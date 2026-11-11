mod commands;
mod contracts;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::archive::archive_interaction,
            commands::app_control::quit_agentdeck,
            commands::app_control::restart_agentdeck,
            commands::app_control::show_agentdeck_window,
            commands::deck::dispatch_command,
            commands::deck::capture_pane,
            commands::tmux::send_to_tmux,
            commands::tmux::capture_tmux_pane,
            commands::tmux::get_tmux_agent_status,
            commands::tmux::start_tmux_agent,
            commands::tmux::stop_tmux_agent,
            commands::tmux::run_tmux_account_command,
            commands::automation::send_to_cursor,
            commands::automation::send_to_terminal_app,
            commands::automation::send_to_active_window,
            commands::automation::get_frontmost_app_name,
            commands::keychain::save_model_account_secret,
            commands::keychain::copy_model_account_secret,
            commands::keychain::delete_model_account_secret,
            commands::setup::run_setup_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running yukun");
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show yukun", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide yukun", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .tooltip("yukun")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}
