import { defaultCommands } from "../../data/defaultCommands"
import type { CommandItem } from "../command-router/types"

const commandsKey = "agentdeck.commands.v1"
const deletedCommandsKey = "agentdeck.deletedCommands.v1"

export function loadDeletedCommandIds() {
  const raw = localStorage.getItem(deletedCommandsKey)
  if (!raw) return new Set<string>()
  try {
    const ids = JSON.parse(raw)
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [])
  } catch {
    return new Set<string>()
  }
}

export function saveDeletedCommandIds(ids: Set<string>) {
  localStorage.setItem(deletedCommandsKey, JSON.stringify([...ids]))
}

export function getDeletedCommandIdsFor(commands: CommandItem[]) {
  const commandIds = new Set(commands.map((command) => command.id))
  return new Set(
    defaultCommands
      .filter((command) => !commandIds.has(command.id))
      .map((command) => command.id),
  )
}

export function normalizeCommands(commands: unknown): CommandItem[] {
  const deletedCommandIds = loadDeletedCommandIds()
  const activeDefaultCommands = defaultCommands.filter((command) => !deletedCommandIds.has(command.id))
  if (!Array.isArray(commands) || commands.length === 0) return activeDefaultCommands
  const savedCommands = commands as CommandItem[]
  const savedById = new Map(savedCommands.map((command) => [command.id, command]))
  const merged = activeDefaultCommands.map((command) => savedById.get(command.id) ?? command)
  const customCommands = savedCommands.filter(
    (command) => !defaultCommands.some((defaultCommand) => defaultCommand.id === command.id),
  )

  return [...merged, ...customCommands]
}

export function loadCommands(): CommandItem[] {
  const raw = localStorage.getItem(commandsKey)
  if (!raw) return normalizeCommands(defaultCommands)
  try {
    return normalizeCommands(JSON.parse(raw))
  } catch {
    return normalizeCommands(defaultCommands)
  }
}

export function saveCommands(commands: CommandItem[]) {
  saveDeletedCommandIds(getDeletedCommandIdsFor(commands))
  localStorage.setItem(commandsKey, JSON.stringify(commands))
}
