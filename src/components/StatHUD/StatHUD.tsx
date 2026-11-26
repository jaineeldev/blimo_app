import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { roomAround, useScreenSpace } from '../../hooks/useScreenSpace'
import { useSystemStats } from '../../hooks/useSystemStats'
import { useBubbleSlot } from '../SpeechBubble/bubbleSlot'
import './StatHUD.css'

/** Hovering has to settle this long before the pills appear, so passing over the buddy doesn't flash them. */
const SHOW_AFTER_MS = 400
/** Only Windows can read the GPU (through the helper). */
const HAS_GPU = window.buddy?.platform === 'win32'
/** Space between the pills and the buddy, and between the pills and the screen's edges. */
const GAP = 14
const EDGE_GAP = 8
/** Space between the pills and a speech bubble they stack past. */
const STACK_GAP = 8
/** Taken as the pills' size until they've been measured: one pill. */
const GUESS = { width: 240, height: 32 }
/** A single note, like the ones that float up while it bops, in a 12-unit box. */
const NOTE =
  'M7.6 1.2V8.6C7.6 10.5 5.9 11.6 4.1 11.4 2.5 11.2 1.5 10.1 1.9 8.9 2.3 7.6 4.2 6.8 5.9 7.3V1.2ZM7.6 1.2C9.2 2 10.6 3.3 10 6.2 9.6 4.8 8.8 4.1 7.6 3.9Z'

interface StatHUDProps {
  hovered: boolean
  /** Show how busy your computer is: CPU, memory and, on Windows, the GPU. */
  stats: boolean
  /** The song that's playing, when "show what's playing" is on. */
  song: Song | null
  size: number
}

/**
 * Slim pills under the buddy while you hover over it: how busy your computer is, and the song that's
 * playing. Near the bottom of the screen (above the taskbar or Dock) they go above it instead, and near
 * a side, or tucked behind a screen edge, they slide over to stay on screen. While the buddy is talking
 * they stack past its speech bubble, never over it.
 */
export function StatHUD({ hovered, stats: showStats, song, size }: StatHUDProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!hovered) {
      setShown(false)
      return
    }
    const timer = window.setTimeout(() => setShown(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [hovered])
  const stats = useSystemStats(shown && showStats)
  const any = (showStats && stats) || song

  const space = useScreenSpace()
  const [box, setBox] = useState(GUESS)
  const observer = useRef<ResizeObserver | null>(null)
  // offsetWidth/Height ignore the slide-in transform, so this is the size they settle at.
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const measure = () => setBox({ width: el.offsetWidth || GUESS.width, height: el.offsetHeight || GUESS.height })
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(el)
  }, [])

  const reach = Math.round(size * 0.36 + GAP)
  const room = roomAround(space, reach)
  const bubble = useBubbleSlot()
  // How far out from the buddy they'd start on each side: past the bubble if it's on that side.
  const startAt = (below: boolean) => (bubble && bubble.below === below ? Math.max(reach, bubble.reach + STACK_GAP) : reach)
  const roomFor = (below: boolean) => (below ? room.below : room.above) - (startAt(below) - reach)
  const fits = (below: boolean) => roomFor(below) >= box.height + EDGE_GAP
  // Under the buddy where they fit, else above; if neither fits, wherever there's more room.
  const above = fits(true) ? false : fits(false) ? true : roomFor(false) > roomFor(true)
  const from = startAt(!above)
  // Centred under the buddy unless that would run off a side of the screen.
  const centre = window.innerWidth / 2
  const half = box.width / 2
  const lo = room.left + EDGE_GAP + half
  const hi = room.right - EDGE_GAP - half
  const shift = lo > hi ? 0 : Math.min(Math.max(centre, lo), hi) - centre
  const nudge = above ? 4 : -4

  return (
    <AnimatePresence>
      {shown && any && (
        <motion.div
          key="stats"
          ref={ref}
          className={above ? 'stat-hud stat-hud--above' : 'stat-hud'}
          style={{ ...(above ? { bottom: `calc(50% + ${from}px)` } : { top: `calc(50% + ${from}px)` }), marginLeft: shift }}
          initial={{ opacity: 0, y: nudge, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: nudge, x: '-50%' }}
          transition={{ duration: 0.2 }}
        >
          {showStats && stats && (
            <div
              className="stat-pill"
              role="status"
              aria-label={`CPU ${stats.cpu}%, memory ${stats.ram}%${stats.gpu === null ? '' : `, GPU ${stats.gpu}%`}`}
            >
              <span>
                CPU <b>{stats.cpu}%</b>
              </span>
              <span title={`${stats.ramUsedGb.toFixed(1)} of ${stats.ramTotalGb.toFixed(0)} GB`}>
                RAM <b>{stats.ram}%</b>
              </span>
              {/* The first GPU reading takes a second; until then it holds its place. */}
              {HAS_GPU && (
                <span>
                  GPU <b>{stats.gpu === null ? '–' : `${stats.gpu}%`}</b>
                </span>
              )}
            </div>
          )}
          {song && (
            <div className="stat-pill stat-song" role="status" aria-label={song.artist ? `Playing ${song.title} by ${song.artist}` : `Playing ${song.title}`}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d={NOTE} fill="currentColor" />
              </svg>
              <b>{song.title}</b>
              {song.artist && <span>· {song.artist}</span>}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
