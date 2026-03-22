pub mod paths;
pub mod installer;
pub mod config;
pub mod secrets;
pub mod setup;
pub mod process;
pub mod clawhub;
pub mod update;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|_app| {
            if cfg!(debug_assertions) {
                _app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // On launch, scrub any stale .env from a prior crash (Phase 2 Step 1)
            tauri::async_runtime::spawn(async move {
                if let Err(e) = process::daemon::scrub_stale_env().await {
                    log::warn!("Failed to scrub stale .env on startup: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Installer commands
            installer::node::check_node,
            installer::node::install_node,
            installer::openclaw::install_openclaw,
            installer::openclaw::check_openclaw,
            installer::skills::install_skill,
            installer::skills::list_installed_skills,
            installer::uninstall::uninstall_klodock,
            installer::uninstall::resume_uninstall,
            // Config commands
            config::soul::read_soul,
            config::soul::write_soul,
            config::soul::generate_soul,
            config::openclaw_json::read_config,
            config::openclaw_json::write_config,
            // Secret commands
            secrets::keychain::store_secret,
            secrets::keychain::retrieve_secret,
            secrets::keychain::delete_secret,
            secrets::keychain::list_secrets,
            secrets::keychain::test_api_key,
            secrets::keychain::check_ollama,
            secrets::keychain::list_ollama_models,
            // Setup state commands
            setup::setup_state::get_setup_state,
            setup::setup_state::complete_step,
            setup::setup_state::verify_all_steps,
            // Process commands
            process::daemon::start_daemon,
            process::daemon::stop_daemon,
            process::daemon::restart_daemon,
            process::daemon::get_daemon_status,
            process::health::run_health_check,
            process::autostart::enable_autostart,
            process::autostart::disable_autostart,
            process::autostart::is_autostart_enabled,
            // ClawHub commands
            clawhub::registry::search_skills,
            clawhub::registry::get_skill_details,
            clawhub::registry::get_recommended_skills,
            clawhub::safety::get_safety_rating,
            // Update commands
            update::openclaw_update::check_openclaw_update,
            update::openclaw_update::update_openclaw,
            update::skill_update::check_skill_updates,
            update::skill_update::update_skill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KloDock");
}
