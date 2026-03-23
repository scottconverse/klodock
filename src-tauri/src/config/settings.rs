use serde_json::Value;
use std::path::PathBuf;

fn settings_path() -> Result<PathBuf, String> {
    Ok(crate::paths::klodock_base_dir()?.join("settings.json"))
}

fn read_settings() -> serde_json::Map<String, Value> {
    let path = match settings_path() {
        Ok(p) => p,
        Err(_) => return serde_json::Map::new(),
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(map: &serde_json::Map<String, Value>) -> Result<(), String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| {
                log::error!("Can't create settings dir: {e}");
                "Can't create settings folder. Check disk space.".to_string()
            })?;
    }
    let json = serde_json::to_string_pretty(map)
        .map_err(|e| {
            log::error!("Can't serialize settings: {e}");
            "Can't prepare settings for saving.".to_string()
        })?;
    std::fs::write(&path, json)
        .map_err(|e| {
            log::error!("Can't write settings at {}: {e}", path.display());
            "Can't save settings. Check disk space and permissions.".to_string()
        })?;
    Ok(())
}

/// Get whether the "keep API keys on disk" setting is enabled.
#[tauri::command]
pub fn get_keep_keys() -> bool {
    read_settings()
        .get("keep_api_keys_on_disk")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Set the "keep API keys on disk" setting.
#[tauri::command]
pub fn set_keep_keys(enabled: bool) -> Result<(), String> {
    let mut settings = read_settings();
    settings.insert(
        "keep_api_keys_on_disk".to_string(),
        Value::Bool(enabled),
    );
    write_settings(&settings)
}
