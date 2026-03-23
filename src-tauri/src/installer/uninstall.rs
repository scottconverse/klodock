use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Discrete steps executed during uninstallation.  Each step is idempotent so
/// the process can be interrupted and resumed safely.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UninstallStep {
    /// Gracefully stop the OpenClaw daemon if running.
    StopDaemon,
    /// Remove launch-agent / systemd / startup-registry entries.
    RemoveAutostart,
    /// Remove KloDock entries from PATH / shell rc files.
    ScrubEnv,
    /// Delete API-key entries from the OS keychain.
    ClearKeychain,
    /// Delete `~/.klodock/node/`.
    RemoveNode,
    /// Run `npm uninstall -g openclaw`.
    RemoveOpenClaw,
    /// Delete `~/.klodock/` (config, logs, state).
    RemoveKlodockConfig,
}

/// Ordered list of all steps in the default removal sequence.
const ALL_STEPS: &[UninstallStep] = &[
    UninstallStep::StopDaemon,
    UninstallStep::RemoveAutostart,
    UninstallStep::ScrubEnv,
    UninstallStep::ClearKeychain,
    UninstallStep::RemoveNode,
    UninstallStep::RemoveOpenClaw,
    UninstallStep::RemoveKlodockConfig,
];

/// Persisted to `~/.klodock/uninstall-state.json` so we can resume after a
/// crash or forced quit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallState {
    /// Steps that have completed successfully.
    pub completed: Vec<UninstallStep>,
    /// Steps that still need to run.
    pub remaining: Vec<UninstallStep>,
    /// Whether the user opted to also remove personal data
    /// (e.g. `~/.openclaw/` soul files, conversation history).
    pub remove_user_data: bool,
    /// ISO-8601 timestamp when the uninstall was initiated.
    pub started_at: String,
}

/// Payload emitted as a Tauri event after each step completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallProgress {
    pub step: UninstallStep,
    pub success: bool,
    pub error: Option<String>,
    /// Number of steps completed so far (for progress bar).
    pub completed_count: usize,
    pub total_count: usize,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Begin a full uninstallation of KloDock and its managed dependencies.
///
/// Persists an [`UninstallState`] to disk before starting so the process can
/// be resumed via [`resume_uninstall`] if interrupted.
///
/// When `remove_user_data` is true, also deletes `~/.openclaw/` (soul files,
/// conversation history, clawhub skills).
///
/// Emits `uninstall-progress` events for each completed step.
#[tauri::command]
pub async fn uninstall_klodock(
    app: tauri::AppHandle,
    remove_user_data: bool,
) -> Result<(), String> {
    let state = UninstallState {
        completed: Vec::new(),
        remaining: ALL_STEPS.to_vec(),
        remove_user_data,
        started_at: chrono_now_iso(),
    };

    persist_state(&state).await?;

    run_remaining_steps(app, state).await
}

/// Check for a previously interrupted uninstall and resume it.
///
/// Returns `Ok(false)` if no uninstall-state.json exists (nothing to resume).
/// Returns `Ok(true)` after successfully completing the remaining steps.
#[tauri::command]
pub async fn resume_uninstall(app: tauri::AppHandle) -> Result<bool, String> {
    let state_path = uninstall_state_path()?;
    if !state_path.exists() {
        return Ok(false);
    }

    let contents = tokio::fs::read_to_string(&state_path)
        .await
        .map_err(|e| {
            log::error!("Uninstall state read error: {}", e);
            "Couldn't read uninstall progress. Try uninstalling again.".to_string()
        })?;

    let state: UninstallState = serde_json::from_str(&contents)
        .map_err(|e| {
            log::error!("Corrupt uninstall-state.json: {}", e);
            "Couldn't resume uninstall — progress file is corrupted. Try again.".to_string()
        })?;

    run_remaining_steps(app, state).await?;
    Ok(true)
}

// ---------------------------------------------------------------------------
// Internal execution engine
// ---------------------------------------------------------------------------

/// Walk through `state.remaining` one step at a time.  After each step,
/// update the persisted state so we can resume on crash.
async fn run_remaining_steps(
    app: tauri::AppHandle,
    mut state: UninstallState,
) -> Result<(), String> {
    let total = state.completed.len() + state.remaining.len();

    while let Some(step) = state.remaining.first().copied() {
        let result = execute_step(step, state.remove_user_data).await;

        let progress = UninstallProgress {
            step,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            completed_count: state.completed.len() + 1,
            total_count: total,
        };

        // Best-effort event emission; don't fail the uninstall if the
        // frontend is gone.
        let _ = app.emit("uninstall-progress", &progress);

        if let Err(e) = result {
            // Persist current progress so the user can retry.
            persist_state(&state).await.ok();
            log::error!("Uninstall step {:?} failed: {}", step, e);
            return Err(format!("Couldn't complete uninstall step. {e}"));
        }

        state.remaining.remove(0);
        state.completed.push(step);
        persist_state(&state).await.ok();
    }

    // All steps done — remove the state file itself.
    tokio::fs::remove_file(uninstall_state_path()?).await.ok();
    Ok(())
}

