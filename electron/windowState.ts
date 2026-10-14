import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** How far the buddy's middle stays inside a screen's edges when it has to be brought back. */
const RESCUE_INSET = 150
/** The window's size before saved positions recorded it (up to v1.0.0). */
const OLD_SIZE = { width: 860, height: 620 }

const stateFile = () => path.join(app.getPath('userData'), 'window-position.json')

/** The screen edge the buddy was left tucked behind, if any. */
let peeking: PeekSide | null = null

/** The edge the buddy is tucked behind right now, if any. */
export const peekSide = () => peeking

const middleOf = (b: Rectangle) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** Whether the middle of the window, where the buddy sits, is inside one of the screens. */
function onScreen(bounds: Rectangle): boolean {
  const { x, y } = middleOf(bounds)
  return screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height)
}

/** Where the buddy was last left, as long as that spot is still on a screen you have. */
export function savedPosition(size: { width: number; height: number }): { x: number; y: number } | undefined {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (typeof saved.x !== 'number' || typeof saved.y !== 'number') return undefined
    // If the window has changed size since, the buddy (in its middle) still lands exactly where it was.
    const was = typeof saved.width === 'number' && typeof saved.height === 'number' ? saved : OLD_SIZE
    const x = Math.round(saved.x + (was.width - size.width) / 2)
    const y = Math.round(saved.y + (was.height - size.height) / 2)
    const { peek } = saved
    if (!onScreen({ x, y, ...size })) return undefined
    // Left peeking from an edge, it's still tucked in there.
    peeking = peek === 'left' || peek === 'right' ? peek : null
    return { x, y }
  } catch {
    // No file yet (first launch) or an unreadable one: start in the middle of the screen.
    return undefined
  }
}

/** Saves where the buddy is now, and the edge it's tucked behind if it's peeking, for next launch. */
export function rememberPosition(win: BrowserWindow, peek: PeekSide | null = null) {
  if (win.isDestroyed()) return
  peeking = peek
  const { x, y, width, height } = win.getBounds()
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ x, y, width, height, peek }))
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
    // Wherever it lands, it isn't tucked behind an edge any more.
    rememberPosition(win)
    win.webContents.send('buddy:peek', null)
  }
  screen.on('display-removed', rescue)
  screen.on('display-metrics-changed', rescue)
  win.on('closed', () => {
    screen.off('display-removed', rescue)
    screen.off('display-metrics-changed', rescue)
  })
}
