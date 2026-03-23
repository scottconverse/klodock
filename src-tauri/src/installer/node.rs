use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::process::Command;
use tauri::Emitter;

/// Minimum Node.js major version required by OpenClaw.
const REQUIRED_NODE_MAJOR: u64 = 22;

/// Minimum Node.js minor version required by OpenClaw (within the required major).
const REQUIRED_NODE_MINOR: u64 = 0;

/// Pinned Node.js version for KloDock-managed installs.
const NODE_VERSION: &str = "24.14.0";

/// Base URL for official Node.js release tarballs / zips.
const NODE_DOWNLOAD_BASE: &str = "https://nodejs.org/dist/";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Describes the state of Node.js on this machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStatus {
    /// Parsed version string (e.g. "22.16.0"), None if node not found.
    pub version: Option<String>,
    /// True when the installed version >= REQUIRED_NODE_MAJOR.REQUIRED_NODE_MINOR.
    pub meets_requirement: bool,
    /// How Node was installed — "nvm", "volta", "homebrew", "system", or
    /// "klodock" when we installed it ourselves. None if not found.
    pub managed_by: Option<String>,
    /// Absolute path to the node binary, if found.
    pub node_path: Option<String>,
}

/// Progress events emitted during installation.
#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub phase: String,
    pub percent: f32,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Detect whether a usable Node.js is available on the user's PATH or inside
/// the KloDock-managed install directory.
#[tauri::command]
pub async fn check_node() -> Result<NodeStatus, String> {
    // 1. Look for KloDock-managed node first (highest priority).
    let klodock_node = klodock_node_path()?;
    if klodock_node.exists() {
        match run_node_version(&klodock_node) {
            Ok(version) => {
                let meets = meets_node_requirement(&version);
                return Ok(NodeStatus {
                    version: Some(version),
                    meets_requirement: meets,
                    managed_by: Some("klodock".into()),
                    node_path: Some(klodock_node.to_string_lossy().to_string()),
                });
            }
            Err(e) => {
                log::warn!("KloDock-managed node exists but failed to get version: {e}");
                // Fall through to system check
            }
        }
    }

    // 2. Check system PATH via `which` crate.
    match which::which("node") {
        Ok(path) => {
            let manager = detect_version_manager(&path);
            match run_node_version(&path) {
                Ok(version) => {
                    let meets = meets_node_requirement(&version);
                    Ok(NodeStatus {
                        version: Some(version),
                        meets_requirement: meets,
                        managed_by: Some(manager),
                        node_path: Some(path.to_string_lossy().to_string()),
                    })
                }
                Err(e) => {
                    log::warn!("System node version check failed: {}", e);
                    Ok(NodeStatus {
                        version: None,
                        meets_requirement: false,
                        managed_by: Some(manager),
                        node_path: Some(path.to_string_lossy().to_string()),
                    })
                }
            }
        }
        Err(_) => Ok(NodeStatus {
            version: None,
            meets_requirement: false,
            managed_by: None,
            node_path: None,
        }),
    }
}

