use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Command, Stdio};

const SERVICE_PREFIX: &str = "AgentDeck.modelAccount";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModelAccountSecretRequest {
    pub account_id: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelAccountSecretResponse {
    pub account_id: String,
    pub has_secret: bool,
    pub username: String,
}

#[tauri::command]
pub fn save_model_account_secret(
    request: SaveModelAccountSecretRequest,
) -> Result<ModelAccountSecretResponse, String> {
    let account_id = validate_account_id(&request.account_id)?;
    let username = validate_username(&request.username)?;
    let username = if username.is_empty() {
        account_id
    } else {
        username
    };
    let password = validate_password(&request.password)?;
    let service = service_name(account_id);

    let output = Command::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-a",
            username,
            "-s",
            service.as_str(),
            "-w",
            password,
            "-U",
        ])
        .output()
        .map_err(|error| format!("failed to access macOS Keychain: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(ModelAccountSecretResponse {
        account_id: account_id.to_string(),
        has_secret: true,
        username: username.to_string(),
    })
}

#[tauri::command]
pub fn copy_model_account_secret(account_id: String) -> Result<String, String> {
    let account_id = validate_account_id(&account_id)?;
    let password = read_secret(account_id)?;
    write_clipboard(&password)?;
    Ok("password copied from Keychain".to_string())
}

#[tauri::command]
pub fn delete_model_account_secret(account_id: String) -> Result<String, String> {
    let account_id = validate_account_id(&account_id)?;
    let service = service_name(account_id);
    let output = Command::new("/usr/bin/security")
        .args(["delete-generic-password", "-s", service.as_str()])
        .output()
        .map_err(|error| format!("failed to access macOS Keychain: {error}"))?;

    if output.status.success() {
        Ok("secret deleted".to_string())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if message.contains("could not be found") {
            Ok("secret was already missing".to_string())
        } else {
            Err(message)
        }
    }
}

fn read_secret(account_id: &str) -> Result<String, String> {
    let service = service_name(account_id);
    let output = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", service.as_str(), "-w"])
        .output()
        .map_err(|error| format!("failed to read macOS Keychain: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout)
            .trim_end_matches('\n')
            .to_string())
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

fn service_name(account_id: &str) -> String {
    format!("{SERVICE_PREFIX}.{account_id}")
}

fn validate_account_id(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("account id is required".to_string());
    }

    if value.len() > 96
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
    {
        return Err("account id contains unsupported characters".to_string());
    }

    Ok(value)
}

fn validate_username(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.len() > 256 || value.contains('\n') || value.contains('\r') {
        return Err("username contains unsupported characters".to_string());
    }

    Ok(value)
}

fn validate_password(value: &str) -> Result<&str, String> {
    if value.is_empty() {
        return Err("password is required".to_string());
    }

    if value.len() > 20_000 || value.contains('\0') {
        return Err("password contains unsupported characters".to_string());
    }

    Ok(value)
}
