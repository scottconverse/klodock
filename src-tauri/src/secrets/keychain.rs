/// KloDock secret store — OS credential integration.
///
/// On Windows, uses DPAPI (Windows Data Protection API) via PowerShell for
/// encrypted file-based storage in `~/.klodock/secrets/`. The `keyring` crate
/// v3 has a round-trip bug on Windows Credential Manager, so we bypass it.
///
/// On macOS/Linux, uses the `keyring` crate (which wraps Keychain/libsecret).

/// Special key whose value is a JSON array of all stored key names.
const KEY_INDEX: &str = "_klodock_key_index";

// ---------------------------------------------------------------------------
// Platform-specific credential operations
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod platform {
    use std::process::Command;
    use sha2::{Digest, Sha256};

    /// Hash a key name to a safe filename that doesn't leak the key identity.
    fn hashed_filename(key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        let hash = hasher.finalize();
        format!("{:x}.enc", hash)
    }

    /// Encrypt and store a secret using DPAPI.
    ///
    /// Passes the plaintext value via stdin to avoid PowerShell interpretation
    /// of special characters ($, backticks, etc.) in the value.
    pub fn store(key: &str, value: &str) -> Result<(), String> {
        use std::io::Write;

        let dir = super::secrets_dir()?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create secrets dir: {e}"))?;

        // Use stdin to pass the value safely — no shell interpretation possible
        let mut child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-Command",
                "$val = [Console]::In.ReadToEnd().TrimEnd(); \
                 $ss = ConvertTo-SecureString $val -AsPlainText -Force; \
                 ConvertFrom-SecureString $ss",
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("DPAPI encrypt failed: {e}"))?;

        if let Some(ref mut stdin) = child.stdin {
            stdin.write_all(value.as_bytes())
                .map_err(|e| format!("Failed to write to PowerShell stdin: {e}"))?;
        }
        // Drop stdin to close it so PowerShell reads EOF
        drop(child.stdin.take());

        let output = child.wait_with_output()
            .map_err(|e| format!("DPAPI encrypt failed: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("DPAPI encrypt failed: {stderr}"));
        }

        let path = dir.join(hashed_filename(key));
        std::fs::write(&path, &output.stdout)
            .map_err(|e| format!("Failed to write encrypted secret: {e}"))
    }

    /// Retrieve and decrypt a secret using DPAPI.
    pub fn retrieve(key: &str) -> Result<String, String> {
        let path = super::secrets_dir()?.join(hashed_filename(key));
        if !path.exists() {
            return Err(format!("No secret found for key '{key}'"));
        }
        let encrypted = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read encrypted secret: {e}"))?;
        let hex_str = encrypted.trim();

        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "$ss = ConvertTo-SecureString '{hex_str}'; \
                     $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss); \
                     [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)"
                ),
            ])
            .output()
            .map_err(|e| format!("DPAPI decrypt failed: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("DPAPI decrypt failed: {stderr}"));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Delete an encrypted secret file.
    pub fn delete(key: &str) -> Result<(), String> {
        let path = super::secrets_dir()?.join(hashed_filename(key));
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete secret file: {e}"))?;
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use keyring::Entry;

    const SERVICE: &str = "klodock";

    fn entry(key: &str) -> Result<Entry, String> {
        Entry::new(SERVICE, key)
            .map_err(|e| format!("Keychain entry error for '{}': {}", key, e))
    }

    pub fn store(key: &str, value: &str) -> Result<(), String> {
        entry(key)?
            .set_password(value)
            .map_err(|e| format!("Failed to store secret '{}': {}", key, e))
    }

    pub fn retrieve(key: &str) -> Result<String, String> {
        entry(key)?
            .get_password()
            .map_err(|e| format!("Failed to retrieve secret '{}': {}", key, e))
    }

    pub fn delete(key: &str) -> Result<(), String> {
        match entry(key)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to delete secret '{}': {}", key, e)),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// `~/.klodock/secrets/` — encrypted secret storage directory.
fn secrets_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".klodock").join("secrets"))
}

/// Read the index of stored key names.
fn read_index() -> Result<Vec<String>, String> {
    match platform::retrieve(KEY_INDEX) {
        Ok(json) => serde_json::from_str::<Vec<String>>(&json)
            .map_err(|e| format!("Failed to parse key index: {}", e)),
        Err(_) => Ok(Vec::new()),
    }
}

/// Persist the key index.
fn write_index(keys: &[String]) -> Result<(), String> {
    let json = serde_json::to_string(keys)
        .map_err(|e| format!("Failed to serialize key index: {}", e))?;
    platform::store(KEY_INDEX, &json)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Store a secret in the OS credential store and track its key name in the index.
#[tauri::command]
pub fn store_secret(key: String, value: String) -> Result<(), String> {
    platform::store(&key, &value)?;

    let mut keys = read_index()?;
    if !keys.contains(&key) {
        keys.push(key);
        write_index(&keys)?;
    }

    Ok(())
}

/// Retrieve a secret from the credential store by key name.
#[tauri::command]
pub fn retrieve_secret(key: String) -> Result<String, String> {
    platform::retrieve(&key)
}

/// Delete a secret from the credential store and remove it from the index.
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    platform::delete(&key)?;

    let mut keys = read_index()?;
    keys.retain(|k| k != &key);
    write_index(&keys)?;

    Ok(())
}

/// Return the names of all secrets stored by KloDock.
#[tauri::command]
pub fn list_secrets() -> Result<Vec<String>, String> {
    read_index()
}

/// Make a lightweight API call to verify that the given key is valid.
#[tauri::command]
pub async fn test_api_key(provider: String, key: String) -> Result<bool, String> {
    let client = reqwest::Client::new();

    let response = match provider.to_lowercase().as_str() {
        "openai" => {
            client.get("https://api.openai.com/v1/models")
                .bearer_auth(&key).send().await
        }
        "anthropic" => {
            client.get("https://api.anthropic.com/v1/models")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .send().await
        }
        "gemini" => {
            client.get("https://generativelanguage.googleapis.com/v1beta/models")
                .header("x-goog-api-key", &key)
                .send().await
        }
        "groq" => {
            client.get("https://api.groq.com/openai/v1/models")
                .bearer_auth(&key).send().await
        }
        "openrouter" => {
            client.get("https://openrouter.ai/api/v1/models")
                .bearer_auth(&key).send().await
        }
        other => return Err(format!("Unsupported provider: '{}'", other)),
    };

    match response {
        Ok(resp) => {
            let status = resp.status().as_u16();
            match status {
                200..=299 => Ok(true),
                401 | 403 => Ok(false),
                _ => Err(format!("Unexpected status {} from {} API", status, provider)),
            }
        }
        Err(e) => Err(format!("Network error testing {} key: {}", provider, e)),
    }
}

/// Check if Ollama is running locally by probing its API endpoint.
///
/// Returns `Ok(true)` if Ollama responds, `Ok(false)` if it's not reachable,
/// and `Err` only for unexpected failures.
#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false), // Not running or not installed — not an error
    }
}

/// Ollama model info returned from the /api/tags endpoint.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OllamaModel {
    /// Model name (e.g. "llama3:latest", "mistral:7b")
    pub name: String,
    /// Human-readable size (e.g. "4.7 GB")
    pub size: String,
}

/// List models that Ollama has pulled locally.
///
/// Returns an empty list if Ollama is not running.
/// Returns `Err` only for unexpected failures.
#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<OllamaModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = match client.get("http://localhost:11434/api/tags").send().await {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()), // Ollama not running
    };

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

    let models = body
        .get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let name = m.get("name")?.as_str()?.to_string();
                    let size_bytes = m.get("size")?.as_u64().unwrap_or(0);
                    let size = format_bytes(size_bytes);
                    Some(OllamaModel { name, size })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

/// Format bytes into a human-readable string.
fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    }
}