/// Download and install Node.js into `~/.klodock/node/`.
///
/// Platform-specific behavior:
/// - **Windows**: Downloads the .zip archive, extracts to `~/.klodock/node/`
/// - **macOS/Linux**: Downloads .tar.gz, extracts to `~/.klodock/node/`
///
/// Returns the installed version string on success.
#[tauri::command]
pub async fn install_node(app: tauri::AppHandle) -> Result<String, String> {
    let install_dir = crate::paths::klodock_base_dir()?.join("node");

    // If already installed and meets requirements, skip
    if klodock_node_path()?.exists() {
        if let Ok(version) = run_node_version(&klodock_node_path()?) {
            if meets_node_requirement(&version) {
                return Ok(version);
            }
        }
        // Remove stale install
        let _ = std::fs::remove_dir_all(&install_dir);
    }

    // Determine archive name and URL for this platform
    let (archive_name, archive_ext) = platform_archive_name(NODE_VERSION)?;
    let download_url = format!("{NODE_DOWNLOAD_BASE}v{NODE_VERSION}/{archive_name}");
    let shasums_url = format!("{NODE_DOWNLOAD_BASE}v{NODE_VERSION}/SHASUMS256.txt");

    emit_progress(&app, "download", 0.0, "Preparing to download Node.js...");

    // Create temp directory for download
    let tmp_dir = crate::paths::klodock_base_dir()?.join("tmp");
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| {
            log::error!("Temp dir creation failed: {}", e);
            "Couldn't prepare download folder. Check disk space or permissions.".to_string()
        })?;

    let archive_path = tmp_dir.join(&archive_name);

    // Download the archive with progress
    emit_progress(&app, "download", 5.0, &format!("Downloading Node.js v{NODE_VERSION}..."));
    download_file(&app, &download_url, &archive_path).await?;
    emit_progress(&app, "download", 60.0, "Download complete. Verifying checksum...");

    // Download and verify SHA256
    let shasums_path = tmp_dir.join("SHASUMS256.txt");
    download_file_simple(&shasums_url, &shasums_path).await?;
    verify_checksum(&archive_path, &shasums_path, &archive_name).await?;
    emit_progress(&app, "verify", 70.0, "Checksum verified.");

    // Extract
    emit_progress(&app, "extract", 75.0, "Extracting Node.js...");
    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| {
            log::error!("Install dir creation failed: {}", e);
            "Couldn't create install folder. Check disk space or permissions.".to_string()
        })?;

    extract_archive(&archive_path, &install_dir, &archive_ext).await?;
    emit_progress(&app, "extract", 90.0, "Extraction complete.");

    // Cleanup temp files
    let _ = tokio::fs::remove_dir_all(&tmp_dir).await;

    // Verify installation
    let node_path = klodock_node_path()?;
    if !node_path.exists() {
        log::error!("Node binary not found at {} after install", node_path.display());
        return Err(
            "Couldn't find Node.js after install. Try restarting KloDock.".to_string()
        );
    }

    let version = run_node_version(&node_path)
        .map_err(|e| {
            log::error!("Node version check failed after install: {}", e);
            "Couldn't verify the Node.js install. Try restarting KloDock.".to_string()
        })?;

    emit_progress(&app, "done", 100.0, &format!("Node.js v{version} installed successfully!"));
    Ok(version)
}

// ---------------------------------------------------------------------------
// Helpers (pub so integration tests and other installer modules can reuse)
// ---------------------------------------------------------------------------

/// Detect which version manager (if any) manages the system `node` binary.
pub fn detect_version_manager(node_path: &std::path::Path) -> String {
    let path_str = node_path.to_string_lossy().to_string();

    if std::env::var("NVM_DIR").is_ok() || path_str.contains(".nvm") {
        return "nvm".into();
    }
    if std::env::var("VOLTA_HOME").is_ok() || path_str.contains(".volta") {
        return "volta".into();
    }

    // Check for Homebrew on macOS
    #[cfg(target_os = "macos")]
    {
        if path_str.contains("/opt/homebrew/") || path_str.contains("/usr/local/Cellar/") {
            return "homebrew".into();
        }
    }

    // Check for common Linux package manager paths
    #[cfg(target_os = "linux")]
    {
        if path_str.starts_with("/usr/bin/") || path_str.starts_with("/usr/local/bin/") {
            return "system".into();
        }
    }

    "system".into()
}

/// Returns the absolute path to the KloDock-managed `node` binary.
pub fn klodock_node_path() -> Result<PathBuf, String> {
    let base = crate::paths::klodock_base_dir()?.join("node");
    if cfg!(windows) {
        Ok(base.join("node.exe"))
    } else {
        Ok(base.join("bin").join("node"))
    }
}

