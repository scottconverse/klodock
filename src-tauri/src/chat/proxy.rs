//! Chat via openclaw agent CLI — runs the agent as a child process
//! and captures the response. No WebSocket, no gateway auth needed.

use tauri::{AppHandle, Emitter};



/// Send a message to the agent via CLI and get the response.
/// This uses `openclaw agent --message <text>` which works without
/// the gateway running (falls back to embedded mode).
#[tauri::command]
pub async fn chat_send_message(
    app: AppHandle,
    message: String,
) -> Result<String, String> {
    let node_dir = crate::paths::klodock_base_dir()
        .map_err(|_| "Couldn't find KloDock installation")?
        .join("node");

    let openclaw_path = if cfg!(windows) {
        let node_exe = node_dir.join("node.exe");
        let openclaw_js = node_dir
            .join("node_modules")
            .join("openclaw")
            .join("openclaw.mjs");
        if node_exe.exists() && openclaw_js.exists() {
            (node_exe, openclaw_js)
        } else {
            return Err("OpenClaw is not installed. Complete the setup wizard first.".into());
        }
    } else {
        let cmd = node_dir.join("openclaw");
        if cmd.exists() {
            // On unix, openclaw is the direct binary
            (cmd.clone(), cmd)
        } else {
            return Err("OpenClaw is not installed. Complete the setup wizard first.".into());
        }
    };

    let openclaw_dir = crate::paths::openclaw_base_dir()
        .map_err(|_| "Couldn't find OpenClaw configuration")?;

    // Materialize API keys from keychain to .env so openclaw agent can read them
    {
        use crate::secrets::keychain;
        use crate::config::env;
        use std::collections::HashMap;

        let key_names = keychain::list_secrets().unwrap_or_default();
        let mut secrets = HashMap::new();
        for key_name in &key_names {
            if let Ok(value) = keychain::retrieve_secret(key_name.clone()) {
                secrets.insert(key_name.clone(), value);
            }
        }
        if !secrets.is_empty() {
            let _ = env::write_env(secrets).await;
        }
    }

    // Build environment
    let current_path = std::env::var("PATH").unwrap_or_default();
    let path_sep = if cfg!(windows) { ";" } else { ":" };
    let new_path = format!("{}{}{}", node_dir.display(), path_sep, current_path);

    // Emit "thinking" event
    let _ = app.emit("chat-event", serde_json::json!({
        "kind": "thinking",
        "message": message,
    }));

    // Run openclaw agent
    let mut cmd = tokio::process::Command::new(&openclaw_path.0);

    if cfg!(windows) {
        // On Windows: node.exe openclaw.mjs agent --agent main --message "..."
        cmd.arg(openclaw_path.1.to_string_lossy().as_ref());
    }

    cmd.args(["agent", "--agent", "main", "--message", &message])
        .env("PATH", &new_path)
        .current_dir(&openclaw_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| {
            log::error!("Chat command failed: {}", e);
            "Couldn't send your message. Is OpenClaw installed?".to_string()
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Filter out diagnostic/log lines from stderr
    let response = if !stdout.trim().is_empty() {
        stdout.trim().to_string()
    } else if !stderr.trim().is_empty() {
        // Check if stderr has actual error or just log noise
        let error_lines: Vec<&str> = stderr
            .lines()
            .filter(|l| !l.contains("[diagnostic]") && !l.contains("[model-fallback"))
            .filter(|l| !l.starts_with("\u{1b}["))  // Filter ANSI escape codes
            .collect();
        if error_lines.is_empty() {
            "I couldn't generate a response. Please try again.".to_string()
        } else {
            // Return filtered error
            let clean: String = error_lines.join("\n");
            if clean.contains("No API key") || clean.contains("auth") {
                "I need an API key to respond. Check Settings to make sure your provider is connected.".to_string()
            } else if clean.contains("timeout") || clean.contains("Timeout") {
                "Response timed out. The AI provider might be slow — try again.".to_string()
            } else {
                format!("Something went wrong: {}", clean.chars().take(200).collect::<String>())
            }
        }
    } else {
        "No response received. Try again or check your AI provider in Settings.".to_string()
    };

    // Emit response event
    let _ = app.emit("chat-event", serde_json::json!({
        "kind": "response",
        "text": response,
    }));

    Ok(response)
}

/// Initialize chat state (no-op for CLI approach)
pub fn init_chat_state(_app: &tauri::AppHandle) {
    // CLI-based chat is stateless — no initialization needed
}
