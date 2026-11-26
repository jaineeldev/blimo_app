import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { roomAround, useScreenSpace } from '../../hooks/useScreenSpace'
import { setBubbleSlot } from './bubbleSlot'

/** Space kept between a bubble and the top or bottom of the screen. */
const EDGE_GAP = 8
/** Taken as the bubble's height until it has been measured: about a two-line comment. */
const GUESS_HEIGHT = 90

/**
 * Where a speech bubble goes: just above the buddy, or underneath when there isn't room above for it
 * (near the top of the screen) and there's more room below. Uses the bubble's real height, and moves
 * again if the buddy is carried somewhere else while it's talking.
 *
 * Put `ref` and `style` on an element with the `bubble-anchor` class, and pass `within` to the bubble
 * so it slides over to stay on screen when the buddy is near a side.
 */
export function useBubblePlacement(size: number): {
  ref: (el: HTMLElement | null) => void
  style: CSSProperties
  tail: 'down' | 'up'
  within: { left: number; right: number } | null
} {
  const space = useScreenSpace()
  const [height, setHeight] = useState(GUESS_HEIGHT)
  const observer = useRef<ResizeObserver | null>(null)
  // offsetHeight ignores the pop-in scale, so this is the height it settles at. It changes when buttons
  // appear under the text, for example.
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    setHeight(el.offsetHeight || GUESS_HEIGHT)
    observer.current = new ResizeObserver(() => setHeight(el.offsetHeight || GUESS_HEIGHT))
    observer.current.observe(el)
  }, [])

  const reach = size * 0.36 + 10
  const room = roomAround(space, reach)
  const need = height + EDGE_GAP
  const below = room.above < need && room.below > room.above
  // Says where it is, so the stats and song pills can stack past it instead of covering it.
  const [owner] = useState(() => Symbol('bubble'))
  useLayoutEffect(() => setBubbleSlot(owner, { below, reach: reach + height }), [owner, below, reach, height])
  useLayoutEffect(() => () => setBubbleSlot(owner, null), [owner])
  return {
    ref,
    style: below ? { top: `calc(50% + ${reach}px)` } : { bottom: `calc(50% + ${reach}px)` },
    tail: below ? 'up' : 'down',
    within: space ? { left: room.left, right: room.right } : null,
  }
}
