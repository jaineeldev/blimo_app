import { useEffect, useMemo, useRef } from 'react'
import { useBuddyStore } from '../stores/buddyStore'

/** Gets bored after this long without any input, and falls asleep after the second. */
const BORED_AFTER_MS = 2 * 60_000
const ASLEEP_AFTER_MS = 5 * 60_000
/** Often enough that typing wakes it within a second; the mouse wakes it instantly through the cursor feed. */
const IDLE_CHECK_MS = 1_000

/** Two clicks closer than this startle it. */
const DOUBLE_CLICK_MS = 260
/** This many pets inside the window and it falls in love. */
const LOVE_PETS = 4
const LOVE_WINDOW_MS = 2_500
/** Hovering has to settle for this long before it gets curious, so passing over it doesn't count. */
const HOVER_DWELL_MS = 450

type Idle = 'awake' | 'bored' | 'asleep'

/**
 * Turns what's happening around the buddy into moods: petting, being carried,
 * being hovered, being left alone. Returns handlers for the mouse hook.
 */
export function useReactions() {
  const state = useRef({
    lastClick: 0,
    pets: [] as number[],
    shaken: false,
    hovering: false,
    hoverTimer: 0,
    idle: 'awake' as Idle,
    lastMove: Date.now(),
  })

  const handlers = useMemo(() => {
    const s = state.current
    const store = useBuddyStore.getState

    // Bored and asleep come from being left alone; curious from a lingering cursor.
    const refreshAmbient = () => {
      store().setAmbient(s.idle === 'asleep' ? 'sleepy' : s.idle === 'bored' ? 'bored' : s.hovering ? 'curious' : null)
    }

    const noticeMovement = () => {
      s.lastMove = Date.now()
      if (s.idle === 'awake') return
      s.idle = 'awake'
      refreshAmbient()
      // Woken up by you coming back.
      store().react('surprised', 900)
      store().bump()
    }

    return {
      refreshAmbient,
      noticeMovement,
      pet() {
        const now = Date.now()
        const quick = now - s.lastClick < DOUBLE_CLICK_MS
        s.lastClick = now
        s.pets = s.pets.filter((t) => now - t < LOVE_WINDOW_MS).concat(now)
        // No bump: the press already squashed it, and letting go springs it back.
        store().notePet()
        // Petting a buddy that's already in love keeps it there.
        if (s.pets.length >= LOVE_PETS || store().reaction === 'love') {
          s.pets = []
          store().react('love', 3_200)
        } else if (quick) {
          store().react('surprised', 800)
        } else {
          store().react(Math.random() < 0.2 ? 'wink' : 'happy', 1_300)
        }
      },
      grab() {
        s.shaken = false
        store().react('surprised', Infinity)
      },
      shaken() {
        s.shaken = true
        store().react('dizzy', Infinity)
      },
      drop() {
        store().bump()
        store().noteDrop()
        if (s.shaken) store().react('dizzy', 2_600)
        else store().react(null)
      },
      hover(on: boolean) {
        window.clearTimeout(s.hoverTimer)
        if (!on) {
          s.hovering = false
          refreshAmbient()
          return
        }
        s.hoverTimer = window.setTimeout(() => {
          s.hovering = true
          refreshAmbient()
          // Now and then it winks at you instead of just looking.
          if (Math.random() < 0.15) store().react('wink', 900)
        }, HOVER_DWELL_MS)
      },
    }
  }, [])

  // Wakes up with a stretch when the app starts.
  useEffect(() => {
    const { react, bump } = useBuddyStore.getState()
    react('sleepy', Infinity)
    const timer = window.setTimeout(() => {
      react('surprised', 700)
      bump()
    }, 900)
    return () => {
      window.clearTimeout(timer)
      react(null)
    }
  }, [])

  // Gets bored, then sleepy, when you leave the computer alone for a while. In the app any input
  // counts, typing included; in a plain browser only the pointer can be seen.
  useEffect(() => {
    const s = state.current
    const check = window.setInterval(async () => {
      const bridge = window.buddy
      const away = bridge ? (await bridge.getIdleSeconds()) * 1000 : Date.now() - s.lastMove
      const next: Idle = away > ASLEEP_AFTER_MS ? 'asleep' : away > BORED_AFTER_MS ? 'bored' : 'awake'
      if (next === s.idle) return
      // Coming back gets a little wake-up; drifting off just changes the mood.
      if (next === 'awake') {
        handlers.noticeMovement()
        return
      }
      s.idle = next
      handlers.refreshAmbient()
    }, IDLE_CHECK_MS)

    const onPointer = () => handlers.noticeMovement()
    window.addEventListener('pointermove', onPointer)
    const offCursor = window.buddy?.onCursor(onPointer)
    const offShaken = window.buddy?.onShaken(handlers.shaken)
    return () => {
      window.clearInterval(check)
      window.removeEventListener('pointermove', onPointer)
      offCursor?.()
      offShaken?.()
    }
  }, [handlers])

  // Perks up to see what you're doing when the customise panel opens.
  const panelOpen = useBuddyStore((s) => s.panelOpen)
  useEffect(() => {
    if (panelOpen) useBuddyStore.getState().react('curious', 1_200)
  }, [panelOpen])

  return handlers
}
