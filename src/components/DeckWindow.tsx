import {
  AlertTriangle,
  BookOpen,
  Bug,
  Cable,
  CheckCircle2,
  ChevronDown,
  Code2,
  Command,
  Copy,
  Database,
  Download,
  FileText,
  GitCommit,
  Globe,
  GripVertical,
  KeyRound,
  Languages,
  Layout,
  ListChecks,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Play,
  RefreshCw,
  RotateCcw,
  Rocket,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  TerminalSquare,
  TestTube2,
  ChevronsDown,
  ChevronsUp,
  Trash2,
  Upload,
  Wrench,
  XCircle,
} from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent } from "react"
import { useTranslation } from "react-i18next"
import { defaultCommands } from "../data/defaultCommands"
import { deckTargets } from "../data/deckTargets"
import type { CommandItem, LocaleCode, LocalizedText, SendMode } from "../modules/command-router/types"
import type {
  BlockReason,
  DispatchCommandResponse,
  RouterStage,
  StartupCheckItem,
  StartupReadiness,
  TargetConfig,
  TargetCapability,
} from "../modules/contracts/agentDeck"
import {
  capturePane,
  copyModelAccountSecret,
  deleteModelAccountSecret,
  dispatchCommand,
  quitAgentDeck,
  restartAgentDeck,
  saveModelAccountSecret,
} from "../modules/contracts/invokeApi"
import {
  getTmuxAgentStatus,
  runTmuxAccountCommand,
  startTmuxAgent,
  stopTmuxAgent,
  type TmuxAgentStatus,
} from "../modules/adapters/tmuxAdapter"
import {
  installMagneticSnap,
  restoreWindowPlacement,
  snapWindowToRightEdge,
} from "../modules/app/magneticSnap"
import { runSetupCheck } from "../modules/setup/setupCheck"
import {
  getDeletedCommandIdsFor,
  loadCommands,
  loadDeletedCommandIds,
  saveCommands,
  saveDeletedCommandIds,
} from "../modules/storage/commandStore"
import { loadConfig, normalizeConfig, saveConfig } from "../modules/storage/configStore"
import { createDeckProfile, parseDeckProfile } from "../modules/storage/deckProfileStore"
import {
  createModelAccount,
  loadActiveModelAccountId,
  loadModelAccounts,
  modelAccountToTarget,
  providerLabel,
  saveActiveModelAccountId,
  saveModelAccounts,
  type ModelAccount,
  type ModelAccountProvider,
} from "../modules/storage/modelAccountStore"
import {
  defaultTileLayoutById,
  loadTileLayouts,
  normalizeTileLayouts,
  saveTileLayouts,
  type TileLayoutItem,
  type TileSize,
} from "../modules/storage/deckLayoutStore"
import { createSkillPackExport, parseSkillPack } from "../modules/storage/skillPackStore"

const locales: Array<{ code: LocaleCode; label: string; shortLabel: string }> = [
  { code: "zh-CN", label: "中文", shortLabel: "中文" },
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ja", label: "日本語", shortLabel: "日" },
  { code: "ko", label: "한국어", shortLabel: "한" },
  { code: "de", label: "Deutsch", shortLabel: "DE" },
  { code: "fr", label: "Français", shortLabel: "FR" },
]

const iconMap = {
  BookOpen,
  Bug,
  Cable,
  Code: Code2,
  Component: Code2,
  Database,
  FileTree: FileText,
  GitCommit,
  Globe,
  Languages,
  Layout,
  ListChecks,
  PackagePlus,
  PanelsTopLeft: Layout,
  Play,
  Rocket,
  Search,
  Sparkles,
  Terminal,
  TestTube: TestTube2,
  Wrench,
}

const checkLabels: Record<string, string> = {
  accessibility: "Accessibility",
  brew: "Homebrew",
  cargo: "Cargo",
  cursor_app: "Cursor",
  desktop: "Desktop runtime",
  osascript: "AppleScript",
  pbcopy: "pbcopy",
  pbpaste: "pbpaste",
  rustc: "Rust compiler",
  tmux: "tmux",
  tmux_cc: "Claude Code session",
  tmux_codex: "Codex session",
}

const blockLabels: Record<BlockReason, string> = {
  curl_pipe_shell: "curl | shell",
  destructive_delete: "delete command",
  long_prompt: "long prompt",
  rm_rf: "rm -rf",
  sudo: "sudo",
  unknown: "unknown risk",
}

const routerStages: RouterStage[] = [
  { id: "react_ui", label: "Trigger", detail: "React UI" },
  { id: "rust_command", label: "Validate", detail: "Rust Command" },
  { id: "router", label: "Route", detail: "Command Router" },
  { id: "target", label: "Execute", detail: "Target" },
]

const desktopLaunchCommand = [
  "cd path/to/yukun",
  "npm run setup:sessions",
  "npm run tauri dev",
].join("\n")

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window
}

const skillPackSteps = [
  {
    id: "context",
    icon: "Search",
    nameKey: "skillCommandContext",
    descriptionKey: "skillCommandContextDescription",
    promptKey: "skillPromptContext",
    size: "medium" as TileSize,
  },
  {
    id: "plan",
    icon: "ListChecks",
    nameKey: "skillCommandPlan",
    descriptionKey: "skillCommandPlanDescription",
    promptKey: "skillPromptPlan",
    size: "medium" as TileSize,
  },
  {
    id: "implement",
    icon: "Code",
    nameKey: "skillCommandImplement",
    descriptionKey: "skillCommandImplementDescription",
    promptKey: "skillPromptImplement",
    size: "medium" as TileSize,
  },
  {
    id: "review",
    icon: "Bug",
    nameKey: "skillCommandReview",
    descriptionKey: "skillCommandReviewDescription",
    promptKey: "skillPromptReview",
    size: "medium" as TileSize,
  },
  {
    id: "fix",
    icon: "Wrench",
    nameKey: "skillCommandFix",
    descriptionKey: "skillCommandFixDescription",
    promptKey: "skillPromptFix",
    size: "small" as TileSize,
  },
  {
    id: "handoff",
    icon: "FileTree",
    nameKey: "skillCommandHandoff",
    descriptionKey: "skillCommandHandoffDescription",
    promptKey: "skillPromptHandoff",
    size: "small" as TileSize,
  },
]

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function text(value: LocalizedText, locale: LocaleCode) {
  return value[locale] ?? value.en ?? value["zh-CN"] ?? Object.values(value)[0] ?? ""
}

function materializeContent(command: CommandItem, locale: LocaleCode) {
  let content = text(command.content, locale)

  for (const variable of command.variables ?? []) {
    content = content.split(`{{${variable.key}}}`).join(variable.defaultValue ?? "")
  }

  return content
}

function calculateReadiness(checks: StartupCheckItem[]): StartupReadiness {
  const failures = checks.filter((check) => check.status !== "ok")

  return {
    allReady: checks.length > 0 && failures.length === 0,
    failures,
    ok: checks.length - failures.length,
    total: checks.length,
  }
}

function getAgentKind(target: TargetConfig) {
  return target.agentKind ?? (target.id.includes("codex") ? "codex" : "agent")
}

function getSession(target: TargetConfig) {
  return target.kind === "tmux_agent" ? target.tmuxSession?.trim() || null : null
}

function getStatusLabel(status: TmuxAgentStatus | null) {
  if (!status) return "checking"
  if (status.status === "agent") return "running"
  if (status.status === "shell") return "shell"
  return status.status
}

function getAccountSession(account: ModelAccount) {
  if (account.provider === "cursor") return null
  return account.tmuxSession?.trim() || (account.provider === "codex" ? "codex" : "cc")
}

function getAccountLaunchCommand(account: ModelAccount) {
  if (account.provider === "cursor") return null
  return account.launchCommand?.trim() || (account.provider === "codex" ? "codex" : "claude")
}

function getAccountAuthCommand(account: ModelAccount) {
  if (account.provider === "cursor") return null
  return account.authCommand?.trim() || (account.provider === "codex" ? "codex login" : "claude auth login")
}

function getAccountAuthStatusCommand(account: ModelAccount) {
  if (account.provider === "cursor") return null
  return (
    account.authStatusCommand?.trim() ||
    (account.provider === "codex" ? "codex login status" : "claude auth status")
  )
}

function sessionSlug(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38)

  return slug || fallback
}

function uniqueTmuxSessionName(
  provider: ModelAccountProvider,
  candidate: string,
  accountName: string,
  accounts: ModelAccount[],
) {
  const usedSessions = new Set(
    accounts
      .map(getAccountSession)
      .filter((session): session is string => Boolean(session)),
  )
  const fallback = provider === "codex" ? "codex" : "cc"
  const trimmedCandidate = candidate.trim() || fallback

  if (!usedSessions.has(trimmedCandidate)) {
    return trimmedCandidate
  }

  const base = `${fallback}-${sessionSlug(accountName, "account")}`
  if (!usedSessions.has(base)) return base

  for (let index = 2; index < 100; index += 1) {
    const nextSession = `${base}-${index}`
    if (!usedSessions.has(nextSession)) return nextSession
  }

  return `${base}-${Date.now().toString(36)}`
}

interface PendingBlock {
  confirmationOnly?: boolean
  command: CommandItem
  response: DispatchCommandResponse
}

interface CommandEditDraft {
  autoEnter: boolean
  confirmBeforeSend: boolean
  content: string
  description: string
  defaultTargetId: string
  group: string
  name: string
  sendMode: SendMode
  size: TileSize
  targetLocked: boolean
}

interface ModelAccountDraft {
  appName: string
  authCommand: string
  authStatusCommand: string
  launchCommand: string
  name: string
  password: string
  provider: ModelAccountProvider
  tmuxSession: string
  username: string
}

type DeckCopyKey =
  | "accountName"
  | "authCommand"
  | "authStatus"
  | "checkAuth"
  | "checkingTmuxSession"
  | "closeWindow"
  | "commandPreview"
  | "commands"
  | "commandRouter"
  | "copyLaunchCommand"
  | "copyPassword"
  | "copySecret"
  | "createSkill"
  | "deleteAccount"
  | "deleteSkill"
  | "desktopLauncher"
  | "desktopOnly"
  | "displayText"
  | "editTileTitle"
  | "editTiles"
  | "emptySkill"
  | "group"
  | "keychainNote"
  | "keychainMissing"
  | "keychainReady"
  | "language"
  | "launchCommandCopied"
  | "loginAssist"
  | "loginPanelHint"
  | "loginStepAuth"
  | "loginStepSecret"
  | "loginStepSession"
  | "loginStepStatus"
  | "mediumTile"
  | "monitorDisabled"
  | "newTile"
  | "latestOutput"
  | "openLoginAssist"
  | "passwordOrToken"
  | "openTile"
  | "noTmuxControl"
  | "pasteMode"
  | "quitApp"
  | "quitAppConfirm"
  | "ready"
  | "renameSkill"
  | "restore"
  | "refreshOutput"
  | "restartDesktop"
  | "restartDesktopConfirm"
  | "runAuth"
  | "save"
  | "sendMode"
  | "skillManager"
  | "skillName"
  | "duplicateSkill"
  | "exportSkill"
  | "importSkill"
  | "smallTile"
  | "modelAccounts"
  | "startupCheck"
  | "stopAgent"
  | "stopCurrentAgentFirst"
  | "systemCallsSealed"
  | "target"
  | "tileSize"
  | "tmuxSession"
  | "tmuxMode"
  | "typeMode"
  | "usernameOrEmail"
  | "wideTile"

