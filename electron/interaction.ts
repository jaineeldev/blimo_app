import { BrowserWindow, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { rememberPosition } from './windowState'

/** Faster than the display, so the buddy stays right under the cursor while carried. */
const DRAG_MS = 1000 / 120
/** How much of each new speed reading to take. The cursor and the timer don't tick in step, so raw readings jitter. */
const SPEED_SMOOTHING = 0.35

let drag: { win: BrowserWindow; timer: ReturnType<typeof setInterval> } | null = null

const windowOf = (event: IpcMainEvent | IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender)

/** A swing has to cover this many px per tick to count, so slow repositioning never trips it. */
const SHAKE_SPEED = 8
/** This many direction changes inside the window means the buddy is being shaken. */
const SHAKE_REVERSALS = 4
const SHAKE_WINDOW_MS = 1000

/** Watches cursor positions during a drag and calls `onShake` once if they swing back and forth hard. */
function shakeDetector(onShake: () => void) {
  let last: { x: number; y: number } | null = null
  const dir = { x: 0, y: 0 }
  let reversals: number[] = []
  let fired = false
  return (cursor: { x: number; y: number }) => {
    if (fired) return
    const now = Date.now()
    if (last) {
      for (const axis of ['x', 'y'] as const) {
        const delta = cursor[axis] - last[axis]
        if (Math.abs(delta) < SHAKE_SPEED) continue
        const sign = Math.sign(delta)
        if (dir[axis] !== 0 && sign !== dir[axis]) reversals.push(now)
        dir[axis] = sign
      }
    }
    last = cursor
    reversals = reversals.filter((t) => now - t < SHAKE_WINDOW_MS)
    if (reversals.length >= SHAKE_REVERSALS) {
      fired = true
      onShake()
    }
  }
}

function stopDrag() {
  if (!drag) return
  clearInterval(drag.timer)
  // Let go, so it swings back to rest.
  if (!drag.win.isDestroyed()) drag.win.webContents.send('buddy:carried', { vx: 0, vy: 0 })
  drag = null
}

/**
 * Window controls the renderer drives: click-through on empty space, dragging
 * by the buddy's body, always-on-top, and where the screen edges are.
 * Registered once; each message acts on the window that sent it.
 */
export function registerWindowControls() {
  ipcMain.on('window:click-through', (event, through: boolean) => {
    // `forward` keeps mouse moves coming while clicks pass through, so the renderer can tell when the cursor reaches the buddy again.
    windowOf(event)?.setIgnoreMouseEvents(through, { forward: true })
  })

  ipcMain.on('window:drag-start', (event) => {
    const win = windowOf(event)
    if (!win) return
    stopDrag()
    const start = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    const grab = { x: start.x - bounds.x, y: start.y - bounds.y }
    const shake = shakeDetector(() => win.webContents.send('buddy:shaken'))
    let last = { x: bounds.x, y: bounds.y, at: performance.now() }
    const speed = { x: 0, y: 0 }
    let sent = ''
    const timer = setInterval(() => {
      if (win.isDestroyed()) return stopDrag()
      const cursor = screen.getCursorScreenPoint()
      shake(cursor)
      const x = cursor.x - grab.x
      const y = cursor.y - grab.y
      const now = performance.now()
      const dt = Math.max(now - last.at, 1) / 1000
      speed.x += ((x - last.x) / dt - speed.x) * SPEED_SMOOTHING
      speed.y += ((y - last.y) / dt - speed.y) * SPEED_SMOOTHING
      if (x !== last.x || y !== last.y) {
        // setBounds with a fixed size: setPosition alone can grow the window on scaled Windows displays.
        win.setBounds({ x, y, width: bounds.width, height: bounds.height })
      }
      last = { x, y, at: now }
      // The renderer swings the buddy from this; px per second.
      const carried = { vx: Math.round(speed.x), vy: Math.round(speed.y) }
      const key = `${carried.vx},${carried.vy}`
      if (key !== sent) win.webContents.send('buddy:carried', carried)
      sent = key
    }, DRAG_MS)
    drag = { win, timer }
  })

  // Let go: it stays right where it was dropped, and remembers the spot for next time.
  ipcMain.on('window:drag-end', (event) => {
    const win = drag?.win ?? windowOf(event)
    stopDrag()
    if (win) rememberPosition(win)
  })

  ipcMain.on('window:always-on-top', (event, onTop: boolean) => {
    windowOf(event)?.setAlwaysOnTop(onTop)
  })

  ipcMain.handle('window:screen-space', (event) => {
    const win = windowOf(event)
    if (!win) return null
    const content = win.getContentBounds()
    const { workArea } = screen.getDisplayNearestPoint({
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    })
    return {
      left: workArea.x - content.x,
      top: workArea.y - content.y,
      right: workArea.x + workArea.width - content.x,
      bottom: workArea.y + workArea.height - content.y,
    }
  })
}
