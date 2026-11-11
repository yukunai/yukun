import { defaultConfig } from "../../data/defaultProfiles"
import type { AppConfig } from "../command-router/types"

const configKey = "agentdeck.config.v1"
const legacyClaudeCodeName = ["C", "C"].join("")

export function normalizeConfig(config: Partial<AppConfig>): AppConfig {
  const targets = (config.targets?.length ? config.targets : defaultConfig.targets).map((target) =>
    target.id === "claude-code" && target.name === legacyClaudeCodeName
      ? { ...target, name: "Claude Code" }
      : target,
  )
  const activeTargetExists = targets.some((target) => target.id === config.activeTargetId)

  return {
    ...defaultConfig,
    ...config,
    activeTargetId: activeTargetExists
      ? (config.activeTargetId as string)
      : (targets[0]?.id ?? defaultConfig.activeTargetId),
    targets,
  }
}

export function loadConfig(): AppConfig {
  const raw = localStorage.getItem(configKey)
  if (!raw) return defaultConfig
  try {
    return normalizeConfig(JSON.parse(raw) as Partial<AppConfig>)
  } catch {
    return defaultConfig
  }
}

export function saveConfig(config: AppConfig) {
  localStorage.setItem(configKey, JSON.stringify(config))
}