const deckCopy: Record<LocaleCode, Record<DeckCopyKey, string>> = {
  "zh-CN": {
    accountName: "账号别名",
    authCommand: "登录命令",
    authStatus: "登录状态",
    checkAuth: "状态",
    checkingTmuxSession: "正在检查 tmux 会话",
    closeWindow: "关闭窗口",
    commandPreview: "命令预览",
    commands: "指令",
    commandRouter: "目标路由",
    copyLaunchCommand: "复制启动命令",
    copyPassword: "复制密码",
    copySecret: "复制密钥",
    createSkill: "创建 Skill 包",
    deleteAccount: "删除账号",
    deleteSkill: "删除 Skill 包",
    desktopLauncher: "桌面启动器",
    desktopOnly: "仅桌面版可用",
    displayText: "显示文字",
    editTileTitle: "编辑小方块",
    editTiles: "调整小方块",
    emptySkill: "这个 Skill 包还没有指令。",
    group: "分组",
    keychainNote: "密码保存在 macOS Keychain。",
    keychainMissing: "未保存密钥",
    keychainReady: "Keychain 已保存",
    language: "语言",
    launchCommandCopied: "桌面启动命令已复制。",
    loginAssist: "登录辅助",
    loginPanelHint: "按顺序完成 session、状态、登录和 Keychain 复制。",
    loginStepAuth: "运行登录命令",
    loginStepSecret: "复制 Keychain 密码 / Token",
    loginStepSession: "确认并启动 session",
    loginStepStatus: "检查登录状态",
    mediumTile: "中",
    monitorDisabled: "监视已关闭",
    newTile: "新增小方块",
    latestOutput: "最新输出",
    openLoginAssist: "辅助",
    passwordOrToken: "密码 / Token",
    noTmuxControl: "此目标没有 tmux 控制",
    openTile: "编辑指令",
    pasteMode: "剪贴板粘贴",
    quitApp: "退出",
    quitAppConfirm: "确认退出 yukun？",
    ready: "就绪",
    renameSkill: "重命名",
    restore: "还原",
    refreshOutput: "刷新输出",
    restartDesktop: "重启桌面版",
    restartDesktopConfirm: "确认重启 yukun 桌面版？",
    runAuth: "登录",
    save: "保存",
    sendMode: "发送方式",
    skillManager: "Skill 包管理",
    skillName: "Skill 包名称",
    duplicateSkill: "复制 Skill 包",
    exportSkill: "导出 Skill 包",
    importSkill: "导入 Skill 包",
    modelAccounts: "模型账号",
    smallTile: "小",
    startupCheck: "启动检查",
    stopAgent: "停止",
    stopCurrentAgentFirst: "先停止当前 Agent？",
    systemCallsSealed: "所有系统调用都封装在 Rust Command 后面。",
    target: "目标",
    tileSize: "尺寸",
    tmuxSession: "tmux 会话",
    tmuxMode: "tmux send-keys",
    typeMode: "模拟输入",
    usernameOrEmail: "邮箱 / 用户名",
    wideTile: "宽",
  },
  en: {
    accountName: "Account name",
    authCommand: "Auth command",
    authStatus: "Auth status",
    checkAuth: "Status",
    checkingTmuxSession: "checking tmux session",
    closeWindow: "Close window",
    commandPreview: "Command preview",
    commands: "Commands",
    commandRouter: "Command Router",
    copyLaunchCommand: "Copy launch command",
    copyPassword: "Copy password",
    copySecret: "Copy secret",
    createSkill: "Create Skill Pack",
    deleteAccount: "Delete account",
    deleteSkill: "Delete Skill Pack",
    desktopLauncher: "Desktop launcher",
    desktopOnly: "Desktop only",
    displayText: "Display text",
    editTileTitle: "Edit tile",
    editTiles: "Edit tile",
    emptySkill: "This Skill pack has no commands yet.",
    group: "Group",
    keychainNote: "Passwords are stored in macOS Keychain.",
    keychainMissing: "No secret saved",
    keychainReady: "Keychain saved",
    language: "Language",
    launchCommandCopied: "Desktop launch command copied.",
    loginAssist: "Login Assist",
    loginPanelHint: "Complete session, status, login, and Keychain copy in order.",
    loginStepAuth: "Run login command",
    loginStepSecret: "Copy Keychain password / token",
    loginStepSession: "Confirm and start session",
    loginStepStatus: "Check login status",
    mediumTile: "Medium",
    monitorDisabled: "monitor disabled",
    newTile: "New tile",
    latestOutput: "Latest output",
    openLoginAssist: "Assist",
    passwordOrToken: "password / token",
    noTmuxControl: "No tmux control for this target",
    openTile: "Edit command",
    pasteMode: "Clipboard paste",
    quitApp: "Quit",
    quitAppConfirm: "Quit yukun?",
    ready: "Ready",
    renameSkill: "Rename",
    restore: "Restore",
    refreshOutput: "Refresh output",
    restartDesktop: "Restart desktop",
    restartDesktopConfirm: "Restart the yukun desktop app?",
    runAuth: "Auth",
    save: "Save",
    sendMode: "Send mode",
    skillManager: "Skill Packs",
    skillName: "Skill pack name",
    duplicateSkill: "Duplicate Skill Pack",
    exportSkill: "Export Skill Pack",
    importSkill: "Import Skill Pack",
    modelAccounts: "Model Accounts",
    smallTile: "Small",
    startupCheck: "Startup Check",
    stopAgent: "Stop",
    stopCurrentAgentFirst: "Stop current agent first?",
    systemCallsSealed: "System calls are sealed behind Rust Command.",
    target: "Target",
    tileSize: "Size",
    tmuxSession: "tmux session",
    tmuxMode: "tmux send-keys",
    typeMode: "Type",
    usernameOrEmail: "email / username",
    wideTile: "Wide",
  },
  ja: {
    accountName: "アカウント名",
    authCommand: "認証コマンド",
    authStatus: "認証状態",
    checkAuth: "状態",
    checkingTmuxSession: "tmux セッション確認中",
    closeWindow: "ウィンドウを閉じる",
    commandPreview: "コマンドプレビュー",
    commands: "指令",
    commandRouter: "ルーター",
    copyLaunchCommand: "起動コマンドをコピー",
    copyPassword: "パスワードコピー",
    copySecret: "シークレットをコピー",
    createSkill: "Skillパック作成",
    deleteAccount: "アカウント削除",
    deleteSkill: "Skillパック削除",
    desktopLauncher: "デスクトップ起動",
    desktopOnly: "デスクトップ版のみ",
    displayText: "表示名",
    editTileTitle: "タイル編集",
    editTiles: "タイルを調整",
    emptySkill: "このSkillパックにはまだ指令がありません。",
    group: "グループ",
    keychainNote: "パスワードは macOS Keychain に保存されます。",
    keychainMissing: "シークレット未保存",
    keychainReady: "Keychain保存済み",
    language: "言語",
    launchCommandCopied: "デスクトップ起動コマンドをコピーしました。",
    loginAssist: "ログイン補助",
    loginPanelHint: "session、状態、ログイン、Keychainコピーの順に進めます。",
    loginStepAuth: "ログインコマンドを実行",
    loginStepSecret: "Keychainのパスワード / Tokenをコピー",
    loginStepSession: "sessionを確認して起動",
    loginStepStatus: "認証状態を確認",
    mediumTile: "中",
    monitorDisabled: "監視は無効",
    newTile: "新規タイル",
    latestOutput: "最新出力",
    openLoginAssist: "補助",
    passwordOrToken: "パスワード / Token",
    noTmuxControl: "この対象に tmux 制御はありません",
    openTile: "指令を編集",
    pasteMode: "クリップボード貼付",
    quitApp: "終了",
    quitAppConfirm: "yukun を終了しますか？",
    ready: "準備完了",
    renameSkill: "名前変更",
    restore: "戻す",
    refreshOutput: "出力更新",
    restartDesktop: "デスクトップ再起動",
    restartDesktopConfirm: "yukun デスクトップ版を再起動しますか？",
    runAuth: "認証",
    save: "保存",
    sendMode: "送信方式",
    skillManager: "Skillパック管理",
    skillName: "Skillパック名",
    duplicateSkill: "Skillパック複製",
    exportSkill: "Skillパック書き出し",
    importSkill: "Skillパック読み込み",
    modelAccounts: "モデルアカウント",
    smallTile: "小",
    startupCheck: "起動チェック",
    stopAgent: "停止",
    stopCurrentAgentFirst: "先に現在のAgentを停止しますか？",
    systemCallsSealed: "システム呼び出しは Rust Command 経由です。",
    target: "対象",
    tileSize: "サイズ",
    tmuxSession: "tmux セッション",
    tmuxMode: "tmux send-keys",
    typeMode: "入力",
    usernameOrEmail: "メール / ユーザー名",
    wideTile: "広",
  },
  ko: {
    accountName: "계정 이름",
    authCommand: "인증 명령",
    authStatus: "인증 상태",
    checkAuth: "상태",
    checkingTmuxSession: "tmux 세션 확인 중",
    closeWindow: "창 닫기",
    commandPreview: "명령 미리보기",
    commands: "명령",
    commandRouter: "라우터",
    copyLaunchCommand: "시작 명령 복사",
    copyPassword: "비밀번호 복사",
    copySecret: "비밀값 복사",
    createSkill: "Skill 팩 만들기",
    deleteAccount: "계정 삭제",
    deleteSkill: "Skill 팩 삭제",
    desktopLauncher: "데스크톱 시작",
    desktopOnly: "데스크톱 전용",
    displayText: "표시 이름",
    editTileTitle: "타일 편집",
    editTiles: "타일 조정",
    emptySkill: "이 Skill 팩에는 아직 명령이 없습니다.",
    group: "그룹",
    keychainNote: "비밀번호는 macOS Keychain에 저장됩니다.",
    keychainMissing: "저장된 비밀값 없음",
    keychainReady: "Keychain 저장됨",
    language: "언어",
    launchCommandCopied: "데스크톱 시작 명령을 복사했습니다.",
    loginAssist: "로그인 도우미",
    loginPanelHint: "session, 상태, 로그인, Keychain 복사를 순서대로 진행합니다.",
    loginStepAuth: "로그인 명령 실행",
    loginStepSecret: "Keychain 비밀번호 / Token 복사",
    loginStepSession: "session 확인 및 시작",
    loginStepStatus: "로그인 상태 확인",
    mediumTile: "중간",
    monitorDisabled: "모니터 꺼짐",
    newTile: "새 타일",
    latestOutput: "최근 출력",
    openLoginAssist: "도우미",
    passwordOrToken: "비밀번호 / Token",
    noTmuxControl: "이 대상은 tmux 제어가 없습니다",
    openTile: "명령 편집",
    pasteMode: "클립보드 붙여넣기",
    quitApp: "종료",
    quitAppConfirm: "yukun을 종료할까요?",
    ready: "준비됨",
    renameSkill: "이름 변경",
    restore: "복원",
    refreshOutput: "출력 새로고침",
    restartDesktop: "데스크톱 재시작",
    restartDesktopConfirm: "yukun 데스크톱 앱을 재시작할까요?",
    runAuth: "인증",
    save: "저장",
    sendMode: "전송 방식",
    skillManager: "Skill 팩 관리",
    skillName: "Skill 팩 이름",
    duplicateSkill: "Skill 팩 복사",
    exportSkill: "Skill 팩 내보내기",
    importSkill: "Skill 팩 가져오기",
    modelAccounts: "모델 계정",
    smallTile: "작게",
    startupCheck: "시작 검사",
    stopAgent: "중지",
    stopCurrentAgentFirst: "현재 Agent를 먼저 중지할까요?",
    systemCallsSealed: "시스템 호출은 Rust Command 뒤에 격리됩니다.",
    target: "대상",
    tileSize: "크기",
    tmuxSession: "tmux 세션",
    tmuxMode: "tmux send-keys",
    typeMode: "입력",
    usernameOrEmail: "이메일 / 사용자명",
    wideTile: "넓게",
  },
  de: {
    accountName: "Accountname",
    authCommand: "Auth-Befehl",
    authStatus: "Auth-Status",
    checkAuth: "Status",
    checkingTmuxSession: "tmux-Sitzung prüfen",
    closeWindow: "Fenster schließen",
    commandPreview: "Befehlsvorschau",
    commands: "Befehle",
    commandRouter: "Router",
    copyLaunchCommand: "Startbefehl kopieren",
    copyPassword: "Passwort kopieren",
    copySecret: "Secret kopieren",
    createSkill: "Skill-Pack erstellen",
    deleteAccount: "Account löschen",
    deleteSkill: "Skill-Pack löschen",
    desktopLauncher: "Desktop-Starter",
    desktopOnly: "Nur Desktop",
    displayText: "Anzeigetext",
    editTileTitle: "Kachel bearbeiten",
    editTiles: "Kachel anpassen",
    emptySkill: "Dieses Skill-Pack hat noch keine Befehle.",
    group: "Gruppe",
    keychainNote: "Passwörter werden im macOS Keychain gespeichert.",
    keychainMissing: "Kein Secret gespeichert",
    keychainReady: "Keychain gespeichert",
    language: "Sprache",
    launchCommandCopied: "Desktop-Startbefehl kopiert.",
    loginAssist: "Login-Hilfe",
    loginPanelHint: "Session, Status, Login und Keychain-Kopie der Reihe nach ausführen.",
    loginStepAuth: "Login-Befehl ausführen",
    loginStepSecret: "Keychain-Passwort / Token kopieren",
    loginStepSession: "Session prüfen und starten",
    loginStepStatus: "Login-Status prüfen",
    mediumTile: "Mittel",
    monitorDisabled: "Monitor deaktiviert",
    newTile: "Neue Kachel",
    latestOutput: "Letzte Ausgabe",
    openLoginAssist: "Hilfe",
    passwordOrToken: "Passwort / Token",
    noTmuxControl: "Kein tmux-Control für dieses Ziel",
    openTile: "Befehl bearbeiten",
    pasteMode: "Clipboard-Paste",
    quitApp: "Beenden",
    quitAppConfirm: "yukun beenden?",
    ready: "Bereit",
    renameSkill: "Umbenennen",
    restore: "Zurücksetzen",
    refreshOutput: "Ausgabe aktualisieren",
    restartDesktop: "Desktop neu starten",
    restartDesktopConfirm: "yukun Desktop-App neu starten?",
    runAuth: "Auth",
    save: "Speichern",
    sendMode: "Sendemodus",
    skillManager: "Skill-Packs",
    skillName: "Skill-Pack-Name",
    duplicateSkill: "Skill-Pack duplizieren",
    exportSkill: "Skill-Pack exportieren",
    importSkill: "Skill-Pack importieren",
    modelAccounts: "Modell-Accounts",
    smallTile: "Klein",
    startupCheck: "Startprüfung",
    stopAgent: "Stoppen",
    stopCurrentAgentFirst: "Aktuellen Agent zuerst stoppen?",
    systemCallsSealed: "Systemaufrufe laufen gekapselt über Rust Command.",
    target: "Ziel",
    tileSize: "Größe",
    tmuxSession: "tmux-Sitzung",
    tmuxMode: "tmux send-keys",
    typeMode: "Tippen",
    usernameOrEmail: "E-Mail / Benutzername",
    wideTile: "Breit",
  },
  fr: {
    accountName: "Nom du compte",
    authCommand: "Commande auth",
    authStatus: "État auth",
    checkAuth: "État",
    checkingTmuxSession: "vérification tmux",
    closeWindow: "Fermer la fenêtre",
    commandPreview: "Aperçu commande",
    commands: "Commandes",
    commandRouter: "Routeur",
    copyLaunchCommand: "Copier la commande",
    copyPassword: "Copier le mot de passe",
    copySecret: "Copier le secret",
    createSkill: "Créer un pack Skill",
    deleteAccount: "Supprimer le compte",
    deleteSkill: "Supprimer le pack Skill",
    desktopLauncher: "Lanceur desktop",
    desktopOnly: "Desktop seulement",
    displayText: "Texte affiché",
    editTileTitle: "Modifier la tuile",
    editTiles: "Modifier la tuile",
    emptySkill: "Ce pack Skill n'a pas encore de commandes.",
    group: "Groupe",
    keychainNote: "Les mots de passe sont stockés dans macOS Keychain.",
    keychainMissing: "Aucun secret enregistré",
    keychainReady: "Keychain enregistré",
    language: "Langue",
    launchCommandCopied: "Commande de lancement desktop copiée.",
    loginAssist: "Assistant connexion",
    loginPanelHint: "Suivre session, état, connexion puis copie Keychain.",
    loginStepAuth: "Lancer la commande de connexion",
    loginStepSecret: "Copier le mot de passe / token Keychain",
    loginStepSession: "Vérifier et démarrer la session",
    loginStepStatus: "Vérifier l'état de connexion",
    mediumTile: "Moyen",
    monitorDisabled: "moniteur désactivé",
    newTile: "Nouvelle tuile",
    latestOutput: "Dernière sortie",
    openLoginAssist: "Aide",
    passwordOrToken: "mot de passe / token",
    noTmuxControl: "Pas de contrôle tmux pour cette cible",
    openTile: "Modifier la commande",
    pasteMode: "Coller presse-papiers",
    quitApp: "Quitter",
    quitAppConfirm: "Quitter yukun ?",
    ready: "Prêt",
    renameSkill: "Renommer",
    restore: "Restaurer",
    refreshOutput: "Actualiser la sortie",
    restartDesktop: "Redémarrer desktop",
    restartDesktopConfirm: "Redémarrer l'app desktop yukun ?",
    runAuth: "Auth",
    save: "Enregistrer",
    sendMode: "Mode d'envoi",
    skillManager: "Packs Skill",
    skillName: "Nom du pack Skill",
    duplicateSkill: "Dupliquer le pack Skill",
    exportSkill: "Exporter le pack Skill",
    importSkill: "Importer le pack Skill",
    modelAccounts: "Comptes modèle",
    smallTile: "Petit",
    startupCheck: "Vérification",
    stopAgent: "Arrêter",
    stopCurrentAgentFirst: "Arrêter l'agent actuel d'abord ?",
    systemCallsSealed: "Les appels système passent par Rust Command.",
    target: "Cible",
    tileSize: "Taille",
    tmuxSession: "session tmux",
    tmuxMode: "tmux send-keys",
    typeMode: "Saisie",
    usernameOrEmail: "email / identifiant",
    wideTile: "Large",
  },
}

const compactCommandLabels: Record<string, Partial<Record<LocaleCode, string>>> = {
  "continue-last-task": { "zh-CN": "继续", en: "Continue", ja: "続行", ko: "계속", de: "Weiter", fr: "Suite" },
  "deployment-docs": { "zh-CN": "部署", en: "Deploy", ja: "デプロイ", ko: "배포", de: "Deploy", fr: "Déployer" },
  "find-bug": { "zh-CN": "Bug", en: "Bug", ja: "Bug", ko: "Bug", de: "Bug", fr: "Bug" },
  "fix-error": { "zh-CN": "修复", en: "Fix", ja: "修正", ko: "수정", de: "Fix", fr: "Corriger" },
  "generate-component": { "zh-CN": "组件", en: "Component", ja: "部品", ko: "컴포", de: "Kompo.", fr: "Compo." },
  "generate-dashboard": { "zh-CN": "后台", en: "Dash", ja: "管理", ko: "대시", de: "Dash", fr: "Admin" },
  "generate-homepage": { "zh-CN": "首页", en: "Home", ja: "ホーム", ko: "홈", de: "Home", fr: "Accueil" },
  "generate-readme": { "zh-CN": "README", en: "README", ja: "README", ko: "README", de: "README", fr: "README" },
  "git-suggestions": { "zh-CN": "Git", en: "Git", ja: "Git", ko: "Git", de: "Git", fr: "Git" },
  "improve-ui": { "zh-CN": "UI", en: "UI", ja: "UI", ko: "UI", de: "UI", fr: "UI" },
  "inspect-project": { "zh-CN": "检查", en: "Inspect", ja: "確認", ko: "검사", de: "Prüfen", fr: "Inspecter" },
  "install-deps": { "zh-CN": "依赖", en: "Deps", ja: "依存", ko: "의존성", de: "Deps", fr: "Deps" },
  "run-tests": { "zh-CN": "测试", en: "Tests", ja: "テスト", ko: "테스트", de: "Tests", fr: "Tests" },
  "summarize-progress": { "zh-CN": "总结", en: "Summary", ja: "要約", ko: "요약", de: "Status", fr: "Résumé" },
  "terminal-build": { "zh-CN": "Build", en: "Build", ja: "Build", ko: "Build", de: "Build", fr: "Build" },
  "terminal-dev-server": { "zh-CN": "Dev", en: "Dev", ja: "Dev", ko: "Dev", de: "Dev", fr: "Dev" },
  "terminal-git-diff": { "zh-CN": "Diff", en: "Diff", ja: "Diff", ko: "Diff", de: "Diff", fr: "Diff" },
  "terminal-git-status": { "zh-CN": "状态", en: "Status", ja: "状態", ko: "상태", de: "Status", fr: "Statut" },
  "terminal-lint": { "zh-CN": "Lint", en: "Lint", ja: "Lint", ko: "Lint", de: "Lint", fr: "Lint" },
  "terminal-rg-search": { "zh-CN": "rg", en: "rg", ja: "rg", ko: "rg", de: "rg", fr: "rg" },
  "terminal-tmux-ls": { "zh-CN": "tmux", en: "tmux", ja: "tmux", ko: "tmux", de: "tmux", fr: "tmux" },
  "terminal-typecheck": { "zh-CN": "类型", en: "Types", ja: "型", ko: "타입", de: "Typen", fr: "Types" },
}

const defaultCommandById = new Map(defaultCommands.map((command) => [command.id, command]))
const emptyCommandEditDraft: CommandEditDraft = {
  autoEnter: true,
  confirmBeforeSend: false,
  content: "",
  description: "",
  defaultTargetId: "claude-code",
  group: "Main",
  name: "",
  sendMode: "tmux_send_keys",
  size: "small",
  targetLocked: false,
}

const emptyModelAccountDraft: ModelAccountDraft = {
  appName: "Cursor",
  authCommand: "claude auth login",
  authStatusCommand: "claude auth status",
  launchCommand: "claude",
  name: "",
  password: "",
  provider: "claude_code",
  tmuxSession: "cc",
  username: "",
}

const groupLabels: Record<string, Partial<Record<LocaleCode, string>>> = {
  Build: { "zh-CN": "构建", en: "Build", ja: "構築", ko: "빌드", de: "Build", fr: "Build" },
  Code: { "zh-CN": "代码", en: "Code", ja: "コード", ko: "코드", de: "Code", fr: "Code" },
  Custom: { "zh-CN": "自定义", en: "Custom", ja: "カスタム", ko: "커스텀", de: "Eigene", fr: "Perso" },
  Flow: { "zh-CN": "流程", en: "Flow", ja: "流れ", ko: "흐름", de: "Flow", fr: "Flux" },
  Main: { "zh-CN": "主要", en: "Main", ja: "主要", ko: "주요", de: "Haupt", fr: "Principal" },
  Ship: { "zh-CN": "交付", en: "Ship", ja: "出荷", ko: "출시", de: "Ship", fr: "Livrer" },
  "Terminal Skill": {
    "zh-CN": "Terminal Skill",
    en: "Terminal Skill",
    ja: "Terminal Skill",
    ko: "Terminal Skill",
    de: "Terminal Skill",
    fr: "Terminal Skill",
  },
}

function copy(locale: LocaleCode, key: DeckCopyKey) {
  return deckCopy[locale]?.[key] ?? deckCopy.en[key]
}

function compactLabel(command: CommandItem, locale: LocaleCode) {
  return compactCommandLabels[command.id]?.[locale] ?? compactCommandLabels[command.id]?.en
}

function groupTitle(group: string, locale: LocaleCode) {
  return groupLabels[group]?.[locale] ?? groupLabels[group]?.en ?? group
}

function fallbackTileLayout(commandId: string, order = 1000): TileLayoutItem {
  return { commandId, group: "Custom", order, size: "small" }
}

