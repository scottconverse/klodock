//! Test DPAPI-based secret storage on Windows.

use std::process::Command;

fn main() {
    println!("=== DPAPI Secret Store Spike ===\n");

    let test_key = "_spike_dpapi_test";
    let test_value = "sk-test-1234567890abcdef-fake-key";

    // Store
    print!("  Encrypt + store...");
    match dpapi_store(test_key, test_value) {
        Ok(()) => println!(" ✓"),
        Err(e) => {
            println!(" ✗ ({e})");
            return;
        }
    }

    // Retrieve
    print!("  Retrieve + decrypt...");
    match dpapi_retrieve(test_key) {
        Ok(val) => {
            if val == test_value {
                println!(" ✓ (match)");
            } else {
                println!(" ✗ (mismatch)");
                println!("    Expected: {test_value}");
                println!("    Got:      {val}");
            }
        }
        Err(e) => println!(" ✗ ({e})"),
    }

    // Store an index
    print!("  Store key index...");
    let index = vec!["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    let index_json = serde_json::to_string(&index).unwrap();
    match dpapi_store("_key_index", &index_json) {
        Ok(()) => println!(" ✓"),
        Err(e) => println!(" ✗ ({e})"),
    }

    // Retrieve index
    print!("  Retrieve key index...");
    match dpapi_retrieve("_key_index") {
        Ok(val) => {
            let keys: Vec<String> = serde_json::from_str(&val).unwrap_or_default();
            println!(" ✓ ({keys:?})");
        }
        Err(e) => println!(" ✗ ({e})"),
    }

    // Delete
    print!("  Delete...");
    match dpapi_delete(test_key) {
        Ok(()) => println!(" ✓"),
        Err(e) => println!(" ✗ ({e})"),
    }
    let _ = dpapi_delete("_key_index");

    // Verify deleted
    print!("  Verify gone...");
    match dpapi_retrieve(test_key) {
        Err(_) => println!(" ✓ (not found, as expected)"),
        Ok(_) => println!(" ✗ (still exists!)"),
    }

    println!("\n=== Spike Complete ===");
}

fn secrets_dir() -> std::path::PathBuf {
    dirs::home_dir().unwrap().join(".klodock").join("secrets")
}

fn dpapi_store(key: &str, value: &str) -> Result<(), String> {
    let dir = secrets_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile", "-Command",
            &format!(
                "$ss = ConvertTo-SecureString '{}' -AsPlainText -Force; ConvertFrom-SecureString $ss",
                value.replace('\'', "''")
            ),
        ])
        .output()
        .map_err(|e| format!("encrypt: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let path = dir.join(format!("{key}.enc"));
    std::fs::write(&path, &output.stdout).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

fn dpapi_retrieve(key: &str) -> Result<String, String> {
    let path = secrets_dir().join(format!("{key}.enc"));
    if !path.exists() {
        return Err("not found".into());
    }

    let encrypted = std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    let hex_str = encrypted.trim();

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile", "-Command",
            &format!(
                "$ss = ConvertTo-SecureString '{hex_str}'; \
                 $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss); \
                 [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)"
            ),
        ])
        .output()
        .map_err(|e| format!("decrypt: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn dpapi_delete(key: &str) -> Result<(), String> {
    let path = secrets_dir().join(format!("{key}.enc"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("delete: {e}"))?;
    }
    Ok(())
}
