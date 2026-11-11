import { ArrowRight, CheckCircle2, CircleAlert, type LucideIcon } from "lucide-react"
import * as Icons from "lucide-react"
import { useTranslation } from "react-i18next"
import type { CommandItem, LocaleCode } from "../modules/command-router/types"
import { localizeText } from "../modules/templates/templateEngine"

export function CommandButton(props: {
  command: CommandItem
  locale: LocaleCode
  selected: boolean
  onSelect: () => void
  onSend: () => void
}) {
  const { t } = useTranslation()
  const Icon = ((Icons as unknown as Record<string, LucideIcon>)[props.command.icon ?? "Sparkles"] ??
    Icons.Sparkles) as LucideIcon

  return (
    <div
      className={[
        "group w-full rounded-lg border p-3 text-left transition",
        props.selected
          ? "border-neutral-900 bg-white shadow-sm"
          : "border-neutral-200 bg-white/70 hover:border-neutral-300 hover:bg-white",
      ].join(" ")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          props.onSelect()
        }
      }}
      onClick={props.onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md border border-neutral-200 bg-neutral-50 p-1.5 text-neutral-700">
          <Icon size={16} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium text-neutral-950">
              {localizeText(props.command.name, props.locale)}
            </div>
            {props.command.autoEnter ? (
              <CheckCircle2 className="shrink-0 text-emerald-600" size={14} />
            ) : (
              <CircleAlert className="shrink-0 text-amber-600" size={14} />
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
            {localizeText(props.command.description, props.locale)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span className="truncate">
              {props.command.skillGroup?.trim() || t(`categories.${props.command.category}`)}
            </span>
            <span>{props.command.autoEnter ? t("autoEnter") : t("preview")}</span>
          </div>
        </div>
        <button
          aria-label={t("send")}
          className="rounded-md border border-neutral-200 bg-neutral-950 p-1.5 text-white transition hover:bg-neutral-800"
          onClick={(event) => {
            event.stopPropagation()
            props.onSend()
          }}
          title={t("send")}
          type="button"
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
