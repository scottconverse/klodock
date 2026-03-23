use serde::Serialize;
use std::path::PathBuf;
use tauri::Emitter;

/// Download URL for the Ollama installer (Windows).
#[cfg(target_os = "windows")]
const OLLAMA_DOWNLOAD_URL: &str = "https://ollama.com/download/OllamaSetup.exe";

/// Download URL for the Ollama installer (macOS).
#[cfg(target_os = "macos")]
const OLLAMA_DOWNLOAD_URL: &str = "https://ollama.com/download/Ollama-darwin.zip";

/// Download URL for the Ollama installer (Linux).
#[cfg(target_os = "linux")]
const OLLAMA_DOWNLOAD_URL: &str = "https://ollama.com/install.sh";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Describes the state of Ollama on this machine.
#[derive(Debug, Clone, Serialize)]
pub struct OllamaStatus {
    /// True if Ollama binary is found on the system.
    pub installed: bool,
    /// True if Ollama API is responding (ollama serve is running).
    pub running: bool,
    /// Path to the Ollama binary, if found.
    pub path: Option<String>,
    /// Ollama version string, if available.
    pub version: Option<String>,
}

/// Progress events emitted during Ollama installation.
#[derive(Debug, Clone, Serialize)]
pub struct OllamaInstallProgress {
    pub phase: String,
    pub percent: f32,
    pub message: String,
}

/// Progress events emitted during model pull.
#[derive(Debug, Clone, Serialize)]
pub struct ModelPullProgress {
    pub model: String,
    pub percent: f32,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Check whether Ollama is installed and running.
#[tauri::command]
pub async fn check_ollama_installed() -> Result<OllamaStatus, String> {
    let (installed, path, version) = find_ollama_binary();
    let running = probe_ollama_api().await;

    Ok(OllamaStatus {
        installed,
        running,
        path,
        version,
    })
}

/// Download the Ollama installer to a temp directory.
/// Emits `ollama-install-progress` events during download.
#[tauri::command]
pub async fn download_ollama(app: tauri::AppHandle) -> Result<String, String> {
    let tmp_dir = crate::paths::klodock_base_dir()?.join("tmp");
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| format!("Failed to create temp directory: {e}"))?;

    let installer_name = if cfg!(target_os = "windows") {
        "OllamaSetup.exe"
    } else if cfg!(target_os = "macos") {
        "Ollama-darwin.zip"
    } else {
        "ollama-install.sh"
    };

    let dest = tmp_dir.join(installer_name);

    emit_ollama_progress(&app, "download", 0.0, "Preparing to download Ollama...");

    // Download with progress
    let response = reqwest::get(OLLAMA_DOWNLOAD_URL)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status {}: {}",
            response.status(),
            OLLAMA_DOWNLOAD_URL
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write to file: {e}"))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let pct = (downloaded as f32 / total_size as f32) * 80.0;
            emit_ollama_progress(
                &app,
                "download",
                pct,
                &format!(
                    "Downloading Ollama... {:.0} MB / {:.0} MB",
                    downloaded as f64 / 1_048_576.0,
                    total_size as f64 / 1_048_576.0
                ),
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {e}"))?;

    emit_ollama_progress(&app, "download", 80.0, "Download complete.");

    Ok(dest.to_string_lossy().to_string())
}

/// Run the downloaded Ollama installer silently.
/// On Windows: runs OllamaSetup.exe /SILENT
/// Returns once installation is complete.
#[tauri::command]
pub async fn install_ollama(app: tauri::AppHandle, installer_path: String) -> Result<(), String> {
    let path = PathBuf::from(&installer_path);
    if !path.exists() {
        return Err(format!("Installer not found at: {installer_path}"));
    }

    emit_ollama_progress(&app, "install", 85.0, "Installing Ollama...");

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let mut cmd = Command::new(&path);
        cmd.arg("/SILENT");

        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run Ollama installer: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Ollama installer failed: {stderr}"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        return Err("macOS Ollama installation not yet implemented. Please install from ollama.com".into());
    }

    #[cfg(target_os = "linux")]
    {
        return Err("Linux Ollama installation not yet implemented. Please install from ollama.com".into());
    }

    // Wait a moment for Ollama to register in PATH
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    emit_ollama_progress(&app, "install", 90.0, "Ollama installed. Starting service...");

    // Try to start Ollama serve
    start_ollama_service().await?;

    // Wait for API to become available
    let mut attempts = 0;
    loop {
        if probe_ollama_api().await {
            break;
        }
        attempts += 1;
        if attempts > 15 {
            return Err("Ollama installed but API not responding after 15 seconds. Try restarting.".into());
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        emit_ollama_progress(
            &app,
            "install",
            90.0 + (attempts as f32 * 0.5),
            &format!("Waiting for Ollama to start... ({attempts}s)"),
        );
    }

    // Cleanup installer
    let _ = tokio::fs::remove_file(&path).await;

    emit_ollama_progress(&app, "done", 100.0, "Ollama installed and running!");
    Ok(())
}

/// Pull an Ollama model. Emits `ollama-model-progress` events.
#[tauri::command]
pub async fn pull_ollama_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    if !probe_ollama_api().await {
        return Err("Ollama is not running. Start it first.".into());
    }

