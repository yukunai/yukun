import type { LocalizedText, LocaleCode, TemplateVariable } from "../command-router/types"

export function localizeText(text: LocalizedText, locale: LocaleCode): string {
  return text[locale] ?? text.en ?? text["zh-CN"] ?? Object.values(text)[0] ?? ""
}

export function extractTemplateKeys(content: string): string[] {
  const keys = new Set<string>()
  for (const match of content.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g)) {
    keys.add(match[1])
  }
  return [...keys]
}

export function renderTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? ""
  })
}

export function buildDefaultVariableValues(variables: TemplateVariable[] = []) {
  return variables.reduce<Record<string, string>>((values, variable) => {
    values[variable.key] = variable.defaultValue ?? ""
    return values
  }, {})
}
