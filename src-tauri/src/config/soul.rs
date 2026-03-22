use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Tone ranges from 0.0 (fully formal) to 1.0 (fully casual).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulConfig {
    pub name: String,
    pub role: Role,
    /// 0.0 = formal, 1.0 = casual
    pub tone: f32,
    pub custom_instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum Role {
    GeneralAssistant,
    ResearchHelper,
    WritingPartner,
    ProductivityBot,
    Custom(String),
}

// ---------------------------------------------------------------------------
// Role templates — one const &str per variant
// ---------------------------------------------------------------------------

const TEMPLATE_GENERAL_ASSISTANT: &str = "\
You are a helpful general-purpose assistant. \
Answer questions clearly and concisely, and offer follow-up suggestions when appropriate.";

const TEMPLATE_RESEARCH_HELPER: &str = "\
You are a research assistant. \
Provide well-sourced, factual answers. Summarize findings and cite references when possible.";

const TEMPLATE_WRITING_PARTNER: &str = "\
You are a writing partner. \
Help draft, revise, and polish prose. Match the user's voice and suggest structural improvements.";

const TEMPLATE_PRODUCTIVITY_BOT: &str = "\
You are a productivity assistant. \
Help the user organize tasks, manage time, and break down complex goals into actionable steps.";

impl Role {
    /// Returns the built-in template string for this role variant.
    pub fn template(&self) -> &str {
        match self {
            Role::GeneralAssistant => TEMPLATE_GENERAL_ASSISTANT,
            Role::ResearchHelper => TEMPLATE_RESEARCH_HELPER,
            Role::WritingPartner => TEMPLATE_WRITING_PARTNER,
            Role::ProductivityBot => TEMPLATE_PRODUCTIVITY_BOT,
            Role::Custom(instructions) => instructions.as_str(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns `~/.openclaw/workspace/SOUL.md`.
pub fn soul_path() -> PathBuf {
    dirs::home_dir()
        .expect("could not resolve home directory")
        .join(".openclaw")
        .join("workspace")
        .join("SOUL.md")
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Read the raw SOUL.md file from disk and return its contents.
#[tauri::command]
pub async fn read_soul() -> Result<String, String> {
    let path = soul_path();
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read SOUL.md at {}: {}", path.display(), e))
}

/// Overwrite SOUL.md with the provided raw markdown content.
#[tauri::command]
pub async fn write_soul(content: String) -> Result<(), String> {
    let path = soul_path();

    // Ensure parent directory (~/.openclaw/workspace/) exists
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    tokio::fs::write(&path, content.as_bytes())
        .await
        .map_err(|e| format!("Failed to write SOUL.md at {}: {}", path.display(), e))
}

/// Generate a SOUL.md markdown string from the structured `SoulConfig` and
/// write it to disk.  Returns the generated markdown so the frontend can
/// display it immediately.
#[tauri::command]
pub async fn generate_soul(config: SoulConfig) -> Result<String, String> {
    // TODO: Build a richer markdown document.  For now, produce a minimal but
    // valid SOUL.md that OpenClaw can consume.
    //
    // Sections to include:
    //   - # Identity   (name)
    //   - # Role       (role template)
    //   - # Tone       (human-readable tone description derived from 0.0–1.0)
    //   - # Custom     (custom_instructions, if present)

    let tone_label = match config.tone {
        t if t <= 0.2 => "very formal",
        t if t <= 0.4 => "formal",
        t if t <= 0.6 => "balanced",
        t if t <= 0.8 => "casual",
        _ => "very casual",
    };

    let mut md = String::new();
    md.push_str(&format!("# Identity\n\nName: {}\n\n", config.name));
    md.push_str(&format!("# Role\n\n{}\n\n", config.role.template()));
    md.push_str(&format!("# Tone\n\nTone: {} ({:.1})\n\n", tone_label, config.tone));

    if let Some(ref instructions) = config.custom_instructions {
        md.push_str(&format!("# Custom Instructions\n\n{}\n", instructions));
    }

    // Persist to disk via the existing write helper
    write_soul(md.clone()).await?;

    Ok(md)
}
