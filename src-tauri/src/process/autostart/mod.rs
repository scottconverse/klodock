#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;

/// Platform-agnostic autostart behaviour.
pub trait Autostart {
    fn enable() -> Result<(), String>;
    fn disable() -> Result<(), String>;
    fn is_enabled() -> Result<bool, String>;
}

// ---------------------------------------------------------------------------
// Platform dispatch helpers
// ---------------------------------------------------------------------------

fn platform_enable() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { windows::WindowsAutostart::enable() }
    #[cfg(target_os = "macos")]
    { macos::MacosAutostart::enable() }
    #[cfg(target_os = "linux")]
    { linux::LinuxAutostart::enable() }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { Err("Unsupported platform for autostart".into()) }
}

fn platform_disable() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { windows::WindowsAutostart::disable() }
    #[cfg(target_os = "macos")]
    { macos::MacosAutostart::disable() }
    #[cfg(target_os = "linux")]
    { linux::LinuxAutostart::disable() }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { Err("Unsupported platform for autostart".into()) }
}

fn platform_is_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    { windows::WindowsAutostart::is_enabled() }
    #[cfg(target_os = "macos")]
    { macos::MacosAutostart::is_enabled() }
    #[cfg(target_os = "linux")]
    { linux::LinuxAutostart::is_enabled() }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { Err("Unsupported platform for autostart".into()) }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn enable_autostart() -> Result<(), String> {
    platform_enable()
}

#[tauri::command]
pub async fn disable_autostart() -> Result<(), String> {
    platform_disable()
}

#[tauri::command]
pub async fn is_autostart_enabled() -> Result<bool, String> {
    platform_is_enabled()
}
