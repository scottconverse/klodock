/// ClawPad secret store — OS credential integration.
///
/// On Windows, uses DPAPI (Windows Data Protection API) via PowerShell for
/// encrypted file-based storage in `~/.clawpad/secrets/`. The `keyring` crate
/// v3 has a round-trip bug on Windows Credential Manager, so we bypass it.
///
/// On macOS/Linux, uses the `keyring` crate (which wraps Keychain/libsecret).

/// Special key whose value is a JSON array of all stored key names.
const KEY_INDEX: &str = "_clawpad_key_index";

// ---------------------------------------------------------------------------
// Platform-specific credential operations
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod platform {
    use std::process::Command;

    /// Encrypt and store a secret using DPAPI.
    pub fn store(key: &str, value: &str) -> Result<(), String> {
        let dir = super::secrets_dir()?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create secrets dir: {e}"))?;

        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "$ss = ConvertTo-SecureString '{}' -AsPlainText -Force; ConvertFrom-SecureString $ss",
                    value.replace('\'', "''")
                ),
            ])
            .output()
            .map_err(|e| format!("DPAPI encrypt failed: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("DPAPI encrypt failed: {stderr}"));
        }

        let path = dir.join(format!("{key}.enc"));
        std::fs::write(&path, &output.stdout)
            .map_err(|e| format!("Failed to write encrypted secret: {e}"))
    }

    /// Retrieve and decrypt a secret using DPAPI.
    pub fn retrieve(key: &str) -> Result<String, String> {
        let path = super::secrets_dir()?.join(format!("{key}.enc"));
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
        let path = super::secrets_dir()?.join(format!("{key}.enc"));
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

    const SERVICE: &str = "clawpad";

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

/// `~/.clawpad/secrets/` — encrypted secret storage directory.
fn secrets_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".clawpad").join("secrets"))
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

/// Return the names of all secrets stored by ClawPad.
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
            client.get(format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={}", key
            )).send().await
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
