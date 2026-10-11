import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** How far the buddy's middle stays inside a screen's edges when it has to be brought back. */
const RESCUE_INSET = 150

const stateFile = () => path.join(app.getPath('userData'), 'window-position.json')

const middleOf = (b: Rectangle) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** Whether the middle of the window, where the buddy sits, is inside one of the screens. */
function onScreen(bounds: Rectangle): boolean {
  const { x, y } = middleOf(bounds)
  return screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height)
}

/** Where the buddy was last left, as long as that spot is still on a screen you have. */
export function savedPosition(size: { width: number; height: number }): { x: number; y: number } | undefined {
  try {
    const { x, y } = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (typeof x !== 'number' || typeof y !== 'number') return undefined
    return onScreen({ x, y, ...size }) ? { x, y } : undefined
  } catch {
    // No file yet (first launch) or an unreadable one: start in the middle of the screen.
    return undefined
  }
}

/** Saves where the buddy is now, for next launch. */
export function rememberPosition(win: BrowserWindow) {
  if (win.isDestroyed()) return
  const { x, y } = win.getBounds()
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ x, y }))
  } catch {
    // Not worth interrupting anything over; it just starts in the middle next time.
  }
}

/**
 * If a screen is unplugged or rearranged and takes the buddy with it, brings it back onto the
 * nearest screen, moving it no further than it has to.
 */
export function keepOnScreen(win: BrowserWindow) {
  const rescue = () => {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    if (onScreen(bounds)) return
    const middle = middleOf(bounds)
    const { workArea: a } = screen.getDisplayNearestPoint(middle)
    const inset = (span: number) => Math.min(RESCUE_INSET, span / 2)
    const clamp = (v: number, lo: number, span: number) => Math.min(Math.max(v, lo + inset(span)), lo + span - inset(span))
    const x = clamp(middle.x, a.x, a.width)
    const y = clamp(middle.y, a.y, a.height)
    win.setBounds({ x: Math.round(x - bounds.width / 2), y: Math.round(y - bounds.height / 2), width: bounds.width, height: bounds.height })
    rememberPosition(win)
  }
  screen.on('display-removed', rescue)
  screen.on('display-metrics-changed', rescue)
  win.on('closed', () => {
    screen.off('display-removed', rescue)
    screen.off('display-metrics-changed', rescue)
  })
}
