import { invoke } from "@tauri-apps/api/core"
import type { AgentTarget, DispatchResult } from "../command-router/types"

const isTauri = "__TAURI_INTERNALS__" in window

export type TmuxAgentState = "agent" | "missing" | "shell" | "unknown"

export interface TmuxAgentStatus {
  session: string
  exists: boolean
  status: TmuxAgentState
  agentRunning: boolean
  currentCommand: string
  detail: string
  lastOutput: string
}

export async function sendToTmux(options: {
  session: string
  text: string
  autoEnter: boolean
  commandName: string
}): Promise<DispatchResult> {
  if (!isTauri) {
    return {
      status: "success",
      message: `Preview mode: would send "${options.commandName}" to tmux:${options.session}.`,
    }
  }

  try {
    const message = await invoke<string>("send_to_tmux", {
      session: options.session,
      text: options.text,
      autoEnter: options.autoEnter,
    })
    return { status: "success", message }
  } catch (error) {
    return { status: "error", message: String(error) }
  }
}

export async function captureTmuxPane(options: {
  session: string
  lineCount?: number
}): Promise<string | null> {
  if (!isTauri) return null

  try {
    return await invoke<string>("capture_tmux_pane", {
      session: options.session,
      lineCount: options.lineCount ?? 240,
    })
  } catch {
    return null
  }
}

export async function getTmuxAgentStatus(options: {
  session: string
  agentKind: string
}): Promise<TmuxAgentStatus> {
  if (!isTauri) {
    return {
      session: options.session,
      exists: false,
      status: "unknown",
      agentRunning: false,
      currentCommand: "",
      detail: "Desktop session checks only run in Tauri.",
      lastOutput: "",
    }
  }

  try {
    return await invoke<TmuxAgentStatus>("get_tmux_agent_status", {
      session: options.session,
      agentKind: options.agentKind,
    })
  } catch (error) {
    return {
      session: options.session,
      exists: false,
      status: "unknown",
      agentRunning: false,
      currentCommand: "",
      detail: String(error),
      lastOutput: "",
    }
  }
}

export async function startTmuxAgent(options: {
  session: string
  launchCommand: string
  agentKind: string
}): Promise<TmuxAgentStatus> {
  if (!isTauri) {
    return {
      session: options.session,
      exists: false,
      status: "unknown",
      agentRunning: false,
      currentCommand: "",
      detail: `Preview mode: would start ${options.launchCommand} in tmux:${options.session}.`,
      lastOutput: "",
    }
  }

  return invoke<TmuxAgentStatus>("start_tmux_agent", {
    session: options.session,
    launchCommand: options.launchCommand,
    agentKind: options.agentKind,
  })
}

export async function stopTmuxAgent(options: {
  session: string
  agentKind: string
}): Promise<TmuxAgentStatus> {
  if (!isTauri) {
    return {
      session: options.session,
      exists: false,
      status: "unknown",
      agentRunning: false,
      currentCommand: "",
      detail: `Preview mode: would send Ctrl-C to tmux:${options.session}.`,
      lastOutput: "",
    }
  }

  return invoke<TmuxAgentStatus>("stop_tmux_agent", {
    session: options.session,
    agentKind: options.agentKind,
  })
}

export async function runTmuxAccountCommand(options: {
  session: string
  command: string
  agentKind: string
}): Promise<TmuxAgentStatus> {
  if (!isTauri) {
    return {
      session: options.session,
      exists: false,
      status: "unknown",
      agentRunning: false,
      currentCommand: "",
      detail: `Preview mode: would run "${options.command}" in tmux:${options.session}.`,
      lastOutput: "",
    }
  }

  return invoke<TmuxAgentStatus>("run_tmux_account_command", {
    session: options.session,
    command: options.command,
    agentKind: options.agentKind,
  })
}

export function getAgentKindForTarget(target: Pick<AgentTarget, "id" | "name">) {
  const probe = `${target.id} ${target.name}`.toLowerCase()
  if (probe.includes("claude")) return "claude_code"
  if (probe.includes("codex")) return "codex"
  return "agent"
}

export function getAgentLaunchCommand(target: Pick<AgentTarget, "id" | "name">) {
  const agentKind = getAgentKindForTarget(target)
  if (agentKind === "codex") return "codex"
  if (agentKind === "claude_code") return "claude"
  return ""
}
