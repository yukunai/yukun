use std::io::Write;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

#[tauri::command]
pub fn send_to_cursor(
    app_name: String,
    text: String,
    open_chat_shortcut: String,
    send_shortcut: String,
    auto_enter: bool,
    restore_clipboard: bool,
) -> Result<String, String> {
    let app_name = app_name.trim();
    if app_name.is_empty() {
        return Err("Cursor app name is required".to_string());
    }

    let previous_clipboard = if restore_clipboard {
        Some(read_clipboard().unwrap_or_default())
    } else {
        None
    };

    write_clipboard(&text)?;
    run_cursor_script(app_name, &open_chat_shortcut, &send_shortcut, auto_enter)?;
    thread::sleep(Duration::from_millis(300));

    if let Some(previous) = previous_clipboard {
        write_clipboard(&previous)
            .map_err(|error| format!("sent to Cursor, but failed to restore clipboard: {error}"))?;
    }

    Ok(format!("sent to {app_name}"))
}

#[tauri::command]
pub fn send_to_terminal_app(
    app_name: String,
    text: String,
    send_shortcut: String,
    auto_enter: bool,
    restore_clipboard: bool,
) -> Result<String, String> {
    let app_name = app_name.trim();
    if app_name.is_empty() {
        return Err("Terminal app name is required".to_string());
    }

    let previous_clipboard = if restore_clipboard {
        Some(read_clipboard().unwrap_or_default())
    } else {
        None
    };

    write_clipboard(&text)?;
    run_paste_script(Some(app_name), &send_shortcut, auto_enter)?;
    thread::sleep(Duration::from_millis(300));

    if let Some(previous) = previous_clipboard {
        write_clipboard(&previous).map_err(|error| {
            format!("sent to {app_name}, but failed to restore clipboard: {error}")
        })?;
    }

    Ok(format!("sent to {app_name}"))
}

#[tauri::command]
pub fn send_to_active_window(
    text: String,
    send_shortcut: String,
    auto_enter: bool,
    restore_clipboard: bool,
) -> Result<String, String> {
    let previous_clipboard = if restore_clipboard {
        Some(read_clipboard().unwrap_or_default())
    } else {
        None
    };

    write_clipboard(&text)?;
    run_paste_script(None, &send_shortcut, auto_enter)?;
    thread::sleep(Duration::from_millis(300));

    if let Some(previous) = previous_clipboard {
        write_clipboard(&previous).map_err(|error| {
            format!("sent to active window, but failed to restore clipboard: {error}")
        })?;
    }

    Ok("sent to active window".to_string())
}

#[tauri::command]
pub fn get_frontmost_app_name() -> Result<String, String> {
    let script = "tell application \"System Events\" to get name of first application process whose frontmost is true";
    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .map_err(|error| format!("failed to run osascript: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn read_clipboard() -> Result<String, String> {
    let output = Command::new("pbpaste")
        .output()
        .map_err(|error| format!("failed to read clipboard: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn write_clipboard(text: &str) -> Result<(), String> {
    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start pbcopy: {error}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|error| format!("failed to write clipboard: {error}"))?;
    }

    let status = child
        .wait()
        .map_err(|error| format!("failed to wait for pbcopy: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("pbcopy failed".to_string())
    }
}

fn run_cursor_script(
    app_name: &str,
    open_chat_shortcut: &str,
    send_shortcut: &str,
    auto_enter: bool,
) -> Result<(), String> {
    let mut system_events = vec![
        shortcut_to_applescript(open_chat_shortcut)?,
        "delay 0.2".to_string(),
        "keystroke \"v\" using command down".to_string(),
        "delay 0.1".to_string(),
    ];

    if auto_enter {
        system_events.push(shortcut_to_applescript(send_shortcut)?);
    }

    let script = format!(
        "tell application \"{}\" to activate\n\
         delay 0.25\n\
         tell application \"System Events\"\n\
         {}\n\
         end tell",
        escape_applescript_string(app_name),
        system_events.join("\n")
    );

    let output = Command::new("osascript")
        .args(["-e", script.as_str()])
        .output()
        .map_err(|error| format!("failed to run osascript: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn run_paste_script(
    app_name: Option<&str>,
    send_shortcut: &str,
    auto_enter: bool,
) -> Result<(), String> {
    let mut lines = Vec::new();

    if let Some(app_name) = app_name {
        lines.push(format!(
            "tell application \"{}\" to activate",
            escape_applescript_string(app_name)
        ));
        lines.push("delay 0.25".to_string());
    }

    let mut system_events = vec![
        "keystroke \"v\" using command down".to_string(),
        "delay 0.1".to_string(),
    ];

    if auto_enter {
        system_events.push(shortcut_to_applescript(send_shortcut)?);
    }

    lines.push(format!(
        "tell application \"System Events\"\n{}\nend tell",
        system_events.join("\n")
    ));

    let script = lines.join("\n");
    let output = Command::new("osascript")
        .args(["-e", script.as_str()])
        .output()
        .map_err(|error| format!("failed to run osascript: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn shortcut_to_applescript(shortcut: &str) -> Result<String, String> {
    let shortcut = shortcut.trim();
    if shortcut.is_empty() {
        return Err("shortcut is required".to_string());
    }

    let parts: Vec<String> = shortcut
        .split('+')
        .map(|part| part.trim().to_lowercase())
        .filter(|part| !part.is_empty())
        .collect();

    if parts.is_empty() {
        return Err("shortcut is required".to_string());
    }

    let mut modifiers = Vec::new();
    let mut key = None;

    for part in parts {
        match part.as_str() {
            "cmd" | "command" | "commandorcontrol" | "meta" => {
                modifiers.push("command down".to_string())
            }
            "ctrl" | "control" => modifiers.push("control down".to_string()),
            "option" | "alt" => modifiers.push("option down".to_string()),
            "shift" => modifiers.push("shift down".to_string()),
            _ => key = Some(part),
        }
    }

    let key = key.ok_or_else(|| format!("shortcut `{shortcut}` has no key"))?;
    let using = match modifiers.as_slice() {
        [] => String::new(),
        [single] => format!(" using {single}"),
        many => format!(" using {{{}}}", many.join(", ")),
    };

    if let Some(code) = key_code(&key) {
        return Ok(format!("key code {code}{using}"));
    }

    if key.chars().count() == 1 {
        return Ok(format!(
            "keystroke \"{}\"{}",
            escape_applescript_string(&key),
            using
        ));
    }

    Err(format!("unsupported shortcut key `{key}`"))
}

fn key_code(key: &str) -> Option<u16> {
    match key {
        "enter" | "return" => Some(36),
        "tab" => Some(48),
        "space" => Some(49),
        "esc" | "escape" => Some(53),
        "delete" | "backspace" => Some(51),
        "up" => Some(126),
        "down" => Some(125),
        "left" => Some(123),
        "right" => Some(124),
        _ => None,
    }
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
