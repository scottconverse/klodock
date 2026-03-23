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

/// Check for skill updates.
///
/// OpenClaw bundles all 52 skills with the framework itself — they update
/// when OpenClaw is updated. This command checks if OpenClaw has a newer
/// version available and, if so, reports all skills as "update available."
///
/// Individual skill updates (from ClawHub) will be supported in a future
/// version when ClawHub exposes a versioned skill API.
#[tauri::command]
pub async fn check_skill_updates() -> Result<Vec<SkillUpdateInfo>, String> {
    // Check if OpenClaw itself has an update available
    let update_info = crate::update::openclaw_update::check_openclaw_update().await;

    match update_info {
        Ok(info) if info.update_available => {
            // All bundled skills update together — report a single entry
            Ok(vec![SkillUpdateInfo {
                slug: "openclaw-bundled".to_string(),
                current_version: info.current_version,
                latest_version: info.latest_version,
                update_available: true,
            }])
        }
        _ => Ok(Vec::new()), // No updates or check failed
    }
}

/// Update a single skill to the latest version.
///
/// Since all skills are currently bundled with OpenClaw, this triggers
/// a full OpenClaw update. Individual skill updates will be supported
/// when ClawHub exposes a versioned skill API.
#[tauri::command]
pub async fn update_skill(app: tauri::AppHandle, slug: String) -> Result<String, String> {
    if slug == "openclaw-bundled" {
        // Delegate to OpenClaw update
        crate::update::openclaw_update::update_openclaw(app)
            .await
            .map(|v| format!("All skills updated with OpenClaw {v}"))
    } else {
        Err(format!(
            "Individual skill updates aren't available yet. \
             All 52 bundled skills update when you update OpenClaw. \
             Check the Updates page to update."
        ))
    }
}
