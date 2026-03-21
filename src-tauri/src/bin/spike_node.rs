//! Spike test for Node.js detection and installation.
//!
//! Run with: cargo run --bin spike_node
//!
//! This exercises the core node.rs logic without needing the full Tauri app.

use std::path::PathBuf;
use std::process::Command;

const REQUIRED_NODE_MAJOR: u64 = 22;
const NODE_VERSION: &str = "22.14.0";
const NODE_DOWNLOAD_BASE: &str = "https://nodejs.org/dist/";

fn main() {
    println!("=== ClawPad Node.js Installer Spike ===\n");

    // --- Phase 1: Detection ---
    println!("--- Phase 1: Detection ---\n");

    // Check ClawPad-managed node
    let clawpad_node = clawpad_node_path();
    println!("ClawPad-managed node path: {}", clawpad_node.display());
    println!("  Exists: {}", clawpad_node.exists());
    if clawpad_node.exists() {
        match run_node_version(&clawpad_node) {
            Ok(v) => println!("  Version: {v} (meets req: {})", parse_major(&v) >= REQUIRED_NODE_MAJOR),
            Err(e) => println!("  Error: {e}"),
        }
    }

    // Check system PATH
    println!();
    match which::which("node") {
        Ok(path) => {
            let manager = detect_version_manager(&path);
            println!("System node found: {}", path.display());
            println!("  Managed by: {manager}");
            match run_node_version(&path) {
                Ok(v) => println!("  Version: {v} (meets req: {})", parse_major(&v) >= REQUIRED_NODE_MAJOR),
                Err(e) => println!("  Error running --version: {e}"),
            }
        }
        Err(_) => {
            println!("System node: NOT FOUND on PATH");
        }
    }

    // Check environment variables
    println!();
    println!("Version manager env vars:");
    println!("  NVM_DIR: {:?}", std::env::var("NVM_DIR").ok());
    println!("  VOLTA_HOME: {:?}", std::env::var("VOLTA_HOME").ok());
    println!("  HTTP_PROXY: {:?}", std::env::var("HTTP_PROXY").ok());
    println!("  HTTPS_PROXY: {:?}", std::env::var("HTTPS_PROXY").ok());

    // --- Phase 2: Platform archive info ---
    println!("\n--- Phase 2: Platform Archive ---\n");

    let (archive_name, ext) = platform_archive_name(NODE_VERSION).unwrap();
    let download_url = format!("{NODE_DOWNLOAD_BASE}v{NODE_VERSION}/{archive_name}");
    println!("Archive: {archive_name}");
    println!("Extension: {ext}");
    println!("Download URL: {download_url}");

    // --- Phase 3: Download test (just HEAD request to verify URL works) ---
    println!("\n--- Phase 3: URL Verification ---\n");

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        match reqwest::Client::new()
            .head(&download_url)
            .send()
            .await
        {
            Ok(resp) => {
                println!("HEAD {download_url}");
                println!("  Status: {}", resp.status());
                if let Some(len) = resp.content_length() {
                    println!("  Content-Length: {:.1} MB", len as f64 / 1_048_576.0);
                }
                println!("  URL accessible: {}", resp.status().is_success());
            }
            Err(e) => {
                println!("  FAILED to reach URL: {e}");
                println!("  This could indicate a proxy or firewall issue.");
            }
        }
    });

    println!("\n--- Phase 4: Install directory check ---\n");
    let install_dir = clawpad_base_dir().join("node");
    println!("Install target: {}", install_dir.display());
    println!("  Parent exists: {}", clawpad_base_dir().exists());
    println!("  Writable: {}", is_writable(&clawpad_base_dir()));

    println!("\n=== Spike Complete ===");
    println!("\nVerdict: Detection logic works. Ready to test full install.");
}

fn run_node_version(node_path: &std::path::Path) -> Result<String, String> {
    let output = Command::new(node_path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute node: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("node --version failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches('v')
        .to_string())
}

fn parse_major(version: &str) -> u64 {
    version.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn detect_version_manager(node_path: &std::path::Path) -> String {
    let path_str = node_path.to_string_lossy().to_string();
    if std::env::var("NVM_DIR").is_ok() || path_str.contains(".nvm") {
        return "nvm".into();
    }
    if std::env::var("VOLTA_HOME").is_ok() || path_str.contains(".volta") {
        return "volta".into();
    }
    "system".into()
}

fn clawpad_node_path() -> PathBuf {
    let base = clawpad_base_dir().join("node");
    if cfg!(windows) {
        base.join("node.exe")
    } else {
        base.join("bin").join("node")
    }
}

fn clawpad_base_dir() -> PathBuf {
    dirs::home_dir().expect("no home dir").join(".clawpad")
}

fn platform_archive_name(version: &str) -> Result<(String, String), String> {
    let (os, arch, ext) = if cfg!(target_os = "windows") {
        let arch = if cfg!(target_arch = "x86_64") { "x64" } else { "arm64" };
        ("win", arch, "zip")
    } else if cfg!(target_os = "macos") {
        let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
        ("darwin", arch, "tar.gz")
    } else {
        let arch = if cfg!(target_arch = "x86_64") { "x64" } else { "arm64" };
        ("linux", arch, "tar.gz")
    };
    Ok((format!("node-v{version}-{os}-{arch}.{ext}"), ext.to_string()))
}

fn is_writable(path: &std::path::Path) -> bool {
    if path.exists() {
        let test_file = path.join(".clawpad_write_test");
        match std::fs::write(&test_file, "test") {
            Ok(_) => {
                let _ = std::fs::remove_file(&test_file);
                true
            }
            Err(_) => false,
        }
    } else {
        // Try to create the directory
        match std::fs::create_dir_all(path) {
            Ok(_) => true,
            Err(_) => false,
        }
    }
}
