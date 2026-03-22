//! Integration tests for `klodock_lib::process::daemon`.
//!
//! These tests exercise the daemon lifecycle helpers.  Tests that interact
//! with real processes are marked `#[ignore]`.

use klodock_lib::process::daemon::{self, DaemonStatus};
use std::path::PathBuf;
use tokio::fs;

/// Helper: path to the .env file the daemon module manages.
/// The daemon's `scrub_stale_env` uses `config::env::env_path()` which
/// resolves to `~/.openclaw/.env`.
fn env_file_path() -> PathBuf {
    dirs::home_dir()
        .expect("home dir")
        .join(".openclaw")
        .join(".env")
}

// ---------------------------------------------------------------------------
// scrub_stale_env
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_scrub_stale_env_no_file() {
    // When no .env file exists, scrub_stale_env should succeed silently
    // without errors.
    let env_path = env_file_path();

    // Ensure the file does not exist before the test.
    if env_path.exists() {
        fs::remove_file(&env_path).await.ok();
    }

    let result = daemon::scrub_stale_env().await;
    assert!(
        result.is_ok(),
        "scrub_stale_env should succeed when no .env exists: {:?}",
        result.err()
    );
}

#[tokio::test]
async fn test_scrub_stale_env_removes_file() {
    let env_path = env_file_path();

    // Ensure parent directory exists.
    if let Some(parent) = env_path.parent() {
        fs::create_dir_all(parent).await.ok();
    }

    // Create a dummy .env file to simulate a stale env.
    fs::write(&env_path, "STALE_KEY=stale_value\n")
        .await
        .expect("should be able to write test .env");

    assert!(env_path.exists(), "test .env should exist before scrub");

    // Scrub should remove it.
    daemon::scrub_stale_env()
        .await
        .expect("scrub_stale_env should succeed");

    assert!(
        !env_path.exists(),
        ".env should be removed after scrub_stale_env"
    );
}

// ---------------------------------------------------------------------------
// get_daemon_status
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_daemon_status_when_not_running() {
    // When no daemon.pid file exists, get_daemon_status should return Stopped.
    let pid_path = dirs::home_dir()
        .expect("home dir")
        .join(".klodock")
        .join("daemon.pid");

    // Ensure no PID file exists.
    if pid_path.exists() {
        fs::remove_file(&pid_path).await.ok();
    }

    let status = daemon::get_daemon_status()
        .await
        .expect("get_daemon_status should not error when no pid file exists");

    // Verify we got Stopped.
    match status {
        DaemonStatus::Stopped => {} // expected
        other => panic!(
            "Expected DaemonStatus::Stopped when no pid file exists, got {:?}",
            other
        ),
    }
}
