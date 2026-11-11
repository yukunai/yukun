import type { AgentKind, TargetConfig } from "../contracts/agentDeck"

export type ModelAccountProvider = "claude_code" | "codex" | "cursor"

export interface ModelAccount {
  appName?: string
  authCommand?: string
  authStatusCommand?: string
  createdAt: number
  hasSecret?: boolean
  id: string
  launchCommand?: string
  name: string
  openChatShortcut?: string
  pasteShortcut?: string
  provider: ModelAccountProvider
  submitShortcut?: string
  tmuxSession?: string
  updatedAt: number
  username?: string
}

const modelAccountsKey = "agentdeck.modelAccounts.v1"
const activeModelAccountKey = "agentdeck.activeModelAccount.v1"

const providerLabels: Record<ModelAccountProvider, string> = {
  claude_code: "Claude Code",
  codex: "Codex CLI",
  cursor: "Cursor",
}

function defaultAuthCommand(provider: ModelAccountProvider) {
  if (provider === "claude_code") return "claude auth login"
  if (provider === "codex") return "codex login"
  return ""
}

function defaultAuthStatusCommand(provider: ModelAccountProvider) {
  if (provider === "claude_code") return "claude auth status"
  if (provider === "codex") return "codex login status"
  return ""
}

function normalizeAuthCommand(provider: ModelAccountProvider, command: string | undefined) {
  const trimmed = command?.trim()
  if (provider === "claude_code" && trimmed === "claude auth") return defaultAuthCommand(provider)
  return trimmed || defaultAuthCommand(provider) || undefined
}

function now() {
  return Date.now()
}

export function defaultModelAccounts(): ModelAccount[] {
  const createdAt = now()

  return [
    {
      createdAt,
      id: "claude-code",
      authCommand: defaultAuthCommand("claude_code"),
      authStatusCommand: defaultAuthStatusCommand("claude_code"),
      launchCommand: "claude",
      name: "Claude Code",
      provider: "claude_code",
      tmuxSession: "cc",
      updatedAt: createdAt,
    },
    {
      createdAt,
      id: "codex-cli",
      authCommand: defaultAuthCommand("codex"),
      authStatusCommand: defaultAuthStatusCommand("codex"),
      launchCommand: "codex",
      name: "Codex CLI",
      provider: "codex",
      tmuxSession: "codex",
      updatedAt: createdAt,
    },
    {
      appName: "Cursor",
      createdAt,
      id: "cursor",
      name: "Cursor",
      openChatShortcut: "cmd+l",
      pasteShortcut: "cmd+v",
      provider: "cursor",
      submitShortcut: "enter",
      updatedAt: createdAt,
    },
  ]
}

const utilityTargetIds = new Set(["active-window"])

function isModelAccountProvider(value: unknown): value is ModelAccountProvider {
  return value === "claude_code" || value === "codex" || value === "cursor"
}

export function isModelAccount(value: unknown): value is ModelAccount {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "provider" in value &&
      isModelAccountProvider(value.provider),
  )
}

export function normalizeModelAccounts(value: unknown): ModelAccount[] {
  if (!Array.isArray(value)) return []

  return value.filter(isModelAccount).map((account) => ({
    ...account,
    appName: account.appName?.trim() || undefined,
    authCommand: normalizeAuthCommand(account.provider, account.authCommand),
    authStatusCommand:
      account.authStatusCommand?.trim() || defaultAuthStatusCommand(account.provider) || undefined,
    hasSecret: Boolean(account.hasSecret),
    launchCommand: account.launchCommand?.trim() || undefined,
    name: account.name?.trim() || providerLabels[account.provider],
    openChatShortcut: account.openChatShortcut?.trim() || undefined,
    pasteShortcut: account.pasteShortcut?.trim() || undefined,
    submitShortcut: account.submitShortcut?.trim() || undefined,
    tmuxSession: account.tmuxSession?.trim() || undefined,
    username: account.username?.trim() || undefined,
  }))
}

