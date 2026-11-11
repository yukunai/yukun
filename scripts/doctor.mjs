#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const args = new Set(process.argv.slice(2))
const shouldBuild = args.has("--build")
const checks = []

function run(command, commandArgs = [], options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: false,
    ...options,
  })

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  }
}

function runShell(command) {
  return run("sh", ["-lc", command])
}

function addCheck(name, ok, detail, hint, required = true) {
  checks.push({ name, ok, detail, hint, required })
}

function checkExecutable(name, command, commandArgs, hint, required = true) {
  const result = run(command, commandArgs)
  addCheck(name, result.status === 0, result.stdout || result.stderr, hint, required)
  return result.status === 0
}

function checkCommand(name, command, hint, required = true) {
  const result = runShell(`command -v ${command}`)
  addCheck(name, result.status === 0, result.stdout || result.stderr, hint, required)
  return result.status === 0
}

function parseMajor(version) {
  const match = version.match(/v?(\d+)/)
  return match ? Number(match[1]) : 0
}

const platformOk = process.platform === "darwin"
addCheck(
  "macOS",
  platformOk,
  process.platform,
  "yukun MVP currently targets macOS only.",
)

const nodeResult = run("node", ["-v"])
const nodeOk = nodeResult.status === 0 && parseMajor(nodeResult.stdout) >= 20
addCheck("Node.js 20+", nodeOk, nodeResult.stdout || nodeResult.stderr, "Install Node.js 20 or newer.")

checkExecutable("npm", "npm", ["-v"], "Install npm with Node.js.")

const tauriResult = run("npm", ["run", "tauri", "--", "--version"])
addCheck(
  "Tauri CLI",
  tauriResult.status === 0,
  (tauriResult.stdout || tauriResult.stderr).split("\n").at(-1) ?? "",
  "Run npm install in the project directory.",
)

const cargoOk = checkExecutable(
  "cargo",
  "cargo",
  ["--version"],
  "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
)

checkExecutable(
  "rustc",
  "rustc",
  ["--version"],
  "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
)

const brewOk = checkCommand(
  "Homebrew",
  "brew",
  "Install Homebrew before using the generated tmux install command.",
  false,
)
const tmuxHint = brewOk
  ? "Install tmux: brew install tmux"
  : "Install Homebrew, then run: brew install tmux"
const tmuxOk = checkExecutable("tmux", "tmux", ["-V"], tmuxHint)

checkExecutable("osascript", "osascript", ["-e", "return \"ok\""], "macOS should include osascript.")
checkCommand("pbcopy", "pbcopy", "macOS should include pbcopy.", false)
checkCommand("pbpaste", "pbpaste", "macOS should include pbpaste.", false)

if (tmuxOk) {
  const codexSession = run("tmux", ["has-session", "-t", "codex"])
  addCheck(
    "tmux session: codex",
    codexSession.status === 0,
    codexSession.status === 0 ? "available" : "missing",
    "Create it with: tmux new -s codex",
    false,
  )

  const ccSession = run("tmux", ["has-session", "-t", "cc"])
  addCheck(
    "Claude Code tmux session (cc)",
    ccSession.status === 0,
    ccSession.status === 0 ? "available" : "missing",
    "Create it with: tmux new -s cc",
    false,
  )
}

if (shouldBuild) {
  const buildResult = run("npm", ["run", "build"], { stdio: "pipe" })
  addCheck(
    "frontend build",
    buildResult.status === 0,
    buildResult.status === 0 ? "build passed" : buildResult.stderr || buildResult.stdout,
    "Fix the reported TypeScript or Vite error.",
  )
}

console.log("\nyukun doctor\n")

for (const check of checks) {
  const status = check.ok ? "[OK]" : check.required ? "[MISS]" : "[WARN]"
  const detail = check.detail ? ` - ${check.detail}` : ""
  console.log(`${status} ${check.name}${detail}`)
  if (!check.ok && check.hint) {
    console.log(`      ${check.hint}`)
  }
}

const blocking = checks.filter((check) => check.required && !check.ok)

console.log("")

if (blocking.length > 0) {
  console.log(`Doctor failed: ${blocking.length} required check(s) need attention.`)
  process.exit(1)
}

if (!cargoOk || !tmuxOk) {
  console.log("Browser preview can still run, but full desktop smoke tests need Rust and tmux.")
}

console.log("Doctor passed. You can run: npm run tauri dev")
