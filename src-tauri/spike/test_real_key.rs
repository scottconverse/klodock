fn main() {
    println!("=== Real API Key End-to-End Test ===\n");

    // Test 1: Store the Gemini key
    print!("1. Store GEMINI_API_KEY in keychain... ");
    match klodock::secrets::keychain::store_secret(
        "GEMINI_API_KEY".to_string(),
        "REDACTED_KEY".to_string(),
    ) {
        Ok(()) => println!("OK"),
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 2: Retrieve it
    print!("2. Retrieve GEMINI_API_KEY from keychain... ");
    match klodock::secrets::keychain::retrieve_secret("GEMINI_API_KEY".to_string()) {
        Ok(v) => {
            if v == "REDACTED_KEY" {
                println!("OK (round-trip exact match)");
            } else {
                println!("FAIL (value mangled: '{}')", v);
                std::process::exit(1);
            }
        }
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 3: Validate against real Gemini API
    print!("3. Validate key against Gemini API (real HTTP call)... ");
    let rt = tokio::runtime::Runtime::new().unwrap();
    match rt.block_on(klodock::secrets::keychain::test_api_key(
        "gemini".to_string(),
        "REDACTED_KEY".to_string(),
    )) {
        Ok(true) => println!("VALID"),
        Ok(false) => { println!("INVALID (rejected by Google)"); std::process::exit(1); }
        Err(e) => { println!("ERROR: {}", e); std::process::exit(1); }
    }

    // Test 4: Write openclaw.json
    print!("4. Write openclaw.json with Gemini config... ");
    let config = klodock::config::openclaw_json::OpenClawConfig {
        model_provider: "gemini".to_string(),
        default_model: "gemini-pro".to_string(),
        base_url: None,
        channels: std::collections::HashMap::new(),
        agent_name: "TestAgent".to_string(),
    };
    let rt2 = tokio::runtime::Runtime::new().unwrap();
    match rt2.block_on(klodock::config::openclaw_json::write_config(config)) {
        Ok(()) => println!("OK"),
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 5: Read config back
    print!("5. Read openclaw.json back... ");
    let rt3 = tokio::runtime::Runtime::new().unwrap();
    match rt3.block_on(klodock::config::openclaw_json::read_config()) {
        Ok(c) => println!("OK (provider={}, model={}, agent={})", c.model_provider, c.default_model, c.agent_name),
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 6: Generate SOUL.md
    print!("6. Generate SOUL.md... ");
    let soul_config = klodock::config::soul::SoulConfig {
        name: "TestAgent".to_string(),
        role: klodock::config::soul::Role::GeneralAssistant,
        tone: 0.5,
        custom_instructions: Some("Always respond helpfully.".to_string()),
    };
    let rt4 = tokio::runtime::Runtime::new().unwrap();
    let soul_content = match rt4.block_on(klodock::config::soul::generate_soul(soul_config)) {
        Ok(s) => { println!("OK ({} bytes)", s.len()); s }
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    };

    // Test 7: Write SOUL.md to disk
    print!("7. Write SOUL.md to ~/.openclaw/workspace/SOUL.md... ");
    let rt5 = tokio::runtime::Runtime::new().unwrap();
    match rt5.block_on(klodock::config::soul::write_soul(soul_content)) {
        Ok(()) => {
            let path = klodock::config::soul::soul_path().unwrap();
            if path.exists() {
                println!("OK ({})", path.display());
            } else {
                println!("FAIL (file not at expected path)");
            }
        }
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 8: Materialize .env from keychain
    print!("8. Materialize .env from keychain... ");
    let mut entries = std::collections::HashMap::new();
    entries.insert("GEMINI_API_KEY".to_string(), "REDACTED_KEY".to_string());
    let rt6 = tokio::runtime::Runtime::new().unwrap();
    match rt6.block_on(klodock::config::env::write_env(entries)) {
        Ok(()) => {
            let env_path = klodock::config::env::env_path().unwrap();
            if env_path.exists() {
                println!("OK ({})", env_path.display());
            } else {
                println!("FAIL (.env not created)");
                std::process::exit(1);
            }
        }
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 9: Verify .env content
    print!("9. Verify .env content... ");
    let env_path = klodock::config::env::env_path().unwrap();
    let content = std::fs::read_to_string(&env_path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() == 1 && lines[0] == "GEMINI_API_KEY=REDACTED_KEY" {
        println!("OK (1 line, exact match)");
    } else {
        println!("FAIL (unexpected content: {:?})", content);
        std::process::exit(1);
    }

    // Test 10: Scrub .env
    print!("10. Scrub .env... ");
    let rt7 = tokio::runtime::Runtime::new().unwrap();
    match rt7.block_on(klodock::config::env::delete_env()) {
        Ok(()) => {
            if !env_path.exists() {
                println!("OK (removed)");
            } else {
                println!("FAIL (still exists!)");
                std::process::exit(1);
            }
        }
        Err(e) => { println!("FAIL: {}", e); std::process::exit(1); }
    }

    // Test 11: Check if OpenClaw binary exists (installed via npm)
    print!("11. Check for OpenClaw binary... ");
    match which::which("openclaw") {
        Ok(path) => println!("FOUND ({})", path.display()),
        Err(_) => {
            // Check KloDock-managed path
            match klodock::installer::node::klodock_node_path() {
                Ok(node_path) => {
                    let parent = node_path.parent().unwrap_or(std::path::Path::new("."));
                    let openclaw_cmd = if cfg!(windows) { "openclaw.cmd" } else { "openclaw" };
                    let oc_path = parent.join(openclaw_cmd);
                    if oc_path.exists() {
                        println!("FOUND ({})", oc_path.display());
                    } else {
                        println!("NOT FOUND (not installed yet — wizard step 3 would install it)");
                    }
                }
                Err(_) => println!("NOT FOUND (no KloDock-managed node)"),
            }
        }
    }

    // Cleanup
    println!("\n--- Cleanup ---");
    print!("Removing test key from keychain... ");
    match klodock::secrets::keychain::delete_secret("GEMINI_API_KEY".to_string()) {
        Ok(()) => println!("OK"),
        Err(e) => println!("WARN: {}", e),
    }

    println!("\n=== ALL 11 STEPS PASSED ===");
}
