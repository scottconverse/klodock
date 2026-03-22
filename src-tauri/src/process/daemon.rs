use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Emitter;

use crate::config::env;
use crate::installer::openclaw;
use crate::secrets::keychain;

/// Maximum number of automatic restart attempts before giving up.
pub const MAX_RESTART_ATTEMPTS: u32 = 3;

/// Event name for daemon status changes.
const STATUS_EVENT: &str = "daemon-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "status", content = "message")]
pub enum DaemonStatus {
    Running,
    Stopped,
    Starting,
    Error(String),
}

/// Tracks the "Keep API keys accessible for manual OpenClaw use" setting.
/// Defaults to false (always scrub .env on stop).
fn keep_keys_setting() -> bool {
    let path = match crate::paths::klodock_base_dir() {
        Ok(p) => p.join("settings.json"),
        Err(_) => return false,
    };
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            return val
                .get("keep_api_keys_on_disk")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Start the OpenClaw daemon as a managed child process.
///
/// Full lifecycle (matches PRD §6.3 secret materialization flow):
/// 1. Scrub any stale .env from a prior crash
/// 2. Read all secrets from OS keychain
/// 3. Write them to .env with 600 permissions
/// 4. Spawn the openclaw daemon as a child process
/// 5. Write PID to ~/.klodock/daemon.pid
#[tauri::command]
pub async fn start_daemon(app: AppHandle) -> Result<DaemonStatus, String> {
    let _ = app.emit(STATUS_EVENT, &DaemonStatus::Starting);

    // Step 1: Scrub any stale .env from a prior crash
    scrub_stale_env().await?;

    // Step 2: Read all secrets from keychain
    let key_names = keychain::list_secrets()?;
    let mut secrets = HashMap::new();
    for key_name in &key_names {
        match keychain::retrieve_secret(key_name.clone()) {
            Ok(value) => {
                secrets.insert(key_name.clone(), value);
            }
            Err(e) => {
                log::warn!("Failed to retrieve secret '{}': {}", key_name, e);
            }
        }
    }

    if secrets.is_empty() {
        log::warn!("No API keys found in keychain — daemon may not function properly");
    }

    // Step 3: Write secrets to .env
    if !secrets.is_empty() {
        env::write_env(secrets)
            .await
            .map_err(|e| format!("Failed to write .env: {e}"))?;
        log::info!("Materialized {} secrets to .env", key_names.len());
    }

    // Step 4: Spawn the openclaw daemon
    let openclaw_path = openclaw::openclaw_bin_path()?;
    if !openclaw_path.exists() {
        // Clean up the .env we just wrote since we can't start the daemon
        let _ = env::delete_env().await;
        return Err(
            "OpenClaw is not installed. Please go back to the Install step.".into(),
        );
    }

    // Set up environment for the daemon
    let node_dir = crate::paths::klodock_base_dir()?.join("node");
    let current_path = std::env::var("PATH").unwrap_or_default();
    let path_sep = if cfg!(windows) { ";" } else { ":" };
    let new_path = format!("{}{}{}", node_dir.display(), path_sep, current_path);

    // The openclaw config directory
    let openclaw_dir = crate::paths::openclaw_base_dir()?;

    // Enable Vulkan GPU acceleration for Ollama. Ollama's own runtime
    // safely ignores this if no Vulkan-capable GPU is present.
    let mut cmd = tokio::process::Command::new(&openclaw_path);
    cmd.args(["gateway", "--port", "18789"])
        .env("PATH", &new_path)
        .env("OLLAMA_VULKAN", "1")
        .current_dir(&openclaw_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to start OpenClaw daemon: {e}. \
             Make sure OpenClaw is installed correctly."
        )
    })?;

    let pid = child.id().unwrap_or(0);

    // Step 5: Write PID file
    let pid_path = pid_file_path()?;
    if let Some(parent) = pid_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create PID directory: {e}"))?;
    }
    tokio::fs::write(&pid_path, pid.to_string())
        .await
        .map_err(|e| format!("Failed to write PID file: {e}"))?;

    log::info!("OpenClaw daemon started with PID {pid}");
    let _ = app.emit(STATUS_EVENT, &DaemonStatus::Running);

    // Spawn a background task to monitor the child process
    let app_monitor = app.clone();
    tokio::spawn(async move {
        monitor_daemon(child, app_monitor).await;
    });

    Ok(DaemonStatus::Running)
}

