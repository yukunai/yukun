use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupCheck {
    id: String,
    status: String,
    detail: String,
    required: bool,
}

#[tauri::command]
pub fn run_setup_check(
    codex_session: String,
    cc_session: String,
    cursor_app_name: String,
) -> Vec<SetupCheck> {
    let codex_session = fallback(codex_session, "codex");
    let cc_session = fallback(cc_session, "cc");
    let cursor_app_name = fallback(cursor_app_name, "Cursor");
    let mut checks = Vec::new();

    checks.push(SetupCheck {
        id: "desktop".to_string(),
        status: "ok".to_string(),
        detail: "Tauri desktop runtime".to_string(),
        required: true,
    });

    checks.push(check_shell_command(
        "cargo",
        "cargo --version",
        "Rust cargo is available",
        true,
    ));
    checks.push(check_shell_command(
        "rustc",
        "rustc --version",
        "Rust compiler is available",
        true,
    ));
    checks.push(check_shell_command(
        "brew",
        "command -v brew",
        "Homebrew is available",
        false,
    ));

    let tmux_check = check_shell_command("tmux", "tmux -V", "tmux is available", true);
    let tmux_available = tmux_check.status == "ok";
    checks.push(tmux_check);

    checks.push(check_tmux_session(
        "tmux_codex",
        &codex_session,
        tmux_available,
    ));
    checks.push(check_tmux_session("tmux_cc", &cc_session, tmux_available));

    checks.push(check_process_command(
        "osascript",
        "osascript",
        &["-e", "return \"ok\""],
        "AppleScript is available",
        true,
    ));

    checks.push(check_shell_command(
        "pbcopy",
        "command -v pbcopy",
        "pbcopy is available",
        true,
    ));
    checks.push(check_shell_command(
        "pbpaste",
        "command -v pbpaste",
        "pbpaste is available",
        true,
    ));

    checks.push(check_accessibility());
    checks.push(check_cursor_app(&cursor_app_name));

    checks
}

fn fallback(value: String, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn ok(id: &str, detail: String, required: bool) -> SetupCheck {
    SetupCheck {
        id: id.to_string(),
        status: "ok".to_string(),
        detail,
        required,
    }
}

fn missing(id: &str, detail: String, required: bool) -> SetupCheck {
    SetupCheck {
        id: id.to_string(),
        status: "missing".to_string(),
        detail,
        required,
    }
}

fn warning(id: &str, detail: String, required: bool) -> SetupCheck {
    SetupCheck {
        id: id.to_string(),
        status: "warning".to_string(),
        detail,
        required,
    }
}

fn check_shell_command(id: &str, command: &str, ok_detail: &str, required: bool) -> SetupCheck {
    let output = Command::new("zsh").args(["-lc", command]).output();
    match output {
        Ok(output) if output.status.success() => {
            let detail = String::from_utf8_lossy(&output.stdout).trim().to_string();
            ok(
                id,
                if detail.is_empty() {
                    ok_detail.to_string()
                } else {
                    detail
                },
                required,
            )
        }
        Ok(output) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            missing(
                id,
                if detail.is_empty() {
                    format!("{command} failed")
                } else {
                    detail
                },
                required,
            )
        }
        Err(error) => missing(id, format!("failed to run {command}: {error}"), required),
    }
}

fn check_process_command(
    id: &str,
    command: &str,
    args: &[&str],
    ok_detail: &str,
    required: bool,
) -> SetupCheck {
    let output = Command::new(command).args(args).output();
    match output {
        Ok(output) if output.status.success() => ok(id, ok_detail.to_string(), required),
        Ok(output) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            missing(
                id,
                if detail.is_empty() {
                    format!("{command} failed")
                } else {
                    detail
                },
                required,
            )
        }
        Err(error) => missing(id, format!("failed to run {command}: {error}"), required),
    }
}

fn check_tmux_session(id: &str, session: &str, tmux_available: bool) -> SetupCheck {
    if !tmux_available {
        return missing(id, "tmux is not available".to_string(), true);
    }

    let command = format!("tmux has-session -t {}", shell_quote(session));
    let output = Command::new("zsh").args(["-lc", command.as_str()]).output();
    match output {
        Ok(output) if output.status.success() => {
            ok(id, format!("session `{session}` exists"), true)
        }
        Ok(output) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            missing(
                id,
                if detail.is_empty() {
                    format!("session `{session}` is missing")
                } else {
                    detail
                },
                true,
            )
        }
        Err(error) => missing(
            id,
            format!("failed to check session `{session}`: {error}"),
            true,
        ),
    }
}

fn check_accessibility() -> SetupCheck {
    let script = "tell application \"System Events\" to get UI elements enabled";
    let output = Command::new("osascript").args(["-e", script]).output();
    match output {
        Ok(output) if output.status.success() => {
            let enabled = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if enabled == "true" {
                ok(
                    "accessibility",
                    "Accessibility automation is enabled".to_string(),
                    false,
                )
            } else {
                warning(
                    "accessibility",
                    "System Events UI automation is disabled".to_string(),
                    false,
                )
            }
        }
        Ok(output) => warning(
            "accessibility",
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
            false,
        ),
        Err(error) => warning(
            "accessibility",
            format!("failed to check Accessibility: {error}"),
            false,
        ),
    }
}

fn check_cursor_app(app_name: &str) -> SetupCheck {
    let script = format!(
        "id of application \"{}\"",
        escape_applescript_string(app_name)
    );
    let output = Command::new("osascript")
        .args(["-e", script.as_str()])
        .output();
    match output {
        Ok(output) if output.status.success() => {
            ok("cursor_app", format!("{app_name} is available"), false)
        }
        Ok(output) => warning(
            "cursor_app",
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
            false,
        ),
        Err(error) => warning(
            "cursor_app",
            format!("failed to check {app_name}: {error}"),
            false,
        ),
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
