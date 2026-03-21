//! Integration tests for `clawpad_lib::secrets::keychain`.
//!
//! **WARNING**: These tests interact with the REAL operating system keychain.
//! They are marked `#[ignore]` by default to prevent accidental mutation of
//! the system keychain in CI or automated runs.
//!
//! To run these tests manually:
//!
//!     cargo test --test keychain_test -- --ignored
//!
//! On macOS, you may be prompted to allow keychain access.
//! On Windows, the Credential Manager will be used.
//! On Linux, the Secret Service (e.g. gnome-keyring) must be running.

use clawpad_lib::secrets::keychain;

/// Prefix used for test keys so they can be identified and cleaned up.
const TEST_PREFIX: &str = "_clawpad_test_";

/// Generate a unique test key name to avoid collisions between test runs.
fn test_key(suffix: &str) -> String {
    format!("{TEST_PREFIX}{suffix}")
}

// ---------------------------------------------------------------------------
// store + retrieve round-trip
// ---------------------------------------------------------------------------

#[test]
#[ignore = "Interacts with the real OS keychain. Run manually with: cargo test --test keychain_test -- --ignored"]
fn test_store_and_retrieve() {
    let key = test_key("store_retrieve");
    let value = "sk-test-abc123-secret-value";

    // Store the secret.
    keychain::store_secret(key.clone(), value.to_string())
        .expect("store_secret should succeed");

    // Retrieve and verify.
    let retrieved = keychain::retrieve_secret(key.clone())
        .expect("retrieve_secret should succeed after store");

    assert_eq!(
        retrieved, value,
        "retrieved value should match what was stored"
    );

    // Cleanup: delete the test key.
    keychain::delete_secret(key).ok();
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

#[test]
#[ignore = "Interacts with the real OS keychain. Run manually with: cargo test --test keychain_test -- --ignored"]
fn test_delete_key() {
    let key = test_key("delete");
    let value = "temporary-secret-to-delete";

    // Store, then delete.
    keychain::store_secret(key.clone(), value.to_string())
        .expect("store_secret should succeed");
    keychain::delete_secret(key.clone())
        .expect("delete_secret should succeed");

    // Retrieval should now fail.
    let result = keychain::retrieve_secret(key.clone());
    assert!(
        result.is_err(),
        "retrieve_secret should fail after the key has been deleted"
    );
}

// ---------------------------------------------------------------------------
// list_secrets
// ---------------------------------------------------------------------------

#[test]
#[ignore = "Interacts with the real OS keychain. Run manually with: cargo test --test keychain_test -- --ignored"]
fn test_list_secrets() {
    let keys = vec![
        test_key("list_a"),
        test_key("list_b"),
        test_key("list_c"),
    ];

    // Store multiple secrets.
    for key in &keys {
        keychain::store_secret(key.clone(), format!("value-for-{key}"))
            .expect("store_secret should succeed");
    }

    // List and verify all are present.
    let listed = keychain::list_secrets()
        .expect("list_secrets should succeed");

    for key in &keys {
        assert!(
            listed.contains(key),
            "list_secrets should include '{key}', got: {:?}",
            listed
        );
    }

    // Cleanup: delete all test keys.
    for key in &keys {
        keychain::delete_secret(key.clone()).ok();
    }
}
