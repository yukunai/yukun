import { useTranslation } from "react-i18next"
import type { RunLog } from "../modules/command-router/types"

export function LogPanel(props: { logs: RunLog[] }) {
  const { t } = useTranslation()

  return (
    <section className="border-t border-neutral-200 bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-neutral-800">{t("logs")}</div>
        <div className="truncate text-[10px] text-neutral-500" title={t("archiveHint")}>
          {t("archiveHint")}
        </div>
      </div>
      {props.logs.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
          {t("emptyLogs")}
        </div>
      ) : (
        <div className="max-h-32 space-y-2 overflow-y-auto">
          {props.logs.slice(0, 5).map((log) => (
            <div className="rounded-md border border-neutral-200 bg-white p-2" key={log.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-medium text-neutral-900">{log.commandName}</div>
                <span
                  className={[
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    log.status === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : log.status === "blocked"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700",
                  ].join(" ")}
                >
                  {log.status}
                </span>
              </div>
              <div className="mt-1 truncate text-[11px] text-neutral-500">
                {log.targetName} · {log.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
