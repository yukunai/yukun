#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetKind {
    TmuxAgent,
    Cursor,
    ActiveWindow,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SendMode {
    TmuxSendKeys,
    Paste,
    Type,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandStatus {
    Sent,
    Blocked,
    Failed,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockReason {
    Sudo,
    RmRf,
    CurlPipeShell,
    DestructiveDelete,
    LongPrompt,
    Unknown,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetConfig {
    pub id: String,
    pub label: String,
    pub kind: TargetKind,
    pub tmux_session: Option<String>,
    pub app_name: Option<String>,
    pub open_chat_shortcut: Option<String>,
    pub paste_shortcut: Option<String>,
    pub submit_shortcut: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchCommandRequest {
    pub target: TargetConfig,
    pub content: String,
    pub auto_enter: bool,
    pub send_mode: Option<SendMode>,
    pub force_execute: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchCommandResponse {
    pub status: CommandStatus,
    pub target_id: String,
    pub message: String,
    pub blocked_reason: Option<BlockReason>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePaneRequest {
    pub session: String,
    pub lines: Option<u16>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePaneResponse {
    pub session: String,
    pub text: String,
    pub captured_at: u64,
}
