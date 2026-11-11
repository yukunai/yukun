use serde::Serialize;
use std::io::Write;
use std::process::Command;
use std::{thread, time::Duration};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmuxAgentStatus {
    session: String,
    exists: bool,
    status: String,
    agent_running: bool,
    current_command: String,
    detail: String,
    last_output: String,
}

#[tauri::command]
pub fn send_to_tmux(session: String, text: String, auto_enter: bool) -> Result<String, String> {
    if session.trim().is_empty() {
        return Err("tmux session is required".to_string());
    }

    if text.len() > 1000 || text.contains('\n') {
        return paste_with_buffer(&session, &text, auto_enter);
    }

    let mut args = vec![
        "send-keys".to_string(),
        "-t".to_string(),
        session.clone(),
        text,
    ];

    if auto_enter {
        args.push("C-m".to_string());
    }

    let output = Command::new("tmux")
        .args(args)
        .output()
        .map_err(|error| format!("failed to run tmux: {error}"))?;

    if output.status.success() {
        Ok(format!("sent to tmux:{session}"))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn capture_tmux_pane(session: String, line_count: u32) -> Result<String, String> {
    let session = session.trim();
    if session.is_empty() {
        return Err("tmux session is required".to_string());
    }

    capture_tmux_pane_text(session, line_count)
}

#[tauri::command]
pub fn get_tmux_agent_status(
    session: String,
    agent_kind: String,
) -> Result<TmuxAgentStatus, String> {
    let session = session.trim();
    if session.is_empty() {
        return Err("tmux session is required".to_string());
    }

    if !tmux_session_exists(session)? {
        return Ok(TmuxAgentStatus {
            session: session.to_string(),
            exists: false,
            status: "missing".to_string(),
            agent_running: false,
            current_command: "".to_string(),
            detail: format!("tmux session `{session}` is missing"),
            last_output: "".to_string(),
        });
    }

    let current_command = tmux_current_command(session).unwrap_or_default();
    let last_output = capture_tmux_pane_text(session, 80).unwrap_or_default();
    let agent_running = looks_like_agent(&agent_kind, &current_command, &last_output);
    let status = if agent_running { "agent" } else { "shell" };
    let detail = if agent_running {
        format!("agent detected in `{session}`")
    } else if current_command.trim().is_empty() {
        format!("session `{session}` exists, but no foreground command was detected")
    } else {
        format!("session `{session}` is running `{current_command}`")
    };

    Ok(TmuxAgentStatus {
        session: session.to_string(),
        exists: true,
        status: status.to_string(),
        agent_running,
        current_command,
        detail,
        last_output,
    })
}

#[tauri::command]
pub fn start_tmux_agent(
    session: String,
    launch_command: String,
    agent_kind: String,
) -> Result<TmuxAgentStatus, String> {
    let session = session.trim();
    if session.is_empty() {
        return Err("tmux session is required".to_string());
    }

    let launch_command = validate_launch_command(&launch_command)?;

    if !tmux_session_exists(session)? {
        let output = Command::new("tmux")
            .args(["new-session", "-d", "-s", session])
            .output()
            .map_err(|error| format!("failed to create tmux session `{session}`: {error}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }

    let status = get_tmux_agent_status(session.to_string(), agent_kind.clone())?;
    if status.agent_running {
        return Ok(status);
    }

    let output = Command::new("tmux")
        .args(["send-keys", "-t", session, launch_command.as_str(), "C-m"])
        .output()
        .map_err(|error| format!("failed to start agent in tmux:{session}: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    get_tmux_agent_status(session.to_string(), agent_kind)
}

#[tauri::command]
pub fn stop_tmux_agent(session: String, agent_kind: String) -> Result<TmuxAgentStatus, String> {
    let session = session.trim();
    if session.is_empty() {
        return Err("tmux session is required".to_string());
    }

    if !tmux_session_exists(session)? {
        return get_tmux_agent_status(session.to_string(), agent_kind);
    }

    let output = Command::new("tmux")
        .args(["send-keys", "-t", session, "C-c"])
        .output()
        .map_err(|error| format!("failed to stop agent in tmux:{session}: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    thread::sleep(Duration::from_millis(180));
    get_tmux_agent_status(session.to_string(), agent_kind)
}

#[tauri::command]
pub fn run_tmux_account_command(
    session: String,
    command: String,
    agent_kind: String,
) -> Result<TmuxAgentStatus, String> {
    let session = session.trim();
    if session.is_empty() {
        return Err("tmux session is required".to_string());
    }

    let command = validate_launch_command(&command)?;

    if !tmux_session_exists(session)? {
        let output = Command::new("tmux")
            .args(["new-session", "-d", "-s", session])
            .output()
            .map_err(|error| format!("failed to create tmux session `{session}`: {error}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }

    let output = Command::new("tmux")
        .args(["send-keys", "-t", session, command.as_str(), "C-m"])
        .output()
        .map_err(|error| format!("failed to run account command in tmux:{session}: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    thread::sleep(Duration::from_millis(180));
    get_tmux_agent_status(session.to_string(), agent_kind)
}

fn capture_tmux_pane_text(session: &str, line_count: u32) -> Result<String, String> {
    let line_count = line_count.clamp(20, 5000);
    let start = format!("-{line_count}");
    let output = Command::new("tmux")
        .args(["capture-pane", "-t", session, "-p", "-S", start.as_str()])
        .output()
        .map_err(|error| format!("failed to run tmux capture-pane: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout)
            .trim_end_matches('\n')
            .to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn tmux_session_exists(session: &str) -> Result<bool, String> {
    let output = Command::new("tmux")
        .args(["has-session", "-t", session])
        .output()
        .map_err(|error| format!("failed to run tmux has-session: {error}"))?;

    Ok(output.status.success())
}

fn tmux_current_command(session: &str) -> Result<String, String> {
    let output = Command::new("tmux")
        .args([
            "display-message",
            "-p",
            "-t",
            session,
            "#{pane_current_command}",
        ])
        .output()
        .map_err(|error| format!("failed to read tmux pane command: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn looks_like_agent(agent_kind: &str, current_command: &str, last_output: &str) -> bool {
    let probe = format!("{current_command}\n{last_output}").to_lowercase();
    let agent_kind = agent_kind.trim().to_lowercase();
    let aliases: &[&str] = match agent_kind.as_str() {
        "claude" | "claude_code" | "claude-code" => &["claude", "claude code"],
        "codex" | "codex_cli" | "codex-cli" => &["codex"],
        _ => &[],
    };

    aliases.iter().any(|alias| probe.contains(alias))
}

fn validate_launch_command(command: &str) -> Result<String, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("agent launch command is required".to_string());
    }

    let forbidden = ['\n', '\r', ';', '&', '|', '<', '>', '`'];
    if command.contains("$(")
        || command
            .chars()
            .any(|character| forbidden.contains(&character))
    {
        return Err("agent launch command contains unsupported shell characters".to_string());
    }

    Ok(command.to_string())
}

fn paste_with_buffer(session: &str, text: &str, auto_enter: bool) -> Result<String, String> {
    let mut file = tempfile::NamedTempFile::new()
        .map_err(|error| format!("failed to create temp prompt file: {error}"))?;
    file.write_all(text.as_bytes())
        .map_err(|error| format!("failed to write temp prompt file: {error}"))?;

    let temp_path = file.path().to_string_lossy().to_string();
    let load_output = Command::new("tmux")
        .args(["load-buffer", "-b", "agentdeck", temp_path.as_str()])
        .output()
        .map_err(|error| format!("failed to run tmux load-buffer: {error}"))?;

    if !load_output.status.success() {
        return Err(String::from_utf8_lossy(&load_output.stderr)
            .trim()
            .to_string());
    }

    let paste_output = Command::new("tmux")
        .args(["paste-buffer", "-b", "agentdeck", "-t", session])
        .output()
        .map_err(|error| format!("failed to run tmux paste-buffer: {error}"))?;

    if !paste_output.status.success() {
        return Err(String::from_utf8_lossy(&paste_output.stderr)
            .trim()
            .to_string());
    }

    if auto_enter {
        let enter_output = Command::new("tmux")
            .args(["send-keys", "-t", session, "C-m"])
            .output()
            .map_err(|error| format!("failed to send enter to tmux: {error}"))?;

        if !enter_output.status.success() {
            return Err(String::from_utf8_lossy(&enter_output.stderr)
                .trim()
                .to_string());
        }
    }

    Ok(format!("pasted to tmux:{session}"))
}