/// Execute a single uninstall step.  Each implementation must be idempotent.
async fn execute_step(step: UninstallStep, remove_user_data: bool) -> Result<(), String> {
    match step {
        UninstallStep::StopDaemon => {
            // Best-effort — the daemon might not be running.
            let _ = crate::process::daemon::stop_daemon().await;
            Ok(())
        }
        UninstallStep::RemoveAutostart => {
            // Best-effort — autostart might not be enabled.
            let _ = crate::process::autostart::disable_autostart().await;
            Ok(())
        }
        UninstallStep::ScrubEnv => {
            // Delete ~/.openclaw/.env
            crate::config::env::delete_env().await?;
            Ok(())
        }
        UninstallStep::ClearKeychain => {
            // Delete all KloDock-stored secrets from the OS keychain.
            if let Ok(keys) = crate::secrets::keychain::list_secrets() {
                for name in keys {
                    let _ = crate::secrets::keychain::delete_secret(name);
                }
            }
            Ok(())
        }
        UninstallStep::RemoveNode => {
            let node_dir = crate::paths::klodock_base_dir()?.join("node");
            if node_dir.exists() {
                tokio::fs::remove_dir_all(&node_dir)
                    .await
                    .map_err(|e| {
                        log::error!("Node dir removal failed: {}", e);
                        "Couldn't remove Node.js files. Close any terminals and try again.".to_string()
                    })?;
            }
            Ok(())
        }
        UninstallStep::RemoveOpenClaw => {
            // Try to run `npm uninstall -g openclaw` via KloDock's managed npm.
            let npm_path = crate::installer::node::klodock_npm_path()?;
            if npm_path.exists() {
                let mut cmd = tokio::process::Command::new(&npm_path);
                cmd.args(["uninstall", "-g", "openclaw"]);
                #[cfg(windows)]
                {
                    #[allow(unused_imports)]
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                let _ = cmd.output().await;
            } else {
                // npm already removed (e.g. RemoveNode ran first) — try to
                // delete the openclaw binary directly.
                let bin_path = crate::installer::openclaw::openclaw_bin_path()?;
                if bin_path.exists() {
                    let _ = tokio::fs::remove_file(&bin_path).await;
                }
            }
            Ok(())
        }
        UninstallStep::RemoveKlodockConfig => {
            // Remove ~/.klodock/ (but leave uninstall-state.json until the
            // very end, which is handled by the caller).
            let base = crate::paths::klodock_base_dir()?;
            if base.exists() {
                tokio::fs::remove_dir_all(&base)
                    .await
                    .map_err(|e| {
                        log::error!("KloDock config removal failed: {}", e);
                        "Couldn't remove KloDock data. Close KloDock and try again.".to_string()
                    })?;
            }

            // Optionally nuke user data.
            if remove_user_data {
                let openclaw_dir = crate::paths::openclaw_base_dir()?;
                if openclaw_dir.exists() {
                    tokio::fs::remove_dir_all(&openclaw_dir)
                        .await
                        .map_err(|e| {
                            log::error!("OpenClaw data removal failed: {}", e);
                            "Couldn't remove user data. Close all apps and try again.".to_string()
                        })?;
                }
            }

            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn uninstall_state_path() -> Result<PathBuf, String> {
    Ok(crate::paths::klodock_base_dir()?.join("uninstall-state.json"))
}

/// Write the current [`UninstallState`] to disk so it survives crashes.
async fn persist_state(state: &UninstallState) -> Result<(), String> {
    let path = uninstall_state_path()?;

    // Ensure parent directory exists (it might have been deleted in an earlier
    // step if we're retrying).
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| {
                log::error!("State dir creation failed: {}", e);
                "Couldn't save uninstall progress. Check disk space.".to_string()
            })?;
    }

    let json = serde_json::to_string_pretty(state)
        .map_err(|e| {
            log::error!("Uninstall state serialization failed: {}", e);
            "Couldn't save uninstall progress.".to_string()
        })?;

    tokio::fs::write(&path, json)
        .await
        .map_err(|e| {
            log::error!("Uninstall state write failed: {}", e);
            "Couldn't save uninstall progress. Check disk space.".to_string()
        })?;

    Ok(())
}

/// Returns current UTC time as an ISO-8601 string without pulling in chrono.
fn chrono_now_iso() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs();

    // Break epoch seconds into date/time components.
    let secs_per_day: u64 = 86400;
    let mut days = total_secs / secs_per_day;
    let day_secs = total_secs % secs_per_day;
    let hours = day_secs / 3600;
    let minutes = (day_secs % 3600) / 60;
    let seconds = day_secs % 60;

    // Convert days since 1970-01-01 to (year, month, day).
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    days += 719468; // shift epoch from 1970-01-01 to 0000-03-01
    let era = days / 146097;
    let doe = days % 146097; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, hours, minutes, seconds
    )
}
