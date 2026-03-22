//! Integration tests for `klodock_lib::setup::setup_state`.
//!
//! These tests exercise the setup wizard state persistence and step
//! completion logic.

use klodock_lib::setup::setup_state::{
    self, SetupState, SetupStep, StepStatus,
};

// ---------------------------------------------------------------------------
// get_setup_state when no file exists
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_get_state_no_file() {
    // When no setup-state.json exists, get_setup_state should return a fresh
    // state with all steps marked NotStarted.
    //
    // To isolate this test, we temporarily rename any existing state file.
    let state_path = dirs::home_dir()
        .expect("home dir")
        .join(".klodock")
        .join("setup-state.json");
    let backup_path = state_path.with_extension("json.bak");

    // Back up existing state file if present.
    let had_existing = state_path.exists();
    if had_existing {
        tokio::fs::rename(&state_path, &backup_path)
            .await
            .expect("should be able to rename state file for backup");
    }

    let state = setup_state::get_setup_state()
        .await
        .expect("get_setup_state should succeed when no file exists");

    // All steps should be NotStarted.
    for &step in SetupState::all_steps() {
        let status = state
            .steps
            .get(&step)
            .expect("every step should be present in the state map");
        assert_eq!(
            *status,
            StepStatus::NotStarted,
            "Step {:?} should be NotStarted when no state file exists",
            step
        );
    }

    // Restore the backup if we had one.
    if had_existing {
        tokio::fs::rename(&backup_path, &state_path).await.ok();
    }
}

// ---------------------------------------------------------------------------
// complete_step persists to disk
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_complete_step_persists() {
    let state_path = dirs::home_dir()
        .expect("home dir")
        .join(".klodock")
        .join("setup-state.json");
    let backup_path = state_path.with_extension("json.bak");

    // Back up existing state.
    let had_existing = state_path.exists();
    if had_existing {
        tokio::fs::rename(&state_path, &backup_path)
            .await
            .expect("backup rename failed");
    }

    // Complete the NodeInstall step.
    let updated = setup_state::complete_step(SetupStep::NodeInstall)
        .await
        .expect("complete_step should succeed");

    // The returned state should show NodeInstall as Completed.
    assert_eq!(
        *updated.steps.get(&SetupStep::NodeInstall).unwrap(),
        StepStatus::Completed,
        "NodeInstall should be Completed after complete_step"
    );

    // Re-read from disk to verify persistence.
    let reloaded = setup_state::get_setup_state()
        .await
        .expect("get_setup_state should read persisted file");

    assert_eq!(
        *reloaded.steps.get(&SetupStep::NodeInstall).unwrap(),
        StepStatus::Completed,
        "NodeInstall should still be Completed after re-reading from disk"
    );

    // Other steps should still be NotStarted.
    assert_eq!(
        *reloaded.steps.get(&SetupStep::ApiKeySetup).unwrap(),
        StepStatus::NotStarted,
        "ApiKeySetup should remain NotStarted"
    );

    // Cleanup: remove the test state file and restore backup.
    tokio::fs::remove_file(&state_path).await.ok();
    if had_existing {
        tokio::fs::rename(&backup_path, &state_path).await.ok();
    }
}

// ---------------------------------------------------------------------------
// verify_all_steps (placeholder)
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore = "verify_all_steps calls real system checks (node, openclaw binary, keychain). Run manually."]
async fn test_verify_steps_checks_real_state() {
    // TODO: Once the verify_step implementations are complete, this test
    // should call verify_all_steps() and assert that each step's status
    // reflects the actual system state (e.g., node on PATH -> Completed).
    let _state = setup_state::verify_all_steps()
        .await
        .expect("verify_all_steps should succeed");
}
