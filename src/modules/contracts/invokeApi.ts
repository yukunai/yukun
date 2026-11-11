import { invoke } from "@tauri-apps/api/core"
import type {
  CapturePaneRequest,
  CapturePaneResponse,
  DispatchCommandRequest,
  DispatchCommandResponse,
} from "./agentDeck"

export interface SaveModelAccountSecretRequest {
  accountId: string
  username: string
  password: string
}

export interface ModelAccountSecretResponse {
  accountId: string
  hasSecret: boolean
  username: string
}

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window
}

export async function dispatchCommand(
  request: DispatchCommandRequest,
): Promise<DispatchCommandResponse> {
  if (!hasTauriRuntime()) {
    return {
      status: "sent",
      targetId: request.target.id,
      message: `Preview mode: ${request.target.label}`,
    }
  }

  return invoke<DispatchCommandResponse>("dispatch_command", { request })
}

export async function capturePane(request: CapturePaneRequest): Promise<CapturePaneResponse> {
  if (!hasTauriRuntime()) {
    return {
      session: request.session,
      text: "Preview monitor\nStart yukun in Tauri to capture tmux output.",
      capturedAt: Date.now(),
    }
  }

  return invoke<CapturePaneResponse>("capture_pane", { request })
}

export async function saveModelAccountSecret(
  request: SaveModelAccountSecretRequest,
): Promise<ModelAccountSecretResponse> {
  if (!hasTauriRuntime()) {
    return {
      accountId: request.accountId,
      hasSecret: Boolean(request.password),
      username: request.username,
    }
  }

  return invoke<ModelAccountSecretResponse>("save_model_account_secret", { request })
}

export async function copyModelAccountSecret(accountId: string): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Preview mode: password copy is only available in Tauri."
  }

  return invoke<string>("copy_model_account_secret", { accountId })
}

export async function deleteModelAccountSecret(accountId: string): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Preview mode: Keychain delete is only available in Tauri."
  }

  return invoke<string>("delete_model_account_secret", { accountId })
}

export async function restartAgentDeck(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Preview mode: restart is only available in Tauri."
  }

  return invoke<string>("restart_agentdeck")
}

export async function quitAgentDeck(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Preview mode: quit is only available in Tauri."
  }

  return invoke<string>("quit_agentdeck")
}

export async function showAgentDeckWindow(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Preview mode: window focus is only available in Tauri."
  }

  return invoke<string>("show_agentdeck_window")
}

/*
Step 1 API pseudocode:

UI click
  -> build DispatchCommandRequest
  -> invoke("dispatch_command", { request })
  -> if response.status === "blocked": show confirmation dialog
  -> user confirms
  -> invoke("dispatch_command", { request: { ...request, forceExecute: true } })

Monitor poll
  -> when active target.kind === "tmux_agent"
  -> every 1500ms invoke("capture_pane", { request: { session, lines: 15 } })
  -> render CapturePaneResponse.text in a read-only log viewport
*/
