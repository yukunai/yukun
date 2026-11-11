import type { CommandItem } from "../command-router/types"
import type { TileLayoutItem } from "./deckLayoutStore"

export interface AgentDeckSkillPack {
  app: "AgentDeck" | "yukun"
  commands: CommandItem[]
  exportedAt: string
  group: string
  kind: "skill_pack"
  tileLayouts: TileLayoutItem[]
  version: 1
}

type ParsedSkillPack = Partial<AgentDeckSkillPack>

export function createSkillPackExport(options: {
  commands: CommandItem[]
  group: string
  tileLayouts: TileLayoutItem[]
}): AgentDeckSkillPack {
  return {
    app: "yukun",
    commands: options.commands,
    exportedAt: new Date().toISOString(),
    group: options.group,
    kind: "skill_pack",
    tileLayouts: options.tileLayouts,
    version: 1,
  }
}

export function parseSkillPack(text: string): AgentDeckSkillPack {
  const parsed = JSON.parse(text) as ParsedSkillPack

  if ((parsed.app !== "AgentDeck" && parsed.app !== "yukun") || parsed.kind !== "skill_pack") {
    throw new Error("Not a yukun Skill pack.")
  }

  if (parsed.version !== 1) {
    throw new Error(`Unsupported yukun Skill pack version: ${String(parsed.version)}.`)
  }

  if (!parsed.group || typeof parsed.group !== "string") {
    throw new Error("Skill pack is missing its group name.")
  }

  if (!Array.isArray(parsed.commands) || parsed.commands.length === 0) {
    throw new Error("Skill pack must include at least one command.")
  }

  return {
    app: "yukun",
    commands: parsed.commands,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    group: parsed.group,
    kind: "skill_pack",
    tileLayouts: Array.isArray(parsed.tileLayouts) ? parsed.tileLayouts : [],
    version: 1,
  }
}
