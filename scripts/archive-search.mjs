#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const args = process.argv.slice(2)
const jsonOutput = args.includes("--json")
const limitIndex = args.indexOf("--limit")
const limit =
  limitIndex >= 0 && args[limitIndex + 1] ? Number.parseInt(args[limitIndex + 1], 10) : 20
const query = args
  .filter(
    (arg, index) =>
      arg !== "--json" && arg !== "--limit" && !(limitIndex >= 0 && index === limitIndex + 1),
  )
  .join(" ")
  .trim()
  .toLowerCase()
const archiveDir =
  process.env.YUKUN_ARCHIVE_DIR ??
  process.env.AGENTDECK_ARCHIVE_DIR ??
  path.join(os.homedir(), ".agentdeck", "archive")

if (!existsSync(archiveDir)) {
  console.log(`yukun archive directory does not exist yet: ${archiveDir}`)
  process.exit(0)
}

const records = []
const files = (await readdir(archiveDir))
  .filter((file) => file.endsWith(".jsonl"))
  .sort()
  .reverse()

for (const file of files) {
  const fullPath = path.join(archiveDir, file)
  const lines = (await readFile(fullPath, "utf8")).split("\n").filter(Boolean)

  for (const line of lines) {
    try {
      const record = JSON.parse(line)
      const haystack = [
        record.kind,
        record.parentId,
        record.commandName,
        record.targetName,
        record.targetKind,
        record.status,
        record.message,
        record.skillGroup,
        record.content,
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase()

      if (!query || haystack.includes(query)) {
        records.push({ ...record, archiveFile: fullPath })
      }
    } catch {
      // Ignore malformed archive lines so one bad record does not break search.
    }
  }
}

records.sort((first, second) => Number(second.createdAt ?? 0) - Number(first.createdAt ?? 0))
const results = records.slice(0, Number.isFinite(limit) ? limit : 20)

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2))
  process.exit(0)
}

console.log(`yukun archive: ${archiveDir}`)
console.log(query ? `Query: ${query}` : `Recent records`)
console.log("")

if (results.length === 0) {
  console.log("No archive records found.")
  process.exit(0)
}

for (const record of results) {
  const time = record.isoTime ?? new Date(record.createdAt ?? Date.now()).toISOString()
  const kind = record.kind ? ` ${record.kind}` : ""
  console.log(`${time} [${record.status}${kind}] ${record.commandName} -> ${record.targetName}`)
  console.log(`  ${record.archiveFile}`)
  console.log(`  ${snippet(record.content)}`)
  console.log("")
}

function snippet(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}
