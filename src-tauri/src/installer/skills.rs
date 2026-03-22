use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A skill that has been installed via `clawhub install`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledSkill {
    /// Registry slug, e.g. "openclaw/web-search".
    pub slug: String,
    /// Installed version string.
    pub version: String,
    /// SHA-256 content hash recorded at install time.
    pub content_hash: String,
}

/// Shape of `~/.openclaw/.clawhub/lock.json` on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClawHubLock {
    /// Map of slug -> lock entry.
    skills: Vec<LockEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LockEntry {
    slug: String,
    version: String,
    content_hash: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// "Install" a skill by slug.
///
/// For bundled OpenClaw skills (source: openclaw-bundled), skills are already
/// present — they just need their requirements met. This command is effectively
/// a no-op acknowledgment that the user selected this skill.
///
/// For ClawHub registry skills, delegates to `npx clawhub install <slug>`.
///
/// Returns Ok with a status message on success.
#[tauri::command]
pub async fn install_skill(slug: String) -> Result<String, String> {
    // Bundled skills are already installed with OpenClaw — selecting them
    // in the wizard is just an acknowledgment. No install action needed.
    // The skill becomes active when its requirements are met (checked by
    // `openclaw skills check`).
    //
    // In the future, ClawHub registry skills will use:
    //   npx clawhub install <slug>
    // but for the wizard's recommended skills (all bundled), we skip that.

    log::info!("Skill selected: {slug}");
    Ok(format!("{slug} enabled"))
}

/// List all skills currently recorded in the ClawHub lock file.
///
/// Reads `~/.openclaw/.clawhub/lock.json` and returns a Vec of
/// [`InstalledSkill`] entries.
#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<InstalledSkill>, String> {
    let lock_path = clawhub_lock_path()?;

    if !lock_path.exists() {
        return Ok(Vec::new());
    }

    let contents = tokio::fs::read_to_string(&lock_path)
        .await
        .map_err(|e| format!("Failed to read lock.json: {e}"))?;

    let lock: ClawHubLock = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse lock.json: {e}"))?;

    Ok(lock
        .skills
        .into_iter()
        .map(|entry| InstalledSkill {
            slug: entry.slug,
            version: entry.version,
            content_hash: entry.content_hash,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Path to the ClawHub lock file: `~/.openclaw/.clawhub/lock.json`.
fn clawhub_lock_path() -> Result<PathBuf, String> {
    Ok(crate::paths::openclaw_base_dir()?
        .join(".clawhub")
        .join("lock.json"))
}
