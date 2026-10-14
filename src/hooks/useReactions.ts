import { useEffect, useMemo, useRef } from 'react'
import { isSecretName } from '../components/Buddy/secretNames'
import { MILESTONES, greetingAt, isLate, lineFor, type Milestone, type Topic } from '../components/Chatter/lines'
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

/** A stroke over the buddy has to travel this far before turning back to count towards a belly rub. */
const RUB_STROKE_PX = 14
/** This many strokes close together starts a belly rub... */
const RUB_STROKES = 4
const RUB_WINDOW_MS = 1_400
/** ...it ends once the strokes stop for this long... */
const RUB_END_MS = 600
/** ...and keep it up for this long and it falls in love. */
const RUB_LOVE_MS = 3_000

/** Cursor steps under this many px don't set a direction, so slow drifting never counts as whipping it around. */
const WHIP_STEP_PX = 6
/** Turning back this many times while covering this much ground, inside the window, is dizzying to watch. */
const WHIP_TURNS = 6
const WHIP_DISTANCE_PX = 3_000
const WHIP_WINDOW_MS = 1_200
/** Time to get its bearings back before it can get dizzy again. */
const WHIP_REST_MS = 8_000

/** It says something now and then, but never more often than this... */
const CHAT_REST_MS = 20_000
/** ...and each kind of moment only comes with a line some of the time. Greetings and warnings always do. */
const CHAT_CHANCE: Record<Topic, number> = {
  click: 0.25,
  love: 0.6,
  rub: 0.5,
  whip: 0.6,
  shaken: 0.6,
  peek: 0.5,
  morning: 1,
  afternoon: 1,
  evening: 1,
  night: 1,
  back: 0.6,
  late: 0.3,
  battery: 1,
  batteryVeryLow: 1,
  charging: 0.6,
  secret: 1,
}

/** It says hello once it has properly woken up at launch, and welcome back a moment after you return. */
const GREET_AFTER_MS = 2_400
const WELCOME_BACK_MS = 1_000
/** Anniversaries in days together, biggest first. */
const ANNIVERSARIES: [Milestone, number][] = [
  ['year', 365],
  ['days-100', 100],
  ['month', 30],
  ['week', 7],
]
const DAY_MS = 86_400_000
const PET_MILESTONES: Partial<Record<number, Milestone>> = { 100: 'pets-100', 500: 'pets-500', 1000: 'pets-1000' }

/** The battery counts as low at this level and very low at the second, unless it's charging. */
const LOW_BATTERY = 0.2
const VERY_LOW_BATTERY = 0.1

/** A secret name is celebrated once it has stayed put this long, since typing one passes through others. */
const SECRET_SETTLE_MS = 700

type Idle = 'awake' | 'bored' | 'asleep'
type Point = { x: number; y: number }
/** The parts of the Battery Status API it uses, which TypeScript's DOM types leave out. */
type Battery = EventTarget & { level: number; charging: boolean }

/**
 * Turns what's happening around the buddy into moods: petting, being carried, being hovered or
 * stroked, watching the cursor, being left alone. Now and then it says something about it, too.
 * Returns handlers for the mouse hook.
 */
