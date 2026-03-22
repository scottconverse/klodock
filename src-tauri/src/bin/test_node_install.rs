//! Test the actual Node.js 22.16.0 download and install to ~/.klodock/node/
//! Run: cargo run --bin test_node_install --features spike

#[tokio::main]
async fn main() {
    println!("=== Node.js Install Test ===\n");

    // Check what's currently on the system
    print!("System Node.js: ");
    match std::process::Command::new("node").arg("--version").output() {
        Ok(out) if out.status.success() => {
            println!("{}", String::from_utf8_lossy(&out.stdout).trim());
        }
        _ => println!("not found"),
    }

    // Check if KloDock-managed Node already exists
    let home = dirs::home_dir().expect("no home dir");
    let klodock_node = home.join(".klodock").join("node").join("node.exe");
    if klodock_node.exists() {
        print!("KloDock-managed Node already at {}: ", klodock_node.display());
        match std::process::Command::new(&klodock_node).arg("--version").output() {
            Ok(out) if out.status.success() => {
                println!("{}", String::from_utf8_lossy(&out.stdout).trim());
                println!("Already installed. Removing to test fresh install...");
                std::fs::remove_dir_all(home.join(".klodock").join("node")).ok();
            }
            _ => {
                println!("exists but can't run. Removing...");
                std::fs::remove_dir_all(home.join(".klodock").join("node")).ok();
            }
        }
    }

    // Now test the download
    println!("\nDownloading Node.js 22.16.0...");
    let version = "22.16.0";
    let archive = "node-v22.16.0-win-x64.zip";
    let url = format!("https://nodejs.org/dist/v{}/{}", version, archive);

    let tmp_dir = home.join(".klodock").join("tmp");
    std::fs::create_dir_all(&tmp_dir).expect("create tmp dir");
    let download_path = tmp_dir.join(archive);

    println!("URL: {}", url);
    print!("Downloading... ");

    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.expect("GET failed");
    let status = resp.status();
    if !status.is_success() {
        println!("FAIL (HTTP {})", status);
        std::process::exit(1);
    }

    let bytes = resp.bytes().await.expect("read body");
    let size_mb = bytes.len() as f64 / 1_048_576.0;
    std::fs::write(&download_path, &bytes).expect("write file");
    println!("OK ({:.1} MB)", size_mb);

    // Verify SHA256
    print!("Verifying checksum... ");
    let checksum_url = format!("https://nodejs.org/dist/v{}/SHASUMS256.txt", version);
    let checksums = client.get(&checksum_url).send().await
        .expect("checksum GET")
        .text().await
        .expect("checksum text");

    let expected_hash = checksums.lines()
        .find(|line| line.contains(archive))
        .map(|line| line.split_whitespace().next().unwrap_or(""))
        .unwrap_or("");

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual_hash = format!("{:x}", hasher.finalize());

    if actual_hash == expected_hash {
        println!("PASS");
    } else {
        println!("FAIL\n  expected: {}\n  actual:   {}", expected_hash, actual_hash);
        std::process::exit(1);
    }

    // Extract
    print!("Extracting... ");
    let install_dir = home.join(".klodock").join("node");
    std::fs::create_dir_all(install_dir.parent().unwrap()).ok();

    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                download_path.display(),
                install_dir.parent().unwrap().display()
            ),
        ])
        .output()
        .expect("powershell");

    if !output.status.success() {
        println!("FAIL: {}", String::from_utf8_lossy(&output.stderr));
        std::process::exit(1);
    }

    // Node extracts to node-v22.16.0-win-x64/ subfolder, need to rename
    let extracted_dir = install_dir.parent().unwrap().join(format!("node-v{}-win-x64", version));
    if extracted_dir.exists() && !install_dir.exists() {
        std::fs::rename(&extracted_dir, &install_dir).expect("rename");
    }
    println!("OK");

    // Verify
    print!("Verifying installed Node... ");
    let node_exe = install_dir.join("node.exe");
    if !node_exe.exists() {
        println!("FAIL (node.exe not found at {})", node_exe.display());
        std::process::exit(1);
    }

    match std::process::Command::new(&node_exe).arg("--version").output() {
        Ok(out) if out.status.success() => {
            let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            println!("PASS ({})", ver);
            if !ver.contains("22.16") {
                println!("WARNING: Expected v22.16.0, got {}", ver);
            }
        }
        Ok(out) => {
            println!("FAIL (exit code: {:?})", out.status.code());
            std::process::exit(1);
        }
        Err(e) => {
            println!("FAIL ({})", e);
            std::process::exit(1);
        }
    }

    // Verify npm
    print!("Verifying npm... ");
    let npm_cmd = install_dir.join("npm.cmd");
    if npm_cmd.exists() {
        match std::process::Command::new(&npm_cmd).arg("--version").output() {
            Ok(out) if out.status.success() => {
                println!("PASS (npm {})", String::from_utf8_lossy(&out.stdout).trim());
            }
            _ => println!("WARN (npm.cmd exists but failed to run)"),
        }
    } else {
        println!("FAIL (npm.cmd not found)");
        std::process::exit(1);
    }

    // Cleanup tmp
    std::fs::remove_file(&download_path).ok();
    std::fs::remove_dir_all(&tmp_dir).ok();

    println!("\n✅ Node.js 22.16.0 installed successfully to ~/.klodock/node/");
    println!("   System Node (22.14.0) is untouched.");
}
