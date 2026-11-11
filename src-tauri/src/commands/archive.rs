use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveRecord {
    id: String,
    parent_id: Option<String>,
    kind: String,
    created_at: u64,
    iso_time: String,
    day: String,
    locale: String,
    command_id: String,
    command_name: String,
    target_id: String,
    target_name: String,
    target_kind: String,
    status: String,
    message: String,
    content: String,
    skill_group: Option<String>,
}

#[tauri::command]
pub fn archive_interaction(record: ArchiveRecord) -> Result<String, String> {
    let archive_dir = archive_dir()?;
    fs::create_dir_all(&archive_dir)
        .map_err(|error| format!("failed to create archive directory: {error}"))?;

    let day = safe_day(&record.day);
    append_jsonl(&archive_dir.join(format!("{day}.jsonl")), &record)?;
    append_markdown(&archive_dir.join(format!("{day}.md")), &record)?;

    Ok(archive_dir.to_string_lossy().to_string())
}

fn archive_dir() -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(PathBuf::from(home).join(".agentdeck").join("archive"))
}

fn safe_day(day: &str) -> String {
    let cleaned: String = day
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect();

    if cleaned.is_empty() {
        "unknown".to_string()
    } else {
        cleaned
    }
}

fn append_jsonl(path: &PathBuf, record: &ArchiveRecord) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open JSONL archive: {error}"))?;
    let line = serde_json::to_string(record)
        .map_err(|error| format!("failed to serialize archive record: {error}"))?;
    writeln!(file, "{line}").map_err(|error| format!("failed to write JSONL archive: {error}"))
}

fn append_markdown(path: &PathBuf, record: &ArchiveRecord) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open Markdown archive: {error}"))?;
    let skill_group = record.skill_group.as_deref().unwrap_or("-");
    let parent_id = record.parent_id.as_deref().unwrap_or("-");
    let fence = if record.content.contains("```") {
        "~~~"
    } else {
        "```"
    };

    writeln!(
        file,
        "\n## {}\n\n- id: {}\n- parent: {}\n- kind: {}\n- command: {}\n- target: {} ({})\n- status: {}\n- message: {}\n- skill: {}\n\n{}text\n{}\n{}\n",
        record.iso_time,
        record.id,
        parent_id,
        record.kind,
        record.command_name,
        record.target_name,
        record.target_kind,
        record.status,
        record.message,
        skill_group,
        fence,
        record.content,
        fence,
    )
    .map_err(|error| format!("failed to write Markdown archive: {error}"))
}
