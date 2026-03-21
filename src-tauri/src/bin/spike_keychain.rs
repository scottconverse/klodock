//! Debug the keychain issue — investigate why store succeeds but retrieve fails.

fn main() {
    println!("=== Keychain Debug ===\n");

    let service = "clawpad";
    let key = "_clawpad_debug_test";
    let value = "test-secret-value-123";

    // Try with keyring crate
    println!("--- keyring crate ---");
    match keyring::Entry::new(service, key) {
        Ok(entry) => {
            println!("  Entry created for {service}/{key}");

            // Store
            match entry.set_password(value) {
                Ok(()) => println!("  set_password: ✓"),
                Err(e) => {
                    println!("  set_password: ✗ ({e:?})");
                    return;
                }
            }

            // Immediate retrieve with same entry object
            match entry.get_password() {
                Ok(v) => println!("  get_password (same entry): ✓ (len={})", v.len()),
                Err(e) => println!("  get_password (same entry): ✗ ({e:?})"),
            }

            // New entry object, same service/key
            match keyring::Entry::new(service, key) {
                Ok(entry2) => match entry2.get_password() {
                    Ok(v) => println!("  get_password (new entry): ✓ (len={})", v.len()),
                    Err(e) => println!("  get_password (new entry): ✗ ({e:?})"),
                },
                Err(e) => println!("  new entry: ✗ ({e:?})"),
            }

            // Cleanup
            let _ = entry.delete_credential();
        }
        Err(e) => println!("  Entry::new failed: {e:?}"),
    }

    // Try with explicit target
    println!("\n--- keyring with builder ---");
    match keyring::Entry::new_with_target(&format!("{service}.{key}"), service, key) {
        Ok(entry) => {
            println!("  Entry created with target {service}.{key}");

            match entry.set_password(value) {
                Ok(()) => println!("  set_password: ✓"),
                Err(e) => {
                    println!("  set_password: ✗ ({e:?})");
                    return;
                }
            }

            match entry.get_password() {
                Ok(v) => println!("  get_password: ✓ (val={})", v),
                Err(e) => println!("  get_password: ✗ ({e:?})"),
            }

            let _ = entry.delete_credential();
        }
        Err(e) => println!("  Entry::new_with_target failed: {e:?}"),
    }

    // Try Windows-native approach via cmdkey
    println!("\n--- cmdkey (Windows native) ---");
    let target = format!("clawpad/{key}");

    let store = std::process::Command::new("cmdkey")
        .args(["/generic", &target, "/user", "clawpad", "/pass", value])
        .output();
    match store {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            println!("  cmdkey add: {} ({})", if out.status.success() { "✓" } else { "✗" }, stdout.trim());
        }
        Err(e) => println!("  cmdkey add: ✗ ({e})"),
    }

    let retrieve = std::process::Command::new("cmdkey")
        .args(["/list"])
        .output();
    match retrieve {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let found = stdout.lines().any(|l| l.contains("clawpad"));
            println!("  cmdkey list contains 'clawpad': {}", if found { "✓" } else { "✗" });
        }
        Err(e) => println!("  cmdkey list: ✗ ({e})"),
    }

    // Cleanup
    let _ = std::process::Command::new("cmdkey")
        .args(["/delete", &target])
        .output();

    println!("\n=== Debug Complete ===");
}
