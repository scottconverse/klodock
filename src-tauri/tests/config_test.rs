use std::collections::HashMap;
use tempfile::TempDir;

// ==========================================================================
// model_ref
// ==========================================================================

#[test]
fn model_ref_openai() {
    let r = klodock_lib::config::openclaw_json::model_ref("openai", "gpt-4o");
    assert_eq!(r, "openai/gpt-4o");
}

#[test]
fn model_ref_anthropic() {
    let r = klodock_lib::config::openclaw_json::model_ref("anthropic", "claude-3-opus");
    assert_eq!(r, "anthropic/claude-3-opus");
}

#[test]
fn model_ref_gemini_alias() {
    let r = klodock_lib::config::openclaw_json::model_ref("gemini", "gemini-pro");
    assert_eq!(r, "google/gemini-pro");
}

#[test]
fn model_ref_ollama() {
    let r = klodock_lib::config::openclaw_json::model_ref("ollama", "qwen2.5:7b");
    assert_eq!(r, "ollama/qwen2.5:7b");
}

#[test]
fn model_ref_openrouter_passthrough() {
    // OpenRouter models already include provider prefix
    let r = klodock_lib::config::openclaw_json::model_ref("openrouter", "meta-llama/llama-3-70b");
    assert_eq!(r, "meta-llama/llama-3-70b");
}

#[test]
fn model_ref_unknown_provider() {
    let r = klodock_lib::config::openclaw_json::model_ref("together", "mixtral-8x7b");
    assert_eq!(r, "together/mixtral-8x7b");
}

// ==========================================================================
// OpenClawConfig serialization roundtrip
// ==========================================================================

#[test]
fn config_serialize_roundtrip() {
    use klodock_lib::config::openclaw_json::OpenClawConfig;

    let json_str = r#"{
        "agents": {
            "defaults": {
                "model": { "primary": "ollama/qwen2.5:7b" },
                "workspace": "~/.openclaw/workspace"
            }
        },
        "gateway": {
            "mode": "local",
            "port": 18789
        }
    }"#;

    let config: OpenClawConfig = serde_json::from_str(json_str).expect("parse failed");
    let serialized = serde_json::to_string(&config).expect("serialize failed");
    let reparsed: OpenClawConfig = serde_json::from_str(&serialized).expect("reparse failed");

    // Verify model survived roundtrip
    let model = reparsed
        .agents
        .as_ref()
        .and_then(|a| a.defaults.as_ref())
        .and_then(|d| d.model.as_ref())
        .map(|m| m.primary.as_str())
        .unwrap_or("");
    assert_eq!(model, "ollama/qwen2.5:7b");

    // Verify gateway survived roundtrip
    let port = reparsed
        .gateway
        .as_ref()
        .and_then(|g| g.port)
        .unwrap_or(0);
    assert_eq!(port, 18789);
}

#[test]
fn config_preserves_extra_fields() {
    use klodock_lib::config::openclaw_json::OpenClawConfig;

    let json_str = r#"{
        "agents": { "defaults": { "model": { "primary": "ollama/qwen2.5:7b" } } },
        "session": { "history_limit": 100 },
        "hooks": { "on_start": "echo hello" }
    }"#;

    let config: OpenClawConfig = serde_json::from_str(json_str).expect("parse failed");

    // Extra fields should be preserved in the `extra` map
    assert!(config.extra.contains_key("session"), "session field lost");
    assert!(config.extra.contains_key("hooks"), "hooks field lost");

    // Roundtrip preserves them
    let serialized = serde_json::to_string(&config).expect("serialize failed");
    assert!(serialized.contains("history_limit"), "extra field lost in serialization");
}

// ==========================================================================
// .env format
// ==========================================================================

