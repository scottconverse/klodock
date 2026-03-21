use super::Autostart;

/// Registry path for current-user auto-start programs.
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Value name used for the ClawPad entry.
const VALUE_NAME: &str = "ClawPad";

/// Windows autostart via Registry key
/// `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
///
/// When enabled, this writes a registry value pointing to the ClawPad
/// executable with a `--minimized` flag so it launches to the system tray
/// without opening a window.
pub struct WindowsAutostart;

impl Autostart for WindowsAutostart {
    fn enable() -> Result<(), String> {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to determine ClawPad executable path: {e}"))?;

        // Launch minimized to system tray
        let value = format!("\"{}\" --minimized", exe_path.display());

        // Use reg.exe to write the value (avoids pulling in the winreg crate)
        let output = std::process::Command::new("reg")
            .args([
                "add",
                &format!("HKCU\\{RUN_KEY}"),
                "/v",
                VALUE_NAME,
                "/t",
                "REG_SZ",
                "/d",
                &value,
                "/f", // Force overwrite if exists
            ])
            .output()
            .map_err(|e| format!("Failed to run reg.exe: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to enable autostart: {stderr}"));
        }

        log::info!("Autostart enabled: {value}");
        Ok(())
    }

    fn disable() -> Result<(), String> {
        let output = std::process::Command::new("reg")
            .args([
                "delete",
                &format!("HKCU\\{RUN_KEY}"),
                "/v",
                VALUE_NAME,
                "/f",
            ])
            .output()
            .map_err(|e| format!("Failed to run reg.exe: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // If the entry doesn't exist, that's fine — it's already disabled
            if stderr.contains("unable to find") || stderr.contains("not find") {
                return Ok(());
            }
            return Err(format!("Failed to disable autostart: {stderr}"));
        }

        log::info!("Autostart disabled");
        Ok(())
    }

    fn is_enabled() -> Result<bool, String> {
        let output = std::process::Command::new("reg")
            .args([
                "query",
                &format!("HKCU\\{RUN_KEY}"),
                "/v",
                VALUE_NAME,
            ])
            .output()
            .map_err(|e| format!("Failed to run reg.exe: {e}"))?;

        // If the query succeeds and contains our value name, it's enabled
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            Ok(stdout.contains(VALUE_NAME))
        } else {
            // Entry doesn't exist
            Ok(false)
        }
    }
}
