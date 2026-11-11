import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Copy,
  RefreshCw,
  Terminal,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { runSetupCheck, type SetupCheckItem } from "../modules/setup/setupCheck"

export function SetupChecklist(props: {
  codexSession: string
  ccSession: string
  cursorAppName: string
}) {
  const { t } = useTranslation()
  const [checks, setChecks] = useState<SetupCheckItem[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [nextCopied, setNextCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [showCommands, setShowCommands] = useState(false)

  const summary = useMemo(() => {
    const missingRequired = checks.filter(
      (check) => check.required && check.status === "missing",
    ).length
    const warnings = checks.filter((check) => check.status === "warning").length
    const ok = checks.filter((check) => check.status === "ok").length
    const readiness = calculateReadinessScore(checks)
    const nextStep = createNextSetupStep(checks, props.codexSession, props.ccSession)
    return { missingRequired, nextStep, ok, readiness, warnings }
  }, [checks, props.ccSession, props.codexSession])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setChecks(
        await runSetupCheck({
          codexSession: props.codexSession,
          ccSession: props.ccSession,
          cursorAppName: props.cursorAppName,
        }),
      )
    } catch (error) {
      setError(String(error))
    } finally {
      setLoading(false)
    }
  }

  const setupCommands = useMemo(() => {
    const codexSession = props.codexSession || "codex"
    const ccSession = props.ccSession || "cc"
    return [
      "cd path/to/yukun",
      "",
      "# Install Rust",
      "command -v cargo >/dev/null || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
      'source "$HOME/.cargo/env" 2>/dev/null || true',
      "",
      "# Install tmux",
      'command -v brew >/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      'command -v brew >/dev/null || eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true',
      "command -v tmux >/dev/null || brew install tmux",
      "",
      "# Create agent sessions",
      `tmux has-session -t ${shellQuote(codexSession)} 2>/dev/null || tmux new-session -d -s ${shellQuote(codexSession)}`,
      `tmux has-session -t ${shellQuote(ccSession)} 2>/dev/null || tmux new-session -d -s ${shellQuote(ccSession)}`,
      "",
      "# Start yukun desktop app",
      "npm run tauri dev",
    ].join("\n")
  }, [props.ccSession, props.codexSession])

  async function copySetupCommands() {
    try {
      await navigator.clipboard.writeText(setupCommands)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      handleClipboardCopyError(error)
    }
  }

  async function copyNextSetupCommand() {
    if (!summary.nextStep?.command) return

    try {
      await navigator.clipboard.writeText(summary.nextStep.command)
      setNextCopied(true)
      window.setTimeout(() => setNextCopied(false), 1600)
    } catch (error) {
      handleClipboardCopyError(error)
    }
  }

  function handleClipboardCopyError(error: unknown) {
    setShowCommands(true)
    setError(t("clipboardCopyFailed", { message: String(error) }))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.codexSession, props.ccSession, props.cursorAppName])

  const tone =
    summary.missingRequired > 0
      ? "border-red-200 bg-red-50/80"
      : summary.warnings > 0
        ? "border-amber-200 bg-amber-50/80"
        : "border-emerald-200 bg-emerald-50/80"

  return (
    <section className={`mb-3 rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <div className="text-xs font-semibold text-neutral-900">{t("setupChecklist")}</div>
          <div className="mt-1 text-[11px] leading-5 text-neutral-600">
            {t("setupSummary", {
              ok: summary.ok,
              warnings: summary.warnings,
              missing: summary.missingRequired,
            })}
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-neutral-700">
              <span>{t("readinessScore", { score: summary.readiness })}</span>
              {summary.nextStep ? (
                <span className="truncate font-medium text-neutral-600">
                  {t("nextSetupAction", {
                    label: t(`setupChecks.${summary.nextStep.id}.label`),
                    hint: t(`setupChecks.${summary.nextStep.id}.hint`),
                  })}
                </span>
              ) : (
                <span className="font-medium text-emerald-700">{t("setupReady")}</span>
              )}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/80">
              <div
                className={`h-full rounded-full ${readinessBarClass(summary.readiness)}`}
                style={{ width: `${summary.readiness}%` }}
              />
            </div>
          </div>
          {error ? <div className="mt-1 text-[11px] text-red-700">{error}</div> : null}
        </button>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
          disabled={!summary.nextStep?.command}
          onClick={copyNextSetupCommand}
          title={t("copyNextSetupCommand")}
          type="button"
        >
          <ClipboardCheck size={14} />
        </button>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
          onClick={() => setShowCommands((current) => !current)}
          title={showCommands ? t("hideSetupCommands") : t("showSetupCommands")}
          type="button"
        >
          <Terminal size={14} />
        </button>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
          onClick={copySetupCommands}
          title={t("copySetupCommands")}
          type="button"
        >
          <Copy size={14} />
        </button>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
          disabled={loading}
          onClick={refresh}
          title={t("refreshSetupCheck")}
          type="button"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={14} />
        </button>
      </div>
      {copied ? (
        <div className="mt-2 text-[11px] font-medium text-neutral-700">
          {t("setupCommandsCopied")}
        </div>
      ) : null}
      {nextCopied ? (
        <div className="mt-2 text-[11px] font-medium text-neutral-700">
          {t("nextSetupCommandCopied")}
        </div>
      ) : null}
      {showCommands ? (
        <pre className="mt-3 max-h-44 overflow-auto rounded-md border border-neutral-200 bg-neutral-950 p-3 text-[10px] leading-4 text-neutral-100">
          {setupCommands}
        </pre>
      ) : null}

      {expanded ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {checks.map((check) => (
            <div
              className="flex min-w-0 items-start gap-2 rounded-md border border-white/70 bg-white/75 p-2"
              key={check.id}
            >
              <StatusIcon status={check.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-neutral-800">
                  {t(`setupChecks.${check.id}.label`)}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-neutral-500">
                  {check.detail || t(`setupChecks.${check.id}.hint`)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

const setupCheckWeights: Record<string, number> = {
  accessibility: 5,
  brew: 6,
  cargo: 12,
  clipboard: 8,
  cursor_app: 4,
  desktop: 12,
  osascript: 8,
  rustc: 10,
  tmux: 15,
  tmux_cc: 10,
  tmux_codex: 10,
}

function calculateReadinessScore(checks: SetupCheckItem[]) {
  if (checks.length === 0) return 0

  let earned = 0
  let possible = 0

  for (const check of checks) {
    const weight = setupCheckWeights[check.id] ?? (check.required ? 10 : 4)
    possible += weight

    if (check.status === "ok") {
      earned += weight
    } else if (check.status === "warning") {
      earned += weight * (check.required ? 0.45 : 0.65)
    } else if (!check.required) {
      earned += weight * 0.35
    }
  }

  return Math.round((earned / possible) * 100)
}

interface NextSetupStep {
  command: string
  id: string
}

function createNextSetupStep(
  checks: SetupCheckItem[],
  codexSessionName: string,
  ccSessionName: string,
): NextSetupStep | null {
  const byId = new Map(checks.map((check) => [check.id, check]))
  const needs = (id: string) => {
    const check = byId.get(id)
    return Boolean(check && check.status !== "ok")
  }
  const desktopCheck = byId.get("desktop")

  if (desktopCheck?.detail.includes("Browser preview")) {
    return {
      command: ["cd path/to/yukun", "npm run setup:mac"].join("\n"),
      id: "setup_mac",
    }
  }

  if (needs("cargo") || needs("rustc")) {
    return {
      command: [
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
        'source "$HOME/.cargo/env" 2>/dev/null || true',
      ].join("\n"),
      id: "cargo",
    }
  }

  if (needs("brew") && needs("tmux")) {
    return {
      command: [
        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        'eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true',
      ].join("\n"),
      id: "brew",
    }
  }

  if (needs("tmux")) {
    return {
      command: "brew install tmux",
      id: "tmux",
    }
  }

  if (needs("tmux_codex")) {
    const codexSession = codexSessionName || "codex"
    return {
      command: `tmux has-session -t ${shellQuote(codexSession)} 2>/dev/null || tmux new-session -d -s ${shellQuote(codexSession)}`,
      id: "tmux_codex",
    }
  }

  if (needs("tmux_cc")) {
    const ccSession = ccSessionName || "cc"
    return {
      command: `tmux has-session -t ${shellQuote(ccSession)} 2>/dev/null || tmux new-session -d -s ${shellQuote(ccSession)}`,
      id: "tmux_cc",
    }
  }

  if (needs("desktop")) {
    return {
      command: "npm run tauri dev",
      id: "desktop",
    }
  }

  return null
}

function readinessBarClass(score: number) {
  if (score >= 85) return "bg-emerald-500"
  if (score >= 60) return "bg-amber-500"
  return "bg-red-500"
}

function StatusIcon(props: { status: SetupCheckItem["status"] }) {
  if (props.status === "ok") {
    return <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={14} />
  }

  if (props.status === "missing") {
    return <XCircle className="mt-0.5 shrink-0 text-red-600" size={14} />
  }

  return <CircleAlert className="mt-0.5 shrink-0 text-amber-600" size={14} />
}
