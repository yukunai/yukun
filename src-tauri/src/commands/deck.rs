use crate::commands::automation;
use crate::contracts::{
    BlockReason, CapturePaneRequest, CapturePaneResponse, CommandStatus, DispatchCommandRequest,
    DispatchCommandResponse, SendMode, TargetConfig, TargetKind,
};
use regex::Regex;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub fn dispatch_command(request: DispatchCommandRequest) -> DispatchCommandResponse {
    let target_id = request.target.id.clone();

    if let Err(message) = validate_target(&request.target) {
        return failed(target_id, message);
    }

    if request.force_execute != Some(true) {
        if let Some(reason) = validate_content(&request.content) {
            return DispatchCommandResponse {
                status: CommandStatus::Blocked,
                target_id,
                message: format!(
                    "blocked by yukun validator: {}",
                    block_reason_label(&reason)
                ),
                blocked_reason: Some(reason),
            };
        }
    }

    match route_command(&request) {
        Ok(message) => DispatchCommandResponse {
            status: CommandStatus::Sent,
            target_id,
            message,
            blocked_reason: None,
        },
        Err(message) => failed(target_id, message),
    }
}

#[tauri::command]
pub fn capture_pane(request: CapturePaneRequest) -> Result<CapturePaneResponse, String> {
    let session = validate_tmux_session(request.session.as_str())?;
    let lines = request.lines.unwrap_or(15).clamp(1, 200);
    let start = format!("-{lines}");
    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t",
            session,
            "-p",
            "-N",
            "-S",
            start.as_str(),
        ])
        .output()
        .map_err(|error| format!("failed to run tmux capture-pane: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(CapturePaneResponse {
        session: session.to_string(),
        text: strip_ansi(String::from_utf8_lossy(&output.stdout).as_ref())
            .trim_end_matches('\n')
            .to_string(),
        captured_at: now_millis(),
    })
}

fn route_command(request: &DispatchCommandRequest) -> Result<String, String> {
    match request.target.kind {
        TargetKind::TmuxAgent => {
            let session = request
                .target
                .tmux_session
                .as_deref()
                .ok_or_else(|| "tmux target requires tmuxSession".to_string())?;
            if request.send_mode == Some(SendMode::Paste) {
                paste_tmux_buffer(session, &request.content, request.auto_enter)
            } else {
                send_tmux_keys(session, &request.content, request.auto_enter)
            }
        }
        TargetKind::Cursor => {
            let app_name = request
                .target
                .app_name
                .clone()
                .unwrap_or_else(|| "Cursor".to_string());
            automation::send_to_cursor(
                app_name,
                request.content.clone(),
                request
                    .target
                    .open_chat_shortcut
                    .clone()
                    .unwrap_or_else(|| "cmd+l".to_string()),
                request
                    .target
                    .submit_shortcut
                    .clone()
                    .unwrap_or_else(|| "enter".to_string()),
                request.auto_enter,
                true,
            )
        }
        TargetKind::ActiveWindow => automation::send_to_active_window(
            request.content.clone(),
            request
                .target
                .submit_shortcut
                .clone()
                .unwrap_or_else(|| "enter".to_string()),
            request.auto_enter,
            true,
        ),
    }
}

fn paste_tmux_buffer(session: &str, content: &str, auto_enter: bool) -> Result<String, String> {
    let session = validate_tmux_session(session)?;
    let buffer_name = "agentdeck";
    let mut child = Command::new("tmux")
        .args(["load-buffer", "-b", buffer_name, "-"])
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to run tmux load-buffer: {error}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(content.as_bytes())
            .map_err(|error| format!("failed to write tmux buffer: {error}"))?;
    }

    let status = child
        .wait()
        .map_err(|error| format!("failed to wait for tmux load-buffer: {error}"))?;

    if !status.success() {
        return Err("tmux load-buffer failed".to_string());
    }

    let paste_output = Command::new("tmux")
        .args(["paste-buffer", "-b", buffer_name, "-t", session])
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

