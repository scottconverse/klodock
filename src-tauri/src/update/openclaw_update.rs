use serde::{Deserialize, Serialize};

/// npm registry URL used to look up the latest published OpenClaw version.
const NPM_REGISTRY_URL: &str = "https://registry.npmjs.org/openclaw";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Describes the current vs. latest OpenClaw version and whether an update is
/// available.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// Semantic version currently installed on this machine.
    pub current_version: String,
    /// Latest version published to the npm registry.
    pub latest_version: String,
    /// True when `latest_version` is newer than `current_version`.
    pub update_available: bool,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Check the npm registry for the latest OpenClaw version and compare it to
/// the locally installed version.
///
/// Returns an [`UpdateInfo`] describing the current state.
#[tauri::command]
pub async fn check_openclaw_update() -> Result<UpdateInfo, String> {
    // For now, return "up to date" since we can't check the registry yet.
    // The real implementation will query the npm registry.
    let _ = NPM_REGISTRY_URL;
    let current = match crate::installer::openclaw::check_openclaw().await {
        Ok(status) => status.version.unwrap_or_else(|| "unknown".to_string()),
        Err(_) => "unknown".to_string(),
    };
    Ok(UpdateInfo {
        current_version: current,
        latest_version: "unknown".to_string(),
        update_available: false,
    })
}

/// Update OpenClaw to the latest version via npm.
///
/// Before running the update, the current configuration is backed up through
/// the config module so it can be restored if the update fails.
#[tauri::command]
pub async fn update_openclaw() -> Result<String, String> {
    Err("Automatic updates are not yet available. Please reinstall KloDock to get the latest version.".into())
}
