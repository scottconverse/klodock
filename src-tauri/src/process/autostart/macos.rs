use super::Autostart;

/// macOS autostart via Login Items (SMAppService or launchd plist).
pub struct MacosAutostart;

impl Autostart for MacosAutostart {
    fn enable() -> Result<(), String> {
        todo!("Register ClawPad as a macOS Login Item")
    }

    fn disable() -> Result<(), String> {
        todo!("Remove ClawPad from macOS Login Items")
    }

    fn is_enabled() -> Result<bool, String> {
        todo!("Check if ClawPad is registered as a macOS Login Item")
    }
}
