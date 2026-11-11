#!/usr/bin/env node

import { mkdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const appPath = resolve("src-tauri/target/release/bundle/macos/yukun.app")
const dmgPath = resolve("src-tauri/target/release/bundle/dmg/yukun_0.1.0_aarch64.dmg")

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

mkdirSync(dirname(dmgPath), { recursive: true })
rmSync(dmgPath, { force: true })

run("hdiutil", [
  "create",
  "-volname",
  "yukun",
  "-srcfolder",
  appPath,
  "-ov",
  "-format",
  "UDZO",
  dmgPath,
])

console.log(`Created DMG: ${dmgPath}`)
