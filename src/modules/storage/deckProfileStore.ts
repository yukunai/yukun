import type { AppConfig, CommandItem } from "../command-router/types"
import type { TileLayoutItem } from "./deckLayoutStore"
import { normalizeModelAccounts, type ModelAccount } from "./modelAccountStore"

export interface AgentDeckFullProfile {
  activeTargetId: string
  app: "AgentDeck" | "yukun"
  commands: CommandItem[]
  config: AppConfig
  deletedCommandIds: string[]
  exportedAt: string
  modelAccounts: ModelAccount[]
  tileLayouts: TileLayoutItem[]
  version: 3
}

interface LegacyAgentDeckProfile {
  app: "AgentDeck" | "yukun"
  commands: CommandItem[]
  config: AppConfig
  exportedAt?: string
  version: 1
}

type ParsedProfile = Partial<AgentDeckFullProfile> & Partial<LegacyAgentDeckProfile>

export function createDeckProfile(options: {
  activeTargetId: string
  commands: CommandItem[]
  config: AppConfig
  deletedCommandIds: string[]
  modelAccounts: ModelAccount[]
  tileLayouts: TileLayoutItem[]
}): AgentDeckFullProfile {
  return {
    activeTargetId: options.activeTargetId,
    app: "yukun",
    commands: options.commands,
    config: options.config,
    deletedCommandIds: options.deletedCommandIds,
    exportedAt: new Date().toISOString(),
    modelAccounts: options.modelAccounts.map((account) => ({ ...account, hasSecret: false })),
    tileLayouts: options.tileLayouts,
    version: 3,
  }
}

export function parseDeckProfile(text: string): AgentDeckFullProfile {
  const parsed = JSON.parse(text) as ParsedProfile

  if (parsed.app !== "AgentDeck" && parsed.app !== "yukun") {
    throw new Error("Not a yukun profile.")
  }

  if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) {
    throw new Error(`Unsupported yukun profile version: ${String(parsed.version)}.`)
  }

  if (!parsed.config) {
    throw new Error("Profile is missing app configuration.")
  }

  if (!Array.isArray(parsed.commands)) {
    throw new Error("Profile is missing commands.")
  }

  if (parsed.commands.length === 0) {
    throw new Error("Profile must include at least one command.")
  }

  if (parsed.version === 1) {
    return {
      activeTargetId: "claude-code",
      app: "yukun",
      commands: parsed.commands,
      config: parsed.config as AppConfig,
      deletedCommandIds: [],
      exportedAt: parsed.exportedAt ?? new Date().toISOString(),
      modelAccounts: [],
      tileLayouts: [],
      version: 3,
    }
  }

  return {
    activeTargetId: typeof parsed.activeTargetId === "string" ? parsed.activeTargetId : "claude-code",
    app: "yukun",
    commands: parsed.commands,
    config: parsed.config as AppConfig,
    deletedCommandIds: Array.isArray(parsed.deletedCommandIds)
      ? parsed.deletedCommandIds.filter((id): id is string => typeof id === "string")
      : [],
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    modelAccounts: normalizeModelAccounts(parsed.modelAccounts).map((account) => ({
      ...account,
      hasSecret: false,
    })),
    tileLayouts: Array.isArray(parsed.tileLayouts) ? parsed.tileLayouts : [],
    version: 3,
  }
}
