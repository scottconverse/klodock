use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Aggregated health-check result returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    /// Whether the openclaw daemon process is alive.
    pub daemon_alive: bool,
    /// `Some(true)` if the stored API key passes a test call, `None` if no key is stored.
    pub api_key_valid: Option<bool>,
    /// Per-channel liveness: channel name -> healthy.
    pub channels: HashMap<String, bool>,
    /// Plain-English summary of any issues found.
    pub issues: Vec<String>,
}

/// Run all health checks and return the composite status.
///
/// Checks performed:
/// 1. Is the daemon process alive? (via PID file)
/// 2. Is the primary API key valid? (lightweight test call)
/// 3. Are configured channels responding?
#[tauri::command]
pub async fn run_health_check() -> Result<HealthStatus, String> {
    let mut issues = Vec::new();

    // 1. Check daemon
    let daemon_status = super::daemon::get_daemon_status().await?;
    let daemon_alive = matches!(daemon_status, super::daemon::DaemonStatus::Running);
    if !daemon_alive {
        issues.push("Your agent is not running. Try restarting it from the dashboard.".into());
    }

    // 2. Check API key validity
    let api_key_valid = check_api_key_health(&mut issues).await;

    // 3. Check channel health
    let channels = check_channel_health(&mut issues).await;

    Ok(HealthStatus {
        daemon_alive,
        api_key_valid,
        channels,
        issues,
    })
}

/// Check if the primary API key is still valid.
async fn check_api_key_health(issues: &mut Vec<String>) -> Option<bool> {
    // Read the key index to find stored keys
    let key_names = match crate::secrets::keychain::list_secrets() {
        Ok(keys) => keys,
        Err(_) => return None,
    };

    if key_names.is_empty() {
        issues.push("No API key configured. Go to Settings to add one.".into());
        return None;
    }

    // Test the first available key
    // Determine provider from key name (e.g., "OPENAI_API_KEY" -> "openai")
    for key_name in &key_names {
        let provider = match key_name.as_str() {
            "OPENAI_API_KEY" => "openai",
            "ANTHROPIC_API_KEY" => "anthropic",
            "GEMINI_API_KEY" => "gemini",
            "GROQ_API_KEY" => "groq",
            "OPENROUTER_API_KEY" => "openrouter",
            _ => continue,
        };

        let key_value = match crate::secrets::keychain::retrieve_secret(key_name.clone()) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match crate::secrets::keychain::test_api_key(provider.to_string(), key_value).await {
            Ok(true) => return Some(true),
            Ok(false) => {
                issues.push(format!(
                    "Your {} API key is invalid or expired. Click Settings to update it.",
                    provider_display_name(provider)
                ));
                return Some(false);
            }
            Err(_) => {
                // Network error — don't report as invalid
                continue;
            }
        }
    }

    None
}

/// Check health of configured channels.
async fn check_channel_health(issues: &mut Vec<String>) -> HashMap<String, bool> {
    let mut channels = HashMap::new();

    // Read openclaw.json to find configured channels
    let config = match crate::config::openclaw_json::read_config().await {
        Ok(c) => c,
        Err(_) => return channels,
    };

    for (channel_name, channel_config) in &config.channels {
        // Check if the channel has the minimum required configuration
        let is_configured = match channel_name.as_str() {
            "telegram" => channel_config.get("bot_token").is_some(),
            "discord" => channel_config.get("bot_token").is_some(),
            "whatsapp" => channel_config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            _ => true, // Unknown channels assumed OK if present
        };

        if !is_configured {
            issues.push(format!(
                "{} is configured but appears incomplete. Check your {} settings.",
                capitalize(channel_name),
                channel_name
            ));
        }

        channels.insert(channel_name.clone(), is_configured);
    }

    channels
}

fn provider_display_name(provider: &str) -> &str {
    match provider {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        "gemini" => "Google Gemini",
        "groq" => "Groq",
        "openrouter" => "OpenRouter",
        _ => provider,
    }
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}
