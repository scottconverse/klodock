use super::Autostart;

/// Registry path for current-user auto-start programs.
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Value name used for the KloDock entry.
const VALUE_NAME: &str = "KloDock";

/// Windows autostart via Registry key
/// `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
///
/// When enabled, this writes a registry value pointing to the KloDock
/// executable with a `--minimized` flag so it launches to the system tray
/// without opening a window.
pub struct WindowsAutostart;

impl Autostart for WindowsAutostart {
    fn enable() -> Result<(), String> {
        let exe_path = std::env::current_exe()
            .map_err(|e| {
                log::error!("Couldn't find KloDock exe path: {}", e);
                "Couldn't find the KloDock app. Try reinstalling.".to_string()
            })?;

        // Launch minimized to system tray
        let value = format!("\"{}\" --minimized", exe_path.display());

        // Use reg.exe to write the value (avoids pulling in the winreg crate)
        let output = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("C:\\Windows\\System32\\reg.exe")
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
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
        }.map_err(|e| {
            log::error!("reg.exe execution failed: {}", e);
            "Couldn't update startup settings. Try running as administrator.".to_string()
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::error!("Autostart enable failed: {}", stderr);
            return Err("Couldn't enable auto-start. Try running as administrator.".to_string());
        }

        log::info!("Autostart enabled: {value}");
        Ok(())
    }

    fn disable() -> Result<(), String> {
        let output = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("C:\\Windows\\System32\\reg.exe")
                .args([
                    "delete",
                    &format!("HKCU\\{RUN_KEY}"),
                    "/v",
                    VALUE_NAME,
                    "/f",
                ])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
        }.map_err(|e| {
            log::error!("reg.exe execution failed (disable): {}", e);
            "Couldn't update startup settings. Try running as administrator.".to_string()
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // If the entry doesn't exist, that's fine — it's already disabled
            if stderr.contains("unable to find") || stderr.contains("not find") {
                return Ok(());
            }
            log::error!("Autostart disable failed: {}", stderr);
            return Err("Couldn't disable auto-start. Try running as administrator.".to_string());
        }

        log::info!("Autostart disabled");
        Ok(())
    }

    fn is_enabled() -> Result<bool, String> {
        let output = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("C:\\Windows\\System32\\reg.exe")
                .args([
                    "query",
                    &format!("HKCU\\{RUN_KEY}"),
                    "/v",
                    VALUE_NAME,
                ])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
        }.map_err(|e| {
            log::error!("reg.exe query failed: {}", e);
            "Couldn't check auto-start status.".to_string()
        })?;

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
