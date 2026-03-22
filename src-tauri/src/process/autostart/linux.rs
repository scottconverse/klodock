use super::Autostart;
use std::path::PathBuf;

/// Linux autostart via XDG `.desktop` file in `~/.config/autostart/`.
pub struct LinuxAutostart;

const DESKTOP_FILENAME: &str = "klodock.desktop";

fn autostart_dir() -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?
        .join(".config")
        .join("autostart"))
}

fn desktop_file_path() -> Result<PathBuf, String> {
    Ok(autostart_dir()?.join(DESKTOP_FILENAME))
}

impl Autostart for LinuxAutostart {
    fn enable() -> Result<(), String> {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to determine KloDock executable path: {e}"))?;

        let dir = autostart_dir()?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create autostart directory: {e}"))?;

        let content = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Name=KloDock\n\
             Comment=Desktop GUI for OpenClaw\n\
             Exec={} --minimized\n\
             Icon=klodock\n\
             Terminal=false\n\
             StartupNotify=false\n\
             X-GNOME-Autostart-enabled=true\n",
            exe_path.display()
        );

        std::fs::write(desktop_file_path()?, content)
            .map_err(|e| format!("Failed to write desktop file: {e}"))?;

        Ok(())
    }

    fn disable() -> Result<(), String> {
        let path = desktop_file_path()?;
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove desktop file: {e}"))?;
        }
        Ok(())
    }

    fn is_enabled() -> Result<bool, String> {
        Ok(desktop_file_path()?.exists())
    }
}
