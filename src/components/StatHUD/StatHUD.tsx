import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useSystemStats } from '../../hooks/useSystemStats'
import './StatHUD.css'

/** Hovering has to settle this long before the pills appear, so passing over the buddy doesn't flash them. */
const SHOW_AFTER_MS = 400
/** Only Windows can read the GPU (through the helper). */
const HAS_GPU = window.buddy?.platform === 'win32'
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
  peek: PeekSide | null
}

/**
 * Slim pills under the buddy while you hover over it: how busy your computer is, and the song that's
 * playing. Tucked behind a screen edge, they shift towards the side that's showing.
 */
export function StatHUD({ hovered, stats: showStats, song, size, peek }: StatHUDProps) {
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

  return (
    <AnimatePresence>
      {shown && any && (
        <motion.div
          key="stats"
          className="stat-hud"
          style={{ top: `calc(50% + ${Math.round(size * 0.36 + 14)}px)`, marginLeft: peek === 'right' ? -110 : peek === 'left' ? 110 : 0 }}
          initial={{ opacity: 0, y: -4, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -4, x: '-50%' }}
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
