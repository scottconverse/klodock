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
/// Reads `~/.clawpad/lock.json` for installed skill versions, then queries the
/// registry for the latest version of each.
#[tauri::command]
pub async fn check_skill_updates() -> Result<Vec<SkillUpdateInfo>, String> {
    // TODO:
    // 1. Read ~/.clawpad/lock.json to get installed skill slugs + versions.
    // 2. For each skill, query ClawHub registry for latest version.
    // 3. Compare versions using semver.
    // 4. Return list of SkillUpdateInfo for all installed skills.
    todo!("Compare lock.json hashes against ClawHub registry")
}

/// Update a single skill to the latest version from ClawHub.
///
/// Runs the equivalent of `clawhub update <slug>`, verifying integrity after
/// download.
#[tauri::command]
pub async fn update_skill(slug: String) -> Result<String, String> {
    // TODO:
    // 1. Fetch latest version metadata from ClawHub registry.
    // 2. Download and install the updated skill package.
    // 3. Update lock.json with new version + hash.
    // 4. Return confirmation message.
    let _ = slug;
    todo!("Run clawhub update for a single skill")
}
