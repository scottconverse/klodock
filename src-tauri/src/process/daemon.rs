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

    // Step 0a: Ensure WebChat control-ui assets exist (fix for OpenClaw packaging)
    if let Ok(node_dir) = crate::paths::klodock_base_dir().map(|p| p.join("node")) {
        crate::installer::openclaw::fix_control_ui_assets_pub(&node_dir);
    }

    // Step 0b: Ensure gateway config allows insecure local auth for in-app chat
    ensure_control_ui_auth().await;

    // Step 0c: Kill any stale daemon on port 18789 from a previous session
    kill_stale_daemon().await;

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
            .map_err(|e| {
                log::error!("Env write for daemon start failed: {}", e);
                "Couldn't prepare API keys for your agent. Try restarting KloDock.".to_string()
            })?;
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
    //
    // On Windows, spawn node.exe directly instead of the .cmd wrapper.
    // The .cmd file uses cmd.exe which opens a console window even with
    // CREATE_NO_WINDOW set on the child process.
    let (spawn_exe, spawn_args): (std::path::PathBuf, Vec<String>) = if cfg!(windows) {
        let node_exe = node_dir.join("node.exe");
        let openclaw_js = node_dir
            .join("node_modules")
            .join("openclaw")
            .join("openclaw.mjs");
        if node_exe.exists() && openclaw_js.exists() {
            (
                node_exe,
                vec![
                    openclaw_js.to_string_lossy().into_owned(),
                    "gateway".into(),
                    "--port".into(),
                    "18789".into(),
                ],
            )
        } else {
            // Fallback to .cmd if direct path not found
            (openclaw_path.clone(), vec!["gateway".into(), "--port".into(), "18789".into()])
        }
    } else {
        (openclaw_path.clone(), vec!["gateway".into(), "--port".into(), "18789".into()])
    };

    let mut cmd = tokio::process::Command::new(&spawn_exe);
    cmd.args(&spawn_args)
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
        log::error!("Daemon spawn failed: {}", e);
        "Couldn't start your agent. Try reinstalling OpenClaw.".to_string()
    })?;

    let pid = child.id().unwrap_or(0);

    // Step 5: Write PID file
    let pid_path = pid_file_path()?;
    if let Some(parent) = pid_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| {
                log::error!("PID dir creation failed: {}", e);
                "Couldn't save agent process info. Check disk space.".to_string()
            })?;
    }
    tokio::fs::write(&pid_path, pid.to_string())
        .await
        .map_err(|e| {
            log::error!("PID file write failed: {}", e);
            "Couldn't save agent process info. Check disk space.".to_string()
        })?;

    // Read active model for activity log
    let model_name = crate::config::openclaw_json::read_config().await
        .ok()
        .and_then(|c| c.agents)
        .and_then(|a| a.defaults)
        .and_then(|d| d.model)
        .map(|m| m.primary)
        .unwrap_or_else(|| "unknown model".into());
    log::info!("OpenClaw daemon started with PID {pid}, model: {model_name}");
    crate::process::activity::record("success", &format!("Agent started · {model_name}"));
    let _ = app.emit(STATUS_EVENT, &DaemonStatus::Running);

    // Spawn a background task to monitor the child process
    let app_monitor = app.clone();
    tokio::spawn(async move {
        monitor_daemon(child, app_monitor).await;
    });

    Ok(DaemonStatus::Running)
}

/// Internal version for non-Tauri callers (e.g., tray quit handler).
pub async fn stop_daemon_internal() -> Result<DaemonStatus, String> {
    stop_daemon().await
}

