use super::Autostart;

/// macOS autostart via Login Items (SMAppService or launchd plist).
pub struct MacosAutostart;

impl Autostart for MacosAutostart {
    fn enable() -> Result<(), String> {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to determine KloDock executable path: {e}"))?;
        let path_str = exe_path.to_string_lossy();

        // Use osascript to add a Login Item
        let script = format!(
            r#"tell application "System Events" to make login item at end with properties {{path:"{}", hidden:true}}"#,
            path_str
        );

        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to add login item: {stderr}"));
        }

        Ok(())
    }

    fn disable() -> Result<(), String> {
        let script = r#"tell application "System Events" to delete login item "KloDock""#;

        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        // Ignore errors if the login item doesn't exist
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("Can't get login item") {
                return Err(format!("Failed to remove login item: {stderr}"));
            }
        }

        Ok(())
    }

    fn is_enabled() -> Result<bool, String> {
        let script = r#"tell application "System Events" to get the name of every login item"#;

        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !output.status.success() {
            return Ok(false);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains("KloDock"))
    }
}
