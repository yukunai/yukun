export type TargetKind = "tmux_agent" | "cursor" | "active_window"

export type AgentKind = "claude_code" | "codex" | "cursor" | "active_window" | "agent"

export type SendMode = "tmux_send_keys" | "paste" | "type"

export type CommandStatus = "sent" | "blocked" | "failed"

export type StartupCheckStatus = "ok" | "warning" | "missing"

export type AgentRuntimeState = "agent" | "missing" | "shell" | "unknown"

export type RouterStageKind = "react_ui" | "rust_command" | "router" | "target"

export type BlockReason =
  | "sudo"
  | "rm_rf"
  | "curl_pipe_shell"
  | "destructive_delete"
  | "long_prompt"
  | "unknown"

export interface PromptCommand {
  id: string
  title: string
  description?: string
  group: string
  targetId: string
  targetKind: TargetKind
  sendMode: SendMode
  content: string
  autoEnter: boolean
  requiresConfirmation?: boolean
}

export interface TargetConfig {
  id: string
  label: string
  kind: TargetKind
  agentKind?: AgentKind
  tmuxSession?: string
  launchCommand?: string
  monitorLines?: number
  appName?: string
  openChatShortcut?: string
  pasteShortcut?: string
  submitShortcut?: string
}

export interface RouterStage {
  id: RouterStageKind
  label: string
  detail: string
}

export interface TargetCapability {
  id: string
  label: string
  kind: TargetKind
  executor: "tmux" | "applescript"
  description: string
}

export interface StartupCheckItem {
  id: string
  status: StartupCheckStatus
  detail: string
  required: boolean
}

export interface StartupReadiness {
  allReady: boolean
  ok: number
  total: number
  failures: StartupCheckItem[]
}

export interface AgentSessionSnapshot {
  targetId: string
  targetLabel: string
  kind: "tmux_agent"
  session: string
  agentKind: AgentKind
  launchCommand: string
  exists: boolean
  status: AgentRuntimeState
  agentRunning: boolean
  currentCommand: string
  detail: string
  lastOutput: string
  updatedAt: number
}

export interface AgentControlActionRequest {
  target: TargetConfig
  action: "refresh" | "start" | "stop"
}

export interface DispatchCommandRequest {
  target: TargetConfig
  content: string
  autoEnter: boolean
  sendMode?: SendMode
  forceExecute?: boolean
}

export interface DispatchCommandResponse {
  status: CommandStatus
  targetId: string
  message: string
  blockedReason?: BlockReason
}

export interface CapturePaneRequest {
  session: string
  lines?: number
}

export interface CapturePaneResponse {
  session: string
  text: string
  capturedAt: number
}

export interface DeckLogItem {
  id: string
  targetId: string
  commandId?: string
  status: CommandStatus
  message: string
  createdAt: number
}