export function loadModelAccounts(): ModelAccount[] {
  const raw = localStorage.getItem(modelAccountsKey)
  if (!raw) {
    const accounts = defaultModelAccounts()
    saveModelAccounts(accounts)
    return accounts
  }

  try {
    const parsed = JSON.parse(raw)
    const accounts = normalizeModelAccounts(parsed)
    return accounts.length ? accounts : defaultModelAccounts()
  } catch {
    return defaultModelAccounts()
  }
}

export function saveModelAccounts(accounts: ModelAccount[]) {
  localStorage.setItem(modelAccountsKey, JSON.stringify(accounts))
}

export function loadActiveModelAccountId(accounts = loadModelAccounts()) {
  const savedId = localStorage.getItem(activeModelAccountKey)
  return accounts.some((account) => account.id === savedId) || utilityTargetIds.has(savedId ?? "")
    ? (savedId as string)
    : (accounts[0]?.id ?? "claude-code")
}

export function saveActiveModelAccountId(accountId: string) {
  localStorage.setItem(activeModelAccountKey, accountId)
}

export function providerLabel(provider: ModelAccountProvider) {
  return providerLabels[provider]
}

function targetLabelForAccount(provider: ModelAccountProvider, accountName: string) {
  const label = providerLabels[provider]
  const name = accountName.trim()
  const duplicateLabel = `${label} · ${label}`

  if (!name || name === label || name === duplicateLabel) return label
  if (name.startsWith(`${label} · `)) return name

  return `${label} · ${name}`
}

export function createModelAccount(options: {
  appName?: string
  authCommand?: string
  authStatusCommand?: string
  hasSecret?: boolean
  launchCommand?: string
  name: string
  provider: ModelAccountProvider
  tmuxSession?: string
  username?: string
}): ModelAccount {
  const createdAt = now()
  const suffix = createdAt.toString(36)
  const label = options.name.trim() || providerLabels[options.provider]

  if (options.provider === "cursor") {
    return {
      appName: options.appName?.trim() || "Cursor",
      createdAt,
      id: `cursor-${suffix}`,
      name: label,
      hasSecret: options.hasSecret,
      openChatShortcut: "cmd+l",
      pasteShortcut: "cmd+v",
      provider: "cursor",
      submitShortcut: "enter",
      updatedAt: createdAt,
      username: options.username?.trim() || undefined,
    }
  }

  const launchCommand = options.launchCommand?.trim() || (options.provider === "codex" ? "codex" : "claude")

  return {
    authCommand: normalizeAuthCommand(options.provider, options.authCommand),
    authStatusCommand:
      options.authStatusCommand?.trim() || defaultAuthStatusCommand(options.provider),
    createdAt,
    id: `${options.provider}-${suffix}`,
    hasSecret: options.hasSecret,
    launchCommand,
    name: label,
    provider: options.provider,
    tmuxSession: options.tmuxSession?.trim() || (options.provider === "codex" ? "codex" : "cc"),
    updatedAt: createdAt,
    username: options.username?.trim() || undefined,
  }
}

export function modelAccountToTarget(account: ModelAccount): TargetConfig {
  if (account.provider === "cursor") {
    return {
      appName: account.appName ?? "Cursor",
      id: account.id,
      label: targetLabelForAccount("cursor", account.name),
      kind: "cursor",
      agentKind: "cursor" as AgentKind,
      openChatShortcut: account.openChatShortcut ?? "cmd+l",
      pasteShortcut: account.pasteShortcut ?? "cmd+v",
      submitShortcut: account.submitShortcut ?? "enter",
    }
  }

  return {
    id: account.id,
    label: targetLabelForAccount(account.provider, account.name),
    kind: "tmux_agent",
    agentKind: account.provider,
    launchCommand: account.launchCommand,
    monitorLines: 10,
    tmuxSession: account.tmuxSession,
  }
}
