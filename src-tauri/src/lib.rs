pub mod paths;
pub mod installer;
pub mod config;
pub mod secrets;
pub mod setup;
pub mod process;
pub mod clawhub;
pub mod update;
pub mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // System tray icon
            tray::setup_tray(app.handle())?;

            // Close button minimizes to tray instead of quitting
            use tauri::Manager;
            if let Some(window) = app.handle().get_webview_window("main") {
                window.on_window_event({
                    let w = window.clone();
                    move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    }
                });
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
            // Ollama commands
            installer::ollama::check_ollama_installed,
            installer::ollama::download_ollama,
            installer::ollama::install_ollama,
            installer::ollama::pull_ollama_model,
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
            secrets::keychain::test_channel_token,
            secrets::keychain::check_ollama,
            secrets::keychain::list_ollama_models,
            // Settings commands
            config::settings::get_keep_keys,
            config::settings::set_keep_keys,
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
            process::activity::get_activity_log,
            process::activity::clear_activity_log,
            // ClawHub commands
            clawhub::registry::search_skills,
            clawhub::registry::get_skill_details,
            clawhub::registry::get_recommended_skills,
            clawhub::registry::list_all_skills,
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
