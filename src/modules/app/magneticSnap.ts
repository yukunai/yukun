import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi"
import { availableMonitors, currentMonitor, getCurrentWindow, type Monitor } from "@tauri-apps/api/window"

const placementStorageKey = "agentdeck.windowPlacement.v1"

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window
}

interface StoredWindowPlacement {
  height?: number
  updatedAt: number
  width?: number
  x: number
  y: number
}

export interface MagneticSnapOptions {
  edgeThreshold?: number
  margin?: number
  settleDelayMs?: number
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readStoredPlacement(): StoredWindowPlacement | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(placementStorageKey) ?? "null")

    if (
      parsed &&
      finiteNumber(parsed.x) &&
      finiteNumber(parsed.y) &&
      finiteNumber(parsed.updatedAt)
    ) {
      return {
        height: finiteNumber(parsed.height) ? parsed.height : undefined,
        updatedAt: parsed.updatedAt,
        width: finiteNumber(parsed.width) ? parsed.width : undefined,
        x: parsed.x,
        y: parsed.y,
      }
    }
  } catch {
    return null
  }

  return null
}

function saveStoredPlacement(placement: StoredWindowPlacement) {
  localStorage.setItem(placementStorageKey, JSON.stringify(placement))
}

function monitorForPoint(monitors: Monitor[], x: number, y: number) {
  return (
    monitors.find((monitor) => {
      const area = monitor.workArea
      return (
        x >= area.position.x &&
        y >= area.position.y &&
        x <= area.position.x + area.size.width &&
        y <= area.position.y + area.size.height
      )
    }) ?? monitors[0]
  )
}

export async function snapWindowToRightEdge(margin = 12) {
  if (!hasTauriRuntime()) return

  const appWindow = getCurrentWindow()
  const monitor = await currentMonitor()
  if (!monitor) return

  const size = await appWindow.outerSize()
  const workArea = monitor.workArea
  const x = workArea.position.x + workArea.size.width - size.width - margin
  const y = workArea.position.y + Math.max(36, margin)

  await appWindow.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
}

export async function restoreWindowPlacement(margin = 12) {
  if (!hasTauriRuntime()) return false

  const placement = readStoredPlacement()
  if (!placement) return false

  const appWindow = getCurrentWindow()
  const monitors = await availableMonitors()
  const monitor = monitorForPoint(monitors, placement.x, placement.y) ?? (await currentMonitor())
  if (!monitor) return false

  const currentSize = await appWindow.outerSize()
  const workArea = monitor.workArea
  const width = clamp(
    Math.round(placement.width ?? currentSize.width),
    360,
    Math.max(360, workArea.size.width - margin * 2),
  )
  const height = clamp(
    Math.round(placement.height ?? currentSize.height),
    420,
    Math.max(420, workArea.size.height - margin * 2),
  )
  const x = clamp(
    Math.round(placement.x),
    workArea.position.x + margin,
    workArea.position.x + workArea.size.width - width - margin,
  )
  const y = clamp(
    Math.round(placement.y),
    workArea.position.y + margin,
    workArea.position.y + workArea.size.height - height - margin,
  )

  await appWindow.setSize(new PhysicalSize(width, height))
  await appWindow.setPosition(new PhysicalPosition(x, y))

  return true
}

async function saveCurrentWindowPlacement() {
  if (!hasTauriRuntime()) return

  const appWindow = getCurrentWindow()
  const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()])

  saveStoredPlacement({
    height: Math.round(size.height),
    updatedAt: Date.now(),
    width: Math.round(size.width),
    x: Math.round(position.x),
    y: Math.round(position.y),
  })
}

export async function installMagneticSnap(options: MagneticSnapOptions = {}) {
  if (!hasTauriRuntime()) {
    return () => undefined
  }

  const appWindow = getCurrentWindow()
  const threshold = options.edgeThreshold ?? 56
  const margin = options.margin ?? 12
  const settleDelayMs = options.settleDelayMs ?? 90
  let timer: number | undefined
  let saveTimer: number | undefined
  let snapping = false

  async function snapIfNearEdge() {
    if (snapping) return

    const monitor = await currentMonitor()
    if (!monitor) return

    const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()])
    const workArea = monitor.workArea

    const left = workArea.position.x + margin
    const right = workArea.position.x + workArea.size.width - size.width - margin
    const top = workArea.position.y + margin
    const bottom = workArea.position.y + workArea.size.height - size.height - margin

    const nearLeft = Math.abs(position.x - left) <= threshold
    const nearRight = Math.abs(position.x - right) <= threshold
    const nearTop = Math.abs(position.y - top) <= threshold
    const nearBottom = Math.abs(position.y - bottom) <= threshold
    const nextX = nearRight ? right : nearLeft ? left : position.x
    const nextY = nearTop ? top : nearBottom ? bottom : clamp(position.y, top, bottom)

    if (nextX === position.x && nextY === position.y) {
      await saveCurrentWindowPlacement()
      return
    }

    snapping = true
    try {
      await appWindow.setPosition(
        new PhysicalPosition(Math.round(nextX), Math.round(nextY)),
      )
      await saveCurrentWindowPlacement()
    } finally {
      window.setTimeout(() => {
        snapping = false
      }, settleDelayMs)
    }
  }

  function queueSave() {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void saveCurrentWindowPlacement(), settleDelayMs)
  }

  const unlisten = await appWindow.onMoved(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void snapIfNearEdge(), settleDelayMs)
  })
  const unlistenResize = await appWindow.onResized(queueSave)

  return () => {
    window.clearTimeout(timer)
    window.clearTimeout(saveTimer)
    unlisten()
    unlistenResize()
  }
}