/// Returns the absolute path to the KloDock-managed `npm` binary.
pub fn klodock_npm_path() -> Result<PathBuf, String> {
    let base = crate::paths::klodock_base_dir()?.join("node");
    if cfg!(windows) {
        Ok(base.join("npm.cmd"))
    } else {
        Ok(base.join("bin").join("npm"))
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Run `node --version` at a specific path and return the version string
/// (e.g., "22.16.0") without the leading "v".
fn run_node_version(node_path: &std::path::Path) -> Result<String, String> {
    let mut cmd = Command::new(node_path);
    cmd.arg("--version");

    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .map_err(|e| {
            log::error!("Node execution failed: {}", e);
            "Couldn't run Node.js. It may not be installed correctly.".to_string()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("node --version failed: {}", stderr);
        return Err("Couldn't check Node.js version. Try reinstalling.".to_string());
    }

    let version_str = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches('v')
        .to_string();

    if version_str.is_empty() {
        return Err("node --version returned empty output".into());
    }

    Ok(version_str)
}

/// Check whether a version string meets the minimum requirement (22.16+).
fn meets_node_requirement(version: &str) -> bool {
    let major = parse_major(version);
    if major > REQUIRED_NODE_MAJOR {
        return true;
    }
    if major < REQUIRED_NODE_MAJOR {
        return false;
    }
    // major == REQUIRED_NODE_MAJOR, check minor
    parse_minor(version) >= REQUIRED_NODE_MINOR
}

/// Parse the major version number from a semver string like "22.16.0".
fn parse_major(version: &str) -> u64 {
    version
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// Parse the minor version number from a semver string like "22.16.0".
fn parse_minor(version: &str) -> u64 {
    version
        .split('.')
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// Determine the archive filename for the current platform.
/// Returns (filename, extension) where extension is "zip" or "tar.gz".
fn platform_archive_name(version: &str) -> Result<(String, String), String> {
    let (os, arch, ext) = if cfg!(target_os = "windows") {
        let arch = if cfg!(target_arch = "x86_64") {
            "x64"
        } else if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            return Err("Unsupported Windows architecture".into());
        };
        ("win", arch, "zip")
    } else if cfg!(target_os = "macos") {
        let arch = if cfg!(target_arch = "aarch64") {
            "arm64"
        } else if cfg!(target_arch = "x86_64") {
            "x64"
        } else {
            return Err("Unsupported macOS architecture".into());
        };
        ("darwin", arch, "tar.gz")
    } else if cfg!(target_os = "linux") {
        let arch = if cfg!(target_arch = "x86_64") {
            "x64"
        } else if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            return Err("Unsupported Linux architecture".into());
        };
        ("linux", arch, "tar.gz")
    } else {
        return Err("Unsupported operating system".into());
    };

    let filename = format!("node-v{version}-{os}-{arch}.{ext}");
    Ok((filename, ext.to_string()))
}

/// Download a file with progress events.
async fn download_file(
    app: &tauri::AppHandle,
    url: &str,
    dest: &std::path::Path,
) -> Result<(), String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| {
            log::error!("Download request failed for {}: {}", url, e);
            "Couldn't connect to download server. Check your internet.".to_string()
        })?;

    if !response.status().is_success() {
        log::error!("Download returned status {} for {}", response.status(), url);
        return Err("Couldn't download Node.js. The server may be down — try again later.".to_string());
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| {
            log::error!("File creation failed at {}: {}", dest.display(), e);
            "Couldn't save download. Check disk space or permissions.".to_string()
        })?;

    use tokio::io::AsyncWriteExt;
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            log::error!("Download stream error: {}", e);
            "Couldn't finish downloading. Check your internet and try again.".to_string()
        })?;
        file.write_all(&chunk)
            .await
            .map_err(|e| {
                log::error!("File write error: {}", e);
                "Couldn't save download. Check disk space.".to_string()
            })?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let pct = 5.0 + (downloaded as f32 / total_size as f32) * 55.0; // 5% to 60%
            emit_progress(
                app,
                "download",
                pct,
                &format!(
                    "Downloading... {:.1} MB / {:.1} MB",
                    downloaded as f64 / 1_048_576.0,
                    total_size as f64 / 1_048_576.0
                ),
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| {
            log::error!("File flush error: {}", e);
            "Couldn't finish saving download. Check disk space.".to_string()
        })?;

    Ok(())
}

