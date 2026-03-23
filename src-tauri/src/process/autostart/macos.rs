use super::Autostart;

/// macOS autostart via Login Items (SMAppService or launchd plist).
pub struct MacosAutostart;

impl Autostart for MacosAutostart {
    fn enable() -> Result<(), String> {
        let exe_path = std::env::current_exe()
            .map_err(|e| {
                log::error!("Couldn't find KloDock exe path: {}", e);
                "Couldn't find the KloDock app. Try reinstalling.".to_string()
            })?;
        let path_str = exe_path.to_string_lossy();

        // Use osascript to add a Login Item
        let script = format!(
            r#"tell application "System Events" to make login item at end with properties {{path:"{}", hidden:true}}"#,
            path_str
        );

        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| {
                log::error!("osascript execution failed: {}", e);
                "Couldn't update login items. Check System Settings permissions.".to_string()
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::error!("Login item add failed: {}", stderr);
            return Err("Couldn't enable auto-start. Allow KloDock in System Settings > Login Items.".to_string());
        }

        Ok(())
    }

    fn disable() -> Result<(), String> {
        let script = r#"tell application "System Events" to delete login item "KloDock""#;

        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| {
                log::error!("osascript execution failed (disable): {}", e);
                "Couldn't update login items. Check System Settings permissions.".to_string()
            })?;

        // Ignore errors if the login item doesn't exist
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("Can't get login item") {
                log::error!("Login item remove failed: {}", stderr);
                return Err("Couldn't disable auto-start. Check System Settings permissions.".to_string());
            }
        }

        Ok(())
    }

    fn is_enabled() -> Result<bool, String> {
        let script = r#"tell application "System Events" to get the name of every login item"#;

        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| {
                log::error!("osascript query failed: {}", e);
                "Couldn't check auto-start status.".to_string()
            })?;

        if !output.status.success() {
            return Ok(false);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains("KloDock"))
    }
}
