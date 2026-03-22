//! Integration tests for `klodock_lib::installer::node`.
//!
//! These tests exercise the public helpers and types from the node installer
//! module.  Tests that require network access or mutate the filesystem are
//! marked `#[ignore]` and should be run manually with `cargo test -- --ignored`.

use klodock_lib::installer::node::{self, NodeStatus};
use std::path::Path;

// ---------------------------------------------------------------------------
// check_node
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_check_node_returns_status() {
    // check_node should always return Ok with a valid NodeStatus, even when
    // Node.js is not installed (version = None, meets_requirement = false).
    let status: NodeStatus = node::check_node()
        .await
        .expect("check_node should not return Err on a normal system");

    // The struct should be well-formed regardless of whether node is present.
    if status.version.is_some() {
        // If a version was detected, managed_by should also be populated.
        assert!(
            status.managed_by.is_some(),
            "managed_by should be Some when a version is detected"
        );
    } else {
        // No node found — requirements cannot be met.
        assert!(
            !status.meets_requirement,
            "meets_requirement must be false when no version is found"
        );
    }
}

// ---------------------------------------------------------------------------
// detect_version_manager
// ---------------------------------------------------------------------------

#[test]
fn test_detect_version_manager_none() {
    // With NVM_DIR and VOLTA_HOME both unset, detect_version_manager should
    // fall back to "system" — never "nvm" or "volta".  We temporarily remove
    // the env vars to simulate a clean environment.
    let nvm_backup = std::env::var("NVM_DIR").ok();
    let volta_backup = std::env::var("VOLTA_HOME").ok();

    std::env::remove_var("NVM_DIR");
    std::env::remove_var("VOLTA_HOME");

    // detect_version_manager now takes a &Path and returns a String.
    let dummy_path = Path::new("/usr/bin/node");
    let result = node::detect_version_manager(dummy_path);

    // Restore env vars.
    if let Some(v) = nvm_backup {
        std::env::set_var("NVM_DIR", v);
    }
    if let Some(v) = volta_backup {
        std::env::set_var("VOLTA_HOME", v);
    }

    // With no version manager env vars set, the function should return
    // "system" — never "nvm" or "volta".
    assert_ne!(result, "nvm", "should not detect nvm when NVM_DIR is unset");
    assert_ne!(
        result, "volta",
        "should not detect volta when VOLTA_HOME is unset"
    );
}

// ---------------------------------------------------------------------------
// klodock_node_path
// ---------------------------------------------------------------------------

#[test]
fn test_klodock_node_path_exists() {
    let path = node::klodock_node_path().expect("should resolve path");

    // The path should be under ~/.klodock/node/ regardless of platform.
    let path_str = path.to_string_lossy();
    assert!(
        path_str.contains(".klodock"),
        "klodock_node_path should be under ~/.klodock/"
    );
    assert!(
        path_str.contains("node"),
        "klodock_node_path should contain 'node' component"
    );

    // Platform-specific binary name check.
    if cfg!(windows) {
        assert!(
            path_str.ends_with("node.exe"),
            "On Windows, path should end with node.exe"
        );
    } else {
        assert!(
            path_str.ends_with("bin/node"),
            "On Unix, path should end with bin/node"
        );
    }
}

// ---------------------------------------------------------------------------
// install_node (requires network + filesystem — run manually)
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore = "Requires network access and mutates ~/.klodock/node/. Run manually."]
async fn test_install_node_clean_system() {
    // TODO: Implement once install_node is fleshed out.
    //
    // Setup:  ensure ~/.klodock/node/ does not exist.
    // Action: call install_node with a mock AppHandle (or real one).
    // Assert: ~/.klodock/node/bin/node (or node.exe) exists and runs --version.
    // Cleanup: remove ~/.klodock/node/.
}

#[tokio::test]
#[ignore = "Requires network access and an existing nvm install. Run manually."]
async fn test_install_node_with_existing_nvm() {
    // TODO: Verify that install_node still works when nvm is present.
    //
    // This test ensures that KloDock's managed node does not conflict with
    // an existing nvm installation.
}