    emit_model_progress(&app, &model, 0.0, &format!("Pulling {model}..."));

    // Use the Ollama API to pull the model
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:11434/api/pull")
        .json(&serde_json::json!({ "name": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Failed to start model pull: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Model pull failed with status {}", response.status()));
    }

    // Stream the NDJSON response for progress
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete JSON lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = json
                    .get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("pulling");

                let total = json
                    .get("total")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let completed = json
                    .get("completed")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);

                let pct = if total > 0 {
                    (completed as f32 / total as f32) * 100.0
                } else {
                    0.0
                };

                let msg = if total > 0 {
                    format!(
                        "{status}: {:.0} MB / {:.0} MB",
                        completed as f64 / 1_048_576.0,
                        total as f64 / 1_048_576.0
                    )
                } else {
                    status.to_string()
                };

                emit_model_progress(&app, &model, pct, &msg);

                // Check for error
                if let Some(err) = json.get("error").and_then(|e| e.as_str()) {
                    return Err(format!("Model pull error: {err}"));
                }
            }
        }
    }

    emit_model_progress(&app, &model, 100.0, &format!("{model} ready!"));
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Check if Ollama binary exists on the system.
fn find_ollama_binary() -> (bool, Option<String>, Option<String>) {
    // Check common Windows locations
    #[cfg(target_os = "windows")]
    {
        // Use LOCALAPPDATA env var directly — more reliable than dirs::home_dir()
        // in the Tauri process context.
        let local_app_data = std::env::var("LOCALAPPDATA")
            .map(|d| PathBuf::from(d).join("Programs").join("Ollama").join("ollama.exe"))
            .ok();

        let common_paths = [
            local_app_data,
            dirs::home_dir().map(|h| h.join("AppData").join("Local").join("Programs").join("Ollama").join("ollama.exe")),
            Some(PathBuf::from(r"C:\Program Files\Ollama\ollama.exe")),
            Some(PathBuf::from(r"C:\Program Files (x86)\Ollama\ollama.exe")),
        ];

        for path_opt in &common_paths {
            if let Some(path) = path_opt {
                log::info!("Checking Ollama at: {}", path.display());
                if path.exists() {
                    log::info!("Found Ollama at: {}", path.display());
                    let version = get_ollama_version(path);
                    return (true, Some(path.to_string_lossy().to_string()), version);
                }
            }
        }
        log::warn!("Ollama not found in any common location");

        // Check PATH
        if let Ok(path) = which::which("ollama") {
            let version = get_ollama_version(&path);
            return (true, Some(path.to_string_lossy().to_string()), version);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(path) = which::which("ollama") {
            let version = get_ollama_version(&path);
            return (true, Some(path.to_string_lossy().to_string()), version);
        }
    }

    (false, None, None)
}

/// Get Ollama version string.
fn get_ollama_version(ollama_path: &std::path::Path) -> Option<String> {
    let mut cmd = std::process::Command::new(ollama_path);
    cmd.arg("--version");

    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().ok()?;
    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();
        if !version_str.is_empty() {
            return Some(version_str);
        }
    }
    None
}

/// Probe the Ollama API to check if it's running.
async fn probe_ollama_api() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Start the Ollama service (ollama serve) in the background.
async fn start_ollama_service() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, Ollama typically starts as a background app after installation.
        // Try launching it via the Start Menu shortcut path or directly.
        let ollama_app = dirs::home_dir()
            .ok_or("Could not determine home directory")?
            .join("AppData")
            .join("Local")
            .join("Programs")
            .join("Ollama")
            .join("ollama app.exe");

        if ollama_app.exists() {
            let mut cmd = std::process::Command::new(&ollama_app);

            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            let _ = cmd.spawn();
            return Ok(());
        }

        // Fallback: try `ollama serve`
        if let Ok(ollama_path) = which::which("ollama") {
            let mut cmd = std::process::Command::new(ollama_path);
            cmd.arg("serve");

            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);

            let _ = cmd.spawn();
            return Ok(());
        }

        Err("Could not find Ollama executable to start".into())
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(ollama_path) = which::which("ollama") {
            let _ = std::process::Command::new(ollama_path)
                .arg("serve")
                .spawn();
            return Ok(());
        }
        Err("Could not find Ollama executable".into())
    }
}

fn emit_ollama_progress(app: &tauri::AppHandle, phase: &str, percent: f32, message: &str) {
    let progress = OllamaInstallProgress {
        phase: phase.to_string(),
        percent,
        message: message.to_string(),
    };
    let _ = app.emit("ollama-install-progress", &progress);
}

fn emit_model_progress(app: &tauri::AppHandle, model: &str, percent: f32, message: &str) {
    let progress = ModelPullProgress {
        model: model.to_string(),
        percent,
        message: message.to_string(),
    };
    let _ = app.emit("ollama-model-progress", &progress);
}
