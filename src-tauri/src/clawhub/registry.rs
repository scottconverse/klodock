use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::safety::SafetyRating;

/// Base URL for the ClawHub skill registry API.
#[allow(dead_code)]
const CLAWHUB_REGISTRY_URL: &str = "https://clawhub.ai";

/// Subdirectory under ~/.klodock/ used for cached registry data.
const CACHE_DIR_NAME: &str = "cache";

/// Filename for the local skill search cache.
const SKILLS_CACHE_FILE: &str = "skills.json";

/// Bundled skills JSON shipped with the app as a fallback when the live
/// query fails (e.g., first run timeout, OpenClaw not ready yet).
const BUNDLED_SKILLS_JSON: &str = include_str!("../../bundled-skills.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Metadata describing a single skill from OpenClaw's bundled skill set
/// or from the ClawHub registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    /// URL-safe identifier, e.g. "weather".
    pub slug: String,
    /// Human-readable display name.
    pub name: String,
    /// Short description of what the skill does.
    pub description: String,
    /// Publisher / author handle.
    pub author: String,
    /// Semantic version string.
    pub version: String,
    /// Total number of installs across all users (0 for bundled skills).
    pub install_count: u64,
    /// Safety review status.
    pub safety_rating: SafetyRating,
    /// Permissions the skill declares it needs (e.g. "shell", "network").
    pub required_permissions: Vec<String>,
    /// ISO-8601 timestamp of the last publish.
    pub updated_at: String,
    /// Whether all requirements are met and the skill is ready to use.
    pub eligible: bool,
    /// Human-readable list of what's missing (empty if eligible).
    pub missing_requirements: Vec<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return `~/.klodock/cache/`, creating the directory if it does not exist.
fn cache_path() -> Result<PathBuf, String> {
    let path = crate::paths::klodock_base_dir()?.join(CACHE_DIR_NAME);
    std::fs::create_dir_all(&path)
        .map_err(|e| {
            log::error!("Cache dir creation failed: {}", e);
            "Couldn't create cache folder. Check disk space or permissions.".to_string()
        })?;
    Ok(path)
}

/// Write search results to the local skills cache file.
#[allow(dead_code)]
fn write_cache(skills: &[SkillMetadata]) -> Result<(), String> {
    let path = cache_path()?.join(SKILLS_CACHE_FILE);
    let json = serde_json::to_string_pretty(skills)
        .map_err(|e| {
            log::error!("Skills cache serialize failed: {}", e);
            "Couldn't prepare skills cache for saving.".to_string()
        })?;
    std::fs::write(&path, json)
        .map_err(|e| {
            log::error!("Skills cache write failed: {}", e);
            "Couldn't save skills cache. Check disk space.".to_string()
        })?;
    Ok(())
}

/// Read previously-cached search results, if any.
#[allow(dead_code)]
fn read_cache() -> Result<Vec<SkillMetadata>, String> {
    let path = cache_path()?.join(SKILLS_CACHE_FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| {
            log::error!("Skills cache read failed: {}", e);
            "Couldn't read skills cache. It will be refreshed automatically.".to_string()
        })?;
    serde_json::from_str(&data)
        .map_err(|e| {
            log::error!("Skills cache parse failed: {}", e);
            "Couldn't read skills cache — it may be corrupted. It will be refreshed.".to_string()
        })
}

/// JSON shape returned by `openclaw skills list --json`.
#[derive(Debug, Deserialize)]
struct SkillsListOutput {
    skills: Vec<SkillEntry>,
}

#[derive(Debug, Deserialize)]
struct SkillEntry {
    name: String,
    description: String,
    #[serde(default)]
    emoji: String,
    eligible: bool,
    source: String,
    #[serde(default)]
    bundled: bool,
    #[serde(default)]
    missing: Option<MissingRequirements>,
}

#[derive(Debug, Deserialize, Default)]
struct MissingRequirements {
    #[serde(default)]
    bins: Vec<String>,
    #[serde(default, rename = "anyBins")]
    any_bins: Vec<String>,
    #[serde(default)]
    env: Vec<String>,
    #[serde(default)]
    config: Vec<String>,
    #[serde(default)]
    os: Vec<String>,
}

/// Run `openclaw skills list` and return parsed results.
/// Times out after 15 seconds to avoid infinite hangs when the daemon is down.
async fn query_openclaw_skills() -> Result<Vec<(bool, SkillMetadata)>, String> {
    let openclaw = crate::installer::openclaw::openclaw_bin_path()?;
    if !openclaw.exists() {
        return Err("OpenClaw is not installed. Complete the setup wizard first.".into());
    }

    let node_dir = crate::paths::klodock_base_dir()?.join("node");
    let current_path = std::env::var("PATH").unwrap_or_default();
    let path_sep = if cfg!(windows) { ";" } else { ":" };
    let new_path = format!("{}{}{}", node_dir.display(), path_sep, current_path);

    // Use --json for reliable parsing (avoids Unicode encoding issues on Windows).
    // Use std::process::Command (blocking) wrapped in spawn_blocking to avoid
    // tokio .cmd file issues on Windows.
    // Wrapped in a 15-second timeout to prevent infinite hangs.
    let new_path_clone = new_path.clone();
    let openclaw_clone = openclaw.clone();
    let task = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&openclaw_clone);
        cmd.args(["skills", "list", "--json"])
            .env("PATH", &new_path_clone)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output()
    });

    // 180s timeout — first-ever run after fresh install can take 90-120s
    // as Node loads 500+ modules for the first time on Windows.
    let output = match tokio::time::timeout(std::time::Duration::from_secs(180), task).await {
        Ok(join_result) => join_result
            .map_err(|e| {
                log::error!("Skills task join error: {}", e);
                "Couldn't load skills list. Try restarting KloDock.".to_string()
            })?
            .map_err(|e| {
                log::error!("openclaw skills list failed: {}", e);
                "Couldn't load skills. Make sure OpenClaw is installed.".to_string()
            })?,
        Err(_) => {
            return Err("Skills query timed out. Try starting your agent from the Overview page.".into());
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("openclaw skills list failed: {}", stderr);
        return Err("Couldn't load skills list. Try restarting your agent.".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: SkillsListOutput = serde_json::from_str(&stdout)
        .map_err(|e| {
            log::error!("Skills JSON parse failed: {}", e);
            "Couldn't read skills data. Try restarting your agent.".to_string()
        })?;

    Ok(parsed.skills.into_iter().map(map_skill_entry).collect())
}

/// Convert a raw SkillEntry (from OpenClaw JSON) into a (is_ready, SkillMetadata) pair.
/// Shared between live query and bundled fallback to avoid duplication.
fn map_skill_entry(entry: SkillEntry) -> (bool, SkillMetadata) {
    let is_ready = entry.eligible;
    let name = entry.name.clone();
    let display_name = format!(
        "{} {}",
        entry.emoji,
        name.split('-')
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().to_string() + c.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    ).trim().to_string();

    // Build human-readable missing requirements list
    let mut missing_reqs = Vec::new();
    if let Some(ref m) = entry.missing {
        for bin in &m.bins { missing_reqs.push(format!("Requires: {bin}")); }
        if !m.any_bins.is_empty() {
            missing_reqs.push(format!("Requires one of: {}", m.any_bins.join(", ")));
        }
        for env in &m.env { missing_reqs.push(format!("Needs env: {env}")); }
        for cfg in &m.config { missing_reqs.push(format!("Needs config: {cfg}")); }
        for os in &m.os { missing_reqs.push(format!("Requires: {os}")); }
    }

    let skill = SkillMetadata {
        slug: name,
        name: display_name,
        description: entry.description,
        author: entry.source,
        version: String::new(),
        install_count: 0,
        safety_rating: if entry.bundled {
            SafetyRating::Bundled
        } else {
            SafetyRating::Published
        },
        required_permissions: Vec::new(),
        updated_at: String::new(),
        eligible: entry.eligible,
        missing_requirements: missing_reqs,
    };
    (is_ready, skill)
}

/// Parse the bundled skills JSON as a fallback when the live query fails.
///
/// **Important:** The `eligible` field in bundled JSON reflects the build
/// machine's state at compile time, not the user's machine. This means some
/// skills may show as "active" when they aren't actually available. This is
/// an acceptable tradeoff — showing an approximate skill list is better than
/// showing nothing — and the live query will correct the state on next load.
fn fallback_bundled_skills() -> Result<Vec<(bool, SkillMetadata)>, String> {
    log::warn!("Using bundled skills fallback (live query failed)");
    let parsed: SkillsListOutput = serde_json::from_str(BUNDLED_SKILLS_JSON)
        .map_err(|e| {
            log::error!("Bundled skills JSON parse failed: {}", e);
            "Couldn't load built-in skills list. Try reinstalling KloDock.".to_string()
        })?;

    Ok(parsed.skills.into_iter().map(map_skill_entry).collect())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Search the ClawHub registry for skills matching `query`.
#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SkillMetadata>, String> {
    let _ = (query, CLAWHUB_REGISTRY_URL);
    Err("Skill search is not yet connected to the ClawHub registry. Browse skills at https://clawhub.ai".into())
}

/// Fetch the full metadata for a single skill identified by its slug.
#[tauri::command]
pub async fn get_skill_details(slug: String) -> Result<SkillMetadata, String> {
    Err(format!("Skill details for '{slug}' — browse at https://clawhub.ai"))
}

/// Return recommended skills for the wizard by querying the real OpenClaw
/// skills list. Returns ready skills first, then a selection of useful
/// missing skills the user might want to know about.
#[tauri::command]
pub async fn get_recommended_skills(
    _goals: Vec<String>,
) -> Result<Vec<SkillMetadata>, String> {
    let all = match query_openclaw_skills().await {
        Ok(skills) => skills,
        Err(e) => {
            log::warn!("Live skills query failed ({e}), falling back to bundled list");
            fallback_bundled_skills()?
        }
    };

    // Separate ready and missing
    let ready: Vec<SkillMetadata> = all.iter()
        .filter(|(is_ready, _)| *is_ready)
        .map(|(_, s)| s.clone())
        .collect();

    let mut missing: Vec<SkillMetadata> = all.iter()
        .filter(|(is_ready, _)| !*is_ready)
        .map(|(_, s)| s.clone())
        .collect();

    // Curate a useful subset of missing skills for the wizard
    // Prioritize well-known, generally useful skills
    let priority_slugs = [
        "weather", "skill-creator", "healthcheck", "node-connect",
        "summarize", "notion", "slack", "discord",
        "gh-issues", "coding-agent", "clawhub",
    ];

    // Sort missing by priority order, then alphabetically
    missing.sort_by(|a, b| {
        let a_priority = priority_slugs.iter().position(|s| *s == a.slug);
        let b_priority = priority_slugs.iter().position(|s| *s == b.slug);
        match (a_priority, b_priority) {
            (Some(ap), Some(bp)) => ap.cmp(&bp),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.cmp(&b.name),
        }
    });

    // Return: all ready skills + top missing skills (up to 8 total)
    let mut result = ready;
    let remaining = 8_usize.saturating_sub(result.len());
    result.extend(missing.into_iter().take(remaining));

    Ok(result)
}

/// Return ALL available skills from OpenClaw (ready and missing).
/// Ready skills appear first, then missing skills sorted alphabetically.
#[tauri::command]
pub async fn list_all_skills() -> Result<Vec<SkillMetadata>, String> {
    let all = match query_openclaw_skills().await {
        Ok(skills) => skills,
        Err(e) => {
            log::warn!("Live skills query failed ({e}), falling back to bundled list");
            fallback_bundled_skills()?
        }
    };

    let mut ready: Vec<SkillMetadata> = all.iter()
        .filter(|(is_ready, _)| *is_ready)
        .map(|(_, s)| s.clone())
        .collect();
    ready.sort_by(|a, b| a.name.cmp(&b.name));

    let mut missing: Vec<SkillMetadata> = all.iter()
        .filter(|(is_ready, _)| !*is_ready)
        .map(|(_, s)| s.clone())
        .collect();
    missing.sort_by(|a, b| a.name.cmp(&b.name));

    ready.extend(missing);
    Ok(ready)
}
