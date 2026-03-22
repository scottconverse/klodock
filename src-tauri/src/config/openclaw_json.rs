use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Top-level structure of `~/.openclaw/openclaw.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawConfig {
    /// e.g. "anthropic", "openai", "openrouter", "ollama"
    pub model_provider: String,
    /// e.g. "claude-sonnet-4-20250514", "llama3", "gpt-4o"
    pub default_model: String,
    /// Base URL for the model provider API. Only needed for local providers
    /// like Ollama (e.g. "http://localhost:11434"). None for cloud providers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Named channel configs.  Keys are channel names (e.g. "default",
    /// "code-review"), values are channel-specific overrides serialized as
    /// arbitrary JSON objects.
    #[serde(default)]
    pub channels: HashMap<String, serde_json::Value>,
    /// Display name for the agent shown in the UI.
    #[serde(default = "default_agent_name")]
    pub agent_name: String,
}

fn default_agent_name() -> String {
    "OpenClaw".to_string()
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
#[tauri::command]
pub async fn read_config() -> Result<OpenClawConfig, String> {
    let path = config_path()?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read config at {}: {}", path.display(), e))?;

    serde_json::from_slice::<OpenClawConfig>(&bytes)
        .map_err(|e| format!("Failed to parse openclaw.json: {}", e))
}

/// Serialize and write the config to `openclaw.json`.
#[tauri::command]
pub async fn write_config(config: OpenClawConfig) -> Result<(), String> {
    let path = config_path()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    tokio::fs::write(&path, json.as_bytes())
        .await
        .map_err(|e| format!("Failed to write config at {}: {}", path.display(), e))
}
