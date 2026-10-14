import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import './SpeechBubble.css'

/** Milliseconds per character while the text types out. */
export const TYPE_MS = 24
/** The widest a bubble gets, padding and all. Panels beside the buddy keep clear of this, so they never cover what it says. */
export const BUBBLE_MAX_WIDTH = 280
/** Space kept between a bubble and the side of the screen. */
const EDGE_GAP = 8
/** The tail stays at least this far in from the bubble's rounded ends. */
const TAIL_INSET = 20

/**
 * How far to slide a bubble sideways to keep it on screen, and where its tail goes so it still points
 * at the buddy. The bubble starts centred over the buddy, in the middle of the window.
 */
function useKeepWithin(ref: RefObject<HTMLElement>, within: { left: number; right: number } | null | undefined, text: string) {
  const [place, setPlace] = useState({ shift: 0, tail: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !within) return
    // offsetWidth ignores the pop-in scale, so this is the size it settles at.
    const half = el.offsetWidth / 2
    const centre = window.innerWidth / 2
    const lo = within.left + EDGE_GAP + half
    const hi = within.right - EDGE_GAP - half
    const shift = lo > hi ? 0 : Math.min(Math.max(centre, lo), hi) - centre
    const reach = Math.max(0, half - TAIL_INSET)
    setPlace({ shift, tail: Math.max(-reach, Math.min(reach, -shift)) })
  }, [ref, within, text])
  return place
}

function useTypewriter(text: string): string {
  const instant = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(instant ? text.length : 0)
  useEffect(() => {
    if (instant) {
      setShown(text.length)
      return
    }
    setShown(0)
    const timer = window.setInterval(() => {
      setShown((n) => {
        if (n >= text.length) window.clearInterval(timer)
        return Math.min(n + 1, text.length)
      })
    }, TYPE_MS)
    return () => window.clearInterval(timer)
  }, [text, instant])
  return text.slice(0, shown)
}

interface SpeechBubbleProps {
  text: string
  /** Buttons, inputs and the like, shown once the text has finished typing. */
  children?: ReactNode
  /** Which way the tail points: down at a buddy below, or up at a buddy above. */
  tail?: 'down' | 'up'
  /** Fades the bubble away, then calls `onLeft`. */
  leaving?: boolean
  onLeft?: () => void
  /** The screen's sides, relative to the window. Near one, the bubble slides over to stay on screen. */
  within?: { left: number; right: number } | null
}

/** What the buddy says. Solid to the mouse, so its buttons work in the click-through window. */
export function SpeechBubble({ text, children, tail = 'down', leaving = false, onLeft, within }: SpeechBubbleProps) {
  const typed = useTypewriter(text)
  const done = typed.length === text.length
  const ref = useRef<HTMLDivElement>(null)
  const place = useKeepWithin(ref, within, text)
  return (
    <div style={{ translate: `${place.shift}px 0` }}>
      <motion.div
        ref={ref}
        data-hit
        className={`bubble bubble--tail-${tail}`}
        style={{ '--tail-x': `${place.tail}px`, maxWidth: BUBBLE_MAX_WIDTH } as CSSProperties}
        initial={{ opacity: 0, scale: 0.9, y: tail === 'down' ? 6 : -6 }}
        animate={leaving ? { opacity: 0, scale: 0.94, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        onAnimationComplete={() => {
          if (leaving) onLeft?.()
        }}
      >
        {/* Keyed by the text: a new line remounts the contents with a small lift, while the bubble itself stays put. */}
        <motion.div key={text} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          {/* The rest of the sentence is laid out but hidden while it types, so the bubble is its full size
              from the start and each centred line sits still as its letters appear. */}
          <p className="bubble-text" aria-live="polite">
            <span aria-hidden="true">
              {typed}
              <span className="bubble-untyped">{text.slice(typed.length)}</span>
            </span>
            {/* Screen readers get the whole sentence once, not a letter at a time. */}
            <span className="sr-only">{text}</span>
          </p>
          {done && children && (
            <motion.div
              className="bubble-extra"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
