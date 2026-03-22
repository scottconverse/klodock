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
        .map_err(|e| format!("Failed to create cache directory: {e}"))?;
    Ok(path)
}

/// Write search results to the local skills cache file.
#[allow(dead_code)]
fn write_cache(skills: &[SkillMetadata]) -> Result<(), String> {
    let path = cache_path()?.join(SKILLS_CACHE_FILE);
    let json = serde_json::to_string_pretty(skills)
        .map_err(|e| format!("Failed to serialize skills cache: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write skills cache: {e}"))?;
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
        .map_err(|e| format!("Failed to read skills cache: {e}"))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse skills cache: {e}"))
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
async fn query_openclaw_skills() -> Result<Vec<(bool, SkillMetadata)>, String> {
    let openclaw = crate::installer::openclaw::openclaw_bin_path()?;
    if !openclaw.exists() {
        return Err("OpenClaw binary not found.".into());
    }

    let node_dir = crate::paths::klodock_base_dir()?.join("node");
    let current_path = std::env::var("PATH").unwrap_or_default();
    let path_sep = if cfg!(windows) { ";" } else { ":" };
    let new_path = format!("{}{}{}", node_dir.display(), path_sep, current_path);

    // Use --json for reliable parsing (avoids Unicode encoding issues on Windows).
    // Use std::process::Command (blocking) wrapped in spawn_blocking to avoid
    // tokio .cmd file issues on Windows.
    let new_path_clone = new_path.clone();
    let openclaw_clone = openclaw.clone();
    let output = tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
    .map_err(|e| format!("Failed to run openclaw skills list: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("openclaw skills list failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: SkillsListOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse skills JSON: {e}"))?;

    Ok(parsed.skills.into_iter().map(|entry| {
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
                SafetyRating::Verified
            } else {
                SafetyRating::Community
            },
            required_permissions: Vec::new(),
            updated_at: String::new(),
            eligible: entry.eligible,
            missing_requirements: missing_reqs,
        };
        (is_ready, skill)
    }).collect())
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
            log::error!("Failed to query OpenClaw skills: {e}");
            return Err(format!("Could not load skills: {e}"));
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
            log::error!("Failed to query all OpenClaw skills: {e}");
            return Err(format!("Could not load skills: {e}"));
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
