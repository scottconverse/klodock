use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// A single activity log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub timestamp: String,
    pub level: String, // "info", "warn", "error", "success"
    pub message: String,
}

/// In-memory activity log. Keeps the last 100 entries.
static ACTIVITY_LOG: Mutex<Vec<ActivityEntry>> = Mutex::new(Vec::new());

const MAX_ENTRIES: usize = 100;

/// Record an activity event.
pub fn record(level: &str, message: &str) {
    let entry = ActivityEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        level: level.to_string(),
        message: message.to_string(),
    };
    if let Ok(mut log) = ACTIVITY_LOG.lock() {
        log.push(entry);
        if log.len() > MAX_ENTRIES {
            log.remove(0);
        }
    }
}

/// Get the last N activity entries.
#[tauri::command]
pub fn get_activity_log(count: Option<usize>) -> Vec<ActivityEntry> {
    let n = count.unwrap_or(20);
    match ACTIVITY_LOG.lock() {
        Ok(log) => {
            let start = if log.len() > n { log.len() - n } else { 0 };
            log[start..].to_vec()
        }
        Err(_) => Vec::new(),
    }
}

/// Clear the activity log.
#[tauri::command]
pub fn clear_activity_log() {
    if let Ok(mut log) = ACTIVITY_LOG.lock() {
        log.clear();
    }
}
