import { LogicalSize } from "@tauri-apps/api/dpi"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { register, unregister } from "@tauri-apps/plugin-global-shortcut"

export const DEFAULT_AGENTDECK_SHORTCUT = "CommandOrControl+Shift+Space"

export const isTauriRuntime = "__TAURI_INTERNALS__" in window

export function formatShortcutLabel(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => {
      const normalized = part.trim().toLowerCase()
      if (["commandorcontrol", "cmdorctrl", "cmd", "command", "meta"].includes(normalized)) return "⌘"
      if (["shift"].includes(normalized)) return "⇧"
      if (["option", "alt"].includes(normalized)) return "⌥"
      if (["control", "ctrl"].includes(normalized)) return "⌃"
      if (normalized === "space") return "Space"
      if (normalized === "enter" || normalized === "return") return "Enter"
      return part.trim()
    })
    .join("")
}

export async function hideOverlayWindow() {
  if (!isTauriRuntime) return
  await getCurrentWindow().hide()
}

export async function showOverlayWindow() {
  if (!isTauriRuntime) return
  const window = getCurrentWindow()
  await window.unminimize()
  await window.show()
  await window.setFocus()
}

export async function toggleOverlayWindow() {
  if (!isTauriRuntime) return
  const window = getCurrentWindow()
  const visible = await window.isVisible()

  if (visible) {
    await window.hide()
    return
  }

  await showOverlayWindow()
}

export async function applyOverlayMode(compactMode: boolean) {
  if (!isTauriRuntime) return
  const window = getCurrentWindow()
  await window.setMinSize(new LogicalSize(84, 280))
  await window.setSize(compactMode ? new LogicalSize(92, 420) : new LogicalSize(520, 760))
}

export async function registerOverlayShortcut(shortcut: string, onError: (message: string) => void) {
  if (!isTauriRuntime) return () => undefined
  const normalizedShortcut = shortcut.trim() || DEFAULT_AGENTDECK_SHORTCUT

  try {
    await unregister(normalizedShortcut).catch(() => undefined)
    await register(normalizedShortcut, async (event) => {
      if (event.state === "Pressed") {
        await toggleOverlayWindow()
      }
    })
    return () => {
      unregister(normalizedShortcut).catch(() => undefined)
    }
  } catch (error) {
    onError(String(error))
    return () => undefined
  }
}
