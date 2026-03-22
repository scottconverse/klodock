//! Integration tests for `klodock_lib::installer::uninstall`.
//!
//! These tests exercise the uninstall state persistence and resume logic
//! without actually performing destructive uninstall operations.

use klodock_lib::installer::uninstall::{UninstallState, UninstallStep};
use std::path::PathBuf;
use std::sync::Mutex;
use tokio::fs;

/// Path to the uninstall state file.
fn uninstall_state_path() -> PathBuf {
    dirs::home_dir()
        .expect("home dir")
        .join(".klodock")
        .join("uninstall-state.json")
}

/// Mutex to prevent concurrent access to the shared state file on disk.
static FILE_LOCK: Mutex<()> = Mutex::new(());

// ---------------------------------------------------------------------------
// UninstallState persistence round-trip
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_uninstall_state_persistence() {
    let _guard = FILE_LOCK.lock().unwrap();

    let state_path = uninstall_state_path();
    let backup_path = state_path.with_extension("json.bak_persist");

    // Back up any existing state file.
    let had_existing = state_path.exists();
    if had_existing {
        fs::rename(&state_path, &backup_path).await.ok();
    }

    // Ensure parent directory exists.
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).await.ok();
    }

    // Create a test state and write it to disk.
    let state = UninstallState {
        completed: vec![UninstallStep::StopDaemon],
        remaining: vec![
            UninstallStep::RemoveAutostart,
            UninstallStep::ScrubEnv,
            UninstallStep::ClearKeychain,
            UninstallStep::RemoveNode,
            UninstallStep::RemoveOpenClaw,
            UninstallStep::RemoveKlodockConfig,
        ],
        remove_user_data: false,
        started_at: "2026-01-01T00:00:00Z".to_string(),
    };

    let json = serde_json::to_string_pretty(&state)
        .expect("should serialize UninstallState");
    fs::write(&state_path, &json)
        .await
        .expect("should write state file");

    // Re-read and verify.
    let contents = fs::read_to_string(&state_path)
        .await
        .expect("should read state file");
    let reloaded: UninstallState =
        serde_json::from_str(&contents).expect("should deserialize state");

    assert_eq!(reloaded.completed.len(), 1, "should have 1 completed step");
    assert_eq!(
        reloaded.completed[0],
        UninstallStep::StopDaemon,
        "completed step should be StopDaemon"
    );
    assert_eq!(
        reloaded.remaining.len(),
        6,
        "should have 6 remaining steps"
    );
    assert!(!reloaded.remove_user_data, "remove_user_data should be false");

    // Cleanup.
    fs::remove_file(&state_path).await.ok();
    if had_existing {
        fs::rename(&backup_path, &state_path).await.ok();
    }
}

// ---------------------------------------------------------------------------
// resume_uninstall detects partial state
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_resume_detects_partial() {
    let _guard = FILE_LOCK.lock().unwrap();

    let state_path = uninstall_state_path();
    let backup_path = state_path.with_extension("json.bak_partial");

    // Back up any existing state file.
    let had_existing = state_path.exists();
    if had_existing {
        fs::rename(&state_path, &backup_path).await.ok();
    }

    // Ensure parent directory exists.
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).await.ok();
    }

    // Write a partial uninstall state (simulating an interrupted uninstall).
    let partial_state = UninstallState {
        completed: vec![
            UninstallStep::StopDaemon,
            UninstallStep::RemoveAutostart,
        ],
        remaining: vec![
            UninstallStep::ScrubEnv,
            UninstallStep::ClearKeychain,
            UninstallStep::RemoveNode,
            UninstallStep::RemoveOpenClaw,
            UninstallStep::RemoveKlodockConfig,
        ],
        remove_user_data: true,
        started_at: "2026-01-01T12:00:00Z".to_string(),
    };

    let json = serde_json::to_string_pretty(&partial_state)
        .expect("serialize partial state");
    fs::write(&state_path, &json)
        .await
        .expect("write partial state");

    // Verify that the state file exists and can be parsed.
    assert!(state_path.exists(), "partial state file should exist");

    let contents = fs::read_to_string(&state_path)
        .await
        .expect("read partial state");
    let loaded: UninstallState =
        serde_json::from_str(&contents).expect("parse partial state");

    // The loaded state should have remaining steps, indicating a partial uninstall.
    assert!(
        !loaded.remaining.is_empty(),
        "remaining steps should be non-empty for a partial uninstall"
    );
    assert_eq!(
        loaded.completed.len(),
        2,
        "should have 2 completed steps in partial state"
    );
    assert_eq!(
        loaded.remaining[0],
        UninstallStep::ScrubEnv,
        "next remaining step should be ScrubEnv"
    );

    // Cleanup.
    fs::remove_file(&state_path).await.ok();
    if had_existing {
        fs::rename(&backup_path, &state_path).await.ok();
    }
}
