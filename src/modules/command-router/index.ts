import type { AgentTarget, CommandItem, DispatchResult, LocaleCode } from "./types"
import { sendToActiveWindow } from "../adapters/activeWindowAdapter"
import { sendToCursor } from "../adapters/cursorAdapter"
import { sendToTerminal } from "../adapters/terminalAdapter"
import { sendToTmux } from "../adapters/tmuxAdapter"
import { localizeText } from "../templates/templateEngine"

const riskyPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-rf\b/i, reason: "rm -rf" },
  { pattern: /\bsudo\b/i, reason: "sudo" },
  { pattern: /\bcurl\b.+\|\s*(sh|bash|zsh)\b/i, reason: "curl | sh" },
  { pattern: /\bgit\s+push\b/i, reason: "git push" },
  { pattern: /\b(chmod|chown)\s+-R\b/i, reason: "recursive permission change" },
  { pattern: /\b(del|delete|remove|unlink)\b/i, reason: "delete operation" },
]

export function getSafetyReason(content: string): string | null {
  if (content.length > 3000) return "prompt longer than 3000 characters"
  return riskyPatterns.find((item) => item.pattern.test(content))?.reason ?? null
}

export async function dispatchCommand(options: {
  command: CommandItem
  target: AgentTarget
  locale: LocaleCode
  content: string
  restoreClipboard: boolean
}): Promise<DispatchResult> {
  const { command, target, locale, content, restoreClipboard } = options
  const commandName = localizeText(command.name, locale)

  if (target.kind === "tmux_agent") {
    if (!target.tmuxSessionName?.trim()) {
      return { status: "error", message: `${target.name} has no tmux session configured.` }
    }
    return sendToTmux({
      session: target.tmuxSessionName,
      text: content,
      autoEnter: command.autoEnter,
      commandName,
    })
  }

  if (target.kind === "cursor") {
    if (!target.appName?.trim()) {
      return { status: "error", message: `${target.name} has no app name configured.` }
    }
    return sendToCursor({
      appName: target.appName,
      text: content,
      openChatShortcut: target.openChatShortcut ?? "cmd+l",
      sendShortcut: target.sendShortcut ?? "enter",
      autoEnter: command.autoEnter,
      restoreClipboard,
      commandName,
    })
  }

  if (target.kind === "terminal_app") {
    if (!target.appName?.trim()) {
      return { status: "error", message: `${target.name} has no app name configured.` }
    }
    return sendToTerminal({
      appName: target.appName,
      text: content,
      sendShortcut: target.sendShortcut ?? "enter",
      autoEnter: command.autoEnter,
      restoreClipboard,
      commandName,
    })
  }

  if (target.kind === "active_window") {
    return sendToActiveWindow({
      text: content,
      sendShortcut: target.sendShortcut ?? "enter",
      autoEnter: command.autoEnter,
      restoreClipboard,
      commandName,
    })
  }

  return {
    status: "error",
    message: `${target.name} is configured, but this adapter is not enabled yet.`,
  }
}
