use super::Autostart;

/// Linux autostart via XDG `.desktop` file in `~/.config/autostart/`.
pub struct LinuxAutostart;

impl Autostart for LinuxAutostart {
    fn enable() -> Result<(), String> {
        todo!("Write clawpad.desktop to ~/.config/autostart/")
    }

    fn disable() -> Result<(), String> {
        todo!("Remove clawpad.desktop from ~/.config/autostart/")
    }

    fn is_enabled() -> Result<bool, String> {
        todo!("Check if clawpad.desktop exists in ~/.config/autostart/")
    }
}
