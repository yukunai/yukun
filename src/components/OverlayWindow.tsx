import { EyeOff, Keyboard, Maximize2, Minimize2, Search, Settings2, ShieldAlert } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AgentSessionManager } from "./AgentSessionManager"
import { CommandButton } from "./CommandButton"
import { CommandEditor } from "./CommandEditor"
import { LogPanel } from "./LogPanel"
import { SetupChecklist } from "./SetupChecklist"
import { Sidebar } from "./Sidebar"
import { TargetSelector } from "./TargetSelector"
import { TemplateVariableDialog } from "./TemplateVariableDialog"
import { dispatchCommand, getSafetyReason } from "../modules/command-router"
import { getFrontmostAppName } from "../modules/adapters/activeWindowAdapter"
import { captureTmuxPane, getAgentKindForTarget, getTmuxAgentStatus } from "../modules/adapters/tmuxAdapter"
import type { AgentTarget, AppConfig, ArchiveRecord, CommandItem, LocaleCode, RunLog } from "../modules/command-router/types"
import { defaultCommands } from "../data/defaultCommands"
import { defaultConfig } from "../data/defaultProfiles"
import { loadCommands, normalizeCommands, saveCommands } from "../modules/storage/commandStore"
import { loadConfig, normalizeConfig, saveConfig } from "../modules/storage/configStore"
import { createProfile, parseProfile } from "../modules/storage/profileStore"
import { localizeText } from "../modules/templates/templateEngine"
import { archiveInteraction, createArchiveRecord } from "../modules/archive/archiveStore"
import {
  applyOverlayMode,
  formatShortcutLabel,
  hideOverlayWindow,
  registerOverlayShortcut,
} from "../modules/app/windowControls"