/// Stop the daemon process, scrub .env (unless "keep keys" is on), remove PID file.
#[tauri::command]
pub async fn stop_daemon() -> Result<DaemonStatus, String> {
    let pid_path = pid_file_path()?;

    if pid_path.exists() {
        let pid_str = tokio::fs::read_to_string(&pid_path)
            .await
            .map_err(|e| {
                log::error!("PID file read failed: {}", e);
                "Couldn't read agent status. Try restarting KloDock.".to_string()
            })?;

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

    crate::process::activity::record("info", "Agent stopped");
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
        .map_err(|e| {
            log::error!("PID file read failed for status check: {}", e);
            "Couldn't check agent status. Try restarting KloDock.".to_string()
        })?;

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

/// Ensure the openclaw.json gateway config includes `controlUi.allowInsecureAuth: true`
/// so the in-app chat can connect with password auth from localhost.
async fn ensure_control_ui_auth() {
    use crate::config::openclaw_json::{config_path, ControlUiConfig};

    let path = match config_path() {
        Ok(p) if p.exists() => p,
        _ => return,
    };

    let content = match tokio::fs::read_to_string(&path).await {
        Ok(c) => c,
        Err(_) => return,
    };

    let mut config: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Ensure controlUi has both flags for in-app chat
    let cui = config
        .get("gateway")
        .and_then(|g| g.get("controlUi"));

    let has_insecure = cui
        .and_then(|c| c.get("allowInsecureAuth"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let has_origin_fallback = cui
        .and_then(|c| c.get("dangerouslyAllowHostHeaderOriginFallback"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if has_insecure && has_origin_fallback {
        return;
    }

    // Set all flags needed for Tauri webview to connect via WebSocket.
    // The Tauri webview sends Origin: http://tauri.localhost which the
    // gateway rejects unless it's in allowedOrigins.
    if let Some(gw) = config.get_mut("gateway").and_then(|g| g.as_object_mut()) {
        gw.insert(
            "controlUi".to_string(),
            serde_json::json!({
                "allowInsecureAuth": true,
                "dangerouslyAllowHostHeaderOriginFallback": true,
                "allowedOrigins": [
                    "http://tauri.localhost",
                    "https://tauri.localhost",
                    "tauri://localhost",
                    "http://localhost",
                    "http://127.0.0.1"
                ]
            }),
        );
    }

    // Write back
    if let Ok(json) = serde_json::to_string_pretty(&config) {
        let _ = tokio::fs::write(&path, json).await;
        log::info!("Added controlUi.allowInsecureAuth to gateway config for in-app chat");
    }
}

/// Kill any daemon process occupying port 18789 from a previous session.
/// This ensures a clean start every time — no stale config, no origin mismatch.
async fn kill_stale_daemon() {
    // First try the PID file
    if let Ok(pid_path) = pid_file_path() {
        if let Ok(pid_str) = tokio::fs::read_to_string(&pid_path).await {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                log::info!("Found stale PID file with PID {pid}, killing...");
                #[cfg(windows)]
                {
                    let _ = tokio::process::Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .creation_flags(0x08000000)
                        .output()
                        .await;
                }
                #[cfg(not(windows))]
                {
                    let _ = tokio::process::Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output()
                        .await;
                }
                let _ = tokio::fs::remove_file(&pid_path).await;
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }

    // Remove OpenClaw lock files that prevent restart
    if let Ok(temp_dir) = std::env::var("TEMP").or_else(|_| std::env::var("TMP")) {
        let openclaw_temp = std::path::PathBuf::from(temp_dir).join("openclaw");
        if let Ok(entries) = std::fs::read_dir(&openclaw_temp) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains(".lock") {
                    log::info!("Removing stale lock file: {}", name);
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }

    // Also check if port 18789 is still in use (covers manual starts)
    match tokio::net::TcpStream::connect("127.0.0.1:18789").await {
        Ok(_) => {
            log::warn!("Port 18789 still in use after PID kill, trying netstat...");
            #[cfg(windows)]
            {
                // Find and kill whatever is on port 18789
                if let Ok(output) = tokio::process::Command::new("cmd")
                    .args(["/C", "netstat -ano | findstr :18789 | findstr LISTENING"])
                    .creation_flags(0x08000000)
                    .output()
                    .await
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        if let Some(pid_str) = line.split_whitespace().last() {
                            if let Ok(pid) = pid_str.parse::<u32>() {
                                if pid > 0 {
                                    log::info!("Killing process {pid} on port 18789");
                                    let _ = tokio::process::Command::new("taskkill")
                                        .args(["/F", "/PID", &pid.to_string()])
                                        .creation_flags(0x08000000)
                                        .output()
                                        .await;
                                }
                            }
                        }
                    }
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
        Err(_) => {
            // Port is free — good
        }
    }
}

/// Delete any orphaned `.env` file left over from a crash.
/// Called on app startup (see `lib.rs` setup hook) and before each daemon start.
pub async fn scrub_stale_env() -> Result<(), String> {
    let env_path = env::env_path()?;
    if env_path.exists() {
        tokio::fs::remove_file(&env_path)
            .await
            .map_err(|e| {
                log::error!("Stale env scrub failed at {}: {}", env_path.display(), e);
                "Couldn't clean up old settings. Check file permissions.".to_string()
            })?;
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
                        &DaemonStatus::Error(
                            "Your agent stopped unexpectedly. Restarting...".to_string()
                        ),
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
                                &DaemonStatus::Error(
                                    "Couldn't restart your agent. Try restarting KloDock.".to_string()
                                ),
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
                                &DaemonStatus::Error(
                                    "Couldn't restart your agent. Try restarting KloDock.".to_string()
                                ),
                            );
                            return;
                        }
                    };
                    let current_path = std::env::var("PATH").unwrap_or_default();
                    let path_sep = if cfg!(windows) { ";" } else { ":" };
                    let new_path =
                        format!("{}{}{}", node_dir.display(), path_sep, current_path);

                    // On Windows, spawn node.exe directly to avoid .cmd console window
                    let (restart_exe, restart_args) = if cfg!(windows) {
                        let node_exe = node_dir.join("node.exe");
                        let openclaw_js = node_dir.join("node_modules").join("openclaw").join("openclaw.mjs");
                        if node_exe.exists() && openclaw_js.exists() {
                            (node_exe, vec![openclaw_js.to_string_lossy().into_owned(), "gateway".into(), "--port".into(), "18789".into()])
                        } else {
                            (openclaw_path.clone(), vec!["gateway".into(), "--port".into(), "18789".into()])
                        }
                    } else {
                        (openclaw_path.clone(), vec!["gateway".into(), "--port".into(), "18789".into()])
                    };

                    let mut restart_cmd = tokio::process::Command::new(&restart_exe);
                    restart_cmd
                        .args(&restart_args)
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
                                &DaemonStatus::Error(
                                    "Couldn't restart your agent. Try restarting KloDock.".to_string()
                                ),
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
                    &DaemonStatus::Error(
                        "Couldn't monitor your agent. Try restarting KloDock.".to_string()
                    ),
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
