import { useSyncExternalStore } from 'react'

/**
 * Where the speech bubble is showing, if one is: above or below the buddy, and how far its far edge
 * reaches from the window's middle. The stats and song pills read it to stack past the bubble rather
 * than cover it. Each bubble holds its own entry, so one fading out can't clear the next one's.
 */
export interface BubbleSlot {
  below: boolean
  /** Px from the window's middle (the buddy's centre) to the bubble's far edge. */
  reach: number
}

const slots = new Map<symbol, BubbleSlot>()
let current: BubbleSlot | null = null
const listeners = new Set<() => void>()

function changed() {
  // The newest bubble is the one on screen; Map keeps the order they arrived in.
  const all = [...slots.values()]
  const latest = all[all.length - 1] ?? null
  if (latest?.below === current?.below && latest?.reach === current?.reach) return
  current = latest
  listeners.forEach((listener) => listener())
}

export function setBubbleSlot(owner: symbol, slot: BubbleSlot | null) {
  if (slot) slots.set(owner, slot)
  else slots.delete(owner)
  changed()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBubbleSlot(): BubbleSlot | null {
  return useSyncExternalStore(subscribe, () => current)
}
