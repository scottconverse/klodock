use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::safety::SafetyRating;

/// Base URL for the ClawHub skill registry API.
const CLAWHUB_REGISTRY_URL: &str = "https://clawhub.com/api/v1";

/// Subdirectory under ~/.klodock/ used for cached registry data.
const CACHE_DIR_NAME: &str = "cache";

/// Filename for the local skill search cache.
const SKILLS_CACHE_FILE: &str = "skills.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Metadata describing a single skill published to the ClawHub registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    /// URL-safe identifier, e.g. "code-review".
    pub slug: String,
    /// Human-readable display name.
    pub name: String,
    /// Short description of what the skill does.
    pub description: String,
    /// Publisher / author handle.
    pub author: String,
    /// Semantic version string.
    pub version: String,
    /// Total number of installs across all users.
    pub install_count: u64,
    /// Safety review status.
    pub safety_rating: SafetyRating,
    /// Permissions the skill declares it needs (e.g. "shell", "network").
    pub required_permissions: Vec<String>,
    /// ISO-8601 timestamp of the last publish.
    pub updated_at: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return `~/.klodock/cache/`, creating the directory if it does not exist.
fn cache_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let path = home.join(".klodock").join(CACHE_DIR_NAME);
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create cache directory: {e}"))?;
    Ok(path)
}

/// Write search results to the local skills cache file.
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

/// Hardcoded starter skills returned by [`get_recommended_skills`] until the
/// recommendation engine is built out.
fn starter_recommendations() -> Vec<SkillMetadata> {
    vec![
        SkillMetadata {
            slug: "code-review".into(),
            name: "Code Review".into(),
            description: "Automated code review with style and bug checks".into(),
            author: "clawhub".into(),
            version: "1.0.0".into(),
            install_count: 12_500,
            safety_rating: SafetyRating::Verified,
            required_permissions: vec!["filesystem".into()],
            updated_at: "2025-06-01T00:00:00Z".into(),
        },
        SkillMetadata {
            slug: "test-gen".into(),
            name: "Test Generator".into(),
            description: "Generate unit tests from function signatures".into(),
            author: "clawhub".into(),
            version: "1.2.0".into(),
            install_count: 8_300,
            safety_rating: SafetyRating::Verified,
            required_permissions: vec!["filesystem".into()],
            updated_at: "2025-05-20T00:00:00Z".into(),
        },
        SkillMetadata {
            slug: "doc-writer".into(),
            name: "Documentation Writer".into(),
            description: "Auto-generate docs from source code".into(),
            author: "clawhub".into(),
            version: "0.9.0".into(),
            install_count: 6_100,
            safety_rating: SafetyRating::Community,
            required_permissions: vec!["filesystem".into()],
            updated_at: "2025-05-15T00:00:00Z".into(),
        },
        SkillMetadata {
            slug: "git-commit-craft".into(),
            name: "Commit Crafter".into(),
            description: "Generate meaningful git commit messages".into(),
            author: "community".into(),
            version: "1.1.0".into(),
            install_count: 4_200,
            safety_rating: SafetyRating::Community,
            required_permissions: vec!["shell".into()],
            updated_at: "2025-04-30T00:00:00Z".into(),
        },
        SkillMetadata {
            slug: "refactor-assist".into(),
            name: "Refactor Assistant".into(),
            description: "Suggest and apply safe refactoring patterns".into(),
            author: "clawhub".into(),
            version: "0.8.0".into(),
            install_count: 3_700,
            safety_rating: SafetyRating::Verified,
            required_permissions: vec!["filesystem".into()],
            updated_at: "2025-05-10T00:00:00Z".into(),
        },
    ]
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Search the ClawHub registry for skills matching `query`.
///
/// Results are cached locally in `~/.klodock/cache/skills.json` so the UI can
/// display them while offline.
#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SkillMetadata>, String> {
    // TODO: HTTP GET to {CLAWHUB_REGISTRY_URL}/skills?q={query}
    //       Parse JSON response into Vec<SkillMetadata>.
    //       On success, write_cache(&results).
    //       On network failure, fall back to read_cache().
    let _ = (query, CLAWHUB_REGISTRY_URL);
    Err("Skill search is not yet connected to the ClawHub registry. This feature is coming in a future update.".into())
}

/// Fetch the full metadata for a single skill identified by its slug.
#[tauri::command]
pub async fn get_skill_details(slug: String) -> Result<SkillMetadata, String> {
    // TODO: HTTP GET to {CLAWHUB_REGISTRY_URL}/skills/{slug}
    //       Parse JSON response into SkillMetadata.
    let _ = CLAWHUB_REGISTRY_URL;
    Err(format!("Skill details for '{}' are not yet available. The ClawHub registry connection is coming in a future update.", slug))
}

/// Return 3-5 recommended skills based on the user's stated goals from the
/// setup wizard.
///
/// Currently returns hardcoded starter recommendations filtered by simple
/// keyword matching against the provided goals.
#[tauri::command]
pub async fn get_recommended_skills(
    goals: Vec<String>,
) -> Result<Vec<SkillMetadata>, String> {
    let all = starter_recommendations();

    if goals.is_empty() {
        // No goals provided — return the top 3 by install count.
        let mut sorted = all;
        sorted.sort_by(|a, b| b.install_count.cmp(&a.install_count));
        sorted.truncate(3);
        return Ok(sorted);
    }

    // Simple keyword matching: keep skills whose name or description contains
    // any of the goal keywords.
    let lower_goals: Vec<String> = goals.iter().map(|g| g.to_lowercase()).collect();
    let matched: Vec<SkillMetadata> = all
        .into_iter()
        .filter(|s| {
            let haystack = format!("{} {}", s.name, s.description).to_lowercase();
            lower_goals.iter().any(|g| haystack.contains(g.as_str()))
        })
        .collect();

    if matched.is_empty() {
        // Fallback: return top 3 starters.
        let mut fallback = starter_recommendations();
        fallback.sort_by(|a, b| b.install_count.cmp(&a.install_count));
        fallback.truncate(3);
        Ok(fallback)
    } else {
        let mut result = matched;
        result.truncate(5);
        Ok(result)
    }
}
