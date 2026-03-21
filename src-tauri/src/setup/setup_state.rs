use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Each discrete step in the first-run setup wizard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SetupStep {
    NodeInstall,
    OpenClawInstall,
    ApiKeySetup,
    PersonalitySetup,
    ChannelSetup,
    SkillInstall,
}

/// Tracks whether an individual step has been attempted / completed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "status", content = "message")]
pub enum StepStatus {
    NotStarted,
    InProgress,
    Completed,
    Failed(String),
}

/// Full wizard state that is persisted to `~/.clawpad/setup-state.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupState {
    pub steps: HashMap<SetupStep, StepStatus>,
}

impl SetupState {
    /// Return a fresh state with every step marked `NotStarted`.
    pub fn new_all_not_started() -> Self {
        let mut steps = HashMap::new();
        for &step in Self::all_steps() {
            steps.insert(step, StepStatus::NotStarted);
        }
        Self { steps }
    }

    /// Canonical ordering of steps.
    pub fn all_steps() -> &'static [SetupStep] {
        &[
            SetupStep::NodeInstall,
            SetupStep::OpenClawInstall,
            SetupStep::ApiKeySetup,
            SetupStep::PersonalitySetup,
            SetupStep::ChannelSetup,
            SetupStep::SkillInstall,
        ]
    }
}

/// Path to `~/.clawpad/setup-state.json`.
fn state_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".clawpad").join("setup-state.json"))
}

/// Reads persisted setup state from disk.
/// Returns all-NotStarted if the file does not exist.
#[tauri::command]
pub async fn get_setup_state() -> Result<SetupState, String> {
    let path = state_file_path()?;
    if !path.exists() {
        return Ok(SetupState::new_all_not_started());
    }
    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read setup state: {e}"))?;
    let state: SetupState =
        serde_json::from_str(&contents).map_err(|e| format!("Failed to parse setup state: {e}"))?;
    Ok(state)
}

/// Marks a single step as `Completed` and persists to disk.
#[tauri::command]
pub async fn complete_step(step: SetupStep) -> Result<SetupState, String> {
    let mut state = get_setup_state().await?;
    state.steps.insert(step, StepStatus::Completed);
    persist_state(&state).await?;
    Ok(state)
}

/// For each step, runs a verification function that checks REAL system state
/// (node on PATH, openclaw binary, keychain secrets, SOUL.md, etc.).
/// The returned state may differ from the persisted one.
#[tauri::command]
pub async fn verify_all_steps() -> Result<SetupState, String> {
    let mut state = SetupState::new_all_not_started();

    for &step in SetupState::all_steps() {
        let status = verify_step(step).await;
        state.steps.insert(step, status);
    }

    persist_state(&state).await?;
    Ok(state)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async fn persist_state(state: &SetupState) -> Result<(), String> {
    let path = state_file_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create .clawpad dir: {e}"))?;
    }
    let json =
        serde_json::to_string_pretty(state).map_err(|e| format!("Failed to serialize state: {e}"))?;
    tokio::fs::write(&path, json)
        .await
        .map_err(|e| format!("Failed to write setup state: {e}"))?;
    Ok(())
}

/// Run a real verification for a single step.
async fn verify_step(step: SetupStep) -> StepStatus {
    match step {
        SetupStep::NodeInstall => verify_node_install().await,
        SetupStep::OpenClawInstall => verify_openclaw_install().await,
        SetupStep::ApiKeySetup => verify_api_key_setup().await,
        SetupStep::PersonalitySetup => verify_personality_setup().await,
        SetupStep::ChannelSetup => verify_channel_setup().await,
        SetupStep::SkillInstall => verify_skill_install().await,
    }
}

/// Checks if `node >= 22` is on PATH or at `~/.clawpad/node/`.
async fn verify_node_install() -> StepStatus {
    // Check ClawPad-managed node first
    let clawpad_node = crate::installer::node::clawpad_node_path();
    if clawpad_node.exists() {
        return StepStatus::Completed;
    }
    // Check system PATH
    match which::which("node") {
        Ok(path) => {
            match std::process::Command::new(&path).arg("--version").output() {
                Ok(output) => {
                    let version = String::from_utf8_lossy(&output.stdout);
                    let major: u64 = version.trim().trim_start_matches('v')
                        .split('.').next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    if major >= 22 { StepStatus::Completed } else { StepStatus::NotStarted }
                }
                Err(_) => StepStatus::NotStarted,
            }
        }
        Err(_) => StepStatus::NotStarted,
    }
}

/// Checks if the openclaw binary exists on disk.
async fn verify_openclaw_install() -> StepStatus {
    let managed = crate::installer::openclaw::openclaw_bin_path();
    if managed.exists() {
        return StepStatus::Completed;
    }
    match which::which("openclaw") {
        Ok(_) => StepStatus::Completed,
        Err(_) => StepStatus::NotStarted,
    }
}

/// Checks if the OS keychain has at least one API key stored.
async fn verify_api_key_setup() -> StepStatus {
    match crate::secrets::keychain::list_secrets() {
        Ok(keys) => {
            if keys.is_empty() { StepStatus::NotStarted } else { StepStatus::Completed }
        }
        Err(_) => StepStatus::NotStarted,
    }
}

/// Checks if `~/.openclaw/SOUL.md` exists.
async fn verify_personality_setup() -> StepStatus {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return StepStatus::Failed("Cannot determine home directory".into()),
    };
    let soul_path = home.join(".openclaw").join("SOUL.md");
    if soul_path.exists() {
        StepStatus::Completed
    } else {
        StepStatus::NotStarted
    }
}

/// Checks if `openclaw.json` has at least one channel configured.
async fn verify_channel_setup() -> StepStatus {
    // Check if any channel token exists in the secret store
    match crate::secrets::keychain::list_secrets() {
        Ok(keys) => {
            let has_channel = keys.iter().any(|k| {
                k.contains("TELEGRAM") || k.contains("DISCORD") || k.contains("WHATSAPP")
            });
            if has_channel { StepStatus::Completed } else { StepStatus::NotStarted }
        }
        Err(_) => StepStatus::NotStarted,
    }
}

/// Checks if `lock.json` has any skill entries.
async fn verify_skill_install() -> StepStatus {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return StepStatus::NotStarted,
    };
    let lock_path = home.join(".openclaw").join(".clawhub").join("lock.json");
    if !lock_path.exists() {
        return StepStatus::NotStarted;
    }
    match tokio::fs::read_to_string(&lock_path).await {
        Ok(content) => {
            // Any non-empty, non-trivial JSON means skills are installed
            if content.trim().len() > 2 { StepStatus::Completed } else { StepStatus::NotStarted }
        }
        Err(_) => StepStatus::NotStarted,
    }
}
