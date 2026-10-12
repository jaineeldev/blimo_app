import { useEffect, useState, type CSSProperties } from 'react'

/** How much room a bubble needs above the buddy before it flips underneath instead. */
const BUBBLE_ROOM = 170

/**
 * Where a speech bubble goes: just above the buddy, or underneath when the buddy sits near the top
 * of the screen. Apply `style` to an element with the `bubble-anchor` class, and pass `within` to the
 * bubble so it stays on screen when the buddy is near a side.
 */
export function useBubblePlacement(size: number): {
  style: CSSProperties
  tail: 'down' | 'up'
  within: { left: number; right: number } | null
} {
  const [below, setBelow] = useState(false)
  const [within, setWithin] = useState<{ left: number; right: number } | null>(null)
  useEffect(() => {
    window.buddy?.getScreenSpace().then((space) => {
      if (!space) return
      setBelow(window.innerHeight / 2 - size * 0.4 - Math.max(0, space.top) < BUBBLE_ROOM)
      setWithin({ left: space.left, right: space.right })
    })
  }, [size])

  const reach = size * 0.36 + 10
  return {
    style: below ? { top: `calc(50% + ${reach}px)` } : { bottom: `calc(50% + ${reach}px)` },
    tail: below ? 'up' : 'down',
    within,
  }
}
