//! Integration tests for `klodock_lib::secrets::keychain`.
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
//! On Windows, the Credential Manager / DPAPI will be used.
//! On Linux, the Secret Service (e.g. gnome-keyring) must be running.
//!
//! These tests MUST run sequentially because they share a global key
//! index file. Use: cargo test --test keychain_test -- --ignored --test-threads=1

use klodock_lib::secrets::keychain;
use std::sync::Mutex;

/// Lock to force serial execution of keychain tests.
static KEYCHAIN_LOCK: Mutex<()> = Mutex::new(());

/// Prefix used for test keys so they can be identified and cleaned up.
const TEST_PREFIX: &str = "_klodock_test_";

/// Generate a unique test key name.
fn test_key(suffix: &str) -> String {
    format!("{TEST_PREFIX}{suffix}")
}

/// Clean up any leftover test keys from previous runs.
fn cleanup_test_keys() {
    if let Ok(keys) = keychain::list_secrets() {
        for key in keys {
            if key.starts_with(TEST_PREFIX) {
                let _ = keychain::delete_secret(key);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// store + retrieve round-trip
// ---------------------------------------------------------------------------

#[test]
#[ignore = "Interacts with the real OS keychain. Run manually with: cargo test --test keychain_test -- --ignored"]
fn test_store_and_retrieve() {
    let _lock = KEYCHAIN_LOCK.lock().unwrap();
    cleanup_test_keys();

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

    // Cleanup
    keychain::delete_secret(key).ok();
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

#[test]
#[ignore = "Interacts with the real OS keychain. Run manually with: cargo test --test keychain_test -- --ignored"]
fn test_delete_key() {
    let _lock = KEYCHAIN_LOCK.lock().unwrap();
    cleanup_test_keys();

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
    let _lock = KEYCHAIN_LOCK.lock().unwrap();
    cleanup_test_keys();

    // Store keys one at a time to avoid any index race
    let key_a = test_key("list_a");
    let key_b = test_key("list_b");
    let key_c = test_key("list_c");

    keychain::store_secret(key_a.clone(), "value-a".to_string())
        .expect("store list_a should succeed");
    keychain::store_secret(key_b.clone(), "value-b".to_string())
        .expect("store list_b should succeed");
    keychain::store_secret(key_c.clone(), "value-c".to_string())
        .expect("store list_c should succeed");

    // List and verify all are present.
    let listed = keychain::list_secrets()
        .expect("list_secrets should succeed");

    assert!(
        listed.contains(&key_a),
        "list_secrets should include '{key_a}', got: {listed:?}"
    );
    assert!(
        listed.contains(&key_b),
        "list_secrets should include '{key_b}', got: {listed:?}"
    );
    assert!(
        listed.contains(&key_c),
        "list_secrets should include '{key_c}', got: {listed:?}"
    );

    // Cleanup
    keychain::delete_secret(key_a).ok();
    keychain::delete_secret(key_b).ok();
    keychain::delete_secret(key_c).ok();
}
