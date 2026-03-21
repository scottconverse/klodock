use serde::{Deserialize, Serialize};

/// npm registry URL used to look up the latest published OpenClaw version.
const NPM_REGISTRY_URL: &str = "https://registry.npmjs.org/@anthropic/openclaw";

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
    // TODO:
    // 1. Run `npm list -g @anthropic/openclaw --json` to get current_version.
    // 2. HTTP GET {NPM_REGISTRY_URL} and parse `dist-tags.latest`.
    // 3. Compare with semver::Version.
    let _ = NPM_REGISTRY_URL;
    todo!("Check npm registry for latest OpenClaw version")
}

/// Update OpenClaw to the latest version via npm.
///
/// Before running the update, the current configuration is backed up through
/// the config module so it can be restored if the update fails.
#[tauri::command]
pub async fn update_openclaw() -> Result<String, String> {
    // TODO:
    // 1. Back up current config via crate::config (e.g. copy openclaw.json).
    // 2. Run `npm update -g @anthropic/openclaw`.
    // 3. Verify the new version with `check_openclaw_update()`.
    // 4. On failure, restore backed-up config.
    todo!("Run npm update for OpenClaw with config backup")
}