/// Download a file without progress tracking (for small files like SHASUMS256.txt).
async fn download_file_simple(url: &str, dest: &std::path::Path) -> Result<(), String> {
    let bytes = reqwest::get(url)
        .await
        .map_err(|e| {
            log::error!("Download failed for {}: {}", url, e);
            "Couldn't download checksum file. Check your internet.".to_string()
        })?
        .bytes()
        .await
        .map_err(|e| {
            log::error!("Response read error for {}: {}", url, e);
            "Couldn't read download response. Try again.".to_string()
        })?;

    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| {
            log::error!("File write error at {}: {}", dest.display(), e);
            "Couldn't save checksum file. Check disk space.".to_string()
        })?;

    Ok(())
}

/// Verify the SHA256 checksum of the downloaded archive against SHASUMS256.txt.
async fn verify_checksum(
    archive_path: &std::path::Path,
    shasums_path: &std::path::Path,
    archive_name: &str,
) -> Result<(), String> {
    // Read SHASUMS256.txt and find the line matching our archive
    let shasums_content = tokio::fs::read_to_string(shasums_path)
        .await
        .map_err(|e| {
            log::error!("Checksum file read error: {}", e);
            "Couldn't read checksum file. Try downloading again.".to_string()
        })?;

    let expected_hash = shasums_content
        .lines()
        .find(|line| line.ends_with(archive_name))
        .and_then(|line| line.split_whitespace().next())
        .ok_or_else(|| {
            log::error!("No checksum found for {} in SHASUMS256.txt", archive_name);
            "Couldn't verify download. Try again.".to_string()
        })?
        .to_string();

    // Compute SHA256 of the downloaded archive
    let archive_bytes = tokio::fs::read(archive_path)
        .await
        .map_err(|e| {
            log::error!("Archive read error for checksum: {}", e);
            "Couldn't verify download integrity. Try again.".to_string()
        })?;

    let mut hasher = Sha256::new();
    hasher.update(&archive_bytes);
    let actual_hash = format!("{:x}", hasher.finalize());

    if actual_hash != expected_hash {
        log::error!("Checksum mismatch: expected {}, got {}", expected_hash, actual_hash);
        return Err(
            "Download appears corrupted. Please try again.".to_string()
        );
    }

    Ok(())
}

/// Extract the Node.js archive into the install directory.
///
/// On Windows: extracts .zip, then moves contents from the nested directory
/// (e.g., node-v22.16.0-win-x64/) up to the install_dir root.
///
/// On macOS/Linux: extracts .tar.gz, then moves contents from the nested
/// directory up to the install_dir root.
async fn extract_archive(
    archive_path: &std::path::Path,
    install_dir: &std::path::Path,
    ext: &str,
) -> Result<(), String> {
    match ext {
        "zip" => extract_zip(archive_path, install_dir).await,
        "tar.gz" => extract_tar_gz(archive_path, install_dir).await,
        _ => Err(format!("Unsupported archive format: {ext}")),
    }
}

/// Extract a .zip archive (Windows).
#[cfg(target_os = "windows")]
async fn extract_zip(
    archive_path: &std::path::Path,
    install_dir: &std::path::Path,
) -> Result<(), String> {
    // Use PowerShell Expand-Archive for simplicity and no extra dependencies
    let archive_str = archive_path.to_string_lossy().to_string();
    let extract_tmp = install_dir.parent().unwrap().join("node_extract_tmp");
    let extract_tmp_str = extract_tmp.to_string_lossy().to_string();

    // Clean up any previous extract attempt
    let _ = tokio::fs::remove_dir_all(&extract_tmp).await;

    let mut cmd = tokio::process::Command::new("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    cmd.args([
        "-NoProfile",
        "-Command",
        &format!(
            "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
            archive_str, extract_tmp_str
        ),
    ]);

    #[allow(unused_imports)]
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .await
        .map_err(|e| {
            log::error!("PowerShell Expand-Archive failed: {}", e);
            "Couldn't extract Node.js archive. Try restarting KloDock.".to_string()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("Zip extraction failed: {}", stderr);
        return Err("Couldn't extract Node.js. The download may be corrupted — try again.".to_string());
    }

    // The zip contains a top-level directory like `node-v24.14.0-win-x64/`.
    // We need to move its contents to install_dir.
    let mut entries = tokio::fs::read_dir(&extract_tmp)
        .await
        .map_err(|e| {
            log::error!("Read extracted dir failed: {}", e);
            "Couldn't read extracted files. Try again.".to_string()
        })?;

    let nested_dir = entries
        .next_entry()
        .await
        .map_err(|e| {
            log::error!("Read entry failed: {}", e);
            "Couldn't read extracted files. Try again.".to_string()
        })?
        .ok_or_else(|| "Couldn't extract Node.js — archive was empty.".to_string())?;

    // Remove existing install_dir if it exists, then rename the nested dir
    let _ = tokio::fs::remove_dir_all(install_dir).await;
    tokio::fs::rename(nested_dir.path(), install_dir)
        .await
        .map_err(|e| {
            log::error!("Move extracted files failed: {}", e);
            "Couldn't finalize Node.js install. Check disk space.".to_string()
        })?;

    // Cleanup
    let _ = tokio::fs::remove_dir_all(&extract_tmp).await;

    Ok(())
}