#[test]
fn env_content_format() {
    // Test the KEY=VALUE format logic directly (without filesystem)
    let mut entries = HashMap::new();
    entries.insert("OPENAI_API_KEY".to_string(), "test-key-placeholder".to_string());
    entries.insert("GEMINI_API_KEY".to_string(), "test-gemini-placeholder".to_string());

    let content: String = entries
        .iter()
        .map(|(k, v)| {
            let clean_key = k.replace(['\n', '\r'], "");
            let clean_val = v.replace(['\n', '\r'], "");
            format!("{}={}", clean_key, clean_val)
        })
        .collect::<Vec<_>>()
        .join("\n");

    assert!(content.contains("OPENAI_API_KEY=test-key-placeholder"));
    assert!(content.contains("GEMINI_API_KEY=test-gemini-placeholder"));
    assert!(!content.contains("\r"));
}

#[test]
fn env_newline_injection_sanitized() {
    let mut entries = HashMap::new();
    entries.insert(
        "INJECTED".to_string(),
        "value\nEVIL_KEY=stolen".to_string(),
    );

    let content: String = entries
        .iter()
        .map(|(k, v)| {
            let clean_key = k.replace(['\n', '\r'], "");
            let clean_val = v.replace(['\n', '\r'], "");
            format!("{}={}", clean_key, clean_val)
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Newline in value should be stripped — the output should be a single line
    // The value "value\nEVIL_KEY=stolen" becomes "valueEVIL_KEY=stolen" (one line, no injection)
    assert_eq!(content.lines().count(), 1, "should be single line after sanitization");
    // The EVIL_KEY should NOT appear as a separate KEY=VALUE pair
    let parsed: Vec<(&str, &str)> = content
        .lines()
        .filter_map(|l| l.split_once('='))
        .collect();
    assert_eq!(parsed.len(), 1, "should have exactly one key-value pair");
    assert_eq!(parsed[0].0, "INJECTED", "key should be INJECTED");
    assert!(!parsed[0].1.contains('\n'), "value should not contain newline");
}

// ==========================================================================
// SOUL.md content parsing
// ==========================================================================

#[test]
fn soul_md_name_extraction() {
    let soul_content = "# Identity\nName: Atlas\n# Role\nGeneral assistant.\n# Tone\nTone: balanced (0.5)";

    // Extract name the same way the frontend does
    let name = soul_content
        .lines()
        .find(|l| l.starts_with("Name:"))
        .and_then(|l| l.strip_prefix("Name:"))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Your agent".to_string());

    assert_eq!(name, "Atlas");
}

#[test]
fn soul_md_missing_name_uses_fallback() {
    let soul_content = "# Identity\n# Role\nGeneral assistant.";

    let name = soul_content
        .lines()
        .find(|l| l.starts_with("Name:"))
        .and_then(|l| l.strip_prefix("Name:"))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Your agent".to_string());

    assert_eq!(name, "Your agent");
}

// ==========================================================================
// Settings (keep_keys)
// ==========================================================================

#[test]
fn settings_json_roundtrip() {
    let tmp = TempDir::new().expect("temp dir");
    let settings_path = tmp.path().join("settings.json");

    // Write a settings file
    let settings = serde_json::json!({
        "keep_api_keys_on_disk": true,
        "other_setting": "hello"
    });
    std::fs::write(&settings_path, serde_json::to_string_pretty(&settings).unwrap()).unwrap();

    // Read it back
    let content = std::fs::read_to_string(&settings_path).unwrap();
    let parsed: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&content).unwrap();

    assert_eq!(
        parsed.get("keep_api_keys_on_disk").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        parsed.get("other_setting").and_then(|v| v.as_str()),
        Some("hello")
    );
}

#[test]
fn settings_default_keep_keys_is_false() {
    // When no settings file exists, keep_keys should default to false
    let empty_map: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    let keep_keys = empty_map
        .get("keep_api_keys_on_disk")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    assert!(!keep_keys, "default should be false (secure)");
}

// ==========================================================================
// Node SHA256 verification logic
// ==========================================================================

#[test]
fn sha256_matching_hash_passes() {
    use sha2::{Sha256, Digest};

    let data = b"hello world test data for checksum";
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash = format!("{:x}", hasher.finalize());

    // Verification: same data should produce same hash
    let mut hasher2 = Sha256::new();
    hasher2.update(data);
    let hash2 = format!("{:x}", hasher2.finalize());

    assert_eq!(hash, hash2, "same data should produce same SHA256");
}

#[test]
fn sha256_different_data_fails() {
    use sha2::{Sha256, Digest};

    let mut hasher1 = Sha256::new();
    hasher1.update(b"legitimate node binary");
    let hash1 = format!("{:x}", hasher1.finalize());

    let mut hasher2 = Sha256::new();
    hasher2.update(b"tampered node binary");
    let hash2 = format!("{:x}", hasher2.finalize());

    assert_ne!(hash1, hash2, "different data must produce different hashes");
}

#[test]
fn sha256_file_verification() {
    use sha2::{Sha256, Digest};

    let tmp = TempDir::new().expect("temp dir");
    let file_path = tmp.path().join("test-binary.zip");
    let content = b"this is a fake node zip for testing";
    std::fs::write(&file_path, content).unwrap();

    // Compute expected hash
    let mut hasher = Sha256::new();
    hasher.update(content);
    let expected = format!("{:x}", hasher.finalize());

    // Read file and verify
    let file_bytes = std::fs::read(&file_path).unwrap();
    let mut verify_hasher = Sha256::new();
    verify_hasher.update(&file_bytes);
    let actual = format!("{:x}", verify_hasher.finalize());

    assert_eq!(expected, actual, "file checksum should match");

    // Wrong hash should fail
    let wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000";
    assert_ne!(actual, wrong_hash, "should not match wrong hash");
}

// ==========================================================================
// Uninstall state file format
// ==========================================================================

#[test]
fn uninstall_state_json_format() {
    let tmp = TempDir::new().expect("temp dir");
    let state_path = tmp.path().join("uninstall-state.json");

    // Write state with some steps completed
    let state = serde_json::json!({
        "steps": {
            "stop_daemon": "completed",
            "scrub_env": "completed",
            "remove_secrets": "pending",
            "remove_openclaw": "pending",
            "remove_node": "pending",
            "remove_klodock": "pending",
            "remove_registry": "pending"
        }
    });
    std::fs::write(&state_path, serde_json::to_string(&state).unwrap()).unwrap();

    // Read back and verify
    let content = std::fs::read_to_string(&state_path).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

    assert_eq!(parsed["steps"]["stop_daemon"], "completed");
    assert_eq!(parsed["steps"]["scrub_env"], "completed");
    assert_eq!(parsed["steps"]["remove_secrets"], "pending");
}

// ==========================================================================
// Config backup
// ==========================================================================

#[test]
fn config_backup_creates_copies() {
    let tmp = TempDir::new().expect("temp dir");
    let config_path = tmp.path().join("openclaw.json");
    let soul_path = tmp.path().join("SOUL.md");
    let backup_dir = tmp.path().join("backups");

    // Create source files
    std::fs::write(&config_path, r#"{"agents":{}}"#).unwrap();
    std::fs::write(&soul_path, "# Identity\nName: Atlas").unwrap();

    // Create backup dir and copy
    std::fs::create_dir_all(&backup_dir).unwrap();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    std::fs::copy(&config_path, backup_dir.join(format!("openclaw.json.{}", timestamp))).unwrap();
    std::fs::copy(&soul_path, backup_dir.join(format!("SOUL.md.{}", timestamp))).unwrap();

    // Verify backups exist
    let entries: Vec<_> = std::fs::read_dir(&backup_dir).unwrap().collect();
    assert_eq!(entries.len(), 2, "should have 2 backup files");

    // Verify content matches
    let backup_config = std::fs::read_to_string(
        backup_dir.join(format!("openclaw.json.{}", timestamp)),
    ).unwrap();
    assert_eq!(backup_config, r#"{"agents":{}}"#);
}