export function useReactions() {
  const state = useRef({
    lastClick: 0,
    pets: [] as number[],
    shaken: false,
    hovering: false,
    hoverTimer: 0,
    /** The cursor is over the buddy right now (`hovering` waits for it to settle). */
    over: false,
    idle: 'awake' as Idle,
    lastMove: Date.now(),
    lastChat: 0,
    point: null as Point | null,
    rub: { dir: 0, travel: 0, strokes: [] as number[], since: 0, loved: false, timer: 0 },
    whip: { dir: { x: 0, y: 0 }, turns: [] as number[], steps: [] as { at: number; px: number }[], restUntil: 0 },
    battery: { low: false, veryLow: false, charging: true },
  })

  const handlers = useMemo(() => {
    const s = state.current
    const store = useBuddyStore.getState

    // Bored and asleep come from being left alone; curious from a lingering cursor; drained from a low battery.
    const refreshAmbient = () => {
      store().setAmbient(
        s.idle === 'asleep' ? 'sleepy' : s.idle === 'bored' ? 'bored' : s.hovering ? 'curious' : s.battery.low ? 'sad' : null,
      )
    }

    /**
     * Says a line, as long as nothing else has the floor: not during the intro, an update message or
     * the what's new card, and not over the customise panel unless `overPanel`. Never in quiet mode;
     * a milestone then waits until it's switched off.
     */
    const speak = (text: string, overPanel = false) => {
      const { quiet, onboarded, panelOpen, whatsNew, updateBusy, chatter, say } = store()
      if (quiet || !onboarded || (panelOpen && !overPanel) || whatsNew || updateBusy || chatter) return false
      s.lastChat = Date.now()
      say(text)
      return true
    }

    /** Sometimes says something about what just happened. `always` skips the dice and the rest between lines. */
    const talk = (topic: Topic, always = false) => {
      if (!always && (Date.now() - s.lastChat < CHAT_REST_MS || Math.random() >= CHAT_CHANCE[topic])) return false
      return speak(lineFor(topic, store().name), topic === 'secret')
    }

    /** Mentions a milestone the first time it can. If something else has the floor, it waits for next time. */
    const celebrateMilestone = (id: Milestone) => {
      if (store().milestones.includes(id) || !speak(MILESTONES[id])) return false
      store().markMilestone(id)
      return true
    }

    /** The biggest anniversary reached and not yet mentioned. Any smaller ones it skipped past count as said. */
    const anniversary = () => {
      const { firstMet, milestones, markMilestone } = store()
      if (!firstMet) return false
      const days = (Date.now() - firstMet) / DAY_MS
      const due = ANNIVERSARIES.find(([id, after]) => days >= after && !milestones.includes(id))
      if (!due || !celebrateMilestone(due[0])) return false
      for (const [id, after] of ANNIVERSARIES) if (after < due[1]) markMilestone(id)
      return true
    }

    const noticeMovement = () => {
      s.lastMove = Date.now()
      if (s.idle === 'awake') return
      const wasAsleep = s.idle === 'asleep'
      s.idle = 'awake'
      refreshAmbient()
      // Woken up by you coming back.
      store().react('surprised', 900)
      store().bump()
      // Back after a proper break: welcome back, or an anniversary if one came round meanwhile.
      if (wasAsleep) window.setTimeout(() => anniversary() || talk('back'), WELCOME_BACK_MS)
    }

    const endRub = () => {
      const r = s.rub
      window.clearTimeout(r.timer)
      if (!r.since) return
      r.since = 0
      store().setMelting(false)
      store().react(r.loved ? 'love' : 'happy', r.loved ? 2_400 : 1_200)
      r.loved = false
    }

    /** Strokes back and forth over the buddy, without pressing: a belly rub. It melts, then falls in love. */
    const watchForRub = (x: number, now: number) => {
      const r = s.rub
      const dx = x - (s.point?.x ?? x)
      if (dx === 0) return
      const dir = Math.sign(dx)
      if (dir === r.dir) {
        r.travel += Math.abs(dx)
        return
      }
      // Turned back: the stroke just finished counts if it went far enough.
      const stroked = r.travel >= RUB_STROKE_PX
      r.dir = dir
      r.travel = Math.abs(dx)
      if (!stroked) return
      r.strokes = r.strokes.filter((t) => now - t < RUB_WINDOW_MS).concat(now)
      if (!r.since && r.strokes.length >= RUB_STROKES) {
        r.since = now
        store().setMelting(true)
        store().react('happy', Infinity)
        if (!celebrateMilestone('first-rub')) talk('rub')
      }
      if (!r.since) return
      if (!r.loved && now - r.since >= RUB_LOVE_MS) {
        r.loved = true
        store().react('love', Infinity)
      }
      window.clearTimeout(r.timer)
      r.timer = window.setTimeout(endRub, RUB_END_MS)
    }

    /** The cursor whipped back and forth, or round in circles, fast: dizzying just to watch. */
    const watchForWhip = (p: Point, now: number) => {
      const w = s.whip
      const last = s.point
      if (!last) return
      const step = { x: p.x - last.x, y: p.y - last.y }
      w.steps = w.steps.filter((m) => now - m.at < WHIP_WINDOW_MS).concat({ at: now, px: Math.hypot(step.x, step.y) })
      for (const axis of ['x', 'y'] as const) {
        if (Math.abs(step[axis]) < WHIP_STEP_PX) continue
        const sign = Math.sign(step[axis])
        if (w.dir[axis] !== 0 && sign !== w.dir[axis]) w.turns.push(now)
        w.dir[axis] = sign
      }
      w.turns = w.turns.filter((t) => now - t < WHIP_WINDOW_MS)
      if (now < w.restUntil || w.turns.length < WHIP_TURNS) return
      if (w.steps.reduce((sum, m) => sum + m.px, 0) < WHIP_DISTANCE_PX) return
      w.turns = []
      w.steps = []
      w.restUntil = now + WHIP_REST_MS
      store().react('dizzy', 2_600)
      talk('whip')
    }

    return {
      refreshAmbient,
      noticeMovement,
      /** Every cursor reading: wakes it up, and watches for belly rubs and dizzying whips. */
      track(p: Point) {
        noticeMovement()
        const now = Date.now()
        const dragging = document.documentElement.dataset.dragging !== undefined
        if (!dragging && s.over) watchForRub(p.x, now)
        // It only gets dizzy watching if its eyes are following the cursor.
        else if (!dragging && store().followCursor) watchForWhip(p, now)
        s.point = p
      },
      pet() {
        const now = Date.now()
        const quick = now - s.lastClick < DOUBLE_CLICK_MS
        s.lastClick = now
        s.pets = s.pets.filter((t) => now - t < LOVE_WINDOW_MS).concat(now)
        // No bump: the press already squashed it, and letting go springs it back.
        store().notePet()
        const lifetimePets = store().lifetimePets + 1
        store().update({ lifetimePets })
        let topic: Topic | null = null
        // Petting a buddy that's already in love keeps it there.
        if (s.pets.length >= LOVE_PETS || store().reaction === 'love') {
          s.pets = []
          store().react('love', 3_200)
          topic = 'love'
        } else if (quick) {
          store().react('surprised', 800)
        } else {
          store().react(Math.random() < 0.2 ? 'wink' : 'happy', 1_300)
          // After midnight, it might gently suggest bed instead.
          topic = isLate() ? 'late' : 'click'
        }
        const milestone = PET_MILESTONES[lifetimePets]
        if (milestone && celebrateMilestone(milestone)) return
        if (topic) talk(topic)
      },
      grab() {
        s.shaken = false
        endRub()
        // Pulled away from the edge it was peeking from.
        store().setPeek(null)
        store().react('surprised', Infinity)
      },
      shaken() {
        s.shaken = true
        store().react('dizzy', Infinity)
      },
      drop() {
        store().bump()
        store().noteDrop()
        if (s.shaken) {
          store().react('dizzy', 2_600)
          talk('shaken')
        } else store().react(null)
      },
      /** Just tucked in behind a screen edge. */
      peeked() {
        store().react('wink', 900)
        talk('peek')
      },
      /** Hello for the time of day, or an anniversary if one has come round. */
      greet() {
        if (!anniversary()) talk(greetingAt(), true)
      },
      /** A laptop battery reading. The first one only sets the mood; after that, changes get a reaction. */
      noticeBattery(level: number, charging: boolean, first = false) {
        const was = s.battery
        const next = { low: !charging && level <= LOW_BATTERY, veryLow: !charging && level <= VERY_LOW_BATTERY, charging }
        s.battery = next
        if (!first) {
          if (charging && !was.charging) {
            store().react('happy', 1_400)
            store().bump()
            talk('charging')
          } else if (next.veryLow && !was.veryLow) talk('batteryVeryLow', true)
          else if (next.low && !was.low) talk('battery', true)
        }
        if (next.low !== was.low) refreshAmbient()
      },
      /** Given one of the secret names. */
      discovered() {
        store().celebrate()
        talk('secret', true)
      },
      hover(on: boolean) {
        s.over = on
        if (!on) endRub()
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

  // Wakes up with a stretch when the app starts, then says hello for the time of day. (Just after an
  // update, its hello-again bubble has the floor instead.)
  useEffect(() => {
    const { react, bump } = useBuddyStore.getState()
    react('sleepy', Infinity)
    const timer = window.setTimeout(() => {
      react('surprised', 700)
      bump()
    }, 900)
    const hello = window.setTimeout(handlers.greet, GREET_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(hello)
      react(null)
    }
  }, [handlers])

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

    // In the app the cursor feed is the one source of positions, so the two streams can't interleave
    // and jitter; in a plain browser the pointer is all there is.
    const onPointer = (e: PointerEvent) => (window.buddy ? handlers.noticeMovement() : handlers.track({ x: e.clientX, y: e.clientY }))
    window.addEventListener('pointermove', onPointer)
    const offCursor = window.buddy?.onCursor(handlers.track)
    const offShaken = window.buddy?.onShaken(handlers.shaken)
    return () => {
      window.clearInterval(check)
      window.clearTimeout(s.rub.timer)
      window.removeEventListener('pointermove', onPointer)
      offCursor?.()
      offShaken?.()
    }
  }, [handlers])

  // On a laptop it feels the battery: drained when it runs low, perky when it's plugged in. Desktops
  // report a full battery that's always charging, so nothing changes there.
  useEffect(() => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery
    let battery: Battery | null = null
    let stopped = false
    const read = () => battery && handlers.noticeBattery(battery.level, battery.charging)
    void getBattery?.call(navigator).then((b) => {
      if (stopped) return
      battery = b
      handlers.noticeBattery(b.level, b.charging, true)
      b.addEventListener('levelchange', read)
      b.addEventListener('chargingchange', read)
    })
    return () => {
      stopped = true
      battery?.removeEventListener('levelchange', read)
      battery?.removeEventListener('chargingchange', read)
    }
  }, [handlers])

  // A secret name gets a little celebration once it has settled.
  useEffect(() => {
    let timer = 0
    const off = useBuddyStore.subscribe((s, before) => {
      if (s.name === before.name) return
      window.clearTimeout(timer)
      if (isSecretName(s.name)) timer = window.setTimeout(handlers.discovered, SECRET_SETTLE_MS)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [handlers])

  // Perks up to see what you're doing when the customise panel opens.
  const panelOpen = useBuddyStore((s) => s.panelOpen)
  useEffect(() => {
    if (panelOpen) useBuddyStore.getState().react('curious', 1_200)
  }, [panelOpen])

  return handlers
}
