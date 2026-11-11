import { invoke } from "@tauri-apps/api/core"

export type SetupCheckStatus = "ok" | "warning" | "missing"

export interface SetupCheckItem {
  id: string
  status: SetupCheckStatus
  detail: string
  required: boolean
}

const isTauri = "__TAURI_INTERNALS__" in window

export async function runSetupCheck(options: {
  codexSession: string
  ccSession: string
  cursorAppName: string
}): Promise<SetupCheckItem[]> {
  if (!isTauri) {
    return [
      {
        id: "desktop",
        status: "warning",
        detail: "Browser preview cannot run desktop checks.",
        required: true,
      },
      {
        id: "cargo",
        status: "warning",
        detail: "Run npm run doctor in the project folder.",
        required: true,
      },
      {
        id: "rustc",
        status: "warning",
        detail: "Run npm run doctor in the project folder.",
        required: true,
      },
      {
        id: "brew",
        status: "warning",
        detail: "Run npm run setup:mac for exact install commands.",
        required: false,
      },
      {
        id: "tmux",
        status: "warning",
        detail: "Run npm run doctor in the project folder.",
        required: true,
      },
      {
        id: "tmux_codex",
        status: "warning",
        detail: `Expected session: ${options.codexSession || "codex"}`,
        required: true,
      },
      {
        id: "tmux_cc",
        status: "warning",
        detail: `Expected session: ${options.ccSession || "cc"}`,
        required: true,
      },
      {
        id: "osascript",
        status: "warning",
        detail: "AppleScript can only be checked in Tauri.",
        required: true,
      },
      {
        id: "pbcopy",
        status: "warning",
        detail: "pbcopy can only be checked in Tauri.",
        required: true,
      },
      {
        id: "pbpaste",
        status: "warning",
        detail: "pbpaste can only be checked in Tauri.",
        required: true,
      },
      {
        id: "accessibility",
        status: "warning",
        detail: "Desktop automation permissions can only be checked in Tauri.",
        required: false,
      },
      {
        id: "cursor_app",
        status: "warning",
        detail: `Expected app: ${options.cursorAppName || "Cursor"}`,
        required: false,
      },
    ]
  }

  return invoke<SetupCheckItem[]>("run_setup_check", {
    codexSession: options.codexSession,
    ccSession: options.ccSession,
    cursorAppName: options.cursorAppName,
  })
}
