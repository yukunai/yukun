import { useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  AgentTarget,
  CommandItem,
  LocaleCode,
  TargetKind,
  TemplateVariable,
} from "../modules/command-router/types"
import { extractTemplateKeys, localizeText } from "../modules/templates/templateEngine"

const editableTargetKinds: TargetKind[] = [
  "tmux_agent",
  "cursor",
  "terminal_app",
  "active_window",
]

export function CommandEditor(props: {
  targets: AgentTarget[]
  commands: CommandItem[]
  selectedCommand?: CommandItem
  locale: LocaleCode
  restoreClipboard: boolean
  globalShortcut: string
  compactMode: boolean
  onUpdateTarget: (targetId: string, patch: Partial<AgentTarget>) => void
  onTestTarget: (targetId: string) => void
  onCreateTarget: () => void
  onDeleteTarget: (targetId: string) => void
  onToggleRestoreClipboard: (restoreClipboard: boolean) => void
  onToggleCompactMode: (compactMode: boolean) => void
  onUpdateGlobalShortcut: (globalShortcut: string) => void
  onCreateCommand: () => void
  onCreateDefaultAgentSkillPacks: () => void
  onCreateSkillGroup: (skillGroupName: string) => void
  onDuplicateCommand: (commandId: string) => void
  onSaveCommand: (command: CommandItem) => void
  onDeleteCommand: (commandId: string) => void
  onMoveCommand: (commandId: string, direction: "up" | "down") => void
  onImportCommands: (commands: CommandItem[]) => void
  onImportCommandsError: (message: string, fileName?: string) => void
  onExportCommands: () => void
  onImportProfile: (file: File | undefined) => void
  onExportProfile: () => void
  onResetCommands: () => void
  onResetAll: () => void
}) {
  const { t } = useTranslation()
  const [skillGroupName, setSkillGroupName] = useState("")
  const command = props.selectedCommand

  function updateLocalizedField(field: "name" | "description" | "content", value: string) {
    if (!command) return
    props.onSaveCommand({
      ...command,
      [field]: {
        ...command[field],
        [props.locale]: value,
      },
      updatedAt: Date.now(),
    })
  }

  function updateCommand(patch: Partial<CommandItem>) {
    if (!command) return
    props.onSaveCommand({ ...command, ...patch, updatedAt: Date.now() })
  }

  function updateVariable(index: number, patch: Partial<TemplateVariable>) {
    if (!command) return
    const variables = [...(command.variables ?? [])]
    const current = variables[index]
    if (!current) return
    variables[index] = { ...current, ...patch }
    updateCommand({ variables })
  }

  function updateVariableLabel(index: number, value: string) {
    if (!command) return
    const variable = command.variables?.[index]
    if (!variable) return
    updateVariable(index, {
      label: {
        ...variable.label,
        [props.locale]: value,
      },
    })
  }

  function handleAddVariable() {
    if (!command) return
    const existingKeys = new Set((command.variables ?? []).map((variable) => variable.key))
    let nextIndex = existingKeys.size + 1
    let key = `variable_${nextIndex}`

    while (existingKeys.has(key)) {
      nextIndex += 1
      key = `variable_${nextIndex}`
    }

    updateCommand({
      variables: [
        ...(command.variables ?? []),
        {
          key,
          label: { [props.locale]: key, en: key },
          defaultValue: "",
          required: false,
        },
      ],
    })
  }

  function handleRemoveVariable(index: number) {
    if (!command) return
    updateCommand({
      variables: (command.variables ?? []).filter((_, variableIndex) => variableIndex !== index),
    })
  }

  function handleSyncVariables() {
    if (!command) return
    const content = localizeText(command.content, props.locale)
    const existingVariables = command.variables ?? []
    const existingByKey = new Map(existingVariables.map((variable) => [variable.key, variable]))
    const keys = extractTemplateKeys(content)

    updateCommand({
      variables: [
        ...existingVariables,
        ...keys
          .filter((key) => !existingByKey.has(key))
          .map((key) => ({
            key,
            label: { [props.locale]: key, en: key },
            defaultValue: "",
            required: false,
          })),
      ],
    })
  }

  async function importCommands(file: File | undefined) {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as CommandItem[]
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Commands JSON must include at least one command.")
      }
      props.onImportCommands(parsed)
    } catch (error) {
      props.onImportCommandsError(String(error), file.name)
    }
  }

  function handleCreateSkillGroup() {
    props.onCreateSkillGroup(skillGroupName)
    setSkillGroupName("")
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="text-xs font-semibold text-neutral-800">{t("appSettings")}</div>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">
            {t("globalShortcut")}
          </span>
          <input
            className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
            value={props.globalShortcut}
            onChange={(event) => props.onUpdateGlobalShortcut(event.target.value)}
            placeholder="CommandOrControl+Shift+Space"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
          <input
            checked={props.restoreClipboard}
            onChange={(event) => props.onToggleRestoreClipboard(event.target.checked)}
            type="checkbox"
          />
          {t("restoreClipboard")}
        </label>
        <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
          <input
            checked={props.compactMode}
            onChange={(event) => props.onToggleCompactMode(event.target.checked)}
            type="checkbox"
          />
          {t("compactMode")}
        </label>
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-neutral-800">{t("targetProfiles")}</div>
          <button
            className="h-7 rounded-md bg-neutral-950 px-2 text-[11px] font-semibold text-white"
            onClick={props.onCreateTarget}
            type="button"
          >
            {t("newTarget")}
          </button>
        </div>

        {props.targets.map((target) => (
          <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2" key={target.id}>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                  {t("targetName")}
                </span>
                <input
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                  value={target.name}
                  onChange={(event) => props.onUpdateTarget(target.id, { name: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                  {t("targetType")}
                </span>
                <select
                  className="h-8 w-28 rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                  value={target.kind}
                  onChange={(event) => {
                    const kind = event.target.value as TargetKind
                    props.onUpdateTarget(target.id, {
                      kind,
                      tmuxSessionName:
                        kind === "tmux_agent"
                          ? (target.tmuxSessionName ?? target.id)
                          : target.tmuxSessionName,
                      appName:
                        kind === "cursor"
                          ? (target.appName ?? "Cursor")
                          : kind === "terminal_app"
                            ? (target.appName ?? "Terminal")
                            : target.appName,
                      openChatShortcut:
                        kind === "cursor"
                          ? (target.openChatShortcut ?? "cmd+l")
                          : target.openChatShortcut,
                      sendShortcut:
                        kind === "cursor" || kind === "terminal_app" || kind === "active_window"
                          ? (target.sendShortcut ?? "enter")
                          : target.sendShortcut,
                    })
                  }}
                >
                  {editableTargetKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`targetKinds.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {target.kind === "tmux_agent" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                  {t("session")}
                </span>
                <input
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                  value={target.tmuxSessionName ?? ""}
                  onChange={(event) =>
                    props.onUpdateTarget(target.id, { tmuxSessionName: event.target.value })
                  }
                />
              </label>
            ) : null}

            {target.kind === "cursor" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                    {t("cursorAppName")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                    value={target.appName ?? ""}
                    onChange={(event) => props.onUpdateTarget(target.id, { appName: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                    {t("openChatShortcut")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                    value={target.openChatShortcut ?? ""}
                    onChange={(event) =>
                      props.onUpdateTarget(target.id, { openChatShortcut: event.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                    {t("sendShortcut")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                    value={target.sendShortcut ?? ""}
                    onChange={(event) => props.onUpdateTarget(target.id, { sendShortcut: event.target.value })}
                  />
                </label>
              </>
            ) : null}

            {target.kind === "terminal_app" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                    {t("terminalAppName")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                    value={target.appName ?? ""}
                    onChange={(event) => props.onUpdateTarget(target.id, { appName: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                    {t("sendShortcut")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                    value={target.sendShortcut ?? ""}
                    onChange={(event) => props.onUpdateTarget(target.id, { sendShortcut: event.target.value })}
                  />
                </label>
              </>
            ) : null}

            {target.kind === "active_window" ? (
              <div className="rounded-md bg-amber-50 p-2 text-[11px] leading-5 text-amber-800">
                {t("activeWindowWarning")}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
              <input
                checked={target.defaultAutoEnter}
                onChange={(event) =>
                  props.onUpdateTarget(target.id, { defaultAutoEnter: event.target.checked })
                }
                type="checkbox"
              />
              {t("defaultAutoEnter")}
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                className="h-7 rounded-md border border-neutral-200 bg-white text-[11px] font-semibold text-neutral-700"
                onClick={() => props.onTestTarget(target.id)}
                type="button"
              >
                {t("testTarget")}
              </button>
              <button
                className="h-7 rounded-md border border-red-200 bg-red-50 text-[11px] font-semibold text-red-700 disabled:opacity-40"
                disabled={props.targets.length <= 1}
                onClick={() => props.onDeleteTarget(target.id)}
                type="button"
              >
                {t("deleteTarget")}
              </button>
            </div>
          </div>
        ))}

      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-neutral-800">{t("buttonManagement")}</div>
          <button
            className="h-7 rounded-md bg-neutral-950 px-2 text-[11px] font-semibold text-white"
            onClick={props.onCreateCommand}
            type="button"
          >
            {t("newCommand")}
          </button>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-2">
          <button
            className="mb-2 h-8 w-full rounded-md border border-neutral-900 bg-neutral-950 text-[11px] font-semibold text-white"
            onClick={props.onCreateDefaultAgentSkillPacks}
            type="button"
          >
            {t("createDefaultAgentSkillPacks")}
          </button>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-neutral-500">
              {t("quickSkillGroupName")}
            </span>
            <div className="flex gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                value={skillGroupName}
                onChange={(event) => setSkillGroupName(event.target.value)}
                placeholder={t("defaultSkillGroupName")}
              />
              <button
                className="h-8 shrink-0 rounded-md bg-neutral-950 px-2 text-[11px] font-semibold text-white"
                onClick={handleCreateSkillGroup}
                type="button"
              >
                {t("createSkillGroup")}
              </button>
            </div>
          </label>
        </div>

        {command ? (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("name")}</span>
              <input
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                value={localizeText(command.name, props.locale)}
                onChange={(event) => updateLocalizedField("name", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("description")}</span>
              <input
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                value={localizeText(command.description, props.locale)}
                onChange={(event) => updateLocalizedField("description", event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("category")}</span>
                <select
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                  value={command.category}
                  onChange={(event) => updateCommand({ category: event.target.value })}
                >
                  {["skill", "project", "frontend", "code", "terminal", "docs", "backend"].map((category) => (
                    <option key={category} value={category}>
                      {t(`categories.${category}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("target")}</span>
                <select
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                  value={command.defaultTargetId}
                  onChange={(event) =>
                    updateCommand({ defaultTargetId: event.target.value, targetLocked: true })
                  }
                >
                  {props.targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
              <input
                checked={command.targetLocked ?? false}
                onChange={(event) => updateCommand({ targetLocked: event.target.checked })}
                type="checkbox"
              />
              {t("lockToCommandTarget")}
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                {t("skillGroup")}
              </span>
              <input
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                value={command.skillGroup ?? ""}
                onChange={(event) => updateCommand({ skillGroup: event.target.value })}
                placeholder={t("skillGroupPlaceholder")}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("content")}</span>
              <textarea
                className="h-28 w-full resize-none rounded-md border border-neutral-200 bg-white p-2 text-xs leading-5 outline-none focus:border-neutral-400"
                value={localizeText(command.content, props.locale)}
                onChange={(event) => updateLocalizedField("content", event.target.value)}
              />
            </label>
            <section className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-neutral-800">
                  {t("templateVariableManagement")}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="h-7 rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-semibold text-neutral-700"
                    onClick={handleSyncVariables}
                    type="button"
                  >
                    {t("syncVariables")}
                  </button>
                  <button
                    className="h-7 rounded-md bg-neutral-950 px-2 text-[11px] font-semibold text-white"
                    onClick={handleAddVariable}
                    type="button"
                  >
                    {t("addVariable")}
                  </button>
                </div>
              </div>

              {(command.variables ?? []).length === 0 ? (
                <div className="rounded-md bg-neutral-50 p-2 text-[11px] leading-5 text-neutral-500">
                  {t("noTemplateVariables")}
                </div>
              ) : null}

              {(command.variables ?? []).map((variable, index) => (
                <div
                  className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-2"
                  key={`${variable.key}-${index}`}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                        {t("variableKey")}
                      </span>
                      <input
                        className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                        value={variable.key}
                        onChange={(event) =>
                          updateVariable(index, {
                            key: event.target.value.replace(/[^\w-]/g, ""),
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                        {t("variableLabel")}
                      </span>
                      <input
                        className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                        value={localizeText(variable.label, props.locale)}
                        onChange={(event) => updateVariableLabel(index, event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                      {t("variableDefault")}
                    </span>
                    <input
                      className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-400"
                      value={variable.defaultValue ?? ""}
                      onChange={(event) =>
                        updateVariable(index, { defaultValue: event.target.value })
                      }
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
                      <input
                        checked={variable.required ?? false}
                        onChange={(event) =>
                          updateVariable(index, { required: event.target.checked })
                        }
                        type="checkbox"
                      />
                      {t("required")}
                    </label>
                    <button
                      className="h-7 rounded-md border border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-700"
                      onClick={() => handleRemoveVariable(index)}
                      type="button"
                    >
                      {t("removeVariable")}
                    </button>
                  </div>
                </div>
              ))}
            </section>
            <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
              <input
                checked={command.autoEnter}
                onChange={(event) => updateCommand({ autoEnter: event.target.checked })}
                type="checkbox"
              />
              {t("autoEnter")}
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
              <input
                checked={command.compactPinned ?? false}
                onChange={(event) => updateCommand({ compactPinned: event.target.checked })}
                type="checkbox"
              />
              {t("pinToCompact")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="h-8 rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-700"
                onClick={() => props.onMoveCommand(command.id, "up")}
                type="button"
              >
                {t("moveUp")}
              </button>
              <button
                className="h-8 rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-700"
                onClick={() => props.onMoveCommand(command.id, "down")}
                type="button"
              >
                {t("moveDown")}
              </button>
            </div>
            <button
              className="h-8 w-full rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-700"
              onClick={() => props.onDuplicateCommand(command.id)}
              type="button"
            >
              {t("duplicateCommand")}
            </button>
            <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-600">
              <input
                checked={command.confirmBeforeSend}
                onChange={(event) => updateCommand({ confirmBeforeSend: event.target.checked })}
                type="checkbox"
              />
              {t("confirmBeforeSend")}
            </label>
            <button
              className="h-8 w-full rounded-md border border-red-200 bg-red-50 text-xs font-semibold text-red-700 disabled:opacity-40"
              disabled={props.commands.length <= 1}
              onClick={() => props.onDeleteCommand(command.id)}
              type="button"
            >
              {t("delete")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-2 border-t border-neutral-200 pt-4">
        <button
          className="h-8 w-full rounded-md border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800"
          onClick={props.onResetCommands}
          type="button"
        >
          {t("resetCommands")}
        </button>
        <button
          className="h-8 w-full rounded-md border border-red-200 bg-red-50 text-xs font-semibold text-red-700"
          onClick={props.onResetAll}
          type="button"
        >
          {t("resetAll")}
        </button>
        <button
          className="h-8 w-full rounded-md bg-neutral-950 text-xs font-semibold text-white"
          onClick={props.onExportProfile}
          type="button"
        >
          {t("exportProfile")}
        </button>
        <label className="flex h-8 w-full items-center justify-center rounded-md border border-neutral-900 bg-white text-xs font-semibold text-neutral-900">
          {t("importProfile")}
          <input
            accept="application/json"
            className="hidden"
            type="file"
            onChange={(event) => props.onImportProfile(event.target.files?.[0])}
          />
        </label>
        <button
          className="h-8 w-full rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-700"
          onClick={props.onExportCommands}
          type="button"
        >
          {t("exportJson")}
        </button>
        <label className="flex h-8 w-full items-center justify-center rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-700">
          {t("importJson")}
          <input
            accept="application/json"
            className="hidden"
            type="file"
            onChange={(event) => importCommands(event.target.files?.[0])}
          />
        </label>
      </section>
    </div>
  )
}
