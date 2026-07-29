use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// The path to the persistent activity log file.
pub fn get_log_path() -> Result<PathBuf, String> {
    Ok(crate::paths::klodock_base_dir()?.join("logs").join("activity.json"))
}

/// Appends a new entry to the activity log file.
/// If the file doesn't exist, it creates it with an empty list.
pub fn append_log(entry: &ActivityEntry) -> Result<(), String> {
    let path = get_log_path()?;
    
    // Ensure logs directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            log::error!("Failed to create log directory: {}", e);
            "Couldn't prepare log folder.".to_string()
        })?;
    }

    let mut logs = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| {
            log::error!("Failed to read activity log: {}", e);
            "Couldn't read activity log.".to_string()
        })?;
        serde_json::from_str::<Vec<ActivityEntry>>(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    logs.push(entry.clone());
    
    // Keep only the last 100 entries to prevent unbounded growth
    if logs.len() > 100 {
        logs.drain(0..logs.len() - 100);
    }

    let json = serde_json::to_string_pretty(&logs).map_err(|e| {
        log::error!("Failed to serialize activity log: {}", e);
        "Couldn't save activity log.".to_string()
    })?;

    fs::write(path, json).map_err(|e| {
        log::error!("Failed to write activity log: {}", e);
        "Couldn't write activity log.".to_string()
    })?;

    Ok(())
}

/// Reads the last N entries from the activity log.
pub fn read_logs(count: usize) -> Vec<ActivityEntry> {
    let path = get_log_path().unwrap_or_default();
    if !path.exists() {
        return Vec::new();
    }

    fs::read_to_string(&path).ok().and_then(|content| {
        serde_json::from_str::<Vec<ActivityEntry>>(&content).ok()
    }).unwrap_or_default()
        .into_iter()
        .rev()
        .take(count)
        .collect()
}

/// Clears the activity log file.
pub fn clear_logs() -> Result<(), String> {
    let path = get_log_path()?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| {
            log::error!("Failed to delete activity log: {}", e);
            "Couldn't clear activity log.".to_string()
        })?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub timestamp: String,
    pub level: String, // "info", "warn", "error", "success"
    pub message: String,
}
