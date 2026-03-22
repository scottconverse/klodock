//! Full installation spike — downloads, verifies, and extracts Node.js.
//!
//! Run with: cargo run --bin spike_install

use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::process::Command;

const NODE_VERSION: &str = "22.14.0";
const NODE_DOWNLOAD_BASE: &str = "https://nodejs.org/dist/";

fn main() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        match run_install().await {
            Ok(version) => {
                println!("\n✅ SUCCESS: Node.js v{version} installed to ~/.klodock/node/");

                // Verify npm also works
                let npm_path = klodock_base_dir().join("node").join("npm.cmd");
                println!("\nVerifying npm...");
                match Command::new(&npm_path).arg("--version").output() {
                    Ok(out) => {
                        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        println!("  npm version: {v}");
                    }
                    Err(e) => println!("  npm check failed: {e}"),
                }

                // Verify npx also works
                let npx_path = klodock_base_dir().join("node").join("npx.cmd");
                println!("\nVerifying npx...");
                match Command::new(&npx_path).arg("--version").output() {
                    Ok(out) => {
                        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        println!("  npx version: {v}");
                    }
                    Err(e) => println!("  npx check failed: {e}"),
                }

                // List files in install dir
                println!("\nInstall directory contents:");
                if let Ok(entries) = std::fs::read_dir(klodock_base_dir().join("node")) {
                    for entry in entries.flatten() {
                        println!("  {}", entry.file_name().to_string_lossy());
                    }
                }

                println!("\n🎉 Spike PASSED. Silent Node.js installation works on Windows.");
            }
            Err(e) => {
                println!("\n❌ FAILED: {e}");
                println!("\nThis is the fallback scenario — we would show the user a guided");
                println!("manual install flow instead.");
            }
        }
    });
}

async fn run_install() -> Result<String, String> {
    let install_dir = klodock_base_dir().join("node");

    // Determine archive
    let archive_name = format!("node-v{NODE_VERSION}-win-x64.zip");
    let download_url = format!("{NODE_DOWNLOAD_BASE}v{NODE_VERSION}/{archive_name}");
    let shasums_url = format!("{NODE_DOWNLOAD_BASE}v{NODE_VERSION}/SHASUMS256.txt");

    // Create temp dir
    let tmp_dir = klodock_base_dir().join("tmp");
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let archive_path = tmp_dir.join(&archive_name);
    let shasums_path = tmp_dir.join("SHASUMS256.txt");

    // Download archive
    println!("Downloading {archive_name}...");
    download_with_progress(&download_url, &archive_path).await?;

    let file_size = tokio::fs::metadata(&archive_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    println!("  Downloaded: {:.1} MB", file_size as f64 / 1_048_576.0);

    // Download SHASUMS
    println!("Downloading SHASUMS256.txt...");
    let shasums_bytes = reqwest::get(&shasums_url)
        .await
        .map_err(|e| format!("Failed to download SHASUMS: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read SHASUMS: {e}"))?;
    tokio::fs::write(&shasums_path, &shasums_bytes)
        .await
        .map_err(|e| format!("Failed to write SHASUMS: {e}"))?;

    // Verify checksum
    println!("Verifying SHA256 checksum...");
    let shasums_content = String::from_utf8_lossy(&shasums_bytes).to_string();
    let expected_hash = shasums_content
        .lines()
        .find(|line| line.ends_with(&archive_name))
        .and_then(|line| line.split_whitespace().next())
        .ok_or("No checksum found for archive")?
        .to_string();

    let archive_bytes = tokio::fs::read(&archive_path)
        .await
        .map_err(|e| format!("Failed to read archive: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&archive_bytes);
    let actual_hash = format!("{:x}", hasher.finalize());

    if actual_hash != expected_hash {
        return Err(format!("Checksum mismatch!\n  Expected: {expected_hash}\n  Got:      {actual_hash}"));
    }
    println!("  Checksum verified ✓");

    // Extract using PowerShell
    println!("Extracting to {}...", install_dir.display());
    let extract_tmp = klodock_base_dir().join("node_extract_tmp");
    let _ = tokio::fs::remove_dir_all(&extract_tmp).await;

    let output = tokio::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                archive_path.to_string_lossy(),
                extract_tmp.to_string_lossy()
            ),
        ])
        .output()
        .await
        .map_err(|e| format!("PowerShell Expand-Archive failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Extraction failed: {stderr}"));
    }
    println!("  Extracted ✓");

    // Move nested directory to final location
    let mut entries = tokio::fs::read_dir(&extract_tmp)
        .await
        .map_err(|e| format!("Failed to read extracted dir: {e}"))?;

    let nested_dir = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to read entry: {e}"))?
        .ok_or("Extracted archive is empty")?;

    println!("  Nested dir: {}", nested_dir.file_name().to_string_lossy());

    let _ = tokio::fs::remove_dir_all(&install_dir).await;
    tokio::fs::rename(nested_dir.path(), &install_dir)
        .await
        .map_err(|e| format!("Failed to move files: {e}"))?;

    // Cleanup
    let _ = tokio::fs::remove_dir_all(&tmp_dir).await;
    let _ = tokio::fs::remove_dir_all(&extract_tmp).await;

    // Verify
    let node_path = install_dir.join("node.exe");
    if !node_path.exists() {
        return Err(format!("node.exe not found at {}", node_path.display()));
    }

    let version_output = Command::new(&node_path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run installed node: {e}"))?;

    let version = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .trim_start_matches('v')
        .to_string();

    println!("  node --version: {version} ✓");

    Ok(version)
}

async fn download_with_progress(url: &str, dest: &std::path::Path) -> Result<(), String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}: {url}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            print!("\r  Progress: {:.0}%", (downloaded as f64 / total as f64) * 100.0);
        }
    }
    println!();
    file.flush().await.map_err(|e| format!("Flush error: {e}"))?;
    Ok(())
}

fn klodock_base_dir() -> PathBuf {
    dirs::home_dir().expect("no home dir").join(".klodock")
}