fn send_tmux_keys(session: &str, content: &str, auto_enter: bool) -> Result<String, String> {
    let session = validate_tmux_session(session)?;
    let mut args = vec![
        "send-keys".to_string(),
        "-t".to_string(),
        session.to_string(),
        content.to_string(),
    ];

    if auto_enter {
        args.push("C-m".to_string());
    }

    let output = Command::new("tmux")
        .args(args)
        .output()
        .map_err(|error| format!("failed to run tmux send-keys: {error}"))?;

    if output.status.success() {
        Ok(format!("sent to tmux:{session}"))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn validate_target(target: &TargetConfig) -> Result<(), String> {
    validate_identifier("target id", &target.id)?;

    match target.kind {
        TargetKind::TmuxAgent => {
            let session = target
                .tmux_session
                .as_deref()
                .ok_or_else(|| "tmux target requires tmuxSession".to_string())?;
            validate_tmux_session(session)?;
        }
        TargetKind::Cursor => {
            let app_name = target.app_name.as_deref().unwrap_or("Cursor");
            validate_app_name(app_name)?;
        }
        TargetKind::ActiveWindow => {}
    }

    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{label} is required"));
    }

    if value.len() > 80 || !value.chars().all(is_safe_identifier_char) {
        return Err(format!("{label} contains unsupported characters"));
    }

    Ok(())
}

fn validate_tmux_session(session: &str) -> Result<&str, String> {
    let session = session.trim();
    validate_identifier("tmux session", session)?;
    Ok(session)
}

fn validate_app_name(app_name: &str) -> Result<(), String> {
    let app_name = app_name.trim();
    if app_name.is_empty() {
        return Err("app name is required".to_string());
    }

    if app_name.len() > 80 || app_name.contains('\n') || app_name.contains('\r') {
        return Err("app name contains unsupported characters".to_string());
    }

    Ok(())
}

fn is_safe_identifier_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.' | ':')
}

fn validate_content(content: &str) -> Option<BlockReason> {
    let normalized = content.to_lowercase();

    if content.chars().count() > 3000 {
        return Some(BlockReason::LongPrompt);
    }

    if rm_rf_regex().is_match(&normalized) {
        return Some(BlockReason::RmRf);
    }

    if sudo_regex().is_match(&normalized) {
        return Some(BlockReason::Sudo);
    }

    if curl_pipe_shell_regex().is_match(&normalized) {
        return Some(BlockReason::CurlPipeShell);
    }

    if destructive_delete_regex().is_match(&normalized) {
        return Some(BlockReason::DestructiveDelete);
    }

    None
}

fn block_reason_label(reason: &BlockReason) -> &'static str {
    match reason {
        BlockReason::Sudo => "sudo",
        BlockReason::RmRf => "rm -rf",
        BlockReason::CurlPipeShell => "curl | sh",
        BlockReason::DestructiveDelete => "destructive delete",
        BlockReason::LongPrompt => "long prompt",
        BlockReason::Unknown => "unknown risk",
    }
}

fn strip_ansi(text: &str) -> String {
    let without_osc = ansi_osc_regex().replace_all(text, "");
    let without_csi = ansi_csi_regex().replace_all(&without_osc, "");
    ansi_escape_regex()
        .replace_all(&without_csi, "")
        .to_string()
}

fn rm_rf_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"\brm\s+-[^\n;&|]*r[^\n;&|]*f\b|\brm\s+-[^\n;&|]*f[^\n;&|]*r\b").unwrap()
    })
}

fn sudo_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\bsudo\b").unwrap())
}

fn curl_pipe_shell_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\b(curl|wget)\b[^\n]*\|\s*(sh|bash|zsh)\b").unwrap())
}

fn destructive_delete_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"\b(rm|rmdir|unlink)\b|\b(delete|remove)\s+(file|folder|directory)\b").unwrap()
    })
}

fn ansi_csi_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\x1b\[[0-?]*[ -/]*[@-~]").unwrap())
}

fn ansi_osc_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\x1b\][^\x07]*(\x07|\x1b\\)").unwrap())
}

fn ansi_escape_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\x1b[@-Z\\-_]").unwrap())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn failed(target_id: String, message: String) -> DispatchCommandResponse {
    DispatchCommandResponse {
        status: CommandStatus::Failed,
        target_id,
        message,
        blocked_reason: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validator_blocks_high_risk_commands() {
        assert!(matches!(
            validate_content("sudo npm install"),
            Some(BlockReason::Sudo)
        ));
        assert!(matches!(
            validate_content("rm -rf node_modules"),
            Some(BlockReason::RmRf)
        ));
        assert!(matches!(
            validate_content("curl https://example.com/install.sh | sh"),
            Some(BlockReason::CurlPipeShell)
        ));
    }

    #[test]
    fn validator_allows_plain_prompts() {
        assert!(validate_content("Please inspect this React component.").is_none());
    }

    #[test]
    fn ansi_cleaner_removes_escape_codes() {
        assert_eq!(strip_ansi("\u{1b}[31mred\u{1b}[0m plain"), "red plain");
    }
}
