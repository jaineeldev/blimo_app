import { useEffect, useState } from 'react'

/**
 * The latest CPU, memory and GPU readings while `active`. Being active also tells the app the stats are
 * showing, so it reads every second and includes the GPU (on Windows) until they're hidden again.
 */
export function useSystemStats(active: boolean): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null)
  useEffect(() => {
    const bridge = window.buddy
    if (!active || !bridge) return
    bridge.setStatsShowing(true)
    const off = bridge.onStats(setStats)
    return () => {
      off()
      bridge.setStatsShowing(false)
      // The next time they show, they start from a fresh reading rather than an old one.
      setStats(null)
    }
  }, [active])
  return stats
}
