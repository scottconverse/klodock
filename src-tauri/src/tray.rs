use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// Set up the system tray icon with context menu.
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show KloDock").build(app)?;
    let webchat = MenuItemBuilder::with_id("webchat", "Open WebChat").build(app)?;
    let toggle_agent = MenuItemBuilder::with_id("toggle_agent", "Start Agent").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit KloDock").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&webchat)
        .item(&toggle_agent)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("failed to decode embedded tray icon");

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("KloDock — Stopped")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "webchat" => {
                    let _ = std::process::Command::new("cmd")
                        .args(["/C", "start", "", "http://127.0.0.1:18789/__openclaw__/canvas/"])
                        .spawn();
                }
                "toggle_agent" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("tray-toggle-agent", ());
                    }
                }
                "quit" => {
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::process::daemon::stop_daemon_internal().await;
                        handle.exit(0);
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
