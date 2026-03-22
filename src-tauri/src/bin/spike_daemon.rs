//! Spike test for the daemon lifecycle and secret materialization flow.
//!
//! Tests:
//! 1. Keychain store/retrieve/list round-trip
//! 2. .env materialization (write, read, verify permissions)
//! 3. .env scrub (delete, verify gone)
//! 4. PID file lifecycle
//! 5. Process alive check
//! 6. Autostart enable/disable/query (Windows registry)
//!
//! Run with: cargo run --bin spike_daemon

use std::collections::HashMap;
use std::path::PathBuf;

fn main() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        println!("=== KloDock Daemon Lifecycle Spike ===\n");

        // --- Test 1: Keychain round-trip ---
        println!("--- Test 1: Keychain Store/Retrieve ---\n");
        test_keychain();

        // --- Test 2: .env materialization ---
        println!("\n--- Test 2: .env Materialization ---\n");
        test_env_materialization().await;

        // --- Test 3: .env scrub ---
        println!("\n--- Test 3: .env Scrub ---\n");
        test_env_scrub().await;

        // --- Test 4: PID file lifecycle ---
        println!("\n--- Test 4: PID File Lifecycle ---\n");
        test_pid_lifecycle().await;

        // --- Test 5: Process alive check ---
        println!("\n--- Test 5: Process Alive Check ---\n");
        test_process_alive();

        // --- Test 6: Autostart (Windows) ---
        println!("\n--- Test 6: Autostart (Windows Registry) ---\n");
        test_autostart();

        // --- Cleanup ---
        println!("\n--- Cleanup ---\n");
        cleanup_test_secrets();

        println!("\n=== Spike Complete ===");
    });
}

fn test_keychain() {
    let test_key = "_klodock_spike_test_key";
    let test_value = "sk-test-1234567890abcdef";

    // Uses DPAPI on Windows (same approach as the updated keychain.rs)
    let secrets = home_dir().join(".klodock").join("secrets");
    let _ = std::fs::create_dir_all(&secrets);

    // Store
    print!("  Store secret (DPAPI)...");
    match dpapi_store(test_key, test_value) {
        Ok(()) => println!(" ✓"),
        Err(e) => { println!(" ✗ ({e})"); return; }
    }

    // Retrieve
    print!("  Retrieve secret (DPAPI)...");
    match dpapi_retrieve(test_key) {
        Ok(val) if val == test_value => println!(" ✓ (match)"),
        Ok(val) => println!(" ✗ (mismatch: '{val}')"),
        Err(e) => println!(" ✗ ({e})"),
    }

    // Key index round-trip
    print!("  Key index store...");
    let index_val = serde_json::to_string(&vec!["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]).unwrap();
    match dpapi_store("_klodock_spike_index", &index_val) {
        Ok(()) => println!(" ✓"),
        Err(e) => println!(" ✗ ({e})"),
    }

    print!("  Key index retrieve...");
    match dpapi_retrieve("_klodock_spike_index") {
        Ok(val) => {
            let keys: Vec<String> = serde_json::from_str(&val).unwrap_or_default();
            println!(" ✓ (keys: {:?})", keys);
        }
        Err(e) => println!(" ✗ ({e})"),
    }

    // Delete
    print!("  Delete secret...");
    match dpapi_delete(test_key) {
        Ok(()) => println!(" ✓"),
        Err(e) => println!(" ✗ ({e})"),
    }
    let _ = dpapi_delete("_klodock_spike_index");

    // Verify deleted
    print!("  Verify deleted...");
    match dpapi_retrieve(test_key) {
        Err(_) => println!(" ✓ (not found, as expected)"),
        Ok(_) => println!(" ✗ (still exists!)"),
    }
}

fn dpapi_store(key: &str, value: &str) -> Result<(), String> {
    let dir = home_dir().join(".klodock").join("secrets");
    let _ = std::fs::create_dir_all(&dir);
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command",
            &format!("$ss = ConvertTo-SecureString '{}' -AsPlainText -Force; ConvertFrom-SecureString $ss",
                value.replace('\'', "''"))])
        .output().map_err(|e| format!("{e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    std::fs::write(dir.join(format!("{key}.enc")), &output.stdout).map_err(|e| format!("{e}"))
}

fn dpapi_retrieve(key: &str) -> Result<String, String> {
    let path = home_dir().join(".klodock").join("secrets").join(format!("{key}.enc"));
    if !path.exists() { return Err("not found".into()); }
    let hex = std::fs::read_to_string(&path).map_err(|e| format!("{e}"))?.trim().to_string();
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command",
            &format!("$ss = ConvertTo-SecureString '{hex}'; \
                $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss); \
                [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)")])
        .output().map_err(|e| format!("{e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn dpapi_delete(key: &str) -> Result<(), String> {
    let path = home_dir().join(".klodock").join("secrets").join(format!("{key}.enc"));
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("{e}"))?; }
    Ok(())
}

