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

/// Partial shape of the npm registry response — we only need dist-tags.latest.
#[derive(Debug, Deserialize)]
struct NpmRegistryResponse {
    #[serde(rename = "dist-tags")]
    dist_tags: Option<NpmDistTags>,
}

#[derive(Debug, Deserialize)]
struct NpmDistTags {
    latest: Option<String>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Check the npm registry for the latest OpenClaw version and compare it to
/// the locally installed version.
#[tauri::command]
pub async fn check_openclaw_update() -> Result<UpdateInfo, String> {
    let current = match crate::installer::openclaw::check_openclaw().await {
        Ok(status) => status.version.unwrap_or_else(|| "unknown".to_string()),
        Err(_) => "unknown".to_string(),
    };

    // Query npm registry for the latest version
    let latest = fetch_latest_npm_version().await.unwrap_or_else(|e| {
        log::warn!("Failed to check npm registry: {e}");
        "unknown".to_string()
    });

    let update_available = is_newer(&current, &latest);

    Ok(UpdateInfo {
        current_version: current,
        latest_version: latest,
        update_available,
    })
}

/// Update OpenClaw to the latest version via npm.
///
/// Reuses the existing `install_openclaw` logic which runs
/// `npm install -g openclaw@latest`.
#[tauri::command]
pub async fn update_openclaw(app: tauri::AppHandle) -> Result<String, String> {
    // Stop the daemon first so files aren't locked
    log::info!("Stopping daemon for OpenClaw update...");
    let _ = crate::process::daemon::stop_daemon().await;

    // Reuse the install command — it runs `npm install -g openclaw@latest`
    // which will upgrade if already installed
    log::info!("Running OpenClaw update via npm...");
    let version = crate::installer::openclaw::install_openclaw(app.clone()).await?;

    // Restart the daemon with the new version
    log::info!("Restarting daemon after update...");
    let _ = crate::process::daemon::start_daemon(app).await;

    Ok(version)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Fetch the latest published version from the npm registry.
async fn fetch_latest_npm_version() -> Result<String, String> {
    // Use a minimal HTTP client via reqwest (already a transitive dep via Tauri).
    // If reqwest isn't available, fall back to spawning a subprocess.
    let url = format!("{NPM_REGISTRY_URL}/latest");

    // Try using our managed node to query npm view
    let node_dir = crate::paths::klodock_base_dir()?.join("node");
    let npm_path = if cfg!(windows) {
        node_dir.join("npm.cmd")
    } else {
        node_dir.join("bin").join("npm")
    };

    if npm_path.exists() {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let path_sep = if cfg!(windows) { ";" } else { ":" };
        let new_path = format!("{}{}{}", node_dir.display(), path_sep, current_path);

        let npm_clone = npm_path.clone();
        let new_path_clone = new_path.clone();

        let output = tokio::task::spawn_blocking(move || {
            let mut cmd = std::process::Command::new(&npm_clone);
            cmd.args(["view", "openclaw", "version"])
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
        .map_err(|e| format!("Failed to run npm view: {e}"))?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string();
            if !version.is_empty() {
                return Ok(version);
            }
        }
    }

    Err("Could not determine latest version from npm registry.".into())
}

/// Compare two semver-ish strings. Returns true if `latest` is strictly newer
/// than `current`. Falls back to string comparison if parsing fails.
fn is_newer(current: &str, latest: &str) -> bool {
    if current == "unknown" || latest == "unknown" {
        return false;
    }

    // Strip common prefixes
    let c = current.trim().trim_start_matches('v');
    let l = latest.trim().trim_start_matches('v');

    if c == l {
        return false;
    }

    // Try semantic version comparison
    let c_parts: Vec<u64> = c.split('.').filter_map(|p| p.parse().ok()).collect();
    let l_parts: Vec<u64> = l.split('.').filter_map(|p| p.parse().ok()).collect();

    if c_parts.len() >= 3 && l_parts.len() >= 3 {
        for i in 0..3 {
            if l_parts[i] > c_parts[i] {
                return true;
            }
            if l_parts[i] < c_parts[i] {
                return false;
            }
        }
        return false;
    }

    // OpenClaw uses date-based versions like "2026.3.13" — handle those too
    let c_nums: Vec<u64> = c.split('.').filter_map(|p| p.split('-').next()?.parse().ok()).collect();
    let l_nums: Vec<u64> = l.split('.').filter_map(|p| p.split('-').next()?.parse().ok()).collect();

    for i in 0..c_nums.len().min(l_nums.len()) {
        if l_nums[i] > c_nums[i] {
            return true;
        }
        if l_nums[i] < c_nums[i] {
            return false;
        }
    }

    false
}
