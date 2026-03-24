use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Top-level structure of `~/.openclaw/openclaw.json`.
///
/// OpenClaw uses JSON5 and has a strict schema — unknown keys cause the
/// Gateway to refuse to start. We only write the fields KloDock manages
/// and preserve any existing config by merging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agents: Option<AgentsConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channels: Option<ChannelsConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gateway: Option<GatewayConfig>,
    /// Preserve any other fields OpenClaw expects (session, hooks, etc.)
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<GatewayAuth>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, rename = "controlUi", skip_serializing_if = "Option::is_none")]
    pub control_ui: Option<ControlUiConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlUiConfig {
    #[serde(default, rename = "allowInsecureAuth", skip_serializing_if = "Option::is_none")]
    pub allow_insecure_auth: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayAuth {
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defaults: Option<AgentDefaults>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    /// Primary model in "provider/model" format, e.g. "google/gemini-pro"
    pub primary: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallbacks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelsConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub telegram: Option<TelegramChannelConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discord: Option<DiscordChannelConfig>,
    /// Preserve any other channel configs
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelegramChannelConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub bot_token: String,
    #[serde(default = "default_dm_policy")]
    pub dm_policy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordChannelConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub bot_token: String,
    #[serde(default = "default_dm_policy")]
    pub dm_policy: String,
}

fn default_true() -> bool { true }
fn default_dm_policy() -> String { "pairing".to_string() }

/// Helper to build the model ref string in "provider/model" format.
pub fn model_ref(provider: &str, model: &str) -> String {
    match provider {
        "openai" => format!("openai/{}", model),
        "anthropic" => format!("anthropic/{}", model),
        "gemini" | "google" => format!("google/{}", model),
        "groq" => format!("groq/{}", model),
        "openrouter" => model.to_string(), // OpenRouter models already have provider prefix
        "ollama" => format!("ollama/{}", model),
        _ => format!("{}/{}", provider, model),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns `~/.openclaw/openclaw.json`.
pub fn config_path() -> Result<PathBuf, String> {
    Ok(crate::paths::openclaw_base_dir()?.join("openclaw.json"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Read and deserialize `openclaw.json` from disk.
/// If the file doesn't exist, returns a default empty config.
#[tauri::command]
pub async fn read_config() -> Result<OpenClawConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(OpenClawConfig {
            agents: None,
            channels: None,
            gateway: None,
            extra: serde_json::Map::new(),
        });
    }
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| {
            log::error!("Config read failed at {}: {}", path.display(), e);
            "Couldn't load your settings. Try restarting KloDock.".to_string()
        })?;

    serde_json::from_slice::<OpenClawConfig>(&bytes)
        .map_err(|e| {
            log::error!("Config parse failed: {}", e);
            "Couldn't read your settings — config file may be corrupted. Try resetting in Settings.".to_string()
        })
}

/// Merge and write the config to `openclaw.json`.
/// Reads the existing file first and merges KloDock's fields on top,
/// preserving any fields set by OpenClaw or the user directly.
#[tauri::command]
pub async fn write_config(config: OpenClawConfig) -> Result<(), String> {
    let path = config_path()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| {
                log::error!("Config dir creation failed at {}: {}", parent.display(), e);
                "Couldn't create settings folder. Check disk space or permissions.".to_string()
            })?;
    }

    // Read existing config to merge
    let mut existing: serde_json::Value = if path.exists() {
        let bytes = tokio::fs::read(&path)
            .await
            .map_err(|e| {
                log::error!("Existing config read failed: {}", e);
                "Couldn't read existing settings. Try restarting KloDock.".to_string()
            })?;
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Object(serde_json::Map::new()))
    } else {
        serde_json::Value::Object(serde_json::Map::new())
    };

    // Merge our config on top
    let new_value = serde_json::to_value(&config)
        .map_err(|e| {
            log::error!("Config serialization failed: {}", e);
            "Couldn't prepare settings for saving.".to_string()
        })?;

    if let (Some(existing_obj), Some(new_obj)) = (existing.as_object_mut(), new_value.as_object()) {
        for (k, v) in new_obj {
            if !v.is_null() {
                existing_obj.insert(k.clone(), v.clone());
            }
        }
    }

    let json = serde_json::to_string_pretty(&existing)
        .map_err(|e| {
            log::error!("Config serialization failed: {}", e);
            "Couldn't prepare settings for saving.".to_string()
        })?;

    tokio::fs::write(&path, json.as_bytes())
        .await
        .map_err(|e| {
            log::error!("Config write failed at {}: {}", path.display(), e);
            "Couldn't save your settings. Check disk space or permissions.".to_string()
        })
}