/// Extract a .tar.gz archive (macOS/Linux).
#[cfg(not(target_os = "windows"))]
async fn extract_tar_gz(
    archive_path: &std::path::Path,
    install_dir: &std::path::Path,
) -> Result<(), String> {
    let extract_tmp = install_dir.parent().unwrap().join("node_extract_tmp");
    let _ = tokio::fs::remove_dir_all(&extract_tmp).await;
    tokio::fs::create_dir_all(&extract_tmp)
        .await
        .map_err(|e| {
            log::error!("Temp extract dir creation failed: {}", e);
            "Couldn't prepare extraction folder. Check disk space.".to_string()
        })?;

    let output = tokio::process::Command::new("tar")
        .args([
            "xzf",
            &archive_path.to_string_lossy(),
            "-C",
            &extract_tmp.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| {
            log::error!("tar execution failed: {}", e);
            "Couldn't extract Node.js archive. Try again.".to_string()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("tar extraction failed: {}", stderr);
        return Err("Couldn't extract Node.js. The download may be corrupted — try again.".to_string());
    }

    // Move nested directory contents to install_dir
    let mut entries = tokio::fs::read_dir(&extract_tmp)
        .await
        .map_err(|e| {
            log::error!("Read extracted dir failed: {}", e);
            "Couldn't read extracted files. Try again.".to_string()
        })?;

    let nested_dir = entries
        .next_entry()
        .await
        .map_err(|e| {
            log::error!("Read entry failed: {}", e);
            "Couldn't read extracted files. Try again.".to_string()
        })?
        .ok_or_else(|| "Couldn't extract Node.js — archive was empty.".to_string())?;

    let _ = tokio::fs::remove_dir_all(install_dir).await;
    tokio::fs::rename(nested_dir.path(), install_dir)
        .await
        .map_err(|e| {
            log::error!("Move extracted files failed: {}", e);
            "Couldn't finalize Node.js install. Check disk space.".to_string()
        })?;

    let _ = tokio::fs::remove_dir_all(&extract_tmp).await;
    Ok(())
}

/// Stub for non-Windows zip extraction (shouldn't be called).
#[cfg(not(target_os = "windows"))]
async fn extract_zip(
    _archive_path: &std::path::Path,
    _install_dir: &std::path::Path,
) -> Result<(), String> {
    Err("Zip extraction is only used on Windows".into())
}

/// Stub for Windows tar.gz extraction (shouldn't be called).
#[cfg(target_os = "windows")]
async fn extract_tar_gz(
    _archive_path: &std::path::Path,
    _install_dir: &std::path::Path,
) -> Result<(), String> {
    Err("tar.gz extraction is only used on macOS/Linux".into())
}

fn emit_progress(app: &tauri::AppHandle, phase: &str, percent: f32, message: &str) {
    let progress = InstallProgress {
        phase: phase.to_string(),
        percent,
        message: message.to_string(),
    };
    let _ = app.emit("install-progress", &progress);
}
