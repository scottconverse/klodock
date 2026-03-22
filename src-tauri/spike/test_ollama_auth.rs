fn main() {
    // Read existing auth-profiles
    let home = dirs::home_dir().unwrap();
    let path = home.join(".openclaw").join("agents").join("main").join("agent").join("auth-profiles.json");
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let mut profiles: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({"version":1,"profiles":{}}));

    // Add ollama profile — local provider, no API key needed
    if let Some(profs) = profiles.get_mut("profiles").and_then(|p| p.as_object_mut()) {
        profs.insert("ollama:default".to_string(), serde_json::json!({
            "type": "ollama",
            "provider": "ollama",
            "baseUrl": "http://localhost:11434"
        }));
    }

    let json = serde_json::to_string_pretty(&profiles).unwrap();
    std::fs::write(&path, &json).unwrap();
    println!("Updated auth-profiles.json:");
    println!("{}", json);
}
