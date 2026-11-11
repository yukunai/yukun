import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { DispatchResult } from "../command-router/types"

const isTauri = "__TAURI_INTERNALS__" in window

export async function sendToActiveWindow(options: {
  text: string
  sendShortcut: string
  autoEnter: boolean
  restoreClipboard: boolean
  commandName: string
}): Promise<DispatchResult> {
  if (!isTauri) {
    return {
      status: "success",
      message: `Preview mode: would paste "${options.commandName}" into the active window.`,
    }
  }

  try {
    await getCurrentWindow().hide()
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    const message = await invoke<string>("send_to_active_window", {
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

export async function getFrontmostAppName(): Promise<string> {
  if (!isTauri) return "Browser Preview"

  try {
    return await invoke<string>("get_frontmost_app_name")
  } catch {
    return "Unknown App"
  }
}
