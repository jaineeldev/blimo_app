import { useSyncExternalStore } from 'react'
import type { ScreenSpace } from '../stores/buddyStore'

// One shared copy of where the screen edges are, relative to the window, kept fresh by the main process
// as the buddy moves. Everything placed around the buddy reads it, so they all agree.
let current: ScreenSpace | null = null
let started = false
const listeners = new Set<() => void>()

function set(space: ScreenSpace | null) {
  if (!space) return
  current = space
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started && window.buddy) {
    started = true
    window.buddy.onScreenSpace(set)
    void window.buddy.getScreenSpace().then(set)
  }
  return () => {
    listeners.delete(listener)
  }
}

/** The screen's usable edges relative to the window, or null in a plain browser (the face gallery). */
export function useScreenSpace(): ScreenSpace | null {
  return useSyncExternalStore(subscribe, () => current)
}

/**
 * The usable room above and below a box of `reach` px either side of the window's middle (where the
 * buddy sits), and the sides, all clipped to the window since nothing draws outside it.
 */
export function roomAround(space: ScreenSpace | null, reach: number) {
  const w = window.innerWidth
  const h = window.innerHeight
  const top = Math.max(0, space?.top ?? 0)
  const bottom = Math.min(h, space?.bottom ?? h)
  return {
    above: h / 2 - reach - top,
    below: bottom - (h / 2 + reach),
    left: Math.max(0, space?.left ?? 0),
    right: Math.min(w, space?.right ?? w),
  }
}
