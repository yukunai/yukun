#!/usr/bin/env node

import { rmSync } from "node:fs"
import { resolve } from "node:path"

const bundleTargets = [
  "src-tauri/target/release/bundle/macos/yukun.app",
  "src-tauri/target/release/bundle/dmg/yukun_0.1.0_aarch64.dmg",
]

for (const target of bundleTargets) {
  const absoluteTarget = resolve(target)
  if (!absoluteTarget.includes("/src-tauri/target/release/bundle/")) {
    throw new Error(`Refusing to remove unexpected path: ${absoluteTarget}`)
  }

  rmSync(absoluteTarget, { force: true, recursive: true })
}

console.log("Cleaned macOS bundle output.")
