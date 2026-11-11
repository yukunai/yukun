import { invoke } from "@tauri-apps/api/core"
import type {
  AgentTarget,
  ArchiveRecord,
  CommandItem,
  LocaleCode,
  RunLog,
} from "../command-router/types"

const isTauri = "__TAURI_INTERNALS__" in window
const archiveKey = "agentdeck.archive.v1"
const maxBrowserArchiveRecords = 500

export function createArchiveRecord(options: {
  command: CommandItem
  kind?: ArchiveRecord["kind"]
  target: AgentTarget
  locale: LocaleCode
  log: RunLog
  parentId?: string
}): ArchiveRecord {
  const date = new Date(options.log.createdAt)

  return {
    id: options.log.id,
    parentId: options.parentId,
    kind: options.kind ?? "prompt",
    createdAt: options.log.createdAt,
    isoTime: date.toISOString(),
    day: date.toISOString().slice(0, 10),
    locale: options.locale,
    commandId: options.command.id,
    commandName: options.log.commandName,
    targetId: options.target.id,
    targetName: options.target.name,
    targetKind: options.target.kind,
    status: options.log.status,
    message: options.log.message,
    content: options.log.content,
    skillGroup: options.command.skillGroup,
  }
}

export async function archiveInteraction(record: ArchiveRecord): Promise<string> {
  if (isTauri) {
    return invoke<string>("archive_interaction", { record })
  }

  const records = loadBrowserArchive()
  records.unshift(record)
  localStorage.setItem(
    archiveKey,
    JSON.stringify(records.slice(0, maxBrowserArchiveRecords)),
  )
  return "browser local archive"
}

function loadBrowserArchive(): ArchiveRecord[] {
  const raw = localStorage.getItem(archiveKey)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ArchiveRecord[]) : []
  } catch {
    return []
  }
}
