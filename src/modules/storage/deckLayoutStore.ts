import { defaultCommands } from "../../data/defaultCommands"

export type TileSize = "small" | "medium" | "wide"

export interface TileLayoutItem {
  commandId: string
  group: string
  order: number
  size: TileSize
}

const tileLayoutKey = "agentdeck.tileLayout.v1"
const validTileSizes = new Set<TileSize>(["small", "medium", "wide"])

export const defaultTileLayouts: TileLayoutItem[] = [
  { commandId: "inspect-project", group: "Main", order: 0, size: "small" },
  { commandId: "fix-error", group: "Main", order: 1, size: "small" },
  { commandId: "run-tests", group: "Main", order: 2, size: "small" },
  { commandId: "find-bug", group: "Main", order: 3, size: "small" },
  { commandId: "continue-last-task", group: "Flow", order: 10, size: "medium" },
  { commandId: "summarize-progress", group: "Flow", order: 11, size: "medium" },
  { commandId: "improve-ui", group: "Flow", order: 12, size: "medium" },
  { commandId: "generate-homepage", group: "Build", order: 20, size: "medium" },
  { commandId: "generate-dashboard", group: "Build", order: 21, size: "medium" },
  { commandId: "generate-component", group: "Build", order: 22, size: "medium" },
  { commandId: "terminal-git-status", group: "Terminal Skill", order: 30, size: "small" },
  { commandId: "terminal-git-diff", group: "Terminal Skill", order: 31, size: "small" },
  { commandId: "terminal-dev-server", group: "Terminal Skill", order: 32, size: "small" },
  { commandId: "terminal-build", group: "Terminal Skill", order: 33, size: "small" },
  { commandId: "terminal-lint", group: "Terminal Skill", order: 34, size: "small" },
  { commandId: "terminal-typecheck", group: "Terminal Skill", order: 35, size: "small" },
  { commandId: "terminal-tmux-ls", group: "Terminal Skill", order: 36, size: "small" },
  { commandId: "terminal-rg-search", group: "Terminal Skill", order: 37, size: "small" },
  { commandId: "check-code-structure", group: "Code", order: 40, size: "wide" },
  { commandId: "explain-terminal-error", group: "Code", order: 41, size: "wide" },
  { commandId: "install-deps", group: "Ship", order: 50, size: "small" },
  { commandId: "generate-readme", group: "Ship", order: 51, size: "small" },
  { commandId: "deployment-docs", group: "Ship", order: 52, size: "small" },
  { commandId: "git-suggestions", group: "Ship", order: 53, size: "small" },
]

export const defaultTileLayoutById = new Map(
  defaultTileLayouts.map((layout) => [layout.commandId, layout]),
)

function isTileLayoutItem(value: unknown): value is Partial<TileLayoutItem> {
  return Boolean(value && typeof value === "object" && "commandId" in value)
}

function normalizeTileLayoutItem(
  value: Partial<TileLayoutItem>,
  fallback: TileLayoutItem,
): TileLayoutItem {
  const size = validTileSizes.has(value.size as TileSize) ? (value.size as TileSize) : fallback.size
  const group = typeof value.group === "string" && value.group.trim() ? value.group.trim() : fallback.group
  const order = Number.isFinite(value.order) ? Number(value.order) : fallback.order

  return {
    commandId: fallback.commandId,
    group,
    order,
    size,
  }
}

export function normalizeTileLayouts(
  layouts: unknown,
  commandIds = defaultCommands.map((command) => command.id),
): TileLayoutItem[] {
  const savedLayouts = Array.isArray(layouts) ? layouts.filter(isTileLayoutItem) : []
  const savedById = new Map(savedLayouts.map((layout) => [String(layout.commandId), layout]))
  const defaultIds = new Set(defaultTileLayouts.map((layout) => layout.commandId))
  const commandIdSet = new Set(commandIds)

  const normalizedDefaults = defaultTileLayouts
    .filter((layout) => commandIdSet.has(layout.commandId))
    .map((layout) => normalizeTileLayoutItem(savedById.get(layout.commandId) ?? layout, layout))

  const customLayouts = commandIds
    .filter((commandId) => !defaultIds.has(commandId))
    .map((commandId, index) => {
      const fallback: TileLayoutItem = {
        commandId,
        group: "Custom",
        order: 1000 + index,
        size: "small",
      }
      return normalizeTileLayoutItem(savedById.get(commandId) ?? fallback, fallback)
    })

  return [...normalizedDefaults, ...customLayouts]
}

export function loadTileLayouts(commandIds?: string[]): TileLayoutItem[] {
  const raw = localStorage.getItem(tileLayoutKey)
  if (!raw) return normalizeTileLayouts(defaultTileLayouts, commandIds)
  try {
    return normalizeTileLayouts(JSON.parse(raw), commandIds)
  } catch {
    return normalizeTileLayouts(defaultTileLayouts, commandIds)
  }
}

export function saveTileLayouts(layouts: TileLayoutItem[]) {
  localStorage.setItem(tileLayoutKey, JSON.stringify(layouts))
}