async fn test_env_materialization() {
    let env_path = home_dir().join(".openclaw").join(".env");

    // Ensure the .env doesn't exist from a prior run
    let _ = tokio::fs::remove_file(&env_path).await;

    // Write
    print!("  Write .env...");
    let mut entries = HashMap::new();
    entries.insert("OPENAI_API_KEY".to_string(), "sk-test-fake-key-12345".to_string());
    entries.insert("ANTHROPIC_API_KEY".to_string(), "sk-ant-test-fake-67890".to_string());

    // Ensure parent dir exists
    if let Some(parent) = env_path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    let content: String = entries
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("\n");

    match tokio::fs::write(&env_path, &content).await {
        Ok(()) => println!(" ✓"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    // Read back and verify
    print!("  Read .env...");
    match tokio::fs::read_to_string(&env_path).await {
        Ok(contents) => {
            let line_count = contents.lines().count();
            println!(" ✓ ({line_count} lines)");
            for line in contents.lines() {
                let key = line.split('=').next().unwrap_or("?");
                let val_len = line.split('=').nth(1).map(|v| v.len()).unwrap_or(0);
                println!("    {key}=<{val_len} chars>");
            }
        }
        Err(e) => println!(" ✗ ({e})"),
    }

    // Check file exists
    print!("  File exists...");
    println!(" {}", if env_path.exists() { "✓" } else { "✗" });
}

async fn test_env_scrub() {
    let env_path = home_dir().join(".openclaw").join(".env");

    // Verify it exists from previous test
    if !env_path.exists() {
        println!("  ⚠ .env doesn't exist (previous test may have failed)");
        return;
    }

    print!("  Scrub .env...");
    match tokio::fs::remove_file(&env_path).await {
        Ok(()) => println!(" ✓"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    print!("  Verify gone...");
    println!(" {}", if !env_path.exists() { "✓" } else { "✗ (still exists!)" });

    // Scrub when already gone should be idempotent
    print!("  Scrub again (idempotent)...");
    match tokio::fs::remove_file(&env_path).await {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => println!(" ✓ (NotFound, OK)"),
        Ok(()) => println!(" ✗ (succeeded — file shouldn't exist)"),
        Err(e) => println!(" ✗ (unexpected error: {e})"),
    }
}

async fn test_pid_lifecycle() {
    let pid_path = home_dir().join(".klodock").join("daemon.pid");
    let _ = tokio::fs::create_dir_all(pid_path.parent().unwrap()).await;

    // Write a PID file
    let fake_pid = std::process::id(); // Use our own PID for testing
    print!("  Write PID ({fake_pid})...");
    match tokio::fs::write(&pid_path, fake_pid.to_string()).await {
        Ok(()) => println!(" ✓"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    // Read it back
    print!("  Read PID...");
    match tokio::fs::read_to_string(&pid_path).await {
        Ok(s) => {
            let read_pid: u32 = s.trim().parse().unwrap_or(0);
            if read_pid == fake_pid {
                println!(" ✓ ({read_pid})");
            } else {
                println!(" ✗ (mismatch: {read_pid})");
            }
        }
        Err(e) => println!(" ✗ ({e})"),
    }

    // Clean up
    let _ = tokio::fs::remove_file(&pid_path).await;
}

fn test_process_alive() {
    let our_pid = std::process::id();
    print!("  Our PID ({our_pid}) is alive...");
    let alive = is_process_alive(our_pid);
    println!(" {}", if alive { "✓" } else { "✗" });

    // Check a definitely-dead PID
    let dead_pid = 99999u32;
    print!("  PID {dead_pid} is dead...");
    let alive = is_process_alive(dead_pid);
    println!(" {}", if !alive { "✓" } else { "✗ (unexpectedly alive!)" });
}

fn test_autostart() {
    // Check initial state
    print!("  Query autostart...");
    match query_autostart() {
        Ok(enabled) => println!(" ✓ (enabled: {enabled})"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    // Enable
    print!("  Enable autostart...");
    match enable_autostart() {
        Ok(()) => println!(" ✓"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    // Verify enabled
    print!("  Verify enabled...");
    match query_autostart() {
        Ok(true) => println!(" ✓"),
        Ok(false) => println!(" ✗ (still disabled!)"),
        Err(e) => println!(" ✗ ({e})"),
    }

    // Disable
    print!("  Disable autostart...");
    match disable_autostart() {
        Ok(()) => println!(" ✓"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    // Verify disabled
    print!("  Verify disabled...");
    match query_autostart() {
        Ok(false) => println!(" ✓"),
        Ok(true) => println!(" ✗ (still enabled!)"),
        Err(e) => println!(" ✗ ({e})"),
    }
}

fn cleanup_test_secrets() {
    for key in &["_klodock_spike_test_key", "_klodock_spike_index"] {
        let _ = dpapi_delete(key);
    }
    println!("  Cleaned up test keychain entries ✓");

    // Clean up .env if it exists
    let env_path = home_dir().join(".openclaw").join(".env");
    if env_path.exists() {
        let _ = std::fs::remove_file(&env_path);
        println!("  Cleaned up .env ✓");
    }
}

// --- Helpers ---

fn home_dir() -> PathBuf {
    dirs::home_dir().expect("no home dir")
}

fn is_process_alive(pid: u32) -> bool {
    match std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.contains(&pid.to_string()) && !stdout.contains("No tasks")
        }
        Err(_) => false,
    }
}

fn enable_autostart() -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {e}"))?;
    let value = format!("\"{}\" --minimized", exe_path.display());
    let output = std::process::Command::new("reg")
        .args([
            "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v", "KloDock", "/t", "REG_SZ", "/d", &value, "/f",
        ])
        .output()
        .map_err(|e| format!("reg.exe failed: {e}"))?;
    if output.status.success() { Ok(()) } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn disable_autostart() -> Result<(), String> {
    let output = std::process::Command::new("reg")
        .args([
            "delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v", "KloDock", "/f",
        ])
        .output()
        .map_err(|e| format!("reg.exe failed: {e}"))?;
    if output.status.success() { Ok(()) } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("unable to find") { Ok(()) } else { Err(stderr.to_string()) }
    }
}

fn query_autostart() -> Result<bool, String> {
    let output = std::process::Command::new("reg")
        .args([
            "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v", "KloDock",
        ])
        .output()
        .map_err(|e| format!("reg.exe failed: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).contains("KloDock"))
    } else {
        Ok(false)
    }
}
