import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { rememberPosition } from './windowState'

/** A drag has to push at least this share of the buddy past a screen's edge for it to tuck in... */
const PUSH_PAST = 0.2
/** ...and then it sits with this share hidden: just under half, so its middle stays on the screen. */
const TUCKED = 0.45
/** It slides the rest of the way in, or back out a little, over this long. */
const SLIDE_MS = 220
const SLIDE_TICK_MS = 1000 / 120

let slide: ReturnType<typeof setInterval> | null = null

/** Stops a slide part-way, for example when the buddy is grabbed again. */
export function stopSlide() {
  if (slide) clearInterval(slide)
  slide = null
}

const distanceTo = (r: Rectangle, x: number, y: number) =>
  Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.width)), Math.max(r.y - y, 0, y - (r.y + r.height)))

/**
 * Which edge a drag pushed the buddy past, and how far to slide it so it sits tucked in. Null when it
 * isn't past an edge, or the edge only leads onto another screen. `body` and `screens` are in screen
 * coordinates.
 */
export function edgeFor(body: BodyRect, screens: Rectangle[]): { side: PeekSide; dx: number } | null {
  const width = body.right - body.left
  if (!screens.length || !(width > 0)) return null
  const midX = (body.left + body.right) / 2
  const midY = (body.top + body.bottom) / 2
  // The screen it was dropped on: the one holding its middle, or the nearest when it was pushed further.
  const home = screens.reduce((best, s) => (distanceTo(s, midX, midY) < distanceTo(best, midX, midY) ? s : best))
  const leadsOn = (x: number) => screens.some((s) => s !== home && x >= s.x && x < s.x + s.width && midY >= s.y && midY < s.y + s.height)
  const left = home.x
  const right = home.x + home.width
  if (left - body.left >= width * PUSH_PAST && !leadsOn(left - 1)) return { side: 'left', dx: left - width * TUCKED - body.left }
  if (body.right - right >= width * PUSH_PAST && !leadsOn(right)) return { side: 'right', dx: right + width * TUCKED - body.right }
  return null
}

/**
 * After a drag. Pushed past a screen's edge, the buddy slides to sit tucked half behind it, peeking
 * out; anywhere else it stays exactly where it was dropped. Either way, the spot is remembered.
 * `body` is where the buddy was let go, relative to the window's content area.
 */
export function settleAfterDrag(win: BrowserWindow, body?: BodyRect) {
  stopSlide()
  if (win.isDestroyed()) return
  const content = win.getContentBounds()
  const measured = body && [body.left, body.top, body.right, body.bottom].every(Number.isFinite)
  const edge = measured
    ? edgeFor(
        { left: content.x + body.left, top: content.y + body.top, right: content.x + body.right, bottom: content.y + body.bottom },
        screen.getAllDisplays().map((d) => d.bounds),
      )
    : null
  if (!edge) {
    win.webContents.send('buddy:peek', null)
    rememberPosition(win)
    return
  }
  const from = win.getBounds()
  const to = Math.round(from.x + edge.dx)
  const start = performance.now()
  slide = setInterval(() => {
    if (win.isDestroyed()) return stopSlide()
    const u = Math.min(1, (performance.now() - start) / SLIDE_MS)
    const x = Math.round(from.x + (to - from.x) * (1 - (1 - u) ** 3))
    // A fixed size, as in the drag: setPosition alone can grow the window on scaled displays.
    win.setBounds({ x, y: from.y, width: from.width, height: from.height })
    if (u < 1) return
    stopSlide()
    rememberPosition(win, edge.side)
    // Told once it has settled, so it peeks out (and anything it says fits the screen) from where it ends up.
    win.webContents.send('buddy:peek', edge.side)
  }, SLIDE_TICK_MS)
}
