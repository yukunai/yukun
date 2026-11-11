import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { CommandItem, LocaleCode } from "../modules/command-router/types"
import {
  buildDefaultVariableValues,
  localizeText,
  renderTemplate,
} from "../modules/templates/templateEngine"

export function TemplateVariableDialog(props: {
  command: CommandItem
  locale: LocaleCode
  onCancel: () => void
  onSubmit: (content: string) => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => buildDefaultVariableValues(props.command.variables))
  const template = localizeText(props.command.content, props.locale)
  const rendered = renderTemplate(template, values)

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950">{t("templateVariables")}</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            {localizeText(props.command.name, props.locale)}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {(props.command.variables ?? []).map((variable) => (
            <label className="block" key={variable.key}>
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                {localizeText(variable.label, props.locale)}
                {variable.required ? <span className="text-red-600"> *</span> : null}
              </span>
              <input
                className="h-9 w-full rounded-md border border-neutral-200 px-2 text-sm outline-none focus:border-neutral-400"
                value={values[variable.key] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [variable.key]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>

        <pre className="mt-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-700">
          {rendered}
        </pre>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-semibold text-neutral-700"
            onClick={props.onCancel}
            type="button"
          >
            {t("cancel")}
          </button>
          <button
            className="h-8 rounded-md bg-neutral-950 px-3 text-xs font-semibold text-white"
            onClick={() => props.onSubmit(rendered)}
            type="button"
          >
            {t("send")}
          </button>
        </div>
      </div>
    </div>
  )
}