/// Stop the daemon process, scrub .env (unless "keep keys" is on), remove PID file.
#[tauri::command]
pub async fn stop_daemon() -> Result<DaemonStatus, String> {
    let pid_path = pid_file_path()?;

    if pid_path.exists() {
        let pid_str = tokio::fs::read_to_string(&pid_path)
            .await
            .map_err(|e| format!("Failed to read PID file: {e}"))?;

        if let Ok(pid) = pid_str.trim().parse::<u32>() {
            kill_process(pid).await;
        }

        // Remove PID file
        let _ = tokio::fs::remove_file(&pid_path).await;
    }

    // Scrub .env — ALWAYS, unless keep_keys is enabled
    if !keep_keys_setting() {
        let _ = env::delete_env().await;
        log::info!("Scrubbed .env on daemon stop");
    } else {
        log::info!("Preserved .env on stop (keep_api_keys_on_disk = true)");
    }

    Ok(DaemonStatus::Stopped)
}

/// Stop then start the daemon.
#[tauri::command]
pub async fn restart_daemon(app: AppHandle) -> Result<DaemonStatus, String> {
    let _ = stop_daemon().await;
    start_daemon(app).await
}

/// Check whether the daemon is currently alive by reading the PID file
/// and verifying the process exists.
#[tauri::command]
pub async fn get_daemon_status() -> Result<DaemonStatus, String> {
    let pid_path = pid_file_path()?;
    if !pid_path.exists() {
        return Ok(DaemonStatus::Stopped);
    }

    let pid_str = tokio::fs::read_to_string(&pid_path)
        .await
        .map_err(|e| format!("Failed to read PID file: {e}"))?;

    let pid: u32 = match pid_str.trim().parse() {
        Ok(p) => p,
        Err(_) => {
            // Corrupt PID file — remove it and report stopped
            log::warn!("Corrupt PID file (non-numeric content), removing");
            let _ = tokio::fs::remove_file(&pid_path).await;
            return Ok(DaemonStatus::Stopped);
        }
    };

    if is_process_alive(pid) {
        Ok(DaemonStatus::Running)
    } else {
        // Stale PID file — process is dead
        let _ = tokio::fs::remove_file(&pid_path).await;
        Ok(DaemonStatus::Stopped)
    }
}

