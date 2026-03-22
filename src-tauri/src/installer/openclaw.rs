use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Version and location info for an installed OpenClaw binary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawStatus {
    /// Parsed version string (e.g. "0.12.3"), None if not found.
    pub version: Option<String>,
    /// Absolute path to the openclaw binary, if located.
    pub bin_path: Option<String>,
    /// True when the binary was installed by KloDock's managed Node/npm.
    pub managed_by_klodock: bool,
}

/// Progress event payload emitted during `install_openclaw`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    /// Human-readable description of the current step.
    pub message: String,
    /// 0.0 – 1.0 fractional progress, None when indeterminate.
    pub fraction: Option<f64>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Install (or upgrade) OpenClaw globally using KloDock-managed npm.
///
/// Runs:
/// ```text
/// <klodock_npm> install -g openclaw@latest
/// ```
///
/// Emits `openclaw-install-progress` events so the frontend can display a
/// live status indicator.
#[tauri::command]
pub async fn install_openclaw(app: tauri::AppHandle) -> Result<String, String> {
    let npm = super::node::klodock_npm_path()?;
    if !npm.exists() {
        return Err(
            "KloDock-managed npm not found. Please install Node.js first \
             (go back to the Dependencies step)."
                .into(),
        );
    }

    emit(&app, "Preparing to install OpenClaw...", Some(0.0));

    // Set up environment so npm uses KloDock-managed node
    let node_dir = npm.parent().unwrap().to_path_buf();
    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{}{}{}", node_dir.display(), path_separator(), current_path);

    // Set the npm global prefix to KloDock's node directory so global installs
    // land in ~/.klodock/node/ (same directory as our Node.js install).
    // This avoids needing any system-level npm prefix.
    let prefix = node_dir.to_string_lossy().to_string();

    emit(&app, "Installing OpenClaw (this may take a minute)...", Some(0.1));

    let mut child = tokio::process::Command::new(&npm)
        .args(["install", "-g", "openclaw@latest", "--prefix", &prefix])
        .env("PATH", &new_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start npm install: {e}"))?;

    // Stream stdout for progress
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_clone = app.clone();

    let stdout_handle = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit(&app_clone, &format!("npm: {line}"), Some(0.3));
                lines.push(line);
            }
        }
        lines
    });

    let stderr_handle = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                lines.push(line);
            }
        }
        lines
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("npm install process error: {e}"))?;

    let _stdout_lines = stdout_handle.await.unwrap_or_default();
    let stderr_lines = stderr_handle.await.unwrap_or_default();

    if !status.success() {
        let stderr_text = stderr_lines.join("\n");
        // Provide a user-friendly error message
        let user_msg = if stderr_text.contains("EACCES") || stderr_text.contains("permission") {
            "OpenClaw couldn't be installed due to a permissions issue. \
             Try restarting KloDock."
        } else if stderr_text.contains("ENOTFOUND") || stderr_text.contains("network") {
            "OpenClaw couldn't be installed — please check your internet connection \
             and try again."
        } else if stderr_text.contains("404") || stderr_text.contains("Not Found") {
            "The OpenClaw package wasn't found on npm. It may not be published yet. \
             Please check back later."
        } else {
            "OpenClaw installation failed. See details below."
        };

        return Err(format!("{user_msg}\n\nDetails: {stderr_text}"));
    }

    emit(&app, "Verifying installation...", Some(0.9));

    // Verify the binary exists
    let bin_path = openclaw_bin_path()?;
    if bin_path.exists() {
        let version = run_openclaw_version(&bin_path)?;
        emit(
            &app,
            &format!("OpenClaw v{version} installed successfully!"),
            Some(1.0),
        );
        Ok(version)
    } else {
        // The npm install succeeded but the binary isn't where we expect.
        // This can happen if the package doesn't have a bin entry matching
        // "openclaw". Try to find it.
        let alt_path = find_openclaw_binary(&node_dir);
        match alt_path {
            Some(path) => {
                let version = run_openclaw_version(&path)?;
                emit(
                    &app,
                    &format!("OpenClaw v{version} installed successfully!"),
                    Some(1.0),
                );
                Ok(version)
            }
            None => {
                emit(&app, "Installation completed but binary not found.", Some(1.0));
                // Return a placeholder version — the install succeeded per npm
                Ok("installed".to_string())
            }
        }
    }
}

