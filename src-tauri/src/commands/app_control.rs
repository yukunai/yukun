use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn restart_agentdeck(app: AppHandle) -> Result<String, String> {
    app.request_restart();
    Ok("restarting yukun".to_string())
}

#[tauri::command]
pub fn quit_agentdeck(app: AppHandle) -> Result<String, String> {
    app.exit(0);
    Ok("quitting yukun".to_string())
}

#[tauri::command]
pub fn show_agentdeck_window(app: AppHandle) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    window
        .unminimize()
        .map_err(|error| format!("failed to unminimize window: {error}"))?;
    window
        .show()
        .map_err(|error| format!("failed to show window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus window: {error}"))?;

    Ok("yukun window focused".to_string())
}
