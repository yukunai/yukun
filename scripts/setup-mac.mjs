#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const args = new Set(process.argv.slice(2))
const shouldCreateSessions = args.has("--create-sessions")

function run(command, commandArgs = []) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: false,
  })

  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  }
}

function commandExists(command) {
  return run("sh", ["-lc", `command -v ${command}`]).ok
}

function hasTmuxSession(session) {
  return run("tmux", ["has-session", "-t", session]).ok
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

const checks = {
  macos: process.platform === "darwin",
  brew: commandExists("brew"),
  cargo: commandExists("cargo"),
  rustc: commandExists("rustc"),
  tmux: commandExists("tmux"),
  osascript: commandExists("osascript"),
  pbcopy: commandExists("pbcopy"),
  pbpaste: commandExists("pbpaste"),
}

const codexSessionExists = checks.tmux && hasTmuxSession("codex")
const ccSessionExists = checks.tmux && hasTmuxSession("cc")

console.log("\nyukun macOS setup\n")

for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? "[OK]" : "[MISS]"} ${name}`)
}

if (checks.tmux) {
  console.log(`${codexSessionExists ? "[OK]" : "[MISS]"} tmux session: codex`)
  console.log(`${ccSessionExists ? "[OK]" : "[MISS]"} Claude Code tmux session (cc)`)
}

const nextCommands = []

if (!checks.macos) {
  console.log("\nyukun MVP currently supports macOS only.")
  process.exit(1)
}

if (!checks.cargo || !checks.rustc) {
  nextCommands.push(
    "# Install Rust",
    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    'source "$HOME/.cargo/env" 2>/dev/null || true',
  )
}

if (!checks.tmux) {
  if (!checks.brew) {
    nextCommands.push(
      "# Install Homebrew",
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      'eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true',
    )
  }
  nextCommands.push("# Install tmux", "brew install tmux")
}

if (checks.tmux && (!codexSessionExists || !ccSessionExists)) {
  if (shouldCreateSessions) {
    if (!codexSessionExists) run("tmux", ["new-session", "-d", "-s", "codex"])
    if (!ccSessionExists) run("tmux", ["new-session", "-d", "-s", "cc"])
    console.log("\nCreated missing detached tmux sessions.")
  } else {
    if (!codexSessionExists) {
      nextCommands.push("# Create Codex tmux session", `tmux new-session -d -s ${quote("codex")}`)
    }
    if (!ccSessionExists) {
      nextCommands.push("# Create Claude Code tmux session", `tmux new-session -d -s ${quote("cc")}`)
    }
  }
}

nextCommands.push("# Run yukun desktop app", "npm run tauri dev")

console.log("\nNext commands\n")
console.log(nextCommands.join("\n"))
console.log("\nTip: run npm run setup:sessions after tmux is installed to create missing sessions.")
