import { invoke } from "@tauri-apps/api/core"
import type { DispatchResult } from "../command-router/types"

const isTauri = "__TAURI_INTERNALS__" in window

export async function sendToTerminal(options: {
  appName: string
  text: string
  sendShortcut: string
  autoEnter: boolean
  restoreClipboard: boolean
  commandName: string
}): Promise<DispatchResult> {
  if (!isTauri) {
    return {
      status: "success",
      message: `Preview mode: would paste "${options.commandName}" into ${options.appName}.`,
    }
  }

  try {
    const message = await invoke<string>("send_to_terminal_app", {
      appName: options.appName,
      text: options.text,
      sendShortcut: options.sendShortcut,
      autoEnter: options.autoEnter,
      restoreClipboard: options.restoreClipboard,
    })
    return { status: "success", message }
  } catch (error) {
    return { status: "error", message: String(error) }
  }
}
