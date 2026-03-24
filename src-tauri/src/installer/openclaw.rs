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

    let mut cmd = tokio::process::Command::new(&npm);
    cmd.args(["install", "-g", "openclaw@latest", "--prefix", &prefix])
        .env("PATH", &new_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Hide the console window on Windows so the user doesn't see a black CMD box.
    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| {
            log::error!("npm install spawn failed: {}", e);
            "Couldn't start the installer. Try restarting KloDock.".to_string()
        })?;

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
        .map_err(|e| {
            log::error!("npm install process error: {}", e);
            "Couldn't complete the install. Try restarting KloDock.".to_string()
        })?;

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
            "Couldn't install OpenClaw. Try restarting KloDock and trying again."
        };

        log::error!("npm install failed: {}", stderr_text);
        return Err(user_msg.to_string());
    }

    emit(&app, "Verifying installation...", Some(0.9));

    // Ensure the Control UI assets are in the expected location.
    // OpenClaw ships canvas UI at dist/canvas-host/a2ui/ but the gateway
    // looks for it at dist/control-ui/. Copy if missing.
    fix_control_ui_assets(&node_dir);

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

/// Copy canvas UI assets to the location the gateway expects.
///
/// OpenClaw ships the canvas UI at `dist/canvas-host/a2ui/` but the gateway's
/// `resolveControlUiRootSync` looks for `dist/control-ui/index.html`. If the
/// control-ui directory doesn't exist, copy the canvas assets there so WebChat
/// works out of the box without requiring `pnpm ui:build`.
/// Public wrapper for daemon.rs to call on startup.
pub fn fix_control_ui_assets_pub(node_dir: &std::path::Path) {
    fix_control_ui_assets(node_dir);
}

fn fix_control_ui_assets(node_dir: &std::path::Path) {
    let openclaw_dir = node_dir.join("node_modules").join("openclaw");
    let source = openclaw_dir.join("dist").join("canvas-host").join("a2ui");
    let target = openclaw_dir.join("dist").join("control-ui");

    // Only copy if source exists and target doesn't
    if source.join("index.html").exists() && !target.join("index.html").exists() {
        if let Err(e) = std::fs::create_dir_all(&target) {
            log::warn!("Couldn't create control-ui dir: {e}");
            return;
        }
        // Copy all files from source to target
        if let Ok(entries) = std::fs::read_dir(&source) {
            for entry in entries.flatten() {
                let dest = target.join(entry.file_name());
                if let Err(e) = std::fs::copy(entry.path(), &dest) {
                    log::warn!("Couldn't copy control-ui asset {}: {e}", entry.file_name().to_string_lossy());
                }
            }
        }
        log::info!("Copied canvas UI to control-ui/ for WebChat support");
    }
}

/// Check whether OpenClaw is installed and return its status.
///
/// Only checks the KloDock-managed location (~/.klodock/node/openclaw).
/// Does NOT fall back to system PATH — a system-level OpenClaw install
/// would cause the wizard to skip the managed install, but the daemon
/// only uses the managed path. This mismatch caused silent failures
/// on clean installs where a stale global npm install existed.
#[tauri::command]
pub async fn check_openclaw() -> Result<OpenClawStatus, String> {
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
                return Ok(OpenClawStatus {
                    version: None,
                    bin_path: Some(managed_path.to_string_lossy().to_string()),
                    managed_by_klodock: true,
                });
            }
        }
    }

    // Not found at managed location
    Ok(OpenClawStatus {
        version: None,
        bin_path: None,
        managed_by_klodock: false,
    })
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
    let mut cmd = std::process::Command::new(bin_path);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output()
        .map_err(|e| {
            log::error!("OpenClaw execution failed: {}", e);
            "Couldn't run OpenClaw. It may not be installed correctly.".to_string()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("openclaw --version failed: {}", stderr);
        return Err("Couldn't check OpenClaw version. Try reinstalling.".to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    // Handle formats like "OpenClaw 2026.3.13 (61d171a)" or "openclaw v1.2.3"
    // Strip any leading name prefix (case-insensitive), then strip commit hash
    let mut version = raw.clone();
    // Remove "OpenClaw " or "openclaw " prefix (case-insensitive)
    if let Some(pos) = version.to_lowercase().find("openclaw ") {
        version = version[pos + "openclaw ".len()..].to_string();
    }
    version = version.trim_start_matches('v').to_string();
    // Remove trailing commit hash like " (61d171a)"
    if let Some(paren) = version.find(" (") {
        version = version[..paren].to_string();
    }
    let version = version.trim().to_string();

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
