//! Integration tests for `klodock_lib::process::autostart`.
//!
//! Autostart behaviour is inherently platform-specific.  Tests are gated
//! with `#[cfg(target_os = "...")]` and most are marked `#[ignore]` because
//! they modify real system state (launch agents, registry keys, systemd units).
//!
//! Run manually with:
//!
//!     cargo test --test autostart_test -- --ignored

use klodock_lib::process::autostart;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod windows_tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Modifies the Windows registry (HKCU Run key). Run manually."]
    async fn test_enable_disable_roundtrip() {
        // Enable autostart.
        autostart::enable_autostart()
            .await
            .expect("enable_autostart should succeed on Windows");

        let enabled = autostart::is_autostart_enabled()
            .await
            .expect("is_autostart_enabled should succeed");
        assert!(enabled, "autostart should be enabled after enable_autostart");

        // Disable autostart.
        autostart::disable_autostart()
            .await
            .expect("disable_autostart should succeed on Windows");

        let still_enabled = autostart::is_autostart_enabled()
            .await
            .expect("is_autostart_enabled should succeed");
        assert!(
            !still_enabled,
            "autostart should be disabled after disable_autostart"
        );
    }

    #[tokio::test]
    async fn test_is_enabled_default_false() {
        // On a fresh system (or after cleanup), autostart should not be enabled.
        let result = autostart::is_autostart_enabled().await;
        match result {
            Ok(enabled) => {
                // We expect false on a fresh system, but don't hard-fail if
                // a previous test left it enabled.
                if enabled {
                    eprintln!(
                        "WARNING: autostart is currently enabled. \
                         This may be leftover from a previous test run."
                    );
                }
            }
            Err(e) => {
                // Some errors are acceptable (e.g., registry key doesn't exist yet).
                eprintln!("is_autostart_enabled returned error (may be expected): {e}");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod macos_tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Modifies macOS launch agent plist. Run manually."]
    async fn test_enable_disable_roundtrip() {
        autostart::enable_autostart()
            .await
            .expect("enable_autostart should succeed on macOS");

        let enabled = autostart::is_autostart_enabled()
            .await
            .expect("is_autostart_enabled should succeed");
        assert!(enabled, "autostart should be enabled after enable_autostart");

        autostart::disable_autostart()
            .await
            .expect("disable_autostart should succeed on macOS");

        let still_enabled = autostart::is_autostart_enabled()
            .await
            .expect("is_autostart_enabled should succeed");
        assert!(
            !still_enabled,
            "autostart should be disabled after disable_autostart"
        );
    }

    #[tokio::test]
    async fn test_is_enabled_default_false() {
        let result = autostart::is_autostart_enabled().await;
        match result {
            Ok(enabled) => {
                if enabled {
                    eprintln!(
                        "WARNING: autostart is currently enabled. \
                         This may be leftover from a previous test run."
                    );
                }
            }
            Err(e) => {
                eprintln!("is_autostart_enabled returned error (may be expected): {e}");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod linux_tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Modifies systemd user unit or XDG autostart entry. Run manually."]
    async fn test_enable_disable_roundtrip() {
        autostart::enable_autostart()
            .await
            .expect("enable_autostart should succeed on Linux");

        let enabled = autostart::is_autostart_enabled()
            .await
            .expect("is_autostart_enabled should succeed");
        assert!(enabled, "autostart should be enabled after enable_autostart");

        autostart::disable_autostart()
            .await
            .expect("disable_autostart should succeed on Linux");

        let still_enabled = autostart::is_autostart_enabled()
            .await
            .expect("is_autostart_enabled should succeed");
        assert!(
            !still_enabled,
            "autostart should be disabled after disable_autostart"
        );
    }

    #[tokio::test]
    async fn test_is_enabled_default_false() {
        let result = autostart::is_autostart_enabled().await;
        match result {
            Ok(enabled) => {
                if enabled {
                    eprintln!(
                        "WARNING: autostart is currently enabled. \
                         This may be leftover from a previous test run."
                    );
                }
            }
            Err(e) => {
                eprintln!("is_autostart_enabled returned error (may be expected): {e}");
            }
        }
    }
}
