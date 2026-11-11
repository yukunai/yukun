import {
  CheckCircle2,
  CircleAlert,
  Play,
  RefreshCw,
  TerminalSquare,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  getAgentKindForTarget,
  getAgentLaunchCommand,
  getTmuxAgentStatus,
  startTmuxAgent,
  type TmuxAgentStatus,
} from "../modules/adapters/tmuxAdapter"
import type { AgentTarget } from "../modules/command-router/types"

export function AgentSessionManager(props: { targets: AgentTarget[] }) {
  const { t } = useTranslation()
  const tmuxTargets = useMemo(
    () => props.targets.filter((target) => target.kind === "tmux_agent"),
    [props.targets],
  )
  const [statuses, setStatuses] = useState<Record<string, TmuxAgentStatus>>({})
  const [busyTargetIds, setBusyTargetIds] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  async function refreshTarget(target: AgentTarget) {
    const session = target.tmuxSessionName?.trim()
    if (!session) return

    setBusyTargetIds((current) => ({ ...current, [target.id]: true }))
    setError(null)
    try {
      const status = await getTmuxAgentStatus({
        agentKind: getAgentKindForTarget(target),
        session,
      })
      setStatuses((current) => ({ ...current, [target.id]: status }))
    } catch (error) {
      setError(String(error))
    } finally {
      setBusyTargetIds((current) => ({ ...current, [target.id]: false }))
    }
  }

  async function refreshAll() {
    await Promise.all(tmuxTargets.map((target) => refreshTarget(target)))
  }

  async function startTarget(target: AgentTarget) {
    const session = target.tmuxSessionName?.trim()
    const launchCommand = getAgentLaunchCommand(target)
    if (!session || !launchCommand) return

    setBusyTargetIds((current) => ({ ...current, [target.id]: true }))
    setError(null)
    try {
      await startTmuxAgent({
        agentKind: getAgentKindForTarget(target),
        launchCommand,
        session,
      })
      window.setTimeout(() => refreshTarget(target), 800)
    } catch (error) {
      setError(t("agentSessionStartFailed", { message: String(error) }))
    } finally {
      setBusyTargetIds((current) => ({ ...current, [target.id]: false }))
    }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmuxTargets.map((target) => `${target.id}:${target.tmuxSessionName}`).join("|")])

  if (tmuxTargets.length === 0) return null

  return (
    <section className="mb-4 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TerminalSquare className="shrink-0 text-neutral-600" size={14} />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-neutral-800">
              {t("agentSessions")}
            </div>
            <div className="truncate text-[10px] text-neutral-500">{t("agentSessionHint")}</div>
          </div>
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
          onClick={refreshAll}
          title={t("refreshAgentSessions")}
          type="button"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="space-y-2">
        {tmuxTargets.map((target) => {
          const status = statuses[target.id]
          const launchCommand = getAgentLaunchCommand(target)
          const isBusy = busyTargetIds[target.id]
          const canStart = Boolean(target.tmuxSessionName?.trim() && launchCommand)

          return (
            <div
              className="rounded-md border border-neutral-200 bg-neutral-50/80 p-2"
              key={target.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-neutral-900">
                    {target.name}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-neutral-500">
                    {t("agentSessionName", { session: target.tmuxSessionName || "-" })}
                  </div>
                </div>
                <StatusPill status={status?.status ?? "unknown"} />
              </div>
              <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-neutral-500">
                {status?.detail || t("agentSessionUnknownDetail")}
              </div>
              {status?.currentCommand ? (
                <div className="mt-1 truncate text-[10px] text-neutral-500">
                  {t("agentCurrentCommand", { command: status.currentCommand })}
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-semibold text-neutral-700 hover:text-neutral-950"
                  disabled={isBusy}
                  onClick={() => refreshTarget(target)}
                  type="button"
                >
                  <RefreshCw className={isBusy ? "animate-spin" : ""} size={12} />
                  {t("refresh")}
                </button>
                <button
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-neutral-950 px-2 text-[11px] font-semibold text-white disabled:bg-neutral-300"
                  disabled={isBusy || !canStart || status?.agentRunning}
                  onClick={() => startTarget(target)}
                  title={!launchCommand ? t("agentLaunchUnavailable") : launchCommand}
                  type="button"
                >
                  <Play size={12} />
                  {t("startAgentSession")}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {error ? <div className="mt-2 text-[11px] leading-4 text-red-700">{error}</div> : null}
    </section>
  )
}

function StatusPill(props: { status: TmuxAgentStatus["status"] }) {
  const { t } = useTranslation()
  const labels: Record<TmuxAgentStatus["status"], string> = {
    agent: t("agentSessionRunning"),
    missing: t("agentSessionMissing"),
    shell: t("agentSessionShell"),
    unknown: t("agentSessionUnknown"),
  }

  if (props.status === "agent") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
        <CheckCircle2 size={11} />
        {labels[props.status]}
      </span>
    )
  }

  if (props.status === "missing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
        <XCircle size={11} />
        {labels[props.status]}
      </span>
    )
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
      <CircleAlert size={11} />
      {labels[props.status]}
    </span>
  )
}