function deckColumnCount(width: number) {
  if (width >= 680) return 20
  if (width >= 520) return 16
  return 12
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function responsiveScale(width: number, height: number) {
  const widthScale = clampNumber((width - 390) / 370, 0, 1) * 0.36
  const heightScale = clampNumber((height - 560) / 300, 0, 1) * 0.16
  return 1 + Math.max(widthScale, heightScale)
}

function scaledNumber(value: number, scale: number) {
  return Math.round(value * scale * 10) / 10
}

function tileSpan(size: TileSize, columns: number) {
  if (size === "wide") return Math.ceil(columns / 2)
  if (size === "medium") return Math.max(4, Math.floor(columns / 3))
  return Math.max(3, Math.floor(columns / 4))
}

function tileHeight(size: TileSize, width: number, height: number) {
  const isShort = height < 520
  const isRoomy = width >= 520 || height >= 700

  if (size === "wide") return isShort ? 46 : isRoomy ? 58 : 50
  if (size === "medium") return isShort ? 50 : isRoomy ? 66 : 56
  return isShort ? 48 : isRoomy ? 62 : 54
}

function monitorHeight(width: number, height: number) {
  if (height < 520) return 72
  if (height >= 760 || width >= 620) return 152
  if (height >= 640) return 122
  return 96
}

function tileSizeCopyKey(size: TileSize): DeckCopyKey {
  if (size === "wide") return "wideTile"
  if (size === "medium") return "mediumTile"
  return "smallTile"
}

function uniqueCommandId(base: string, commandIds: string[]) {
  const sanitized = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const prefix = sanitized || "custom-command"
  const existingIds = new Set(commandIds)
  if (!existingIds.has(prefix)) return prefix

  let index = 2
  while (existingIds.has(`${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

function uniqueSkillGroupName(base: string, groups: string[]) {
  const prefix = base.trim() || "New Skill"
  const existingGroups = new Set(groups.map((group) => group.trim().toLowerCase()))
  if (!existingGroups.has(prefix.toLowerCase())) return prefix

  let index = 2
  while (existingGroups.has(`${prefix} ${index}`.toLowerCase())) index += 1
  return `${prefix} ${index}`
}

function moveArrayItem<T>(items: T[], sourceIndex: number, targetIndex: number) {
  if (
    sourceIndex === targetIndex ||
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= items.length ||
    targetIndex >= items.length
  ) {
    return items
  }

  const nextItems = [...items]
  const [item] = nextItems.splice(sourceIndex, 1)
  nextItems.splice(targetIndex, 0, item)
  return nextItems
}

function rebuildLayoutOrders(layouts: TileLayoutItem[], groupOrder: string[]) {
  const seenGroups = new Set<string>()
  const orderedGroups = [
    ...groupOrder.filter((group) => {
      if (seenGroups.has(group)) return false
      seenGroups.add(group)
      return true
    }),
    ...[...new Set(layouts.map((layout) => layout.group))].filter((group) => !seenGroups.has(group)),
  ]
  let order = 0

  return orderedGroups.flatMap((group) =>
    layouts
      .filter((layout) => layout.group === group)
      .sort((a, b) => a.order - b.order)
      .map((layout) => ({ ...layout, order: order++ })),
  )
}

function localText(locale: LocaleCode, value: string, enValue = value): LocalizedText {
  return locale === "en" ? { en: value } : { [locale]: value, en: enValue }
}

function replaceLocalizedText(value: LocalizedText, from: string, to: string): LocalizedText {
  const nextValue: LocalizedText = {}

  for (const [localeCode, localeValue] of Object.entries(value) as Array<[LocaleCode, string]>) {
    nextValue[localeCode] = localeValue.split(from).join(to)
  }

  return nextValue
}

function normalizeTargetId(targetId?: string) {
  if (targetId === "codex") return "codex-cli"
  if (targetId === "terminal") return "active-window"
  return targetId || "claude-code"
}

function sendModeCopyKey(sendMode: SendMode): DeckCopyKey {
  if (sendMode === "tmux_send_keys") return "tmuxMode"
  if (sendMode === "type") return "typeMode"
  return "pasteMode"
}

function defaultSendModeForTarget(target: TargetConfig): SendMode {
  return target.kind === "tmux_agent" ? "tmux_send_keys" : "paste"
}

function targetLabel(target: TargetConfig, locale: LocaleCode) {
  if (target.id === "active-window") {
    return {
      "zh-CN": "当前窗口",
      en: "Active Window",
      ja: "現在のウィンドウ",
      ko: "현재 창",
      de: "Aktives Fenster",
      fr: "Fenêtre active",
    }[locale]
  }

  return target.label
}

export function DeckWindow() {
  const { i18n, t } = useTranslation()
  const deckRef = useRef<HTMLElement | null>(null)
  const importProfileInputRef = useRef<HTMLInputElement | null>(null)
  const importSkillPackInputRef = useRef<HTMLInputElement | null>(null)
  const [config, setConfig] = useState(() => loadConfig())
  const locale = config.locale
  const [modelAccounts, setModelAccounts] = useState<ModelAccount[]>(() => loadModelAccounts())
  const [activeTargetId, setActiveTargetId] = useState(() => loadActiveModelAccountId())
  const [commands, setCommands] = useState<CommandItem[]>(() => loadCommands())
  const [tileLayouts, setTileLayouts] = useState<TileLayoutItem[]>(() =>
    loadTileLayouts(defaultCommands.map((command) => command.id)),
  )
  const [query, setQuery] = useState("")
  const [editMode, setEditMode] = useState(false)
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CommandEditDraft>(emptyCommandEditDraft)
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [selectedSkillGroup, setSelectedSkillGroup] = useState("")
  const [skillCreateDraft, setSkillCreateDraft] = useState("")
  const [skillRenameDraft, setSkillRenameDraft] = useState("")
  const [draggingSkillGroup, setDraggingSkillGroup] = useState<string | null>(null)
  const [draggingCommandId, setDraggingCommandId] = useState<string | null>(null)
  const suppressDragClickRef = useRef(false)
  const [checks, setChecks] = useState<StartupCheckItem[]>([])
  const [checksLoading, setChecksLoading] = useState(false)
  const [showCheckPopover, setShowCheckPopover] = useState(false)
  const [showRouterPopover, setShowRouterPopover] = useState(false)
  const [showAccountManager, setShowAccountManager] = useState(false)
  const [modelAccountDraft, setModelAccountDraft] =
    useState<ModelAccountDraft>(emptyModelAccountDraft)
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({})
  const [agentStatus, setAgentStatus] = useState<TmuxAgentStatus | null>(null)
  const [agentBusy, setAgentBusy] = useState(false)
  const [accountStatuses, setAccountStatuses] = useState<Record<string, TmuxAgentStatus>>({})
  const [accountBusyId, setAccountBusyId] = useState<string | null>(null)
  const [selectedLoginAccountId, setSelectedLoginAccountId] = useState<string | null>(null)
  const [sendingCommandId, setSendingCommandId] = useState<string | null>(null)
  const [lastResponse, setLastResponse] = useState<DispatchCommandResponse | null>(null)
  const [pendingBlock, setPendingBlock] = useState<PendingBlock | null>(null)
  const [monitorText, setMonitorText] = useState("Idle")
  const [monitorError, setMonitorError] = useState<string | null>(null)
  const [deckMetrics, setDeckMetrics] = useState({ width: 376, height: 568 })

  const utilityTargets = useMemo(
    () => deckTargets.filter((target) => target.kind === "active_window"),
    [],
  )
  const availableTargets = useMemo(
    () => [...modelAccounts.map(modelAccountToTarget), ...utilityTargets],
    [modelAccounts, utilityTargets],
  )
  const activeTarget = useMemo(
    () => availableTargets.find((target) => target.id === activeTargetId) ?? availableTargets[0],
    [activeTargetId, availableTargets],
  )
  const deckScaleFactor = responsiveScale(deckMetrics.width, deckMetrics.height)
  const scaledSizes = useMemo(
    () => ({
      actionGap: Math.round(scaledNumber(8, deckScaleFactor)),
      groupFont: scaledNumber(10, deckScaleFactor),
      iconBox: Math.round(scaledNumber(24, deckScaleFactor)),
      iconSize: Math.round(scaledNumber(14, deckScaleFactor)),
      monitorFont: scaledNumber(10.5, deckScaleFactor),
      monitorLine: scaledNumber(16, deckScaleFactor),
      tileGap: scaledNumber(6, deckScaleFactor),
      tilePaddingX: scaledNumber(10, deckScaleFactor),
      tileSmallFont: scaledNumber(10, deckScaleFactor),
      tileTextFont: scaledNumber(11, deckScaleFactor),
    }),
    [deckScaleFactor],
  )
  const actionColumnCount = deckColumnCount(deckMetrics.width)
  const actionGridStyle = useMemo(
    () => ({
      gap: scaledSizes.actionGap,
      gridTemplateColumns: `repeat(${actionColumnCount}, minmax(0, 1fr))`,
    }),
    [actionColumnCount, scaledSizes.actionGap],
  )
  const currentMonitorHeight = monitorHeight(deckMetrics.width, deckMetrics.height)
  const selectedLoginAccount = useMemo(
    () => modelAccounts.find((account) => account.id === selectedLoginAccountId) ?? null,
    [modelAccounts, selectedLoginAccountId],
  )
  const session = activeTarget ? getSession(activeTarget) : null
  const readiness = useMemo(() => calculateReadiness(checks), [checks])
  const commandById = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  )
  const commandIds = useMemo(() => commands.map((command) => command.id), [commands])
  const tileByCommandId = useMemo(
    () => new Map(tileLayouts.map((layout) => [layout.commandId, layout])),
    [tileLayouts],
  )
  const editingCommand = editingCommandId ? commandById.get(editingCommandId) ?? null : null
  const editingTileLayout = editingCommand
    ? tileByCommandId.get(editingCommand.id) ?? fallbackTileLayout(editingCommand.id)
    : null
  const availableGroups = useMemo(() => {
    const groups = new Set(tileLayouts.map((layout) => layout.group))
    return [...groups]
  }, [tileLayouts])
  const editingGroupLayouts = editingTileLayout
    ? tileLayouts
        .filter((layout) => layout.group === editingTileLayout.group)
        .sort((a, b) => a.order - b.order)
    : []
  const editingLayoutIndex = editingTileLayout
    ? editingGroupLayouts.findIndex((layout) => layout.commandId === editingTileLayout.commandId)
    : -1
  const canMoveEditingTileUp = editingLayoutIndex > 0
  const canMoveEditingTileDown =
    editingLayoutIndex >= 0 && editingLayoutIndex < editingGroupLayouts.length - 1

  const visibleCommands = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands

    return commands.filter((command) => {
      const haystack = [
        text(command.name, locale),
        text(command.description, locale),
        command.category,
        command.skillGroup ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [commands, locale, query])

  const actionSections = useMemo(() => {
    const sections = new Map<
      string,
      { firstOrder: number; group: string; tiles: Array<{ command: CommandItem; layout: TileLayoutItem }> }
    >()

    for (const layout of [...tileLayouts].sort((a, b) => a.order - b.order)) {
      const command = commandById.get(layout.commandId)
      if (!command) continue

      const section = sections.get(layout.group) ?? {
        firstOrder: layout.order,
        group: layout.group,
        tiles: [],
      }
      section.firstOrder = Math.min(section.firstOrder, layout.order)
      section.tiles.push({ command, layout })
      sections.set(layout.group, section)
    }

    return [...sections.values()].sort((a, b) => a.firstOrder - b.firstOrder)
  }, [commandById, tileLayouts])
  const skillPacks = useMemo(
    () =>
      actionSections.map((section) => ({
        ...section,
        count: section.tiles.length,
        title: groupTitle(section.group, locale),
      })),
    [actionSections, locale],
  )
  const selectedSkillPack =
    skillPacks.find((pack) => pack.group === selectedSkillGroup) ?? skillPacks[0] ?? null
  const visibleTargetCapabilities = useMemo<TargetCapability[]>(
    () =>
      availableTargets.map((target) => ({
        id: target.id,
        label: target.label,
        kind: target.kind,
        executor: target.kind === "tmux_agent" ? "tmux" : "applescript",
        description:
          target.kind === "tmux_agent"
            ? `tmux session: ${target.tmuxSession ?? "-"}`
            : target.kind === "cursor"
              ? `app: ${target.appName ?? "Cursor"}`
              : "frontmost app",
      })),
    [availableTargets],
  )

  async function refreshChecks() {
    setChecksLoading(true)
    try {
      setChecks(
        await runSetupCheck({
          ccSession: modelAccounts.find((account) => account.provider === "claude_code")?.tmuxSession ?? "cc",
          codexSession: modelAccounts.find((account) => account.provider === "codex")?.tmuxSession ?? "codex",
          cursorAppName: modelAccounts.find((account) => account.provider === "cursor")?.appName ?? "Cursor",
        }),
      )
    } finally {
      setChecksLoading(false)
    }
  }

  async function copyDesktopLaunchCommand() {
    try {
      await navigator.clipboard.writeText(desktopLaunchCommand)
      setLastResponse({
        message: copy(locale, "launchCommandCopied"),
        status: "sent",
        targetId: "desktop",
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "desktop",
      })
    }
  }

  async function restartDesktopApp() {
    if (!hasTauriRuntime()) {
      await copyDesktopLaunchCommand()
      return
    }

    const confirmed = window.confirm(copy(locale, "restartDesktopConfirm"))
    if (!confirmed) return

    try {
      const message = await restartAgentDeck()
      setLastResponse({
        message,
        status: "sent",
        targetId: "desktop",
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "desktop",
      })
    }
  }

  async function quitDesktopApp() {
    if (!hasTauriRuntime()) {
      setLastResponse({
        message: copy(locale, "desktopOnly"),
        status: "failed",
        targetId: "desktop",
      })
      return
    }

    const confirmed = window.confirm(copy(locale, "quitAppConfirm"))
    if (!confirmed) return

    try {
      const message = await quitAgentDeck()
      setLastResponse({
        message,
        status: "sent",
        targetId: "desktop",
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "desktop",
      })
    }
  }

  async function refreshAgent() {
    if (!activeTarget || activeTarget.kind !== "tmux_agent" || !session) {
      setAgentStatus(null)
      return
    }

    setAgentBusy(true)
    try {
      const nextStatus = await getTmuxAgentStatus({
        agentKind: getAgentKind(activeTarget),
        session,
      })
      setAgentStatus(nextStatus)
      setAccountStatuses((statuses) => ({ ...statuses, [activeTarget.id]: nextStatus }))
    } finally {
      setAgentBusy(false)
    }
  }

  async function startAgent() {
    if (!activeTarget || !session || !activeTarget.launchCommand) return

    setAgentBusy(true)
    try {
      const nextStatus = await startTmuxAgent({
        agentKind: getAgentKind(activeTarget),
        launchCommand: activeTarget.launchCommand,
        session,
      })
      setAgentStatus(nextStatus)
      setAccountStatuses((statuses) => ({ ...statuses, [activeTarget.id]: nextStatus }))
    } finally {
      setAgentBusy(false)
    }
  }

  async function stopAgent() {
    if (!activeTarget || !session) return

    setAgentBusy(true)
    try {
      const nextStatus = await stopTmuxAgent({
        agentKind: getAgentKind(activeTarget),
        session,
      })
      setAgentStatus(nextStatus)
      setAccountStatuses((statuses) => ({ ...statuses, [activeTarget.id]: nextStatus }))
    } finally {
      setAgentBusy(false)
    }
  }

  async function refreshModelAccountAgent(account: ModelAccount, quiet = false) {
    const accountSession = getAccountSession(account)
    if (!accountSession) return null

    if (!quiet) setAccountBusyId(account.id)
    try {
      const nextStatus = await getTmuxAgentStatus({
        agentKind: account.provider,
        session: accountSession,
      })
      setAccountStatuses((statuses) => ({ ...statuses, [account.id]: nextStatus }))
      if (activeTargetId === account.id) setAgentStatus(nextStatus)
      return nextStatus
    } finally {
      if (!quiet) setAccountBusyId(null)
    }
  }

  async function startModelAccountAgent(account: ModelAccount) {
    const accountSession = getAccountSession(account)
    const launchCommand = getAccountLaunchCommand(account)
    if (!accountSession || !launchCommand) return

    setAccountBusyId(account.id)
    try {
      const nextStatus = await startTmuxAgent({
        agentKind: account.provider,
        launchCommand,
        session: accountSession,
      })
      setAccountStatuses((statuses) => ({ ...statuses, [account.id]: nextStatus }))
      if (activeTargetId === account.id) setAgentStatus(nextStatus)
      setLastResponse({
        message: nextStatus.detail,
        status: "sent",
        targetId: account.id,
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: account.id,
      })
    } finally {
      setAccountBusyId(null)
    }
  }

  async function stopModelAccountAgent(account: ModelAccount) {
    const accountSession = getAccountSession(account)
    if (!accountSession) return

    setAccountBusyId(account.id)
    try {
      const nextStatus = await stopTmuxAgent({
        agentKind: account.provider,
        session: accountSession,
      })
      setAccountStatuses((statuses) => ({ ...statuses, [account.id]: nextStatus }))
      if (activeTargetId === account.id) setAgentStatus(nextStatus)
      setLastResponse({
        message: nextStatus.detail,
        status: "sent",
        targetId: account.id,
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: account.id,
      })
    } finally {
      setAccountBusyId(null)
    }
  }

  async function runModelAccountLoginCommand(account: ModelAccount, command: string | null, label: string) {
    const accountSession = getAccountSession(account)
    if (!accountSession || !command) return

    setAccountBusyId(account.id)
    try {
      let currentStatus = accountStatuses[account.id] ?? null
      if (!currentStatus) {
        currentStatus = await getTmuxAgentStatus({
          agentKind: account.provider,
          session: accountSession,
        })
      }

      if (currentStatus.agentRunning) {
        const confirmed = window.confirm(
          `${label}: ${account.name}\n${command}\n\n${copy(locale, "stopCurrentAgentFirst")}`,
        )
        if (!confirmed) return

        currentStatus = await stopTmuxAgent({
          agentKind: account.provider,
          session: accountSession,
        })
      }

      const nextStatus = await runTmuxAccountCommand({
        agentKind: account.provider,
        command,
        session: accountSession,
      })
      setAccountStatuses((statuses) => ({ ...statuses, [account.id]: nextStatus }))
      if (activeTargetId === account.id) setAgentStatus(nextStatus)
      setLastResponse({
        message: `${label}: ${command}`,
        status: "sent",
        targetId: account.id,
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: account.id,
      })
    } finally {
      setAccountBusyId(null)
    }
  }

  async function runModelAccountAuthCommand(account: ModelAccount) {
    await runModelAccountLoginCommand(account, getAccountAuthCommand(account), copy(locale, "runAuth"))
  }

  async function runModelAccountAuthStatusCommand(account: ModelAccount) {
    await runModelAccountLoginCommand(
      account,
      getAccountAuthStatusCommand(account),
      copy(locale, "authStatus"),
    )
  }

  async function sendCommand(command: CommandItem, forceExecute = false, confirmationAccepted = false) {
    const routedTarget = resolveCommandTarget(command)
    if (!routedTarget) return

    setSendingCommandId(command.id)
    setLastResponse(null)

    try {
      if (command.confirmBeforeSend && !confirmationAccepted) {
        setPendingBlock({
          confirmationOnly: true,
          command,
          response: {
            message: t("confirmBeforeSend"),
            status: "blocked",
            targetId: routedTarget.id,
          },
        })
        return
      }

      const response = await dispatchCommand({
        autoEnter: command.autoEnter,
        content: materializeContent(command, locale),
        forceExecute,
        sendMode: command.sendMode,
        target: routedTarget,
      })

      setLastResponse(response)

      if (response.status === "blocked" && !forceExecute) {
        setPendingBlock({ command, response })
      }

      if (response.status === "sent" && routedTarget.kind === "tmux_agent" && routedTarget.id === activeTargetId) {
        void refreshAgent()
      }
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: routedTarget.id,
      })
    } finally {
      setSendingCommandId(null)
    }
  }

  useEffect(() => {
    void refreshChecks()
    void restoreWindowPlacement(12).then((restored) => {
      if (!restored) void snapWindowToRightEdge(12)
    })

    let cleanup: (() => void) | undefined
    void installMagneticSnap({ edgeThreshold: 64, margin: 12, settleDelayMs: 90 }).then(
      (unlisten) => {
        cleanup = unlisten
      },
    )

    return () => cleanup?.()
  }, [])

  useEffect(() => {
    const node = deckRef.current
    if (!node) return

    const updateMetrics = () => {
      const rect = node.getBoundingClientRect()
      setDeckMetrics({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    updateMetrics()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(node)
    window.addEventListener("resize", updateMetrics)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateMetrics)
    }
  }, [])

  useEffect(() => {
    void i18n.changeLanguage(locale)
  }, [i18n, locale])

  useEffect(() => {
    if (!availableTargets.some((target) => target.id === activeTargetId) && availableTargets[0]) {
      updateActiveTarget(availableTargets[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTargetId, availableTargets])

  useEffect(() => {
    const normalized = normalizeTileLayouts(tileLayouts, commandIds)
    if (JSON.stringify(normalized) !== JSON.stringify(tileLayouts)) {
      setTileLayouts(normalized)
      saveTileLayouts(normalized)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandIds])

  useEffect(() => {
    if (!skillPacks.length) {
      setSelectedSkillGroup("")
      return
    }

    if (!selectedSkillGroup || !skillPacks.some((pack) => pack.group === selectedSkillGroup)) {
      setSelectedSkillGroup(skillPacks[0].group)
    }
  }, [selectedSkillGroup, skillPacks])

  useEffect(() => {
    if (showSkillManager && selectedSkillPack) {
      setSkillRenameDraft(selectedSkillPack.group)
    }
  }, [selectedSkillPack?.group, showSkillManager])

  useEffect(() => {
    if (!showAccountManager) return

    for (const account of modelAccounts) {
      if (account.provider !== "cursor") {
        void refreshModelAccountAgent(account, true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showAccountManager,
    modelAccounts
      .map((account) => `${account.id}:${account.provider}:${account.tmuxSession}:${account.launchCommand}`)
      .join("|"),
  ])

  useEffect(() => {
    if (selectedLoginAccountId && !modelAccounts.some((account) => account.id === selectedLoginAccountId)) {
      setSelectedLoginAccountId(null)
    }
  }, [modelAccounts, selectedLoginAccountId])

  useEffect(() => {
    void refreshAgent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTargetId])

  useEffect(() => {
    if (!session) {
      setMonitorText(
        `${activeTarget ? targetLabel(activeTarget, locale) : copy(locale, "target")} ${copy(
          locale,
          "monitorDisabled",
        )}`,
      )
      setMonitorError(null)
      return
    }

    const monitorSession = session
    let isMounted = true

    async function refreshMonitor() {
      try {
        const response = await capturePane({
          lines: activeTarget?.monitorLines ?? 10,
          session: monitorSession,
        })
        if (!isMounted) return
        setMonitorText(response.text || "No output")
        setMonitorError(null)
      } catch (error) {
        if (!isMounted) return
        setMonitorError(error instanceof Error ? error.message : String(error))
      }
    }

    void refreshMonitor()
    const timer = window.setInterval(refreshMonitor, 1500)

    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [activeTarget, locale, session])

  const firstFailure = readiness.failures[0]
  const statusLine = firstFailure
    ? `${t(`setupChecks.${firstFailure.id}.label`, {
        defaultValue: checkLabels[firstFailure.id] ?? firstFailure.id,
      })}: ${firstFailure.detail}`
    : (lastResponse?.message ?? copy(locale, "ready"))
  const hasSearch = query.trim().length > 0

  function updateCommands(nextCommands: CommandItem[]) {
    setCommands(nextCommands)
    saveCommands(nextCommands)
  }

  function updateTileLayouts(nextLayouts: TileLayoutItem[], nextCommandIds = commandIds) {
    const normalized = normalizeTileLayouts(nextLayouts, nextCommandIds)
    setTileLayouts(normalized)
    saveTileLayouts(normalized)
  }

  function updateLocale(nextLocale: LocaleCode) {
    const nextConfig = { ...config, locale: nextLocale }
    setConfig(nextConfig)
    saveConfig(nextConfig)
  }

  function updateActiveTarget(nextTargetId: string) {
    setActiveTargetId(nextTargetId)
    saveActiveModelAccountId(nextTargetId)
  }

  function updateModelAccounts(nextAccounts: ModelAccount[]) {
    setModelAccounts(nextAccounts)
    saveModelAccounts(nextAccounts)
  }

  function localizedSkillText(key: string, skillGroupName: string): LocalizedText {
    return locales.reduce<LocalizedText>((value, item) => {
      value[item.code] = i18n.getFixedT(item.code)(key, { skill: skillGroupName })
      return value
    }, {})
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

  function exportProfile() {
    const exportedAt = new Date().toISOString().replace(/[:.]/g, "-")
    const deletedCommandIds = new Set([...loadDeletedCommandIds(), ...getDeletedCommandIdsFor(commands)])
    downloadJson(
      `yukun-profile-${exportedAt}.json`,
      createDeckProfile({
        activeTargetId,
        commands,
        config,
        deletedCommandIds: [...deletedCommandIds],
        modelAccounts,
        tileLayouts,
      }),
    )
    setLastResponse({
      message: `${t("exportProfile")}: ${commands.length}`,
      status: "sent",
      targetId: "local",
    })
  }

  async function importProfile(file: File | undefined) {
    if (!file) return

    try {
      const profile = parseDeckProfile(await file.text())
      const normalizedConfig = normalizeConfig(profile.config)
      const importedCommands = profile.commands
      const importedCommandIds = importedCommands.map((command) => command.id)
      const importedModelAccounts = profile.modelAccounts.length ? profile.modelAccounts : modelAccounts
      const importedTargets = [...importedModelAccounts.map(modelAccountToTarget), ...utilityTargets]
      const deletedCommandIds = profile.deletedCommandIds.length
        ? new Set(profile.deletedCommandIds)
        : getDeletedCommandIdsFor(importedCommands)
      const importedTileLayouts = normalizeTileLayouts(profile.tileLayouts, importedCommandIds)
      const importedActiveTarget = importedTargets.some((target) => target.id === profile.activeTargetId)
        ? profile.activeTargetId
        : (importedTargets[0]?.id ?? "claude-code")

      saveDeletedCommandIds(deletedCommandIds)
      saveCommands(importedCommands)
      saveTileLayouts(importedTileLayouts)
      saveConfig(normalizedConfig)
      if (profile.modelAccounts.length) {
        saveModelAccounts(importedModelAccounts)
        setModelAccounts(importedModelAccounts)
      }
      setConfig(normalizedConfig)
      setCommands(importedCommands)
      setTileLayouts(importedTileLayouts)
      updateActiveTarget(importedActiveTarget)
      setEditingCommandId(null)
      setLastResponse({
        message: `${t("importProfile")}: ${importedCommands.length}`,
        status: "sent",
        targetId: "local",
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "local",
      })
    } finally {
      if (importProfileInputRef.current) importProfileInputRef.current.value = ""
    }
  }

  function exportSkillPack(group: string) {
    const pack = skillPacks.find((item) => item.group === group)
    if (!pack) return

    const exportedAt = new Date().toISOString().replace(/[:.]/g, "-")
    downloadJson(
      `yukun-skill-${group.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "pack"}-${exportedAt}.json`,
      createSkillPackExport({
        commands: pack.tiles.map(({ command }) => command),
        group: pack.group,
        tileLayouts: pack.tiles.map(({ layout }) => layout),
      }),
    )
    setLastResponse({
      message: `${copy(locale, "exportSkill")}: ${pack.group}`,
      status: "sent",
      targetId: "local",
    })
  }

  async function importSkillPack(file: File | undefined) {
    if (!file) return

    try {
      const pack = parseSkillPack(await file.text())
      const nextGroup = uniqueSkillGroupName(pack.group, availableGroups)
      const now = Date.now()
      const nextCommandIds = [...commandIds]
      const layoutByCommandId = new Map(pack.tileLayouts.map((layout) => [layout.commandId, layout]))
      const commandByImportedId = new Map(pack.commands.map((command) => [command.id, command]))
      const orderedImportedCommands = [
        ...pack.tileLayouts
          .filter((layout) => commandByImportedId.has(layout.commandId))
          .sort((a, b) => a.order - b.order)
          .map((layout) => commandByImportedId.get(layout.commandId) as CommandItem),
        ...pack.commands.filter(
          (command) => !pack.tileLayouts.some((layout) => layout.commandId === command.id),
        ),
      ]
      const idMap = new Map<string, string>()
      const packId = uniqueCommandId(`skill-pack-${nextGroup}`, [])
      const importedCommands = orderedImportedCommands.map((command, index) => {
        const id = uniqueCommandId(command.id, nextCommandIds)
        nextCommandIds.push(id)
        idMap.set(command.id, id)

        return {
          ...command,
          id,
          content: replaceLocalizedText(command.content, pack.group, nextGroup),
          createdAt: now + index,
          description: replaceLocalizedText(command.description, pack.group, nextGroup),
          name: replaceLocalizedText(command.name, pack.group, nextGroup),
          skillGroup: nextGroup,
          skillPackId: packId,
          updatedAt: now + index,
        }
      })
      const baseOrder = nextOrderAfterAll()
      const importedLayouts: TileLayoutItem[] = orderedImportedCommands.map((command, index) => {
        const sourceLayout = layoutByCommandId.get(command.id)

        return {
          commandId: idMap.get(command.id) ?? importedCommands[index].id,
          group: nextGroup,
          order: baseOrder + index,
          size: sourceLayout?.size ?? "small",
        }
      })
      const nextCommands = [...commands, ...importedCommands]

      updateCommands(nextCommands)
      updateTileLayouts([...tileLayouts, ...importedLayouts], nextCommands.map((item) => item.id))
      setSelectedSkillGroup(nextGroup)
      setSkillRenameDraft(nextGroup)
      setShowSkillManager(true)
      setLastResponse({
        message: `${copy(locale, "importSkill")}: ${nextGroup}`,
        status: "sent",
        targetId: "local",
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "local",
      })
    } finally {
      if (importSkillPackInputRef.current) importSkillPackInputRef.current.value = ""
    }
  }

  function updateModelAccountDraftProvider(provider: ModelAccountProvider) {
    setModelAccountDraft((draft) => ({
      ...draft,
      appName: provider === "cursor" ? draft.appName || "Cursor" : draft.appName,
      authCommand:
        provider === "codex" ? "codex login" : provider === "claude_code" ? "claude auth login" : "",
      authStatusCommand:
        provider === "codex"
          ? "codex login status"
          : provider === "claude_code"
            ? "claude auth status"
            : "",
      launchCommand:
        provider === "codex" ? "codex" : provider === "claude_code" ? "claude" : draft.launchCommand,
      provider,
      tmuxSession:
        provider === "codex" ? "codex" : provider === "claude_code" ? "cc" : draft.tmuxSession,
    }))
  }

  async function createModelAccountFromDraft() {
    const name = modelAccountDraft.name || providerLabel(modelAccountDraft.provider)
    const tmuxSession =
      modelAccountDraft.provider === "cursor"
        ? modelAccountDraft.tmuxSession
        : uniqueTmuxSessionName(
            modelAccountDraft.provider,
            modelAccountDraft.tmuxSession,
            name,
            modelAccounts,
          )
    const account = createModelAccount({
      appName: modelAccountDraft.appName,
      authCommand: modelAccountDraft.authCommand,
      authStatusCommand: modelAccountDraft.authStatusCommand,
      hasSecret: Boolean(modelAccountDraft.password),
      launchCommand: modelAccountDraft.launchCommand,
      name,
      provider: modelAccountDraft.provider,
      tmuxSession,
      username: modelAccountDraft.username,
    })
    let savedAccount = account

    if (modelAccountDraft.password) {
      try {
        await saveModelAccountSecret({
          accountId: account.id,
          password: modelAccountDraft.password,
          username: modelAccountDraft.username,
        })
      } catch (error) {
        savedAccount = { ...account, hasSecret: false }
        setLastResponse({
          message: error instanceof Error ? error.message : String(error),
          status: "failed",
          targetId: "keychain",
        })
      }
    }

    const nextAccounts = [...modelAccounts, savedAccount]
    updateModelAccounts(nextAccounts)
    updateActiveTarget(savedAccount.id)
    setModelAccountDraft({
      ...emptyModelAccountDraft,
      authCommand:
        modelAccountDraft.provider === "codex"
          ? "codex login"
          : modelAccountDraft.provider === "claude_code"
            ? "claude auth login"
            : "",
      authStatusCommand:
        modelAccountDraft.provider === "codex"
          ? "codex login status"
          : modelAccountDraft.provider === "claude_code"
            ? "claude auth status"
            : "",
      provider: modelAccountDraft.provider,
      launchCommand: modelAccountDraft.provider === "codex" ? "codex" : "claude",
      tmuxSession: modelAccountDraft.provider === "codex" ? "codex" : "cc",
    })
    setLastResponse((current) =>
      current?.status === "failed"
        ? current
        : {
            message: `${copy(locale, "modelAccounts")}: ${savedAccount.name}`,
            status: "sent",
            targetId: savedAccount.id,
          },
    )
  }

  async function saveExistingModelAccountSecret(account: ModelAccount) {
    const password = secretDrafts[account.id] ?? ""
    if (!password) return

    try {
      await saveModelAccountSecret({
        accountId: account.id,
        password,
        username: account.username ?? "",
      })
      updateModelAccounts(
        modelAccounts.map((item) =>
          item.id === account.id ? { ...item, hasSecret: true, updatedAt: Date.now() } : item,
        ),
      )
      setSecretDrafts((drafts) => ({ ...drafts, [account.id]: "" }))
      setLastResponse({
        message: `${copy(locale, "modelAccounts")}: Keychain saved`,
        status: "sent",
        targetId: account.id,
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: account.id,
      })
    }
  }

  async function copyExistingModelAccountSecret(account: ModelAccount) {
    try {
      const message = await copyModelAccountSecret(account.id)
      setLastResponse({
        message,
        status: "sent",
        targetId: account.id,
      })
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: account.id,
      })
    }
  }

  function openLoginAssist(account: ModelAccount) {
    setSelectedLoginAccountId(account.id)
    setShowAccountManager(false)
    updateActiveTarget(account.id)
    if (account.provider !== "cursor") {
      void refreshModelAccountAgent(account, true)
    }
  }

  function updateExistingModelAccount(
    accountId: string,
    patch: Partial<
      Pick<
        ModelAccount,
        "appName" | "authCommand" | "authStatusCommand" | "launchCommand" | "name" | "tmuxSession" | "username"
      >
    >,
  ) {
    updateModelAccounts(
      modelAccounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              ...patch,
              updatedAt: Date.now(),
            }
          : account,
        ),
    )
    if ("tmuxSession" in patch || "launchCommand" in patch) {
      setAccountStatuses((statuses) => {
        const nextStatuses = { ...statuses }
        delete nextStatuses[accountId]
        return nextStatuses
      })
    }
  }

  async function deleteModelAccount(account: ModelAccount) {
    const confirmed = window.confirm(`${copy(locale, "deleteAccount")}: ${account.name}?`)
    if (!confirmed) return

    if (account.hasSecret) {
      try {
        await deleteModelAccountSecret(account.id)
      } catch {
        // Keep deleting the local profile even if the Keychain item has already gone missing.
      }
    }

    const nextAccounts = modelAccounts.filter((item) => item.id !== account.id)
    updateModelAccounts(nextAccounts)
    setAccountStatuses((statuses) => {
      const nextStatuses = { ...statuses }
      delete nextStatuses[account.id]
      return nextStatuses
    })
    if (activeTargetId === account.id) {
      updateActiveTarget(nextAccounts[0]?.id ?? "active-window")
    }
  }

  function resolveCommandTarget(command: CommandItem) {
    if (!command.targetLocked) return activeTarget

    const targetId = normalizeTargetId(command.defaultTargetId)
    return availableTargets.find((target) => target.id === targetId) ?? activeTarget
  }

  function openCommandEditor(command: CommandItem) {
    const layout = tileByCommandId.get(command.id) ?? fallbackTileLayout(command.id, tileLayouts.length)
    setEditingCommandId(command.id)
    setEditDraft({
      autoEnter: command.autoEnter,
      confirmBeforeSend: command.confirmBeforeSend,
      content: text(command.content, locale),
      description: text(command.description, locale),
      defaultTargetId: normalizeTargetId(command.defaultTargetId),
      group: layout.group,
      name: text(command.name, locale),
      sendMode: command.sendMode,
      size: layout.size,
      targetLocked: Boolean(command.targetLocked),
    })
  }

  function saveCommandEdit() {
    if (!editingCommand) return
    const nextGroup = editDraft.group.trim() || editingTileLayout?.group || "Main"
    const currentLayout = editingTileLayout ?? fallbackTileLayout(editingCommand.id, tileLayouts.length)
    const groupChanged = currentLayout.group !== nextGroup
    const ordersInNextGroup = tileLayouts
      .filter((layout) => layout.group === nextGroup)
      .map((layout) => layout.order)
    const nextOrder = groupChanged
      ? ordersInNextGroup.length
        ? Math.max(...ordersInNextGroup) + 1
        : currentLayout.order
      : currentLayout.order

    const nextCommands = commands.map((command) =>
      command.id === editingCommand.id
        ? {
            ...command,
            autoEnter: editDraft.autoEnter,
            confirmBeforeSend: editDraft.confirmBeforeSend,
            content: { ...command.content, [locale]: editDraft.content },
            defaultTargetId: editDraft.defaultTargetId,
            description: { ...command.description, [locale]: editDraft.description.trim() },
            name: { ...command.name, [locale]: editDraft.name.trim() || text(command.name, locale) },
            sendMode: editDraft.sendMode,
            skillGroup: nextGroup,
            targetLocked: editDraft.targetLocked,
            updatedAt: Date.now(),
          }
        : command,
    )

    updateCommands(nextCommands)
    updateTileLayouts(
      tileLayouts.map((layout) =>
        layout.commandId === editingCommand.id
          ? { ...layout, group: nextGroup, order: nextOrder, size: editDraft.size }
          : layout,
      ),
    )
    setEditingCommandId(null)
  }

  function resetCommandEdit() {
    if (!editingCommand) return

    const defaultCommand = defaultCommandById.get(editingCommand.id)
    if (!defaultCommand) return

    updateCommands(
      commands.map((command) => (command.id === editingCommand.id ? defaultCommand : command)),
    )
    updateTileLayouts(
      tileLayouts.map((layout) =>
        layout.commandId === editingCommand.id
          ? (defaultTileLayoutById.get(editingCommand.id) ?? fallbackTileLayout(editingCommand.id))
          : layout,
      ),
    )
    setEditingCommandId(null)
  }

  function moveTile(commandId: string, direction: -1 | 1) {
    const current = tileByCommandId.get(commandId)
    if (!current) return

    const groupLayouts = tileLayouts
      .filter((layout) => layout.group === current.group)
      .sort((a, b) => a.order - b.order)
    const index = groupLayouts.findIndex((layout) => layout.commandId === commandId)
    const next = groupLayouts[index + direction]
    if (!next) return

    updateTileLayouts(
      tileLayouts.map((layout) => {
        if (layout.commandId === current.commandId) return { ...layout, order: next.order }
        if (layout.commandId === next.commandId) return { ...layout, order: current.order }
        return layout
      }),
    )
  }

  function nextOrderForGroup(group: string) {
    const orders = tileLayouts
      .filter((layout) => layout.group === group)
      .map((layout) => layout.order)
    return orders.length ? Math.max(...orders) + 1 : 1000
  }

  function nextOrderAfterAll() {
    const orders = tileLayouts.map((layout) => layout.order)
    return orders.length ? Math.max(...orders) + 10 : 1000
  }

  function orderAfter(commandId: string) {
    const current = tileByCommandId.get(commandId)
    if (!current) return nextOrderForGroup("Custom")

    const groupLayouts = tileLayouts
      .filter((layout) => layout.group === current.group)
      .sort((a, b) => a.order - b.order)
    const index = groupLayouts.findIndex((layout) => layout.commandId === commandId)
    const next = groupLayouts[index + 1]

    return next ? (current.order + next.order) / 2 : current.order + 1
  }

  function createCommand() {
    const now = Date.now()
    const name = t("newCommand")
    const description = locale === "zh-CN" ? "自定义 Prompt 小方块" : "Custom prompt tile"
    const content = locale === "zh-CN" ? "请输入 Prompt 内容。" : "Write your prompt here."
    const id = uniqueCommandId("custom-command", commandIds)
    const command: CommandItem = {
      id,
      autoEnter: true,
      category: "custom",
      confirmBeforeSend: false,
      content: localText(locale, content, "Write your prompt here."),
      createdAt: now,
      defaultTargetId: activeTargetId,
      description: localText(locale, description, "Custom prompt tile"),
      icon: "Sparkles",
      name: localText(locale, name, "New Command"),
      sendMode: defaultSendModeForTarget(activeTarget),
      skillGroup: "Custom",
      targetLocked: false,
      updatedAt: now,
    }
    const nextCommands = [...commands, command]
    const layout: TileLayoutItem = {
      commandId: id,
      group: "Custom",
      order: nextOrderForGroup("Custom"),
      size: "small",
    }

    updateCommands(nextCommands)
    updateTileLayouts([...tileLayouts, layout], nextCommands.map((item) => item.id))
    setEditMode(true)
    setEditingCommandId(id)
    setEditDraft({
      autoEnter: command.autoEnter,
      confirmBeforeSend: command.confirmBeforeSend,
      content,
      description,
      defaultTargetId: command.defaultTargetId,
      group: layout.group,
      name,
      sendMode: command.sendMode,
      size: layout.size,
      targetLocked: Boolean(command.targetLocked),
    })
  }

  function duplicateCommand(command: CommandItem) {
    const now = Date.now()
    const originalName = text(command.name, locale)
    const suffix = t("copySuffix")
    const id = uniqueCommandId(`${command.id}-copy`, commandIds)
    const sourceLayout = tileByCommandId.get(command.id) ?? fallbackTileLayout(command.id)
    const duplicatedCommand: CommandItem = {
      ...command,
      id,
      createdAt: now,
      name: {
        ...command.name,
        [locale]: `${originalName} ${suffix}`,
        en: `${text(command.name, "en")} ${locale === "en" ? suffix : "Copy"}`,
      },
      skillGroup: sourceLayout.group,
      updatedAt: now,
    }
    const duplicatedLayout: TileLayoutItem = {
      commandId: id,
      group: sourceLayout.group,
      order: orderAfter(command.id),
      size: sourceLayout.size,
    }
    const nextCommands = [...commands, duplicatedCommand]

    updateCommands(nextCommands)
    updateTileLayouts([...tileLayouts, duplicatedLayout], nextCommands.map((item) => item.id))
    setEditingCommandId(id)
    setEditDraft({
      autoEnter: duplicatedCommand.autoEnter,
      confirmBeforeSend: duplicatedCommand.confirmBeforeSend,
      content: text(duplicatedCommand.content, locale),
      defaultTargetId: normalizeTargetId(duplicatedCommand.defaultTargetId),
      description: text(duplicatedCommand.description, locale),
      group: duplicatedLayout.group,
      name: text(duplicatedCommand.name, locale),
      sendMode: duplicatedCommand.sendMode,
      size: duplicatedLayout.size,
      targetLocked: Boolean(duplicatedCommand.targetLocked),
    })
  }

  function deleteCommand(command: CommandItem) {
    const confirmed = window.confirm(`${t("delete")}: ${text(command.name, locale)}?`)
    if (!confirmed) return

    const nextCommands = commands.filter((item) => item.id !== command.id)
    updateCommands(nextCommands)
    updateTileLayouts(
      tileLayouts.filter((layout) => layout.commandId !== command.id),
      nextCommands.map((item) => item.id),
    )
    if (editingCommandId === command.id) setEditingCommandId(null)
  }

  function openSkillManager() {
    setEditingCommandId(null)
    setShowSkillManager(true)
    setSelectedSkillGroup(selectedSkillPack?.group ?? skillPacks[0]?.group ?? "")
    setSkillRenameDraft(selectedSkillPack?.group ?? skillPacks[0]?.group ?? "")
  }

  function selectSkillPack(group: string) {
    setSelectedSkillGroup(group)
    setSkillRenameDraft(group)
  }

  function finishDrag() {
    window.setTimeout(() => {
      suppressDragClickRef.current = false
      setDraggingSkillGroup(null)
      setDraggingCommandId(null)
    }, 0)
  }

  function reorderSkillPack(sourceGroup: string, targetGroup: string) {
    if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) return

    const groups = skillPacks.map((pack) => pack.group)
    const nextGroups = moveArrayItem(
      groups,
      groups.indexOf(sourceGroup),
      groups.indexOf(targetGroup),
    )
    if (nextGroups === groups) return

    updateTileLayouts(rebuildLayoutOrders(tileLayouts, nextGroups))
    setSelectedSkillGroup(sourceGroup)
    setSkillRenameDraft(sourceGroup)
  }

  function reorderCommandWithinSkillPack(sourceCommandId: string, targetCommandId: string) {
    if (!sourceCommandId || !targetCommandId || sourceCommandId === targetCommandId) return

    const sourceLayout = tileByCommandId.get(sourceCommandId)
    const targetLayout = tileByCommandId.get(targetCommandId)
    if (!sourceLayout || !targetLayout || sourceLayout.group !== targetLayout.group) return

    const groupLayouts = tileLayouts
      .filter((layout) => layout.group === sourceLayout.group)
      .sort((a, b) => a.order - b.order)
    const reorderedGroupLayouts = moveArrayItem(
      groupLayouts,
      groupLayouts.findIndex((layout) => layout.commandId === sourceCommandId),
      groupLayouts.findIndex((layout) => layout.commandId === targetCommandId),
    )
    const reorderedById = new Map(
      reorderedGroupLayouts.map((layout, index) => [layout.commandId, { ...layout, order: index }]),
    )
    const nextLayouts = tileLayouts.map((layout) =>
      layout.group === sourceLayout.group ? (reorderedById.get(layout.commandId) ?? layout) : layout,
    )

    updateTileLayouts(rebuildLayoutOrders(nextLayouts, skillPacks.map((pack) => pack.group)))
    setSelectedSkillGroup(sourceLayout.group)
  }

  function createSkillPack(rawName = skillCreateDraft) {
    const skillGroupName = uniqueSkillGroupName(rawName.trim() || t("defaultSkillGroupName"), availableGroups)
    const now = Date.now()
    const nextCommandIds = [...commandIds]
    const baseOrder = nextOrderAfterAll()
    const packId = uniqueCommandId(`skill-pack-${skillGroupName}`, [])
    const createdCommands: CommandItem[] = skillPackSteps.map((step, index) => {
      const id = uniqueCommandId(`skill-${skillGroupName}-${step.id}`, nextCommandIds)
      nextCommandIds.push(id)

      return {
        id,
        autoEnter: true,
        category: "skill",
        confirmBeforeSend: false,
        content: localizedSkillText(step.promptKey, skillGroupName),
        createdAt: now + index,
        defaultTargetId: activeTargetId,
        description: localizedSkillText(step.descriptionKey, skillGroupName),
        icon: step.icon,
        name: localizedSkillText(step.nameKey, skillGroupName),
        sendMode: defaultSendModeForTarget(activeTarget),
        skillGroup: skillGroupName,
        skillPackId: packId,
        targetLocked: false,
        updatedAt: now + index,
      }
    })
    const createdLayouts: TileLayoutItem[] = createdCommands.map((command, index) => ({
      commandId: command.id,
      group: skillGroupName,
      order: baseOrder + index,
      size: skillPackSteps[index]?.size ?? "small",
    }))
    const nextCommands = [...commands, ...createdCommands]

    updateCommands(nextCommands)
    updateTileLayouts([...tileLayouts, ...createdLayouts], nextCommands.map((item) => item.id))
    setSkillCreateDraft("")
    setSelectedSkillGroup(skillGroupName)
    setSkillRenameDraft(skillGroupName)
    setShowSkillManager(true)
    setLastResponse({
      message: t("skillGroupCreated", { count: createdCommands.length, skill: skillGroupName }),
      status: "sent",
      targetId: "local",
    })
  }

  function renameSkillPack(group: string, rawName = skillRenameDraft) {
    const nextGroup = rawName.trim()
    if (!nextGroup || nextGroup === group) return

    const existingGroups = availableGroups.filter((item) => item !== group)
    const normalizedGroup = uniqueSkillGroupName(nextGroup, existingGroups)
    const groupCommandIds = new Set(
      tileLayouts.filter((layout) => layout.group === group).map((layout) => layout.commandId),
    )

    updateCommands(
      commands.map((command) =>
        groupCommandIds.has(command.id)
          ? {
              ...command,
              content: replaceLocalizedText(command.content, group, normalizedGroup),
              description: replaceLocalizedText(command.description, group, normalizedGroup),
              name: replaceLocalizedText(command.name, group, normalizedGroup),
              skillGroup: normalizedGroup,
              updatedAt: Date.now(),
            }
          : command,
      ),
    )
    updateTileLayouts(
      tileLayouts.map((layout) =>
        layout.group === group ? { ...layout, group: normalizedGroup } : layout,
      ),
    )
    setSelectedSkillGroup(normalizedGroup)
    setSkillRenameDraft(normalizedGroup)
    setLastResponse({
      message: `${copy(locale, "renameSkill")}: ${normalizedGroup}`,
      status: "sent",
      targetId: "local",
    })
  }

  function duplicateSkillPack(group: string) {
    const sourceLayouts = tileLayouts
      .filter((layout) => layout.group === group)
      .sort((a, b) => a.order - b.order)
    const sourceCommands = sourceLayouts
      .map((layout) => ({ command: commandById.get(layout.commandId), layout }))
      .filter(
        (item): item is { command: CommandItem; layout: TileLayoutItem } => Boolean(item.command),
      )

    if (!sourceCommands.length) return

    const nextGroup = uniqueSkillGroupName(`${group} ${t("copySuffix")}`, availableGroups)
    const now = Date.now()
    const nextCommandIds = [...commandIds]
    const baseOrder = nextOrderAfterAll()
    const packId = uniqueCommandId(`skill-pack-${nextGroup}`, [])
    const duplicatedCommands = sourceCommands.map(({ command }, index) => {
      const id = uniqueCommandId(`${command.id}-copy`, nextCommandIds)
      nextCommandIds.push(id)

      return {
        ...command,
        id,
        content: replaceLocalizedText(command.content, group, nextGroup),
        createdAt: now + index,
        description: replaceLocalizedText(command.description, group, nextGroup),
        name: replaceLocalizedText(command.name, group, nextGroup),
        skillGroup: nextGroup,
        skillPackId: packId,
        updatedAt: now + index,
      }
    })
    const duplicatedLayouts = sourceCommands.map(({ layout }, index) => ({
      commandId: duplicatedCommands[index].id,
      group: nextGroup,
      order: baseOrder + index,
      size: layout.size,
    }))
    const nextCommands = [...commands, ...duplicatedCommands]

    updateCommands(nextCommands)
    updateTileLayouts([...tileLayouts, ...duplicatedLayouts], nextCommands.map((item) => item.id))
    setSelectedSkillGroup(nextGroup)
    setSkillRenameDraft(nextGroup)
    setShowSkillManager(true)
    setLastResponse({
      message: `${copy(locale, "duplicateSkill")}: ${nextGroup}`,
      status: "sent",
      targetId: "local",
    })
  }

  function deleteSkillPack(group: string) {
    const pack = skillPacks.find((item) => item.group === group)
    const confirmed = window.confirm(`${copy(locale, "deleteSkill")}: ${group}?`)
    if (!confirmed) return

    const deletedCommandIds = new Set(pack?.tiles.map(({ command }) => command.id) ?? [])
    const nextCommands = commands.filter((command) => !deletedCommandIds.has(command.id))

    updateCommands(nextCommands)
    updateTileLayouts(
      tileLayouts.filter((layout) => layout.group !== group),
      nextCommands.map((item) => item.id),
    )
    if (editingCommandId && deletedCommandIds.has(editingCommandId)) setEditingCommandId(null)
    const nextPack = skillPacks.find((item) => item.group !== group)
    setSelectedSkillGroup(nextPack?.group ?? "")
    setSkillRenameDraft(nextPack?.group ?? "")
    setLastResponse({
      message: `${copy(locale, "deleteSkill")}: ${group}`,
      status: "sent",
      targetId: "local",
    })
  }

  function toggleEditMode() {
    const nextEditMode = !editMode
    setEditMode(nextEditMode)
    if (!nextEditMode) {
      setEditingCommandId(null)
      setShowSkillManager(false)
    }
  }

  async function startWindowDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return

    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest("button,input,select,textarea,label,a,[data-no-window-drag='true']")
    ) {
      return
    }

    if (!("__TAURI_INTERNALS__" in window)) return

    event.preventDefault()

    try {
      await getCurrentWindow().startDragging()
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "window",
      })
    }
  }

  async function closeOverlayWindow() {
    if (!hasTauriRuntime()) {
      setLastResponse({
        message: copy(locale, "desktopOnly"),
        status: "failed",
        targetId: "window",
      })
      return
    }

    try {
      await getCurrentWindow().hide()
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "window",
      })
    }
  }

  async function startWindowResize() {
    if (!("__TAURI_INTERNALS__" in window)) return

    try {
      await getCurrentWindow().startResizeDragging("SouthEast")
    } catch (error) {
      setLastResponse({
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
        targetId: "window",
      })
    }
  }

  function renderActionButton(command: CommandItem, size = "small" as TileSize) {
    const Icon = iconMap[command.icon as keyof typeof iconMap] ?? Command
    const isSending = sendingCommandId === command.id
    const iconBoxSize = scaledSizes.iconBox
    const iconPixelSize = scaledSizes.iconSize
    const editBadgeSize = Math.round(scaledNumber(16, deckScaleFactor))
    const tileFontSize = size === "small" ? scaledSizes.tileSmallFont : scaledSizes.tileTextFont
    const tileLineHeight = scaledNumber(14, deckScaleFactor)
    const tileGap = size === "wide" ? scaledNumber(10, deckScaleFactor) : scaledSizes.tileGap
    const defaultCommand = defaultCommandById.get(command.id)
    const hasCustomName = defaultCommand
      ? text(defaultCommand.name, locale) !== text(command.name, locale)
      : true
    const label =
      size === "small" && !hasCustomName
        ? compactLabel(command, locale) ?? text(command.name, locale)
        : text(command.name, locale)

    return (
      <button
        className={cx(
          "relative min-w-0 rounded-lg border bg-[#263746]/70 text-left shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] transition hover:border-[#5b7084] hover:bg-[#304354]/82 active:translate-y-px active:scale-[0.985]",
          editMode ? "border-[#66c59f]/55 ring-1 ring-[#66c59f]/20" : "border-[#405468]/80",
          size === "small" && "flex flex-col items-center justify-center gap-1 px-1.5 text-center",
          size === "medium" && "flex items-center gap-2 px-2.5",
          size === "wide" && "flex items-center gap-2.5 px-2.5",
        )}
        key={command.id}
        onClick={() => (editMode ? openCommandEditor(command) : void sendCommand(command))}
        title={
          editMode
            ? `${copy(locale, "editTileTitle")}: ${text(command.name, locale)}`
            : text(command.description, locale)
        }
        style={{
          gap: tileGap,
          gridColumn: `span ${tileSpan(size, actionColumnCount)} / span ${tileSpan(size, actionColumnCount)}`,
          height: scaledNumber(tileHeight(size, deckMetrics.width, deckMetrics.height), deckScaleFactor),
          paddingLeft: size === "small" ? scaledNumber(6, deckScaleFactor) : scaledSizes.tilePaddingX,
          paddingRight: size === "small" ? scaledNumber(6, deckScaleFactor) : scaledSizes.tilePaddingX,
        }}
        type="button"
      >
        {editMode ? (
          <span
            className="absolute flex items-center justify-center rounded-full border border-[#66c59f]/35 bg-[#203d3b] text-[#a8f0cf]"
            style={{
              height: editBadgeSize,
              right: scaledNumber(4, deckScaleFactor),
              top: scaledNumber(4, deckScaleFactor),
              width: editBadgeSize,
            }}
          >
            <Pencil
              style={{
                height: scaledNumber(10, deckScaleFactor),
                width: scaledNumber(10, deckScaleFactor),
              }}
            />
          </span>
        ) : null}
        <span
          className={cx(
            "flex shrink-0 items-center justify-center rounded-md border border-[#506579]/70 bg-[#314354]/76 text-[#c4cfda]",
          )}
          style={{ height: iconBoxSize, width: iconBoxSize }}
        >
          {isSending ? (
            <Loader2 className="animate-spin" style={{ height: iconPixelSize, width: iconPixelSize }} />
          ) : (
            <Icon style={{ height: iconPixelSize, width: iconPixelSize }} />
          )}
        </span>
        <span className={cx("min-w-0", size === "small" ? "w-full" : "flex-1")}>
          <span
            className="block truncate font-semibold text-[#eef3f8]"
            style={{ fontSize: tileFontSize, lineHeight: `${tileLineHeight}px` }}
          >
            {label}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-screen w-screen items-start justify-end bg-transparent p-2 text-[#eef3f8]">
      <section
        className="drag-region relative flex h-[calc(100vh-16px)] min-h-[420px] w-[calc(100vw-16px)] min-w-[360px] max-w-[760px] flex-col overflow-hidden rounded-[16px] border border-[#3f5265]/78 bg-[linear-gradient(145deg,rgba(45,62,78,0.94),rgba(25,39,52,0.94))] shadow-[0_18px_56px_rgba(8,18,30,0.36)] backdrop-blur-2xl"
        ref={deckRef}
      >
        <header
          className="flex h-11 shrink-0 cursor-move items-center gap-1.5 border-b border-[#3f5265]/70 bg-[#263746]/38 px-3"
          onPointerDown={(event) => void startWindowDrag(event)}
        >
          <button
            className="no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/35"
            onClick={() => setShowCheckPopover((current) => !current)}
            title={
              readiness.allReady
                ? `${readiness.total} startup checks ready`
                : `${readiness.failures.length} startup checks need attention`
            }
            type="button"
          >
            <span
              className={cx(
                "h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_rgba(113,113,122,0.12)]",
                readiness.allReady ? "bg-emerald-500" : "bg-red-500",
                checksLoading && "animate-pulse",
              )}
            />
          </button>

          <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-normal text-[#f3f7fb]">
            yukun
          </h1>

          <button
            className={cx(
              "no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition active:translate-y-px",
              showAccountManager
                ? "border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf]"
                : "border-[#405468]/80 bg-[#263746]/72 text-[#c4cfda]",
            )}
            onClick={() => setShowAccountManager((current) => !current)}
            title={copy(locale, "modelAccounts")}
            type="button"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>

          <button
            className={cx(
              "no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition active:translate-y-px",
              showRouterPopover
                ? "border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf]"
                : "border-[#405468]/80 bg-[#263746]/72 text-[#c4cfda]",
            )}
            onClick={() => setShowRouterPopover((current) => !current)}
            title={copy(locale, "commandRouter")}
            type="button"
          >
            <Command className="h-3.5 w-3.5" />
          </button>

          <button
            className={cx(
              "no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition active:translate-y-px",
              editMode
                ? "border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf]"
                : "border-[#405468]/80 bg-[#263746]/72 text-[#c4cfda]",
            )}
            onClick={toggleEditMode}
            title={copy(locale, "editTileTitle")}
            type="button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>

          <label className="no-drag relative w-[138px] shrink-0">
            <select
              className="h-7 w-full appearance-none rounded-md border border-[#405468]/80 bg-[#263746]/72 py-0 pl-2.5 pr-7 text-[10px] font-medium text-[#eef3f8] outline-none transition focus:border-[#66c59f]/60"
              value={activeTargetId}
              onChange={(event) => updateActiveTarget(event.target.value)}
            >
              {availableTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {targetLabel(target, locale)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-4 w-4 text-[#9fb1c1]" />
          </label>

          <button
            className="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468]/80 bg-[#263746]/72 text-[#c4cfda] transition hover:border-[#d78a8a]/50 hover:bg-[#4a2d34]/55 hover:text-[#ffb4b4] active:translate-y-px"
            onClick={() => void closeOverlayWindow()}
            title={copy(locale, "closeWindow")}
            type="button"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </header>

        {showCheckPopover && (
          <div className="no-drag absolute left-2.5 right-2.5 top-[50px] z-20 rounded-xl border border-[#405468]/80 bg-[#172636]/96 p-2.5 text-[#eef3f8] shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-[#f3f7fb]">
                {copy(locale, "startupCheck")} {readiness.ok}/{readiness.total}
              </div>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#405468] bg-[#263746] text-[#c4cfda] transition active:translate-y-px"
                onClick={() => void refreshChecks()}
                type="button"
              >
                <RefreshCw className={checksLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              </button>
            </div>
            <div className="mb-2 rounded-lg border border-[#405468]/80 bg-[#263746]/58 p-1.5">
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <div className="truncate text-[10px] font-semibold text-[#aebdcc]">
                  {copy(locale, "desktopLauncher")}
                </div>
                <div className="truncate font-mono text-[8.5px] text-[#72869a]">
                  {hasTauriRuntime() ? "Tauri" : "Browser"}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[10px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                  onClick={() => void copyDesktopLaunchCommand()}
                  title={desktopLaunchCommand}
                  type="button"
                >
                  <Copy className="h-3 w-3 shrink-0" />
                  <span className="truncate">{copy(locale, "copyLaunchCommand")}</span>
                </button>
                <button
                  className={cx(
                    "flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold transition active:translate-y-px",
                    hasTauriRuntime()
                      ? "border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf]"
                      : "border-[#405468]/65 bg-[#172636]/42 text-[#72869a]",
                  )}
                  onClick={() => void restartDesktopApp()}
                  title={hasTauriRuntime() ? copy(locale, "restartDesktop") : copy(locale, "desktopOnly")}
                  type="button"
                >
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {hasTauriRuntime() ? copy(locale, "restartDesktop") : copy(locale, "desktopOnly")}
                  </span>
                </button>
                <button
                  className={cx(
                    "flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold transition active:translate-y-px",
                    hasTauriRuntime()
                      ? "border-[#d78a8a]/45 bg-[#4a2d34]/38 text-[#ffb4b4]"
                      : "border-[#405468]/65 bg-[#172636]/42 text-[#72869a]",
                  )}
                  onClick={() => void quitDesktopApp()}
                  title={hasTauriRuntime() ? copy(locale, "quitApp") : copy(locale, "desktopOnly")}
                  type="button"
                >
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {hasTauriRuntime() ? copy(locale, "quitApp") : copy(locale, "desktopOnly")}
                  </span>
                </button>
              </div>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(readiness.failures.length ? readiness.failures : checks).map((check) => (
                <div
                  className="flex items-start gap-2 rounded-lg border border-[#405468]/80 bg-[#263746]/72 p-2"
                  key={check.id}
                >
                  {check.status === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-[#f3f7fb]">
                      {t(`setupChecks.${check.id}.label`, {
                        defaultValue: checkLabels[check.id] ?? check.id,
                      })}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[#aebdcc]">
                      {check.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showRouterPopover && (
          <div className="no-drag absolute left-2.5 right-2.5 top-[50px] z-20 rounded-xl border border-[#405468]/80 bg-[#172636]/94 p-2.5 text-[#eef3f8] shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-semibold">{copy(locale, "commandRouter")}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[#aebdcc]">
                  TargetKind = <span className="text-[#f2c46d]">tmux_agent</span> | cursor | active_window
                </div>
              </div>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md border border-[#405468] bg-[#263746] text-[#c4cfda]"
                onClick={() => setShowRouterPopover(false)}
                type="button"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {routerStages.map((stage) => (
                <div
                  className="rounded-lg border border-[#405468]/80 bg-[#314354]/68 p-1.5 text-center"
                  key={stage.id}
                >
                  <div className="text-[10px] font-semibold text-[#f3f7fb]">{stage.label}</div>
                  <div className="mt-0.5 truncate text-[8.5px] text-[#aebdcc]">{stage.detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-2 space-y-1">
              {visibleTargetCapabilities.map((target) => (
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-lg border p-1.5",
                    target.id === activeTargetId
                      ? "border-[#66c59f]/45 bg-[#2e6f5b]/20"
                      : "border-[#405468]/80 bg-[#263746]/62",
                  )}
                  key={target.id}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#506579]/70 bg-[#172636] text-[#c4cfda]">
                    {target.executor === "tmux" ? (
                      <TerminalSquare className="h-3.5 w-3.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-[#f3f7fb]">
                    {(() => {
                      const deckTarget = availableTargets.find((item) => item.id === target.id)
                      return deckTarget ? targetLabel(deckTarget, locale) : target.label
                    })()}
                    </div>
                    <div className="truncate text-[9px] text-[#aebdcc]">{target.description}</div>
                  </div>
                  <span className="rounded-full border border-[#66c59f]/20 bg-[#2e6f5b]/28 px-1.5 py-0.5 font-mono text-[8.5px] text-[#a8f0cf]">
                    {target.kind}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#405468]/80 bg-[#263746]/62 px-2 py-1.5 text-[9.5px] text-[#aebdcc]">
              <AlertTriangle className="h-3 w-3 shrink-0 text-[#aebdcc]" />
              <span className="truncate">{copy(locale, "systemCallsSealed")}</span>
            </div>
          </div>
        )}

        {showAccountManager && (
          <div className="no-drag absolute left-2.5 right-2.5 top-[50px] z-20 rounded-xl border border-[#405468]/80 bg-[#172636]/96 p-2.5 text-[#eef3f8] shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-semibold">{copy(locale, "modelAccounts")}</div>
                <div className="mt-0.5 text-[9px] text-[#91a6b8]">
                  {copy(locale, "keychainNote")}
                </div>
              </div>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md border border-[#405468] bg-[#263746] text-[#c4cfda]"
                onClick={() => setShowAccountManager(false)}
                type="button"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-lg border border-[#405468]/80 bg-[#263746]/54 p-2">
              <div className="grid grid-cols-[112px_1fr] gap-1.5">
                <select
                  className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none"
                  onChange={(event) =>
                    updateModelAccountDraftProvider(event.target.value as ModelAccountProvider)
                  }
                  value={modelAccountDraft.provider}
                >
                  {(["claude_code", "codex", "cursor"] as ModelAccountProvider[]).map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLabel(provider)}
                    </option>
                  ))}
                </select>
                <input
                  className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                  onChange={(event) =>
                    setModelAccountDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                  placeholder={copy(locale, "accountName")}
                  value={modelAccountDraft.name}
                />
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <input
                  className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                  onChange={(event) =>
                    setModelAccountDraft((draft) => ({ ...draft, username: event.target.value }))
                  }
                  placeholder={copy(locale, "usernameOrEmail")}
                  value={modelAccountDraft.username}
                />
                <input
                  className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                  onChange={(event) =>
                    setModelAccountDraft((draft) => ({ ...draft, password: event.target.value }))
                  }
                  placeholder={copy(locale, "passwordOrToken")}
                  type="password"
                  value={modelAccountDraft.password}
                />
              </div>

              <div className="mt-1.5 grid grid-cols-[1fr_1fr_68px] gap-1.5">
                {modelAccountDraft.provider === "cursor" ? (
                  <input
                    className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                    onChange={(event) =>
                      setModelAccountDraft((draft) => ({ ...draft, appName: event.target.value }))
                    }
                    placeholder="Cursor"
                    value={modelAccountDraft.appName}
                  />
                ) : (
                  <input
                    className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                    onChange={(event) =>
                      setModelAccountDraft((draft) => ({ ...draft, tmuxSession: event.target.value }))
                    }
                    placeholder={copy(locale, "tmuxSession")}
                    value={modelAccountDraft.tmuxSession}
                  />
                )}
                <input
                  className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] disabled:opacity-45"
                  disabled={modelAccountDraft.provider === "cursor"}
                  onChange={(event) =>
                    setModelAccountDraft((draft) => ({ ...draft, launchCommand: event.target.value }))
                  }
                  placeholder="launch"
                  value={modelAccountDraft.provider === "cursor" ? "Cursor" : modelAccountDraft.launchCommand}
                />
                <button
                  className="h-8 rounded-md border border-[#66c59f]/45 bg-[#2e6f5b]/28 px-2 text-[10px] font-semibold text-[#a8f0cf] transition active:translate-y-px"
                  onClick={() => void createModelAccountFromDraft()}
                  type="button"
                >
                  {t("newCommand")}
                </button>
              </div>
              {modelAccountDraft.provider !== "cursor" ? (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <input
                    className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                    onChange={(event) =>
                      setModelAccountDraft((draft) => ({ ...draft, authCommand: event.target.value }))
                    }
                    placeholder={copy(locale, "authCommand")}
                    value={modelAccountDraft.authCommand}
                  />
                  <input
                    className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                    onChange={(event) =>
                      setModelAccountDraft((draft) => ({
                        ...draft,
                        authStatusCommand: event.target.value,
                      }))
                    }
                    placeholder={copy(locale, "authStatus")}
                    value={modelAccountDraft.authStatusCommand}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {modelAccounts.map((account) => {
                const accountTarget = modelAccountToTarget(account)
                const accountStatus = accountStatuses[account.id] ?? null
                const accountSession = getAccountSession(account)
                const authCommand = getAccountAuthCommand(account)
                const authStatusCommand = getAccountAuthStatusCommand(account)
                const launchCommand = getAccountLaunchCommand(account)
                const isAccountBusy = accountBusyId === account.id
                const canControlAgent = Boolean(accountSession && launchCommand)
                const canRunAuth = Boolean(accountSession && authCommand)
                const canRunAuthStatus = Boolean(accountSession && authStatusCommand)

                return (
                  <div
                    className={cx(
                      "rounded-lg border p-2",
                      account.id === activeTargetId
                        ? "border-[#66c59f]/45 bg-[#2e6f5b]/18"
                        : "border-[#405468]/80 bg-[#263746]/58",
                    )}
                    key={account.id}
                  >
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#91a6b8]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold text-[#f3f7fb]">
                          {accountTarget.label}
                        </div>
                        <div className="truncate text-[9px] text-[#91a6b8]">
                          {account.username || "no username"} ·{" "}
                          {account.provider === "cursor"
                            ? account.appName ?? "Cursor"
                            : `${accountSession ?? "-"} · ${getStatusLabel(accountStatus)}`}
                          {account.hasSecret ? " · Keychain" : ""}
                        </div>
                      </div>
                      <button
                        className={cx(
                          "h-7 rounded-md border px-2 text-[9px] font-semibold transition active:translate-y-px",
                          selectedLoginAccountId === account.id
                            ? "border-[#66c59f]/45 bg-[#2e6f5b]/28 text-[#a8f0cf]"
                            : "border-[#405468] bg-[#172636]/72 text-[#c4cfda]",
                        )}
                        onClick={() => openLoginAssist(account)}
                        type="button"
                      >
                        {copy(locale, "openLoginAssist")}
                      </button>
                      <button
                        className="h-7 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                        onClick={() => updateActiveTarget(account.id)}
                        type="button"
                      >
                        {copy(locale, "target")}
                      </button>
                      {account.provider !== "cursor" ? (
                        <>
                          <button
                            className="h-7 shrink-0 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                            disabled={!canRunAuthStatus || isAccountBusy}
                            onClick={() => void runModelAccountAuthStatusCommand(account)}
                            title={authStatusCommand ?? copy(locale, "authStatus")}
                            type="button"
                          >
                            {copy(locale, "checkAuth")}
                          </button>
                          <button
                            className="h-7 shrink-0 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                            disabled={!canRunAuth || isAccountBusy}
                            onClick={() => void runModelAccountAuthCommand(account)}
                            title={authCommand ?? copy(locale, "authCommand")}
                            type="button"
                          >
                            {copy(locale, "runAuth")}
                          </button>
                          <button
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#172636]/72 text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                            disabled={!accountSession || isAccountBusy}
                            onClick={() => void refreshModelAccountAgent(account)}
                            title={t("refresh")}
                            type="button"
                          >
                            <RefreshCw
                              className={isAccountBusy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
                            />
                          </button>
                          {accountStatus?.agentRunning ? (
                            <button
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#172636]/72 text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                              disabled={!accountSession || isAccountBusy}
                              onClick={() => void stopModelAccountAgent(account)}
                              title={copy(locale, "stopAgent")}
                              type="button"
                            >
                              <Square className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#172636]/72 text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                              disabled={!canControlAgent || isAccountBusy}
                              onClick={() => void startModelAccountAgent(account)}
                              title={t("startAgentSession")}
                              type="button"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <input
                        className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                        onChange={(event) =>
                          updateExistingModelAccount(account.id, { name: event.target.value })
                        }
                        placeholder={copy(locale, "accountName")}
                        value={account.name}
                      />
                      <input
                        className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                        onChange={(event) =>
                          updateExistingModelAccount(account.id, { username: event.target.value })
                        }
                        placeholder={copy(locale, "usernameOrEmail")}
                        value={account.username ?? ""}
                      />
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <input
                        className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                        onChange={(event) =>
                          updateExistingModelAccount(
                            account.id,
                            account.provider === "cursor"
                              ? { appName: event.target.value }
                              : { tmuxSession: event.target.value },
                          )
                        }
                        placeholder={account.provider === "cursor" ? "Cursor" : copy(locale, "tmuxSession")}
                        value={
                          account.provider === "cursor"
                            ? (account.appName ?? "")
                            : (account.tmuxSession ?? "")
                        }
                      />
                      <input
                        className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] disabled:opacity-45"
                        disabled={account.provider === "cursor"}
                        onChange={(event) =>
                          updateExistingModelAccount(account.id, { launchCommand: event.target.value })
                        }
                        placeholder="launch"
                        value={account.provider === "cursor" ? "Cursor" : (account.launchCommand ?? "")}
                      />
                    </div>
                    {account.provider !== "cursor" ? (
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <input
                          className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                          onChange={(event) =>
                            updateExistingModelAccount(account.id, { authCommand: event.target.value })
                          }
                          placeholder={copy(locale, "authCommand")}
                          value={account.authCommand ?? ""}
                        />
                        <input
                          className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                          onChange={(event) =>
                            updateExistingModelAccount(account.id, {
                              authStatusCommand: event.target.value,
                            })
                          }
                          placeholder={copy(locale, "authStatus")}
                          value={account.authStatusCommand ?? ""}
                        />
                      </div>
                    ) : null}

                    <div className="mt-1.5 grid grid-cols-[1fr_44px_44px_32px] gap-1.5">
                      <input
                        className="h-7 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                        onChange={(event) =>
                          setSecretDrafts((drafts) => ({
                            ...drafts,
                            [account.id]: event.target.value,
                          }))
                        }
                        placeholder={account.hasSecret ? "replace password" : "save password"}
                        type="password"
                        value={secretDrafts[account.id] ?? ""}
                      />
                      <button
                        className="h-7 rounded-md border border-[#405468] bg-[#172636]/72 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                        disabled={!secretDrafts[account.id]}
                        onClick={() => void saveExistingModelAccountSecret(account)}
                        type="button"
                      >
                        {copy(locale, "save")}
                      </button>
                      <button
                        className="h-7 rounded-md border border-[#405468] bg-[#172636]/72 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                        disabled={!account.hasSecret}
                        onClick={() => void copyExistingModelAccountSecret(account)}
                        title={copy(locale, "copyPassword")}
                        type="button"
                      >
                        {copy(locale, "copyPassword").slice(0, 2)}
                      </button>
                      <button
                        className="flex h-7 items-center justify-center rounded-md border border-[#7f4a4a]/80 bg-[#4d2529]/64 text-[#ffb4b4] transition active:translate-y-px disabled:opacity-40"
                        disabled={modelAccounts.length <= 1}
                        onClick={() => void deleteModelAccount(account)}
                        title={copy(locale, "deleteAccount")}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {selectedLoginAccount && (
          <div className="no-drag absolute inset-0 z-40 flex items-end bg-[#081222]/58 p-2 backdrop-blur-sm">
            {(() => {
              const account = selectedLoginAccount
              const accountStatus = accountStatuses[account.id] ?? null
              const accountSession = getAccountSession(account)
              const authCommand = getAccountAuthCommand(account)
              const authStatusCommand = getAccountAuthStatusCommand(account)
              const launchCommand = getAccountLaunchCommand(account)
              const isAccountBusy = accountBusyId === account.id
              const latestOutput =
                accountStatus?.lastOutput
                  ?.split("\n")
                  .slice(-16)
                  .join("\n")
                  .trim() ||
                monitorText ||
                "Idle"

              return (
                <div className="flex max-h-[calc(100vh-18px)] w-full flex-col overflow-hidden rounded-xl border border-[#405468]/90 bg-[#172636]/98 shadow-2xl">
                  <div className="border-b border-[#405468]/70 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-[#a8f0cf]" />
                          <div className="truncate text-[13px] font-semibold text-[#f3f7fb]">
                            {copy(locale, "loginAssist")}
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] leading-4 text-[#91a6b8]">
                          {copy(locale, "loginPanelHint")}
                        </div>
                      </div>
                      <button
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#263746] text-[#c4cfda]"
                        onClick={() => setSelectedLoginAccountId(null)}
                        type="button"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-[1fr_96px] gap-1.5">
                      <label className="relative block min-w-0">
                        <select
                          className="h-8 w-full appearance-none rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2 pr-7 text-[11px] font-semibold text-[#eef3f8] outline-none"
                          onChange={(event) => {
                            const nextAccount = modelAccounts.find((item) => item.id === event.target.value)
                            if (nextAccount) openLoginAssist(nextAccount)
                          }}
                          value={account.id}
                        >
                          {modelAccounts.map((item) => (
                            <option key={item.id} value={item.id}>
                              {providerLabel(item.provider)} · {item.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-[#91a6b8]" />
                      </label>
                      <button
                        className="h-8 rounded-md border border-[#405468] bg-[#263746]/72 px-2 text-[10px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                        onClick={() => {
                          setSelectedLoginAccountId(null)
                          setShowAccountManager(true)
                        }}
                        type="button"
                      >
                        {copy(locale, "modelAccounts")}
                      </button>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <div className="rounded-md border border-[#405468]/70 bg-[#263746]/54 p-2">
                        <div className="text-[9px] uppercase text-[#91a6b8]">{copy(locale, "target")}</div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-[#eef3f8]">
                          {providerLabel(account.provider)}
                        </div>
                      </div>
                      <div className="rounded-md border border-[#405468]/70 bg-[#263746]/54 p-2">
                        <div className="text-[9px] uppercase text-[#91a6b8]">{copy(locale, "tmuxSession")}</div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-[#eef3f8]">
                          {accountSession ?? account.appName ?? "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-[#405468]/70 bg-[#263746]/54 p-2">
                        <div className="text-[9px] uppercase text-[#91a6b8]">{copy(locale, "authStatus")}</div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-[#eef3f8]">
                          {getStatusLabel(accountStatus)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="rounded-lg border border-[#405468]/80 bg-[#263746]/62 p-2 text-left transition active:translate-y-px disabled:opacity-40"
                        disabled={!accountSession || !launchCommand || isAccountBusy}
                        onClick={() => void startModelAccountAgent(account)}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#f3f7fb]">
                          <Play className="h-3.5 w-3.5 text-[#a8f0cf]" />
                          {copy(locale, "loginStepSession")}
                        </div>
                        <div className="mt-1 truncate font-mono text-[9px] text-[#91a6b8]">
                          {launchCommand ?? "-"}
                        </div>
                      </button>
                      <button
                        className="rounded-lg border border-[#405468]/80 bg-[#263746]/62 p-2 text-left transition active:translate-y-px disabled:opacity-40"
                        disabled={!accountSession || !authStatusCommand || isAccountBusy}
                        onClick={() => void runModelAccountAuthStatusCommand(account)}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#f3f7fb]">
                          <ListChecks className="h-3.5 w-3.5 text-[#a8f0cf]" />
                          {copy(locale, "loginStepStatus")}
                        </div>
                        <div className="mt-1 truncate font-mono text-[9px] text-[#91a6b8]">
                          {authStatusCommand ?? "-"}
                        </div>
                      </button>
                      <button
                        className="rounded-lg border border-[#405468]/80 bg-[#263746]/62 p-2 text-left transition active:translate-y-px disabled:opacity-40"
                        disabled={!accountSession || !authCommand || isAccountBusy}
                        onClick={() => void runModelAccountAuthCommand(account)}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#f3f7fb]">
                          <TerminalSquare className="h-3.5 w-3.5 text-[#a8f0cf]" />
                          {copy(locale, "loginStepAuth")}
                        </div>
                        <div className="mt-1 truncate font-mono text-[9px] text-[#91a6b8]">
                          {authCommand ?? "-"}
                        </div>
                      </button>
                      <button
                        className="rounded-lg border border-[#405468]/80 bg-[#263746]/62 p-2 text-left transition active:translate-y-px disabled:opacity-40"
                        disabled={!account.hasSecret || isAccountBusy}
                        onClick={() => void copyExistingModelAccountSecret(account)}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#f3f7fb]">
                          <KeyRound className="h-3.5 w-3.5 text-[#a8f0cf]" />
                          {copy(locale, "copySecret")}
                        </div>
                        <div className="mt-1 truncate text-[9px] text-[#91a6b8]">
                          {account.hasSecret ? copy(locale, "keychainReady") : copy(locale, "keychainMissing")}
                        </div>
                      </button>
                    </div>

                    {account.provider !== "cursor" ? (
                      <div className="mt-2 rounded-lg border border-[#405468]/80 bg-[#263746]/42 p-2">
                        <div className="mb-1.5 text-[10px] font-semibold text-[#aebdcc]">
                          {copy(locale, "commandPreview")}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <input
                            className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 font-mono text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                            onChange={(event) =>
                              updateExistingModelAccount(account.id, {
                                launchCommand: event.target.value,
                              })
                            }
                            placeholder="launch"
                            value={account.launchCommand ?? ""}
                          />
                          <input
                            className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 font-mono text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                            onChange={(event) =>
                              updateExistingModelAccount(account.id, {
                                authStatusCommand: event.target.value,
                              })
                            }
                            placeholder={copy(locale, "authStatus")}
                            value={account.authStatusCommand ?? ""}
                          />
                          <input
                            className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 font-mono text-[10px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8]"
                            onChange={(event) =>
                              updateExistingModelAccount(account.id, {
                                authCommand: event.target.value,
                              })
                            }
                            placeholder={copy(locale, "authCommand")}
                            value={account.authCommand ?? ""}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-2 rounded-lg border border-[#1f3040]/90 bg-[#081222]/96 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="text-[10px] font-semibold uppercase text-[#91a6b8]">
                          {copy(locale, "latestOutput")}
                        </div>
                        <button
                          className="h-6 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                          disabled={!accountSession || isAccountBusy}
                          onClick={() => void refreshModelAccountAgent(account)}
                          type="button"
                        >
                          {copy(locale, "refreshOutput")}
                        </button>
                      </div>
                      <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-[#72869a]">
                        {latestOutput}
                      </pre>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        <div className="no-drag flex gap-1.5 border-b border-[#3f5265]/70 bg-[#263746]/28 p-2">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#91a6b8]" />
            <input
              className="h-8 w-full rounded-md border border-[#405468]/80 bg-[#263746]/68 pl-8 pr-2.5 text-[12px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] focus:border-[#66c59f]/60"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              value={query}
            />
          </label>
          {editMode ? (
            <>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf] transition active:translate-y-px"
                onClick={openSkillManager}
                title={copy(locale, "skillManager")}
                type="button"
              >
                <PackagePlus className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf] transition active:translate-y-px"
                onClick={createCommand}
                title={copy(locale, "newTile")}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#405468]/80 bg-[#263746]/68 text-[#c4cfda] transition active:translate-y-px"
                onClick={exportProfile}
                title={t("exportProfile")}
                type="button"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#405468]/80 bg-[#263746]/68 text-[#c4cfda] transition active:translate-y-px"
                onClick={() => importProfileInputRef.current?.click()}
                title={t("importProfile")}
                type="button"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input
                ref={importProfileInputRef}
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void importProfile(event.target.files?.[0])}
                type="file"
              />
            </>
          ) : null}
          <label className="relative block w-[72px] shrink-0" title={copy(locale, "language")}>
            <select
              className="h-8 w-full appearance-none rounded-md border border-[#405468]/80 bg-[#263746]/68 pl-2 pr-6 text-[10px] font-semibold text-[#d9e3ec] outline-none focus:border-[#66c59f]/60"
              onChange={(event) => updateLocale(event.target.value as LocaleCode)}
              value={locale}
            >
              {locales.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-3.5 w-3.5 text-[#9fb1c1]" />
          </label>
        </div>

        <main className="no-drag min-h-0 flex-1 overflow-y-auto p-2">
          {hasSearch ? (
            <div className="grid gap-2" style={actionGridStyle}>
              {visibleCommands.map((command) =>
                renderActionButton(command, tileByCommandId.get(command.id)?.size ?? "small"),
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {actionSections.map((section) => (
                <section key={section.group}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <h2
                      className="font-semibold uppercase tracking-normal text-[#aebdcc]"
                      style={{
                        fontSize: scaledSizes.groupFont,
                        lineHeight: `${scaledNumber(14, deckScaleFactor)}px`,
                      }}
                    >
                      {groupTitle(section.group, locale)}
                    </h2>
                    <div className="h-px flex-1 bg-[#405468]/70 ml-2" />
                  </div>
                  <div className="grid gap-2" style={actionGridStyle}>
                    {section.tiles.map(({ command, layout }) =>
                      renderActionButton(command, layout.size),
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>

        <footer className="no-drag shrink-0 border-t border-[#3f5265]/70 bg-[#263746]/30 p-2">
          <div
            className={cx(
              "mb-1.5 flex h-8 items-center gap-1.5 rounded-md border px-2",
              session
                ? "border-[#405468]/82 bg-[#263746]/70 text-[#eef3f8]"
                : "border-[#405468]/62 bg-[#263746]/48 text-[#91a6b8]",
            )}
          >
            <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10.5px] font-semibold">
                {session
                  ? `${targetLabel(activeTarget, locale)} (${session}) - status: ${getStatusLabel(agentStatus)}`
                  : `${activeTarget ? targetLabel(activeTarget, locale) : copy(locale, "target")} - ${copy(
                      locale,
                      "monitorDisabled",
                    )}`}
              </div>
              <div className="truncate text-[9px] text-[#91a6b8]">
                {session
                  ? (agentStatus?.detail ?? copy(locale, "checkingTmuxSession"))
                  : copy(locale, "noTmuxControl")}
              </div>
            </div>

            <button
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#172636]/72 text-[#c4cfda] disabled:opacity-45"
              disabled={!session || agentBusy}
              onClick={() => void refreshAgent()}
              type="button"
            >
              <RefreshCw className={agentBusy ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
            </button>
            {agentStatus?.agentRunning ? (
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#172636]/72 text-[#c4cfda] disabled:opacity-45"
                disabled={!session || agentBusy}
                onClick={() => void stopAgent()}
                title={copy(locale, "stopAgent")}
                type="button"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#172636]/72 text-[#c4cfda] disabled:opacity-45"
                disabled={!session || agentBusy || !activeTarget?.launchCommand}
                onClick={() => void startAgent()}
                title={t("startAgentSession")}
                type="button"
              >
                <Play className="h-3 w-3" />
              </button>
            )}
          </div>

          <div
            className="overflow-y-auto rounded-lg border border-[#1f3040]/90 bg-[#081222]/96 p-2.5 font-mono text-[#72869a] shadow-inner"
            style={{
              fontSize: scaledSizes.monitorFont,
              height: currentMonitorHeight,
              lineHeight: `${scaledSizes.monitorLine}px`,
            }}
          >
            {monitorError ? (
              <pre className="whitespace-pre-wrap text-[#aebdcc]">{monitorError}</pre>
            ) : (
              <pre className="whitespace-pre-wrap">{monitorText}</pre>
            )}
          </div>

          <div
            className={cx(
              "mt-1.5 flex items-center gap-1.5 text-[10.5px]",
              firstFailure ? "text-[#ffb4b4]" : "text-[#91a6b8]",
            )}
          >
            {firstFailure ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="truncate">{statusLine}</span>
          </div>
        </footer>

        {showSkillManager && (
          <div className="no-drag absolute inset-0 z-30 flex items-end bg-[#081222]/48 p-2 backdrop-blur-sm">
            <div className="flex max-h-[calc(100vh-24px)] w-full flex-col overflow-hidden rounded-xl border border-[#405468]/90 bg-[#172636]/98 p-3 shadow-2xl">
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#f3f7fb]">
                    {copy(locale, "skillManager")}
                  </div>
                  <div className="mt-0.5 truncate text-[9px] text-[#91a6b8]">
                    {skillPacks.length} Skill packs · {commands.length} {copy(locale, "commands")}
                  </div>
                </div>
                <button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#263746] text-[#c4cfda] transition active:translate-y-px"
                  onClick={() => setShowSkillManager(false)}
                  type="button"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mb-2 grid grid-cols-[1fr_92px] gap-2">
                <input
                  className="h-8 rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2.5 text-[12px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] focus:border-[#66c59f]/60"
                  onChange={(event) => setSkillCreateDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createSkillPack()
                  }}
                  placeholder={t("defaultSkillGroupName")}
                  value={skillCreateDraft}
                />
                <button
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#66c59f]/45 bg-[#2e6f5b]/28 px-2 text-[10px] font-semibold text-[#a8f0cf] transition active:translate-y-px"
                  onClick={() => createSkillPack()}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("newCommand")}
                </button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-[118px_1fr] gap-2">
                <div className="min-h-0 overflow-y-auto rounded-lg border border-[#405468]/80 bg-[#0f1d2c]/52 p-1.5">
                  {skillPacks.map((pack) => (
                    <button
                      className={cx(
                        "mb-1 flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition active:translate-y-px",
                        draggingSkillGroup === pack.group && "opacity-55 ring-1 ring-[#66c59f]/35",
                        pack.group === selectedSkillPack?.group
                          ? "border-[#66c59f]/45 bg-[#2e6f5b]/24 text-[#a8f0cf]"
                          : "border-[#405468]/70 bg-[#263746]/58 text-[#c4cfda] hover:border-[#5b7084]",
                      )}
                      draggable
                      key={pack.group}
                      onClick={() => {
                        if (suppressDragClickRef.current) {
                          suppressDragClickRef.current = false
                          return
                        }
                        selectSkillPack(pack.group)
                      }}
                      onDragEnd={finishDrag}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = "move"
                      }}
                      onDragStart={(event) => {
                        suppressDragClickRef.current = true
                        setDraggingSkillGroup(pack.group)
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("application/x-yukun-skill", pack.group)
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const sourceGroup =
                          draggingSkillGroup ||
                          event.dataTransfer.getData("application/x-yukun-skill")
                        reorderSkillPack(sourceGroup, pack.group)
                        finishDrag()
                      }}
                      type="button"
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-[#91a6b8]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-semibold">
                          {pack.title}
                        </span>
                        <span className="block truncate text-[8.5px] text-[#91a6b8]">
                          {pack.count} {copy(locale, "commands")}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="min-h-0 overflow-hidden rounded-lg border border-[#405468]/80 bg-[#263746]/46 p-2">
                  {selectedSkillPack ? (
                    <div className="flex h-full min-h-0 flex-col">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                          {copy(locale, "skillName")}
                        </span>
                        <div className="grid grid-cols-[1fr_64px] gap-1.5">
                          <input
                            className="h-8 rounded-md border border-[#405468]/80 bg-[#172636]/82 px-2 text-[11px] text-[#eef3f8] outline-none focus:border-[#66c59f]/60"
                            onChange={(event) => setSkillRenameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                renameSkillPack(selectedSkillPack.group)
                              }
                            }}
                            value={skillRenameDraft}
                          />
                          <button
                            className="h-8 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[10px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                            onClick={() => renameSkillPack(selectedSkillPack.group)}
                            type="button"
                          >
                            {copy(locale, "renameSkill")}
                          </button>
                        </div>
                      </label>

                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button
                          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                          onClick={() => duplicateSkillPack(selectedSkillPack.group)}
                          type="button"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span className="whitespace-nowrap">{copy(locale, "duplicateSkill")}</span>
                        </button>
                        <button
                          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#7f4a4a]/80 bg-[#4d2529]/64 px-2 text-[9px] font-semibold text-[#ffb4b4] transition active:translate-y-px"
                          onClick={() => deleteSkillPack(selectedSkillPack.group)}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="whitespace-nowrap">{t("delete")}</span>
                        </button>
                      </div>

                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button
                          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                          onClick={() => exportSkillPack(selectedSkillPack.group)}
                          title={copy(locale, "exportSkill")}
                          type="button"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="whitespace-nowrap">{copy(locale, "exportSkill")}</span>
                        </button>
                        <button
                          className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#405468] bg-[#172636]/72 px-2 text-[9px] font-semibold text-[#c4cfda] transition active:translate-y-px"
                          onClick={() => importSkillPackInputRef.current?.click()}
                          title={copy(locale, "importSkill")}
                          type="button"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span className="whitespace-nowrap">{copy(locale, "importSkill")}</span>
                        </button>
                        <input
                          ref={importSkillPackInputRef}
                          accept="application/json,.json"
                          className="hidden"
                          onChange={(event) => void importSkillPack(event.target.files?.[0])}
                          type="file"
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-[#405468]/70 pt-2">
                        <div className="text-[10px] font-semibold text-[#aebdcc]">
                          {copy(locale, "commands")}
                        </div>
                        <div className="rounded-full border border-[#405468]/70 bg-[#172636]/72 px-2 py-0.5 text-[8.5px] text-[#91a6b8]">
                          {selectedSkillPack.count}
                        </div>
                      </div>

                      <div className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto">
                        {selectedSkillPack.tiles.length ? (
                          selectedSkillPack.tiles.map(({ command, layout }) => {
                            const Icon = iconMap[command.icon as keyof typeof iconMap] ?? Command

                            return (
                              <button
                                className={cx(
                                  "flex w-full items-center gap-2 rounded-md border border-[#405468]/70 bg-[#172636]/70 px-2 py-1.5 text-left transition hover:border-[#5b7084] active:translate-y-px",
                                  draggingCommandId === command.id && "opacity-55 ring-1 ring-[#66c59f]/35",
                                )}
                                draggable
                                key={command.id}
                                onClick={() => {
                                  if (suppressDragClickRef.current) {
                                    suppressDragClickRef.current = false
                                    return
                                  }
                                  setShowSkillManager(false)
                                  openCommandEditor(command)
                                }}
                                onDragEnd={finishDrag}
                                onDragOver={(event) => {
                                  event.preventDefault()
                                  event.dataTransfer.dropEffect = "move"
                                }}
                                onDragStart={(event) => {
                                  suppressDragClickRef.current = true
                                  setDraggingCommandId(command.id)
                                  event.dataTransfer.effectAllowed = "move"
                                  event.dataTransfer.setData("application/x-agentdeck-command", command.id)
                                }}
                                onDrop={(event) => {
                                  event.preventDefault()
                                  const sourceCommandId =
                                    draggingCommandId ||
                                    event.dataTransfer.getData("application/x-agentdeck-command")
                                  reorderCommandWithinSkillPack(sourceCommandId, command.id)
                                  finishDrag()
                                }}
                                title={copy(locale, "openTile")}
                                type="button"
                              >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#506579]/70 bg-[#263746]/76 text-[#c4cfda]">
                                  <GripVertical className="h-3.5 w-3.5 text-[#91a6b8]" />
                                </span>
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#506579]/70 bg-[#263746]/76 text-[#c4cfda]">
                                  <Icon className="h-3.5 w-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[10.5px] font-semibold text-[#eef3f8]">
                                    {text(command.name, locale)}
                                  </span>
                                  <span className="block truncate text-[8.5px] text-[#91a6b8]">
                                    {copy(locale, tileSizeCopyKey(layout.size))} ·{" "}
                                    {copy(locale, sendModeCopyKey(command.sendMode))}
                                  </span>
                                </span>
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-[#91a6b8]" />
                              </button>
                            )
                          })
                        ) : (
                          <div className="rounded-md border border-dashed border-[#405468]/80 px-2 py-4 text-center text-[10px] text-[#91a6b8]">
                            {copy(locale, "emptySkill")}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-[#405468]/80 px-3 text-center text-[10px] leading-4 text-[#91a6b8]">
                      {copy(locale, "emptySkill")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {editingCommand && (
          <div className="no-drag absolute inset-0 z-30 flex items-end bg-[#081222]/48 p-2 backdrop-blur-sm">
            <div className="max-h-[calc(100vh-24px)] w-full overflow-y-auto rounded-xl border border-[#405468]/90 bg-[#172636]/98 p-3 shadow-2xl">
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#f3f7fb]">
                    {copy(locale, "editTiles")}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[9px] text-[#91a6b8]">
                    {editingCommand.category} / {editingCommand.id}
                  </div>
                </div>
                <button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#405468] bg-[#263746] text-[#c4cfda] transition active:translate-y-px"
                  onClick={() => setEditingCommandId(null)}
                  type="button"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                    {copy(locale, "displayText")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2.5 text-[12px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] focus:border-[#66c59f]/60"
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    value={editDraft.name}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                    {t("description")}
                  </span>
                  <input
                    className="h-8 w-full rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2.5 text-[12px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] focus:border-[#66c59f]/60"
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, description: event.target.value }))
                    }
                    value={editDraft.description}
                  />
                </label>

                <div className="grid grid-cols-[1fr_92px] gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                      {copy(locale, "group")}
                    </span>
                    <input
                      className="h-8 w-full rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2.5 text-[12px] text-[#eef3f8] outline-none placeholder:text-[#91a6b8] focus:border-[#66c59f]/60"
                      list="agentdeck-tile-groups"
                      onChange={(event) =>
                        setEditDraft((draft) => ({ ...draft, group: event.target.value }))
                      }
                      value={editDraft.group}
                    />
                    <datalist id="agentdeck-tile-groups">
                      {availableGroups.map((group) => (
                        <option key={group} value={group} />
                      ))}
                    </datalist>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                      {copy(locale, "tileSize")}
                    </span>
                    <select
                      className="h-8 w-full appearance-none rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2 text-[11px] text-[#eef3f8] outline-none focus:border-[#66c59f]/60"
                      onChange={(event) =>
                        setEditDraft((draft) => ({
                          ...draft,
                          size: event.target.value as TileSize,
                        }))
                      }
                      value={editDraft.size}
                    >
                      {(["small", "medium", "wide"] as TileSize[]).map((size) => (
                        <option key={size} value={size}>
                          {copy(locale, tileSizeCopyKey(size))}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-[1fr_122px] gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                      {copy(locale, "target")}
                    </span>
                    <select
                      className="h-8 w-full appearance-none rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2 text-[11px] text-[#eef3f8] outline-none transition focus:border-[#66c59f]/60 disabled:opacity-45"
                      disabled={!editDraft.targetLocked}
                      onChange={(event) => {
                        const nextTarget = availableTargets.find((target) => target.id === event.target.value)
                        setEditDraft((draft) => ({
                          ...draft,
                          defaultTargetId: event.target.value,
                          sendMode: nextTarget ? defaultSendModeForTarget(nextTarget) : draft.sendMode,
                        }))
                      }}
                      value={editDraft.defaultTargetId}
                    >
                      {availableTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {targetLabel(target, locale)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                      {copy(locale, "sendMode")}
                    </span>
                    <select
                      className="h-8 w-full appearance-none rounded-md border border-[#405468]/80 bg-[#263746]/72 px-2 text-[11px] text-[#eef3f8] outline-none focus:border-[#66c59f]/60"
                      onChange={(event) =>
                        setEditDraft((draft) => ({
                          ...draft,
                          sendMode: event.target.value as SendMode,
                        }))
                      }
                      value={editDraft.sendMode}
                    >
                      {(["tmux_send_keys", "paste", "type"] as SendMode[]).map((sendMode) => (
                        <option key={sendMode} value={sendMode}>
                          {copy(locale, sendModeCopyKey(sendMode))}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex h-8 items-center gap-2 rounded-md border border-[#405468]/80 bg-[#263746]/58 px-2 text-[10px] font-medium text-[#c4cfda]">
                    <input
                      checked={editDraft.targetLocked}
                      className="h-3.5 w-3.5 accent-[#66c59f]"
                      onChange={(event) =>
                        setEditDraft((draft) => ({ ...draft, targetLocked: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span className="truncate">{t("lockToCommandTarget")}</span>
                  </label>
                  <label className="flex h-8 items-center gap-2 rounded-md border border-[#405468]/80 bg-[#263746]/58 px-2 text-[10px] font-medium text-[#c4cfda]">
                    <input
                      checked={editDraft.autoEnter}
                      className="h-3.5 w-3.5 accent-[#66c59f]"
                      onChange={(event) =>
                        setEditDraft((draft) => ({ ...draft, autoEnter: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span className="truncate">{t("autoEnter")}</span>
                  </label>
                  <label className="flex h-8 items-center gap-2 rounded-md border border-[#405468]/80 bg-[#263746]/58 px-2 text-[10px] font-medium text-[#c4cfda]">
                    <input
                      checked={editDraft.confirmBeforeSend}
                      className="h-3.5 w-3.5 accent-[#66c59f]"
                      onChange={(event) =>
                        setEditDraft((draft) => ({
                          ...draft,
                          confirmBeforeSend: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span className="truncate">{t("confirmBeforeSend")}</span>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-[#aebdcc]">
                    Prompt / {t("content")}
                  </span>
                  <textarea
                    className="h-28 w-full resize-none rounded-md border border-[#405468]/80 bg-[#081222]/72 px-2.5 py-2 font-mono text-[10.5px] leading-4 text-[#d9e3ec] outline-none placeholder:text-[#72869a] focus:border-[#66c59f]/60"
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, content: event.target.value }))
                    }
                    value={editDraft.content}
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  <button
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#405468] bg-[#263746]/72 px-2.5 text-[11px] font-medium text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                    disabled={!defaultCommandById.has(editingCommand.id)}
                    onClick={resetCommandEdit}
                    type="button"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {copy(locale, "restore")}
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#405468] bg-[#263746]/72 text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                    disabled={!canMoveEditingTileUp}
                    onClick={() => moveTile(editingCommand.id, -1)}
                    title={t("moveUp")}
                    type="button"
                  >
                    <ChevronsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#405468] bg-[#263746]/72 text-[#c4cfda] transition active:translate-y-px disabled:opacity-40"
                    disabled={!canMoveEditingTileDown}
                    onClick={() => moveTile(editingCommand.id, 1)}
                    title={t("moveDown")}
                    type="button"
                  >
                    <ChevronsDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#405468] bg-[#263746]/72 text-[#c4cfda] transition active:translate-y-px"
                    onClick={() => duplicateCommand(editingCommand)}
                    title={t("duplicateCommand")}
                    type="button"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#7f4a4a]/80 bg-[#4d2529]/64 text-[#ffb4b4] transition active:translate-y-px"
                    onClick={() => deleteCommand(editingCommand)}
                    title={t("delete")}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    className="h-8 rounded-md border border-[#405468] bg-[#263746]/72 px-3 text-[11px] font-medium text-[#c4cfda] transition active:translate-y-px"
                    onClick={() => setEditingCommandId(null)}
                    type="button"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#66c59f]/45 bg-[#2e6f5b]/28 px-3 text-[11px] font-semibold text-[#a8f0cf] transition active:translate-y-px"
                    onClick={saveCommandEdit}
                    type="button"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {copy(locale, "save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {pendingBlock && (
          <div className="no-drag absolute inset-0 z-40 flex items-end bg-zinc-950/24 p-3 backdrop-blur-sm">
            <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-50">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[14px] font-semibold text-zinc-950">
                    {pendingBlock.confirmationOnly ? t("confirm") : t("riskTitle")}
                  </h2>
                  <p className="mt-1 text-[12px] leading-5 text-zinc-600">
                    {pendingBlock.response.blockedReason
                      ? blockLabels[pendingBlock.response.blockedReason]
                      : pendingBlock.response.message}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 transition active:translate-y-px"
                  onClick={() => setPendingBlock(null)}
                  type="button"
                >
                  {t("cancel")}
                </button>
                <button
                  className="rounded-md bg-zinc-950 px-3 py-1.5 text-[12px] font-medium text-zinc-50 transition active:translate-y-px"
                  onClick={() => {
                    const blockedCommand = pendingBlock.command
                    const confirmationOnly = pendingBlock.confirmationOnly
                    setPendingBlock(null)
                    void sendCommand(blockedCommand, !confirmationOnly, true)
                  }}
                  type="button"
                >
                  {t("send")}
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          aria-label="Resize yukun"
          className="no-drag absolute bottom-1.5 right-1.5 z-50 flex h-5 w-5 items-center justify-center rounded-md border border-[#405468]/70 bg-[#172636]/72 text-[#72869a] opacity-70 transition hover:opacity-100 active:translate-y-px"
          onPointerDown={(event) => {
            event.preventDefault()
            void startWindowResize()
          }}
          title="Resize"
          type="button"
        >
          <GripVertical className="h-3.5 w-3.5 rotate-45" />
        </button>
      </section>
    </div>
  )
}
