import { useSpring, type MotionValue } from 'framer-motion'
import { useEffect, type RefObject } from 'react'

/** Snaps to a target like a real eye, overshooting a touch before it settles. */
const SACCADE = { stiffness: 420, damping: 21, mass: 0.6 }

/** After this long without the cursor moving, the buddy starts glancing around on its own. */
const IDLE_AFTER_MS = 3500

/** How far the eyes turn toward the cursor by default, in viewBox units. */
export const GAZE_TRAVEL = 3.4

interface GazeOptions {
  /** Point between the eyes, in viewBox units. */
  center: { x: number; y: number }
  /** Furthest the eyes travel, in viewBox units. */
  travel?: number
  enabled?: boolean
  /** Somewhere to keep looking instead of at the cursor, relative to the window: a video, say. */
  target?: { x: number; y: number } | null
}

/**
 * Eye offset toward the cursor. In Electron the main process feeds the cursor
 * position from anywhere on the desktop; in a plain browser the eyes follow
 * the pointer across the page.
 */
export function useGaze(
  svgRef: RefObject<SVGSVGElement>,
  { center, travel = GAZE_TRAVEL, enabled = true, target = null }: GazeOptions,
): { x: MotionValue<number>; y: MotionValue<number> } {
  const x = useSpring(0, SACCADE)
  const y = useSpring(0, SACCADE)
  const { x: cx, y: cy } = center
  const tx = target?.x
  const ty = target?.y

  useEffect(() => {
    if (!enabled) {
      x.set(0)
      y.set(0)
      return
    }

    let lastMove = performance.now()
    let glanceTimer = 0

    const aim = (point: { x: number; y: number }) => {
      lastMove = performance.now()
      const svg = svgRef.current
      if (!svg) return
      const box = svg.getBoundingClientRect()
      const dx = point.x - (box.left + (cx / 100) * box.width)
      const dy = point.y - (box.top + (cy / 100) * box.height)
      const dist = Math.hypot(dx, dy) || 1
      // Close targets get a small turn; far ones saturate at `travel`.
      const reach = travel * (1 - Math.exp(-dist / 140))
      x.set((dx / dist) * reach)
      y.set((dy / dist) * reach)
    }

    // Eyes fixed on something, so no glancing around and no following the cursor.
    if (tx !== undefined && ty !== undefined) {
      aim({ x: tx, y: ty })
      return
    }

    const glance = () => {
      if (performance.now() - lastMove > IDLE_AFTER_MS) {
        const angle = Math.random() * Math.PI * 2
        const reach = Math.random() < 0.3 ? 0 : travel * (0.3 + Math.random() * 0.4)
        x.set(Math.cos(angle) * reach)
        y.set(Math.sin(angle) * reach)
      }
      glanceTimer = window.setTimeout(glance, 1200 + Math.random() * 2200)
    }
    glanceTimer = window.setTimeout(glance, 2000)

    let unsubscribe: () => void
    if (window.buddy) {
      unsubscribe = window.buddy.onCursor(aim)
    } else {
      const onPointer = (e: PointerEvent) => aim({ x: e.clientX, y: e.clientY })
      window.addEventListener('pointermove', onPointer)
      unsubscribe = () => window.removeEventListener('pointermove', onPointer)
    }

    return () => {
      unsubscribe()
      window.clearTimeout(glanceTimer)
    }
  }, [svgRef, cx, cy, travel, enabled, x, y, tx, ty])

  return { x, y }
}
