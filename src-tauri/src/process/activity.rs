use crate::process::logger::{append_log, clear_logs, read_logs, ActivityEntry};

/// Record an activity event.
pub fn record(level: &str, message: &str) {
    let entry = ActivityEntry {
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        level: level.to_string(),
        message: message.to_string(),
    };
    let _ = append_log(&entry);
}

/// Get the last N activity entries.
#[tauri::command]
pub fn get_activity_log(count: Option<usize>) -> Vec<ActivityEntry> {
    let n = count.unwrap_or(20);
    read_logs(n)
}

/// Clear the activity log.
#[tauri::command]
pub fn clear_activity_log() {
    let _ = clear_logs();
}