/// Delete any orphaned `.env` file left over from a crash.
/// Called on app startup (see `lib.rs` setup hook) and before each daemon start.
pub async fn scrub_stale_env() -> Result<(), String> {
    let env_path = env::env_path()?;
    if env_path.exists() {
        tokio::fs::remove_file(&env_path)
            .await
            .map_err(|e| format!("Failed to scrub stale .env: {e}"))?;
        log::info!("Scrubbed stale .env at {}", env_path.display());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Path to `~/.klodock/daemon.pid`.
fn pid_file_path() -> Result<PathBuf, String> {
    Ok(crate::paths::klodock_base_dir()?.join("daemon.pid"))
}


/// Monitor a running daemon child process. When it exits, clean up state.
async fn monitor_daemon(mut child: tokio::process::Child, app: AppHandle) {
    let mut restart_count: u32 = 0;

    loop {
        match child.wait().await {
            Ok(status) => {
                if status.success() {
                    log::info!("OpenClaw daemon exited cleanly");
                    cleanup_after_stop().await;
                    let _ = app.emit(STATUS_EVENT, &DaemonStatus::Stopped);
                    return;
                }

                let code = status.code().unwrap_or(-1);
                log::warn!("OpenClaw daemon exited with code {code}");

                // Auto-restart with backoff (up to MAX_RESTART_ATTEMPTS)
                if restart_count < MAX_RESTART_ATTEMPTS {
                    restart_count += 1;
                    let delay = std::time::Duration::from_secs(2u64.pow(restart_count));
                    log::info!(
                        "Restarting daemon (attempt {restart_count}/{MAX_RESTART_ATTEMPTS}) \
                         after {delay:?}"
                    );
                    let _ = app.emit(
                        STATUS_EVENT,
                        &DaemonStatus::Error(format!(
                            "Daemon crashed (exit code {code}). Restarting..."
                        )),
                    );
                    tokio::time::sleep(delay).await;

                    // Note: .env is preserved across retries (keys haven't changed)
                    let openclaw_path = match openclaw::openclaw_bin_path() {
                        Ok(p) => p,
                        Err(e) => {
                            log::error!("Cannot determine openclaw path for restart: {e}");
                            cleanup_after_stop().await;
                            let _ = app.emit(
                                STATUS_EVENT,
                                &DaemonStatus::Error(format!(
                                    "Daemon couldn't be restarted: {e}"
                                )),
                            );
                            return;
                        }
                    };
                    let node_dir = match crate::paths::klodock_base_dir() {
                        Ok(p) => p.join("node"),
                        Err(e) => {
                            log::error!("Cannot determine base dir for restart: {e}");
                            cleanup_after_stop().await;
                            let _ = app.emit(
                                STATUS_EVENT,
                                &DaemonStatus::Error(format!(
                                    "Daemon couldn't be restarted: {e}"
                                )),
                            );
                            return;
                        }
                    };
                    let current_path = std::env::var("PATH").unwrap_or_default();
                    let path_sep = if cfg!(windows) { ";" } else { ":" };
                    let new_path =
                        format!("{}{}{}", node_dir.display(), path_sep, current_path);

                    let mut restart_cmd = tokio::process::Command::new(&openclaw_path);
                    restart_cmd
                        .args(["gateway", "--port", "18789"])
                        .env("PATH", &new_path)
                        .env("OLLAMA_VULKAN", "1")
                        .stdout(std::process::Stdio::piped())
                        .stderr(std::process::Stdio::piped());

                    #[cfg(windows)]
                    {
                        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
                        restart_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    }

                    match restart_cmd.spawn()
                    {
                        Ok(new_child) => {
                            // Update PID file
                            if let Ok(pid_path) = pid_file_path() {
                                let pid = new_child.id().unwrap_or(0);
                                let _ = tokio::fs::write(&pid_path, pid.to_string()).await;
                            }
                            child = new_child;
                            let _ = app.emit(STATUS_EVENT, &DaemonStatus::Running);
                            continue;
                        }
                        Err(e) => {
                            log::error!("Failed to restart daemon: {e}");
                            cleanup_after_stop().await;
                            let _ = app.emit(
                                STATUS_EVENT,
                                &DaemonStatus::Error(format!(
                                    "Daemon couldn't be restarted: {e}"
                                )),
                            );
                            return;
                        }
                    }
                } else {
                    log::error!(
                        "Daemon crashed {MAX_RESTART_ATTEMPTS} times. Giving up."
                    );
                    cleanup_after_stop().await;
                    let _ = app.emit(
                        STATUS_EVENT,
                        &DaemonStatus::Error(
                            "Your agent keeps crashing. Check Settings for details.".into(),
                        ),
                    );
                    return;
                }
            }
            Err(e) => {
                log::error!("Error waiting for daemon: {e}");
                cleanup_after_stop().await;
                let _ = app.emit(
                    STATUS_EVENT,
                    &DaemonStatus::Error(format!("Daemon monitoring error: {e}")),
                );
                return;
            }
        }
    }
}

/// Clean up PID file and optionally .env after daemon stops.
async fn cleanup_after_stop() {
    if let Ok(pid_path) = pid_file_path() {
        let _ = tokio::fs::remove_file(&pid_path).await;
    }

    if !keep_keys_setting() {
        let _ = env::delete_env().await;
        log::info!("Scrubbed .env after daemon stop");
    }
}

/// Kill a process by PID. Platform-specific.
async fn kill_process(pid: u32) {
    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        let mut cmd = tokio::process::Command::new("C:\\Windows\\System32\\taskkill.exe");
        cmd.args(["/F", "/PID", &pid.to_string()]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let _ = cmd.output().await;
    }

    #[cfg(unix)]
    {
        // Try SIGTERM first, then SIGKILL after a short delay
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        if is_process_alive(pid) {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
    }
}

/// Check if a process with the given PID is still running.
fn is_process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        // Use tasklist to check if PID exists
        let output = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("C:\\Windows\\System32\\tasklist.exe")
                .args(["/FI", &format!("PID eq {pid}"), "/NH"])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
        };
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // tasklist returns info line if process exists, or "no tasks" message
                stdout.contains(&pid.to_string())
                    && !stdout.contains("No tasks are running")
            }
            Err(_) => false,
        }
    }

    #[cfg(unix)]
    {
        // kill(pid, 0) checks if the process exists without sending a signal
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
}