const locales: Array<{ code: LocaleCode; label: string }> = [
  { code: "zh-CN", label: "中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
]

const skillSteps = [
  {
    id: "context",
    icon: "ScanSearch",
    nameKey: "skillCommandContext",
    descriptionKey: "skillCommandContextDescription",
    promptKey: "skillPromptContext",
    enName: "Context",
    enDescription: "Collect context and constraints for this skill.",
    enPrompt: (skill: string) =>
      `You are running the ${skill} skill. First inspect the current context, identify the goal, constraints, risks, and the smallest useful next step. Do not edit yet unless the next step is obvious.`,
  },
  {
    id: "plan",
    icon: "ListTodo",
    nameKey: "skillCommandPlan",
    descriptionKey: "skillCommandPlanDescription",
    promptKey: "skillPromptPlan",
    enName: "Plan",
    enDescription: "Create a compact implementation plan.",
    enPrompt: (skill: string) =>
      `For the ${skill} skill, create a concise plan with the smallest useful steps, likely files to touch, validation commands, and risks. Then start the first safe step.`,
  },
  {
    id: "implement",
    icon: "Hammer",
    nameKey: "skillCommandImplement",
    descriptionKey: "skillCommandImplementDescription",
    promptKey: "skillPromptImplement",
    enName: "Implement",
    enDescription: "Implement the focused change.",
    enPrompt: (skill: string) =>
      `Continue the ${skill} skill and implement the next focused change. Keep the edit scoped, follow the existing code style, and explain only what matters after verification.`,
  },
  {
    id: "review",
    icon: "ShieldCheck",
    nameKey: "skillCommandReview",
    descriptionKey: "skillCommandReviewDescription",
    promptKey: "skillPromptReview",
    enName: "Review",
    enDescription: "Review the result for issues.",
    enPrompt: (skill: string) =>
      `Review the current ${skill} skill changes. Look for bugs, missing edge cases, weak UX, regressions, and missing tests. Lead with concrete findings and file references.`,
  },
  {
    id: "fix",
    icon: "Wrench",
    nameKey: "skillCommandFix",
    descriptionKey: "skillCommandFixDescription",
    promptKey: "skillPromptFix",
    enName: "Fix",
    enDescription: "Fix issues found during review.",
    enPrompt: (skill: string) =>
      `For the ${skill} skill, fix the issues just found with the smallest safe changes. Then run or explain the most relevant validation.`,
  },
  {
    id: "handoff",
    icon: "FileCheck2",
    nameKey: "skillCommandHandoff",
    descriptionKey: "skillCommandHandoffDescription",
    promptKey: "skillPromptHandoff",
    enName: "Handoff",
    enDescription: "Summarize status and next actions.",
    enPrompt: (skill: string) =>
      `Summarize the ${skill} skill work: what changed, what was verified, what remains risky, and the next best action. Keep it concise and actionable.`,
  },
]

const defaultAgentSkillPacks = [
  {
    packId: "codex-default",
    skillNameKey: "codexDefaultSkillPackName",
    targetId: "codex",
    targetNameHint: "codex",
  },
  {
    packId: "cc-default",
    skillNameKey: "ccDefaultSkillPackName",
    targetId: "claude-code",
    targetNameHint: "claude",
  },
  {
    packId: "cursor-default",
    skillNameKey: "cursorDefaultSkillPackName",
    targetId: "cursor",
    targetNameHint: "cursor",
  },
]

const tmuxSnapshotDelayMs = 5000

export function OverlayWindow() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<AppConfig>(() => loadConfig())
  const [commands, setCommands] = useState<CommandItem[]>(() => loadCommands())
  const [activeCategory, setActiveCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [selectedCommandId, setSelectedCommandId] = useState(commands[0]?.id ?? "")
  const [logs, setLogs] = useState<RunLog[]>([])
  const [pendingRisk, setPendingRisk] = useState<{
    command: CommandItem
    content: string
    reason: string
    targetAppName?: string
  } | null>(null)
  const [pendingTemplateCommand, setPendingTemplateCommand] = useState<CommandItem | null>(null)
  const [shortcutError, setShortcutError] = useState<string | null>(null)

  useEffect(() => {
    let cleanup: () => void = () => undefined
    setShortcutError(null)

    registerOverlayShortcut(config.globalShortcut, setShortcutError).then((dispose) => {
      cleanup = dispose
    })

    return () => cleanup()
  }, [config.globalShortcut])

  useEffect(() => {
    i18n.changeLanguage(config.locale)
    saveConfig(config)
  }, [config, i18n])

  useEffect(() => {
    saveCommands(commands)
  }, [commands])

  useEffect(() => {
    if (commands.length === 0) {
      setCommands(defaultCommands)
      setSelectedCommandId(defaultCommands[0]?.id ?? "")
      return
    }

    if (!commands.some((command) => command.id === selectedCommandId)) {
      setSelectedCommandId(commands[0]?.id ?? "")
    }
  }, [commands, selectedCommandId])

  useEffect(() => {
    applyOverlayMode(config.compactMode).catch((error) => {
      console.warn("Failed to apply overlay mode", error)
    })
  }, [config.compactMode])

  const locale = config.locale
  const shortcutLabel = formatShortcutLabel(config.globalShortcut)
  const activeTarget = config.targets.find((target) => target.id === config.activeTargetId) ?? config.targets[0]
  const codexSession =
    config.targets.find((target) => target.id === "codex")?.tmuxSessionName ?? "codex"
  const ccSession =
    config.targets.find((target) => target.id === "claude-code")?.tmuxSessionName ?? "cc"
  const cursorAppName =
    config.targets.find((target) => target.id === "cursor")?.appName ?? "Cursor"
  const selectedCommand =
    commands.find((command) => command.id === selectedCommandId) ?? commands[0]
  const selectedCommandTarget = selectedCommand ? resolveCommandTarget(selectedCommand) : activeTarget

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const activeSkillGroup = activeCategory.startsWith("skill:")
      ? activeCategory.slice("skill:".length)
      : null
    return commands.filter((command) => {
      const name = localizeText(command.name, locale)
      const description = localizeText(command.description, locale)
      const content = localizeText(command.content, locale)
      const skillGroup = command.skillGroup ?? ""
      const matchesCategory =
        activeCategory === "all" ||
        (activeSkillGroup ? skillGroup === activeSkillGroup : command.category === activeCategory)
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${name} ${description} ${content} ${skillGroup}`.toLowerCase().includes(normalizedQuery)
      return matchesCategory && matchesQuery
    })
  }, [activeCategory, commands, locale, query])

  const compactCommands = useMemo(() => {
    const pinnedCommands = commands.filter((command) => command.compactPinned)
    return (pinnedCommands.length > 0 ? pinnedCommands : filteredCommands).slice(0, 8)
  }, [commands, filteredCommands])

  function addLog(log: Omit<RunLog, "id" | "createdAt">): RunLog {
    const runLog = { ...log, id: crypto.randomUUID(), createdAt: Date.now() }
    setLogs((current) => [runLog, ...current])
    return runLog
  }

  function archiveCommandRun(
    command: CommandItem,
    target: AgentTarget,
    log: RunLog,
    kind: ArchiveRecord["kind"] = "prompt",
    parentId?: string,
  ) {
    const record = createArchiveRecord({
      command,
      kind,
      target,
      locale,
      log,
      parentId,
    })

    archiveInteraction(record).catch((error) => {
      addLog({
        commandName: "yukun Archive",
        targetName: "Local",
        status: "error",
        message: String(error),
        content: log.content,
      })
    })
  }

  function scheduleTmuxSnapshotArchive(command: CommandItem, target: AgentTarget, parentLog: RunLog) {
    if (target.kind !== "tmux_agent" || parentLog.status !== "success") return

    const session = target.tmuxSessionName?.trim()
    if (!session) return

    window.setTimeout(async () => {
      const snapshot = await captureTmuxPane({ session, lineCount: 240 })
      if (!snapshot?.trim()) return

      const snapshotLog = addLog({
        commandName: `${parentLog.commandName} · ${t("tmuxSnapshot")}`,
        targetName: target.name,
        status: "success",
        message: t("tmuxSnapshotArchived"),
        content: snapshot,
      })
      archiveCommandRun(command, target, snapshotLog, "tmux_snapshot", parentLog.id)
    }, tmuxSnapshotDelayMs)
  }

  function updateConfig(nextConfig: AppConfig) {
    setConfig(nextConfig)
  }

  function resolveCommandTarget(command: CommandItem) {
    if (command.targetLocked) {
      return config.targets.find((target) => target.id === command.defaultTargetId) ?? activeTarget
    }

    return activeTarget
  }

  function handleTargetChange(targetId: string, patch: Partial<AppConfig["targets"][number]>) {
    updateConfig({
      ...config,
      targets: config.targets.map((target) =>
        target.id === targetId ? { ...target, ...patch } : target,
      ),
    })
  }

  function handleCreateTarget() {
    const createdAt = Date.now()
    const target = {
      id: `target-${createdAt}`,
      name: "New Agent",
      kind: "tmux_agent" as const,
      tmuxSessionName: "agent",
      defaultAutoEnter: true,
    }
    updateConfig({
      ...config,
      activeTargetId: target.id,
      targets: [...config.targets, target],
    })
  }

  function handleDeleteTarget(targetId: string) {
    if (config.targets.length <= 1) return

    const nextTargets = config.targets.filter((target) => target.id !== targetId)
    const fallbackTargetId = nextTargets[0]?.id ?? config.activeTargetId
    const nextActiveTargetId =
      config.activeTargetId === targetId ? fallbackTargetId : config.activeTargetId

    updateConfig({
      ...config,
      activeTargetId: nextActiveTargetId,
      targets: nextTargets,
    })

    setCommands((current) =>
      current.map((command) =>
        command.defaultTargetId === targetId
          ? { ...command, defaultTargetId: fallbackTargetId, updatedAt: Date.now() }
          : command,
      ),
    )
  }

  async function sendCommand(command: CommandItem, contentOverride?: string, skipSafety = false) {
    const commandTarget = resolveCommandTarget(command)
    if (!commandTarget) return
    if (!contentOverride && command.variables?.length) {
      setPendingTemplateCommand(command)
      return
    }

    const content = contentOverride ?? localizeText(command.content, locale)
    const riskReason = getSafetyReason(content)
    const targetRiskReason =
      commandTarget.kind === "active_window" ? "active window target" : null
    const agentStatus =
      commandTarget.kind === "tmux_agent" && commandTarget.tmuxSessionName?.trim()
        ? await getTmuxAgentStatus({
            agentKind: getAgentKindForTarget(commandTarget),
            session: commandTarget.tmuxSessionName,
          })
        : null
    const tmuxAgentRiskReason =
      agentStatus && !agentStatus.agentRunning
        ? t("agentShellRiskReason", {
            detail: agentStatus.detail,
            target: commandTarget.name,
          })
        : null

    if (
      !skipSafety &&
      (command.confirmBeforeSend || riskReason || targetRiskReason || tmuxAgentRiskReason)
    ) {
      const targetAppName =
        commandTarget.kind === "active_window" ? await getFrontmostAppName() : undefined
      setPendingRisk({
        command,
        content,
        reason: riskReason ?? targetRiskReason ?? tmuxAgentRiskReason ?? "manual confirmation",
        targetAppName,
      })
      return
    }

    const result = await dispatchCommand({
      command,
      target: commandTarget,
      locale,
      content,
      restoreClipboard: config.restoreClipboard,
    })

    const runLog = addLog({
      commandName: localizeText(command.name, locale),
      targetName: commandTarget.name,
      status: result.status,
      message: result.message,
      content,
    })
    archiveCommandRun(command, commandTarget, runLog)
    scheduleTmuxSnapshotArchive(command, commandTarget, runLog)
  }

  function handleLocaleChange(localeCode: LocaleCode) {
    updateConfig({ ...config, locale: localeCode })
  }

  function handleCompactModeChange(compactMode: boolean) {
    updateConfig({ ...config, compactMode })
  }

  function handleCreateCommand() {
    const createdAt = Date.now()
    const activeSkillGroup = activeCategory.startsWith("skill:")
      ? activeCategory.slice("skill:".length)
      : undefined
    const command: CommandItem = {
      id: `custom-${createdAt}`,
      name: { [locale]: "新按钮", en: "New Command" },
      description: { [locale]: "自定义 Prompt 按钮", en: "Custom prompt button" },
      category: activeSkillGroup ? "skill" : "project",
      skillGroup: activeSkillGroup,
      icon: "Sparkles",
      defaultTargetId: config.activeTargetId,
      sendMode: "tmux_send_keys",
      content: { [locale]: "请输入 Prompt 内容。", en: "Write your prompt here." },
      autoEnter: activeTarget?.defaultAutoEnter ?? true,
      confirmBeforeSend: false,
      createdAt,
      updatedAt: createdAt,
    }
    setCommands((current) => [command, ...current])
    setSelectedCommandId(command.id)
  }

  function handleDuplicateCommand(commandId: string) {
    const command = commands.find((item) => item.id === commandId)
    if (!command) return

    const createdAt = Date.now()
    const copy: CommandItem = {
      ...command,
      id: `${command.id}-copy-${createdAt}`,
      name: {
        ...command.name,
        [locale]: `${localizeText(command.name, locale)} ${t("copySuffix")}`,
        en:
          locale === "en"
            ? `${localizeText(command.name, locale)} ${t("copySuffix")}`
            : `${localizeText(command.name, "en")} Copy`,
      },
      createdAt,
      updatedAt: createdAt,
    }

    setCommands((current) => {
      const index = current.findIndex((item) => item.id === commandId)
      if (index === -1) return [copy, ...current]
      const next = [...current]
      next.splice(index + 1, 0, copy)
      return next
    })
    setSelectedCommandId(copy.id)
    addLog({
      commandName: t("duplicateCommand"),
      targetName: "Local",
      status: "success",
      message: t("commandDuplicated"),
      content: localizeText(command.name, locale),
    })
  }

  function handleCreateSkillGroup(skillGroupName: string) {
    const name = skillGroupName.trim() || t("defaultSkillGroupName")
    const existingGroup = commands.find(
      (command) => command.skillGroup?.trim().toLowerCase() === name.toLowerCase(),
    )

    if (existingGroup) {
      setActiveCategory(`skill:${existingGroup.skillGroup}`)
      setSelectedCommandId(existingGroup.id)
      setQuery("")
      addLog({
        commandName: t("createSkillGroup"),
        targetName: "Local",
        status: "blocked",
        message: t("skillGroupAlreadyExists", { skill: existingGroup.skillGroup }),
        content: existingGroup.skillGroup ?? name,
      })
      return
    }

    const createdAt = Date.now()
    const skillCommands: CommandItem[] = [
      {
        id: `skill-${createdAt}-context`,
        name: { [locale]: t("skillCommandContext", { skill: name }), en: `${name}: Context` },
        description: {
          [locale]: t("skillCommandContextDescription"),
          en: "Collect context and constraints for this skill.",
        },
        category: "skill",
        skillGroup: name,
        icon: "ScanSearch",
        defaultTargetId: config.activeTargetId,
        sendMode: "tmux_send_keys",
        content: {
          [locale]: t("skillPromptContext", { skill: name }),
          en: `You are running the ${name} skill. First inspect the current context, identify the goal, constraints, risks, and the smallest useful next step. Do not edit yet unless the next step is obvious.`,
        },
        autoEnter: activeTarget?.defaultAutoEnter ?? true,
        confirmBeforeSend: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `skill-${createdAt}-plan`,
        name: { [locale]: t("skillCommandPlan", { skill: name }), en: `${name}: Plan` },
        description: {
          [locale]: t("skillCommandPlanDescription"),
          en: "Create a compact implementation plan.",
        },
        category: "skill",
        skillGroup: name,
        icon: "ListTodo",
        defaultTargetId: config.activeTargetId,
        sendMode: "tmux_send_keys",
        content: {
          [locale]: t("skillPromptPlan", { skill: name }),
          en: `For the ${name} skill, create a concise plan with the smallest useful steps, likely files to touch, validation commands, and risks. Then start the first safe step.`,
        },
        autoEnter: activeTarget?.defaultAutoEnter ?? true,
        confirmBeforeSend: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `skill-${createdAt}-implement`,
        name: { [locale]: t("skillCommandImplement", { skill: name }), en: `${name}: Implement` },
        description: {
          [locale]: t("skillCommandImplementDescription"),
          en: "Implement the focused change.",
        },
        category: "skill",
        skillGroup: name,
        icon: "Hammer",
        defaultTargetId: config.activeTargetId,
        sendMode: "tmux_send_keys",
        content: {
          [locale]: t("skillPromptImplement", { skill: name }),
          en: `Continue the ${name} skill and implement the next focused change. Keep the edit scoped, follow the existing code style, and explain only what matters after verification.`,
        },
        autoEnter: activeTarget?.defaultAutoEnter ?? true,
        confirmBeforeSend: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `skill-${createdAt}-review`,
        name: { [locale]: t("skillCommandReview", { skill: name }), en: `${name}: Review` },
        description: {
          [locale]: t("skillCommandReviewDescription"),
          en: "Review the result for issues.",
        },
        category: "skill",
        skillGroup: name,
        icon: "ShieldCheck",
        defaultTargetId: config.activeTargetId,
        sendMode: "tmux_send_keys",
        content: {
          [locale]: t("skillPromptReview", { skill: name }),
          en: `Review the current ${name} skill changes. Look for bugs, missing edge cases, weak UX, regressions, and missing tests. Lead with concrete findings and file references.`,
        },
        autoEnter: activeTarget?.defaultAutoEnter ?? true,
        confirmBeforeSend: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `skill-${createdAt}-fix`,
        name: { [locale]: t("skillCommandFix", { skill: name }), en: `${name}: Fix` },
        description: {
          [locale]: t("skillCommandFixDescription"),
          en: "Fix issues found during review.",
        },
        category: "skill",
        skillGroup: name,
        icon: "Wrench",
        defaultTargetId: config.activeTargetId,
        sendMode: "tmux_send_keys",
        content: {
          [locale]: t("skillPromptFix", { skill: name }),
          en: `For the ${name} skill, fix the issues just found with the smallest safe changes. Then run or explain the most relevant validation.`,
        },
        autoEnter: activeTarget?.defaultAutoEnter ?? true,
        confirmBeforeSend: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `skill-${createdAt}-handoff`,
        name: { [locale]: t("skillCommandHandoff", { skill: name }), en: `${name}: Handoff` },
        description: {
          [locale]: t("skillCommandHandoffDescription"),
          en: "Summarize status and next actions.",
        },
        category: "skill",
        skillGroup: name,
        icon: "FileCheck2",
        defaultTargetId: config.activeTargetId,
        sendMode: "tmux_send_keys",
        content: {
          [locale]: t("skillPromptHandoff", { skill: name }),
          en: `Summarize the ${name} skill work: what changed, what was verified, what remains risky, and the next best action. Keep it concise and actionable.`,
        },
        autoEnter: activeTarget?.defaultAutoEnter ?? true,
        confirmBeforeSend: false,
        createdAt,
        updatedAt: createdAt,
      },
    ]

    setCommands((current) => [...skillCommands, ...current])
    setSelectedCommandId(skillCommands[0]?.id ?? "")
    setActiveCategory(`skill:${name}`)
    setQuery("")
    addLog({
      commandName: t("createSkillGroup"),
      targetName: "Local",
      status: "success",
      message: t("skillGroupCreated", { count: skillCommands.length, skill: name }),
      content: name,
    })
  }

  function buildTargetSkillPack(options: {
    skillGroupName: string
    skillPackId: string
    target: AppConfig["targets"][number]
    createdAt: number
  }): CommandItem[] {
    const sendMode = options.target.kind === "tmux_agent" ? "tmux_send_keys" : "paste"

    return skillSteps.map((step) => ({
      id: `skill-${options.createdAt}-${options.target.id}-${step.id}`,
      name: {
        [locale]: t(step.nameKey, { skill: options.skillGroupName }),
        en: `${options.skillGroupName}: ${step.enName}`,
      },
      description: {
        [locale]: t(step.descriptionKey),
        en: step.enDescription,
      },
      category: "skill",
      skillGroup: options.skillGroupName,
      skillPackId: options.skillPackId,
      icon: step.icon,
      defaultTargetId: options.target.id,
      targetLocked: true,
      sendMode,
      content: {
        [locale]: t(step.promptKey, { skill: options.skillGroupName }),
        en: step.enPrompt(options.skillGroupName),
      },
      autoEnter: options.target.defaultAutoEnter,
      confirmBeforeSend: false,
      createdAt: options.createdAt,
      updatedAt: options.createdAt,
    }))
  }

  function findTargetForDefaultPack(targetId: string, nameHint: string) {
    return (
      config.targets.find((target) => target.id === targetId) ??
      config.targets.find((target) => target.name.toLowerCase().includes(nameHint))
    )
  }

  function hasDefaultSkillPack(packId: string, skillGroupName: string) {
    return commands.some((command) => {
      const matchesPackId = command.skillPackId === packId
      const matchesLegacyGroup = command.skillGroup === skillGroupName
      return matchesPackId || matchesLegacyGroup
    })
  }

  function handleCreateDefaultAgentSkillPacks() {
    const createdAt = Date.now()
    const packTargets = defaultAgentSkillPacks
      .map((pack) => ({
        ...pack,
        skillGroupName: t(pack.skillNameKey),
        target: findTargetForDefaultPack(pack.targetId, pack.targetNameHint),
      }))
      .filter(
        (
          pack,
        ): pack is (typeof defaultAgentSkillPacks)[number] & {
          skillGroupName: string
          target: AppConfig["targets"][number]
        } => Boolean(pack.target),
      )

    if (packTargets.length === 0) {
      addLog({
        commandName: t("createDefaultAgentSkillPacks"),
        targetName: "Local",
        status: "blocked",
        message: t("defaultAgentSkillPacksMissingTargets"),
        content: "Codex CLI / Claude Code / Cursor",
      })
      return
    }

    const missingPackTargets = packTargets.filter(
      (pack) => !hasDefaultSkillPack(pack.packId, pack.skillGroupName),
    )
    const skippedPackTargets = packTargets.filter((pack) =>
      hasDefaultSkillPack(pack.packId, pack.skillGroupName),
    )

    if (missingPackTargets.length === 0) {
      const firstExistingPack = skippedPackTargets[0]
      if (firstExistingPack) {
        const firstCommand = commands.find(
          (command) =>
            command.skillPackId === firstExistingPack.packId ||
            command.skillGroup === firstExistingPack.skillGroupName,
        )
        setActiveCategory(`skill:${firstCommand?.skillGroup ?? firstExistingPack.skillGroupName}`)
        setSelectedCommandId(firstCommand?.id ?? selectedCommandId)
        setQuery("")
      }

      addLog({
        commandName: t("createDefaultAgentSkillPacks"),
        targetName: "Local",
        status: "blocked",
        message: t("defaultAgentSkillPacksAlreadyExist"),
        content: skippedPackTargets.map((pack) => pack.skillGroupName).join("\n"),
      })
      return
    }

    const skillCommands = missingPackTargets.flatMap((pack, index) =>
      buildTargetSkillPack({
        skillGroupName: pack.skillGroupName,
        skillPackId: pack.packId,
        target: pack.target,
        createdAt: createdAt + index,
      }),
    )

    setCommands((current) => [...skillCommands, ...current])
    setSelectedCommandId(skillCommands[0]?.id ?? "")
    setActiveCategory(`skill:${missingPackTargets[0].skillGroupName}`)
    setQuery("")
    addLog({
      commandName: t("createDefaultAgentSkillPacks"),
      targetName: "Local",
      status: "success",
      message:
        skippedPackTargets.length > 0
          ? t("defaultAgentSkillPacksCreatedWithSkipped", {
              count: skillCommands.length,
              createdPacks: missingPackTargets.length,
              skippedPacks: skippedPackTargets.length,
            })
          : t("defaultAgentSkillPacksCreated", {
              count: skillCommands.length,
              packs: missingPackTargets.length,
            }),
      content: [
        ...missingPackTargets.map((pack) => `${pack.skillGroupName} -> ${pack.target.name}`),
        ...skippedPackTargets.map((pack) => `${t("skipped")} ${pack.skillGroupName}`),
      ].join("\n"),
    })
  }

  function handleSaveCommand(updatedCommand: CommandItem) {
    setCommands((current) =>
      current.map((command) => (command.id === updatedCommand.id ? updatedCommand : command)),
    )
  }

  function handleMoveCommand(commandId: string, direction: "up" | "down") {
    setCommands((current) => {
      const index = current.findIndex((command) => command.id === commandId)
      if (index === -1) return current

      const nextIndex = direction === "up" ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= current.length) return current

      const next = [...current]
      const [command] = next.splice(index, 1)
      next.splice(nextIndex, 0, { ...command, updatedAt: Date.now() })
      return next
    })
  }

  function handleDeleteCommand(commandId: string) {
    if (commands.length <= 1) {
      addLog({
        commandName: "yukun Commands",
        targetName: "Local",
        status: "blocked",
        message: "At least one command is required.",
        content: commandId,
      })
      return
    }

    setCommands((current) => {
      const next = current.filter((command) => command.id !== commandId)
      setSelectedCommandId(next[0]?.id ?? "")
      return next
    })
  }

  function handleExportCommands() {
    const blob = new Blob([JSON.stringify(commands, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "yukun-commands.json"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleImportCommands(importedCommands: CommandItem[]) {
    const normalizedCommands = normalizeCommands(importedCommands)
    setCommands(normalizedCommands)
    setSelectedCommandId(normalizedCommands[0]?.id ?? "")
    addLog({
      commandName: "yukun Commands",
      targetName: "Local",
      status: "success",
      message: `Imported ${normalizedCommands.length} commands.`,
      content: "yukun-commands.json",
    })
  }

  function handleImportCommandsError(message: string, fileName?: string) {
    addLog({
      commandName: "yukun Commands",
      targetName: "Local",
      status: "error",
      message,
      content: fileName ?? "commands import",
    })
  }

  function handleResetCommands() {
    setCommands(defaultCommands)
    setSelectedCommandId(defaultCommands[0]?.id ?? "")
    setActiveCategory("all")
    setQuery("")
    addLog({
      commandName: "yukun Commands",
      targetName: "Local",
      status: "success",
      message: "Restored default commands.",
      content: "defaultCommands",
    })
  }

  function handleResetAll() {
    setConfig(defaultConfig)
    setCommands(defaultCommands)
    setSelectedCommandId(defaultCommands[0]?.id ?? "")
    setActiveCategory("all")
    setQuery("")
    setPendingRisk(null)
    setPendingTemplateCommand(null)
    addLog({
      commandName: "yukun",
      targetName: "Local",
      status: "success",
      message: "Restored default settings and commands.",
      content: "defaultConfig + defaultCommands",
    })
  }

  async function handleTestTarget(targetId: string) {
    const target = config.targets.find((item) => item.id === targetId)
    if (!target) return

    if (target.kind === "active_window" && !window.confirm(t("targetTestActiveWindowConfirm"))) {
      addLog({
        commandName: t("testTarget"),
        targetName: target.name,
        status: "blocked",
        message: t("targetTestBlocked"),
        content: target.name,
      })
      return
    }

    const createdAt = Date.now()
    const content = t("targetTestContent", {
      target: target.name,
      time: new Date(createdAt).toLocaleTimeString(locale),
    })
    const testCommand: CommandItem = {
      id: `target-test-${createdAt}`,
      name: { [locale]: t("testTarget"), en: "Test Target" },
      description: { [locale]: t("targetTestDescription"), en: "Send a short test message." },
      category: "project",
      icon: "Radio",
      defaultTargetId: target.id,
      sendMode: target.kind === "tmux_agent" ? "tmux_send_keys" : "paste",
      content: { [locale]: content, en: content },
      autoEnter: false,
      confirmBeforeSend: false,
      createdAt,
      updatedAt: createdAt,
    }

    const result = await dispatchCommand({
      command: testCommand,
      target,
      locale,
      content,
      restoreClipboard: config.restoreClipboard,
    })

    const runLog = addLog({
      commandName: t("testTarget"),
      targetName: target.name,
      status: result.status,
      message: result.message,
      content,
    })
    archiveCommandRun(testCommand, target, runLog)
    scheduleTmuxSnapshotArchive(testCommand, target, runLog)
  }

  function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleExportProfile() {
    downloadJson("yukun-profile.json", createProfile(config, commands))
  }

  async function handleImportProfile(file: File | undefined) {
    if (!file) return

    try {
      const profile = parseProfile(await file.text())
      setConfig(normalizeConfig(profile.config))
      const normalizedCommands = normalizeCommands(profile.commands)
      setCommands(normalizedCommands)
      setSelectedCommandId(normalizedCommands[0]?.id ?? "")
      addLog({
        commandName: "yukun Profile",
        targetName: "Local",
        status: "success",
        message: `Imported ${profile.commands.length} commands and ${profile.config.targets.length} targets.`,
        content: file.name,
      })
    } catch (error) {
      addLog({
        commandName: "yukun Profile",
        targetName: "Local",
        status: "error",
        message: String(error),
        content: file.name,
      })
    }
  }

  return (
    <main className="h-screen w-screen bg-transparent p-3">
      {config.compactMode ? (
        <div className="flex h-full w-20 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur">
          <div className="drag-region flex h-12 items-center justify-center border-b border-neutral-200">
            <div className="rounded-md bg-neutral-950 px-2 py-1 text-xs font-semibold text-white">AD</div>
          </div>
          <div className="no-drag flex flex-col items-center gap-2 border-b border-neutral-200 p-2">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-950"
              onClick={() => handleCompactModeChange(false)}
              title={t("expandMode")}
              type="button"
            >
              <Maximize2 size={16} />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-950"
              onClick={() => hideOverlayWindow()}
              title={t("hideWindow")}
              type="button"
            >
              <EyeOff size={16} />
            </button>
          </div>
          <div className="no-drag border-b border-neutral-200 p-2">
            <div
              className="truncate rounded-md bg-neutral-100 px-2 py-1 text-center text-[10px] font-semibold text-neutral-600"
              title={activeTarget?.name}
            >
              {activeTarget?.name.slice(0, 3)}
            </div>
          </div>
          <div className="no-drag min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {compactCommands.map((command) => {
              const name = localizeText(command.name, locale)
              const commandTarget = resolveCommandTarget(command)
              return (
                <button
                  className="flex h-10 w-full items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-800 hover:border-neutral-300 hover:bg-white"
                  key={command.id}
                  onClick={() => sendCommand(command)}
                  title={`${name} -> ${commandTarget?.name}`}
                  type="button"
                >
                  {name.slice(0, 1)}
                </button>
              )
            })}
            {compactCommands.length === 0 ? (
              <button
                className="flex h-10 w-full items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-500"
                onClick={() => handleCompactModeChange(false)}
                type="button"
              >
                …
              </button>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="flex h-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100/95 shadow-2xl backdrop-blur">
        <Sidebar
          activeCategory={activeCategory}
          commands={commands}
          locale={locale}
          onCategoryChange={setActiveCategory}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="drag-region border-b border-neutral-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-neutral-950">yukun</h1>
                <p className="truncate text-[11px] text-neutral-500">AI Overlay Control Shell</p>
              </div>
              <div className="no-drag flex items-center gap-2">
                <button
                  className="hidden h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-600 lg:flex"
                  title={t("shortcutHint", { shortcut: shortcutLabel })}
                  type="button"
                >
                  <Keyboard size={14} />
                  {shortcutLabel}
                </button>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
                  onClick={() => handleCompactModeChange(true)}
                  title={t("compactMode")}
                  type="button"
                >
                  <Minimize2 size={15} />
                </button>
                <TargetSelector
                  activeTargetId={config.activeTargetId}
                  targets={config.targets}
                  onChange={(targetId) => updateConfig({ ...config, activeTargetId: targetId })}
                />
                <select
                  className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 outline-none"
                  value={config.locale}
                  onChange={(event) => handleLocaleChange(event.target.value as LocaleCode)}
                >
                  {locales.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-950"
                  onClick={() => hideOverlayWindow()}
                  title={t("hideWindow")}
                  type="button"
                >
                  <EyeOff size={15} />
                </button>
              </div>
            </div>
            <div className="no-drag mt-3 flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2">
              <Search size={15} className="text-neutral-400" />
              <input
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                placeholder={t("search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="min-w-0 flex-1 overflow-y-auto p-3">
              <SetupChecklist
                ccSession={ccSession}
                codexSession={codexSession}
                cursorAppName={cursorAppName}
              />
              <div className="mb-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs leading-5 text-neutral-600">
                <div>{t("mvpNotice")}</div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {t("shortcutHint", { shortcut: shortcutLabel })}
                </div>
                {shortcutError ? (
                  <div className="mt-1 text-[11px] text-amber-700">
                    {t("shortcutError", { message: shortcutError })}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                {filteredCommands.map((command) => (
                  <CommandButton
                    command={command}
                    key={command.id}
                    locale={locale}
                    selected={command.id === selectedCommand?.id}
                    onSelect={() => setSelectedCommandId(command.id)}
                    onSend={() => sendCommand(command)}
                  />
                ))}
                {filteredCommands.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-center">
                    <p className="text-sm font-semibold text-neutral-800">{t("emptyCommands")}</p>
                    <p className="mt-1 text-xs text-neutral-500">{t("emptyCommandsHint")}</p>
                    <button
                      className="mt-3 h-8 rounded-md bg-neutral-950 px-3 text-xs font-semibold text-white"
                      onClick={handleResetCommands}
                      type="button"
                    >
                      {t("resetCommands")}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-neutral-50/80 p-3 md:flex">
              <section className="mb-4 rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-neutral-800">
                  <Settings2 size={14} />
                  {t("preview")}
                </div>
                {selectedCommand ? (
                  <>
                    <h2 className="text-sm font-semibold text-neutral-950">
                      {localizeText(selectedCommand.name, locale)}
                    </h2>
                    <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-neutral-600">
                      {localizeText(selectedCommand.content, locale)}
                    </p>
                    <button
                      className="mt-3 h-8 w-full rounded-md bg-neutral-950 px-3 text-xs font-semibold text-white"
                      onClick={() => sendCommand(selectedCommand)}
                      type="button"
                    >
                      {t("send")} · {selectedCommandTarget?.name}
                    </button>
                  </>
                ) : null}
              </section>

              <AgentSessionManager targets={config.targets} />

              <CommandEditor
                commands={commands}
                globalShortcut={config.globalShortcut}
                compactMode={config.compactMode}
                locale={locale}
                restoreClipboard={config.restoreClipboard}
                selectedCommand={selectedCommand}
                targets={config.targets}
                onCreateCommand={handleCreateCommand}
                onCreateDefaultAgentSkillPacks={handleCreateDefaultAgentSkillPacks}
                onCreateSkillGroup={handleCreateSkillGroup}
                onDeleteCommand={handleDeleteCommand}
                onCreateTarget={handleCreateTarget}
                onDeleteTarget={handleDeleteTarget}
                onDuplicateCommand={handleDuplicateCommand}
                onExportCommands={handleExportCommands}
                onExportProfile={handleExportProfile}
                onImportCommands={handleImportCommands}
                onImportCommandsError={handleImportCommandsError}
                onImportProfile={handleImportProfile}
                onMoveCommand={handleMoveCommand}
                onResetAll={handleResetAll}
                onResetCommands={handleResetCommands}
                onSaveCommand={handleSaveCommand}
                onToggleRestoreClipboard={(restoreClipboard) =>
                  updateConfig({ ...config, restoreClipboard })
                }
                onToggleCompactMode={handleCompactModeChange}
                onTestTarget={handleTestTarget}
                onUpdateGlobalShortcut={(globalShortcut) =>
                  updateConfig({ ...config, globalShortcut })
                }
                onUpdateTarget={handleTargetChange}
              />
            </aside>
          </div>

          <LogPanel logs={logs} />
        </section>
      </div>
      )}

      {pendingRisk ? (
        <div className="fixed inset-0 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-950">{t("riskTitle")}</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-600">
                  {t("riskBody", { reason: pendingRisk.reason })}
                </p>
                {pendingRisk.targetAppName ? (
                  <p className="mt-1 text-xs font-medium text-neutral-800">
                    {t("willSendToApp", { app: pendingRisk.targetAppName })}
                  </p>
                ) : null}
              </div>
            </div>
            <pre className="mt-3 max-h-32 overflow-y-auto rounded-md bg-neutral-50 p-2 text-[11px] leading-5 text-neutral-700">
              {pendingRisk.content}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-semibold text-neutral-700"
                onClick={() => setPendingRisk(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                className="h-8 rounded-md bg-neutral-950 px-3 text-xs font-semibold text-white"
                onClick={() => {
                  const command = pendingRisk.command
                  setPendingRisk(null)
                  sendCommand(command, pendingRisk.content, true)
                }}
                type="button"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingTemplateCommand ? (
        <TemplateVariableDialog
          command={pendingTemplateCommand}
          locale={locale}
          onCancel={() => setPendingTemplateCommand(null)}
          onSubmit={(content) => {
            const command = pendingTemplateCommand
            setPendingTemplateCommand(null)
            sendCommand(command, content)
          }}
        />
      ) : null}
    </main>
  )
}
