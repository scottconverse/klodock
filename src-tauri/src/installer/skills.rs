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

/// Install a skill from the ClawHub registry.
///
/// Delegates to:
/// ```text
/// <openclaw_bin> clawhub install <slug>
/// ```
///
/// Returns the installed version string on success.
#[tauri::command]
pub async fn install_skill(slug: String) -> Result<String, String> {
    let openclaw = super::openclaw::openclaw_bin_path();
    if !openclaw.exists() {
        return Err("OpenClaw binary not found. Please install OpenClaw first.".into());
    }

    let node_dir = super::node::klodock_base_dir().join("node");
    let current_path = std::env::var("PATH").unwrap_or_default();
    let path_sep = if cfg!(windows) { ";" } else { ":" };
    let new_path = format!("{}{}{}", node_dir.display(), path_sep, current_path);

    let output = tokio::process::Command::new(&openclaw)
        .args(["clawhub", "install", &slug])
        .env("PATH", &new_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run skill install: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Skill installation failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(stdout)
}

/// List all skills currently recorded in the ClawHub lock file.
///
/// Reads `~/.openclaw/.clawhub/lock.json` and returns a Vec of
/// [`InstalledSkill`] entries.
#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<InstalledSkill>, String> {
    let lock_path = clawhub_lock_path();

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
fn clawhub_lock_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".openclaw")
        .join(".clawhub")
        .join("lock.json")
}