/// Check whether OpenClaw is installed and return its status.
///
/// Looks for the binary at the KloDock-managed location first, then falls
/// back to the system PATH.
#[tauri::command]
pub async fn check_openclaw() -> Result<OpenClawStatus, String> {
    // 1. Check KloDock-managed location.
    let managed_path = openclaw_bin_path()?;
    if managed_path.exists() {
        match run_openclaw_version(&managed_path) {
            Ok(version) => {
                return Ok(OpenClawStatus {
                    version: Some(version),
                    bin_path: Some(managed_path.to_string_lossy().to_string()),
                    managed_by_klodock: true,
                });
            }
            Err(e) => {
                log::warn!("Managed openclaw exists but version check failed: {e}");
                // Binary exists but is broken — still report its location
                return Ok(OpenClawStatus {
                    version: None,
                    bin_path: Some(managed_path.to_string_lossy().to_string()),
                    managed_by_klodock: true,
                });
            }
        }
    }

    // 2. Check system PATH.
    match which::which("openclaw") {
        Ok(path) => {
            let version = run_openclaw_version(&path).ok();
            Ok(OpenClawStatus {
                version,
                bin_path: Some(path.to_string_lossy().to_string()),
                managed_by_klodock: false,
            })
        }
        Err(_) => Ok(OpenClawStatus {
            version: None,
            bin_path: None,
            managed_by_klodock: false,
        }),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Expected path to the `openclaw` binary when installed via KloDock npm.
///
/// Global npm packages land in the `node/` prefix on Windows or
/// `node/bin/` on Unix.
pub(crate) fn openclaw_bin_path() -> Result<PathBuf, String> {
    let base = crate::paths::klodock_base_dir()?.join("node");
    if cfg!(windows) {
        Ok(base.join("openclaw.cmd"))
    } else {
        Ok(base.join("bin").join("openclaw"))
    }
}

/// Run `openclaw --version` and parse the output.
fn run_openclaw_version(bin_path: &std::path::Path) -> Result<String, String> {
    let output = std::process::Command::new(bin_path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run openclaw: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("openclaw --version failed: {stderr}"));
    }

    let version = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches('v')
        // Some CLIs output "openclaw v1.2.3" — strip the name prefix too
        .trim_start_matches("openclaw ")
        .trim_start_matches('v')
        .to_string();

    if version.is_empty() {
        return Err("openclaw --version returned empty output".into());
    }

    Ok(version)
}

/// Try to find the openclaw binary in common npm global bin locations.
fn find_openclaw_binary(node_dir: &std::path::Path) -> Option<PathBuf> {
    let candidates = if cfg!(windows) {
        vec![
            node_dir.join("openclaw.cmd"),
            node_dir.join("openclaw.ps1"),
            node_dir.join("openclaw"),
            node_dir.join("node_modules").join(".bin").join("openclaw.cmd"),
        ]
    } else {
        vec![
            node_dir.join("bin").join("openclaw"),
            node_dir.join("lib").join("node_modules").join("openclaw").join("bin").join("openclaw"),
        ]
    };

    candidates.into_iter().find(|p| p.exists())
}

/// Platform-specific PATH separator.
fn path_separator() -> &'static str {
    if cfg!(windows) { ";" } else { ":" }
}

fn emit(app: &tauri::AppHandle, message: &str, fraction: Option<f64>) {
    let progress = InstallProgress {
        message: message.to_string(),
        fraction,
    };
    let _ = app.emit("openclaw-install-progress", &progress);
}
