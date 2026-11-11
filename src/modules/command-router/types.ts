export type LocaleCode = "zh-CN" | "en" | "ja" | "ko" | "de" | "fr"

export type LocalizedText = Partial<Record<LocaleCode, string>>

export type TargetKind = "tmux_agent" | "cursor" | "terminal_app" | "active_window"

export type SendMode = "paste" | "type" | "tmux_send_keys"

export interface TemplateVariable {
  key: string
  label: LocalizedText
  defaultValue?: string
  required?: boolean
}

export interface CommandItem {
  id: string
  name: LocalizedText
  description: LocalizedText
  category: string
  skillGroup?: string
  skillPackId?: string
  icon?: string
  defaultTargetId: string
  targetLocked?: boolean
  sendMode: SendMode
  content: LocalizedText
  autoEnter: boolean
  confirmBeforeSend: boolean
  compactPinned?: boolean
  variables?: TemplateVariable[]
  createdAt: number
  updatedAt: number
}

export interface AgentTarget {
  id: string
  name: string
  kind: TargetKind
  tmuxSessionName?: string
  appName?: string
  openChatShortcut?: string
  sendShortcut?: string
  defaultAutoEnter: boolean
}

export interface AppConfig {
  locale: LocaleCode
  activeTargetId: string
  restoreClipboard: boolean
  globalShortcut: string
  compactMode: boolean
  targets: AgentTarget[]
}

export type LogStatus = "success" | "error" | "blocked"

export interface RunLog {
  id: string
  commandName: string
  targetName: string
  status: LogStatus
  message: string
  content: string
  createdAt: number
}

export interface DispatchResult {
  status: LogStatus
  message: string
}

export interface ArchiveRecord {
  id: string
  parentId?: string
  kind: "prompt" | "tmux_snapshot"
  createdAt: number
  isoTime: string
  day: string
  locale: LocaleCode
  commandId: string
  commandName: string
  targetId: string
  targetName: string
  targetKind: TargetKind
  status: LogStatus
  message: string
  content: string
  skillGroup?: string
}
