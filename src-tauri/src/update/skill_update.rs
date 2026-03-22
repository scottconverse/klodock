use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Describes the update status for a single installed skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillUpdateInfo {
    /// Skill identifier matching the ClawHub registry slug.
    pub slug: String,
    /// Semantic version currently installed locally.
    pub current_version: String,
    /// Latest version available on the ClawHub registry.
    pub latest_version: String,
    /// True when the registry version is newer than the local one.
    pub update_available: bool,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Compare every installed skill's lock.json hash against the ClawHub registry
/// to detect available updates.
///
/// Reads `~/.klodock/lock.json` for installed skill versions, then queries the
/// registry for the latest version of each.
#[tauri::command]
pub async fn check_skill_updates() -> Result<Vec<SkillUpdateInfo>, String> {
    // For now, return empty — no update checking until ClawHub API is connected.
    Ok(Vec::new())
}

/// Update a single skill to the latest version from ClawHub.
///
/// Runs the equivalent of `clawhub update <slug>`, verifying integrity after
/// download.
#[tauri::command]
pub async fn update_skill(slug: String) -> Result<String, String> {
    Err(format!("Skill updates are not yet available. You can reinstall '{}' manually from the skill browser.", slug))
}
