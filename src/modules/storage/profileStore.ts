import type { AppConfig, CommandItem } from "../command-router/types"

export interface AgentDeckProfile {
  app: "AgentDeck" | "yukun"
  version: 1
  exportedAt: string
  config: AppConfig
  commands: CommandItem[]
}

export function createProfile(config: AppConfig, commands: CommandItem[]): AgentDeckProfile {
  return {
    app: "yukun",
    version: 1,
    exportedAt: new Date().toISOString(),
    config,
    commands,
  }
}

export function parseProfile(text: string): AgentDeckProfile {
  const parsed = JSON.parse(text) as Partial<AgentDeckProfile>

  if (parsed.app !== "AgentDeck" && parsed.app !== "yukun") {
    throw new Error("Not a yukun profile.")
  }

  if (parsed.version !== 1) {
    throw new Error(`Unsupported yukun profile version: ${String(parsed.version)}.`)
  }

  if (!parsed.config || !Array.isArray(parsed.config.targets)) {
    throw new Error("Profile is missing target configuration.")
  }

  if (!Array.isArray(parsed.commands)) {
    throw new Error("Profile is missing commands.")
  }

  if (parsed.config.targets.length === 0) {
    throw new Error("Profile must include at least one target.")
  }

  if (parsed.commands.length === 0) {
    throw new Error("Profile must include at least one command.")
  }

  return parsed as AgentDeckProfile
}
