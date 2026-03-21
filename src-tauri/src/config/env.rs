use std::collections::HashMap;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns `~/.openclaw/.env`.
pub fn env_path() -> PathBuf {
    dirs::home_dir()
        .expect("could not resolve home directory")
        .join(".openclaw")
        .join(".env")
}

/// Set file permissions to 600 (owner read/write only).
///
/// On Unix this calls `std::fs::set_permissions` with mode 0o600.
/// On Windows this is a best-effort no-op — NTFS ACLs don't map directly to
/// Unix modes; a future iteration can call `icacls` or the Win32 security API.
#[allow(unused_variables)]
pub fn set_file_permissions(path: &std::path::Path, mode: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(mode);
        std::fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to set permissions on {}: {}", path.display(), e))?;
    }

    #[cfg(windows)]
    {
        // Use icacls to restrict to current user only
        // First remove all inherited permissions, then grant only the current user
        let path_str = path.to_string_lossy().to_string();
        let username = std::env::var("USERNAME").unwrap_or_else(|_| "".to_string());
        if !username.is_empty() {
            // Remove inheritance and grant only current user full control
            let _ = std::process::Command::new("icacls")
                .args([&path_str, "/inheritance:r", "/grant:r", &format!("{username}:(R,W)")])
                .output();
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Write a set of key=value pairs to `~/.openclaw/.env` with 600 permissions.
///
/// This is a pure file writer — it has NO knowledge of the OS keychain.
/// The frontend / orchestration layer is responsible for deciding which
/// secrets flow through here versus `secrets::keychain`.
#[tauri::command]
pub async fn write_env(entries: HashMap<String, String>) -> Result<(), String> {
    let path = env_path();

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    // Build the .env content: KEY=VALUE per line, no quoting needed for simple
    // values.  If a value contains whitespace or special chars the caller
    // should pre-validate.
    let content: String = entries
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("\n");

    tokio::fs::write(&path, content.as_bytes())
        .await
        .map_err(|e| format!("Failed to write .env at {}: {}", path.display(), e))?;

    // Restrict permissions to owner-only (600)
    set_file_permissions(&path, 0o600)?;

    Ok(())
}

/// Delete the `.env` file from disk.  Silently succeeds if the file does not
/// exist.
#[tauri::command]
pub async fn delete_env() -> Result<(), String> {
    let path = env_path();
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to delete .env at {}: {}", path.display(), e)),
    }
}

/// Read the `.env` file and return its contents as a `HashMap`.
///
/// Intended for verification / debug only — the frontend should not rely on
/// this to retrieve secrets at runtime.
#[tauri::command]
pub async fn read_env() -> Result<HashMap<String, String>, String> {
    let path = env_path();
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read .env at {}: {}", path.display(), e))?;

    let map: HashMap<String, String> = content
        .lines()
        .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .filter_map(|line| {
            let mut parts = line.splitn(2, '=');
            let key = parts.next()?.trim().to_string();
            let value = parts.next().unwrap_or("").trim().to_string();
            if key.is_empty() {
                None
            } else {
                Some((key, value))
            }
        })
        .collect();

    Ok(map)
}
