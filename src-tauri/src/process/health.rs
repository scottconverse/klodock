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
        // Check if the configured model is Ollama — no API key needed
        let uses_ollama = match crate::config::openclaw_json::read_config().await {
            Ok(config) => config.agents.as_ref()
                .and_then(|a| a.defaults.as_ref())
                .and_then(|d| d.model.as_ref())
                .map(|m| m.primary.starts_with("ollama/"))
                .unwrap_or(false),
            Err(_) => false,
        };

        if !uses_ollama {
            issues.push("No API key configured. Go to Settings to add one.".into());
        }
        return None;
    }

    // Test the first available key
    // Determine provider from key name (e.g., "OPENAI_API_KEY" -> "openai")
    for key_name in &key_names {
        let provider = match key_name.as_str() {
            "OPENAI_API_KEY" => "openai",
            "ANTHROPIC_API_KEY" => "anthropic",
            "GOOGLE_API_KEY" => "gemini",
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

    if let Some(ref ch) = config.channels {
        if let Some(ref tg) = ch.telegram {
            let ok = tg.enabled && !tg.bot_token.is_empty();
            if !ok {
                issues.push("Telegram is configured but appears incomplete. Check your telegram settings.".to_string());
            }
            channels.insert("telegram".to_string(), ok);
        }
        if let Some(ref dc) = ch.discord {
            let ok = dc.enabled && !dc.bot_token.is_empty();
            if !ok {
                issues.push("Discord is configured but appears incomplete. Check your discord settings.".to_string());
            }
            channels.insert("discord".to_string(), ok);
        }
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
