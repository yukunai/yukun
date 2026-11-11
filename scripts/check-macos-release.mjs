#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const notaryProfile =
  process.env.YUKUN_NOTARY_PROFILE || process.env.AGENTDECK_NOTARY_PROFILE || "yukunNotary"

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  })
}

function ok(label, detail = "") {
  console.log(`ok   ${label}${detail ? ` - ${detail}` : ""}`)
}

function warn(label, detail = "") {
  console.log(`warn ${label}${detail ? ` - ${detail}` : ""}`)
}

function fail(label, detail = "") {
  console.log(`fail ${label}${detail ? ` - ${detail}` : ""}`)
}

function hasTool(label, command, args) {
  const result = run(command, args)
  if (result.status === 0) {
    ok(label)
    return true
  }

  fail(label, result.stderr.trim() || result.stdout.trim() || "not available")
  return false
}

function hasExecutable(label, command) {
  const result = run("/usr/bin/which", [command])
  if (result.status === 0) {
    ok(label, result.stdout.trim())
    return true
  }

  fail(label, `${command} not found`)
  return false
}

let failed = false

if (process.platform !== "darwin") {
  fail("macOS", "Developer ID signing and notarization must run on macOS")
  failed = true
} else {
  ok("macOS")
}

for (const [label, command, args] of [
  ["Xcode notarytool", "xcrun", ["-f", "notarytool"]],
  ["Xcode stapler", "xcrun", ["-f", "stapler"]],
]) {
  if (!hasTool(label, command, args)) {
    failed = true
  }
}

for (const [label, command] of [
  ["codesign", "codesign"],
  ["hdiutil", "hdiutil"],
  ["ditto", "ditto"],
]) {
  if (!hasExecutable(label, command)) {
    failed = true
  }
}

const identities = run("security", ["find-identity", "-v", "-p", "codesigning"])
const identityOutput = `${identities.stdout}${identities.stderr}`
const developerIdMatches = identityOutput
  .split("\n")
  .map((line) => line.match(/"([^"]*Developer ID Application[^"]*)"/)?.[1])
  .filter(Boolean)

if (developerIdMatches.length > 0) {
  ok("Developer ID Application identity", developerIdMatches[0])
} else {
  fail(
    "Developer ID Application identity",
    "none found in the current keychain; install/import a Developer ID Application certificate first",
  )
  failed = true
}

if (process.env.YUKUN_SIGNING_IDENTITY || process.env.AGENTDECK_SIGNING_IDENTITY) {
  ok(
    "YUKUN_SIGNING_IDENTITY",
    process.env.YUKUN_SIGNING_IDENTITY || process.env.AGENTDECK_SIGNING_IDENTITY,
  )
} else {
  warn("YUKUN_SIGNING_IDENTITY", "not set; release script will use the first Developer ID Application identity it finds")
}

if (
  process.env.YUKUN_SKIP_NOTARY_PROFILE_CHECK === "1" ||
  process.env.AGENTDECK_SKIP_NOTARY_PROFILE_CHECK === "1"
) {
  warn("Notary keychain profile", "skipped by YUKUN_SKIP_NOTARY_PROFILE_CHECK=1")
} else {
  const notaryHistory = run("xcrun", [
    "notarytool",
    "history",
    "--keychain-profile",
    notaryProfile,
    "--limit",
    "1",
  ])

  if (notaryHistory.status === 0) {
    ok("Notary keychain profile", notaryProfile)
  } else {
    fail(
      "Notary keychain profile",
      `${notaryProfile} is not usable yet; run npm run release:notary:store`,
    )
    failed = true
  }
}

if (failed) {
  console.log("\nRelease readiness: blocked")
  process.exit(1)
}

console.log("\nRelease readiness: ok")
