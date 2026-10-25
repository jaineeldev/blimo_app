import { useEffect, useMemo, useRef } from 'react'
import { isSecretName } from '../components/Buddy/secretNames'
import type { BuddyState } from '../components/Buddy/BuddyStates'
import { MILESTONES, greetingAt, isLate, lineFor, type Milestone, type Topic } from '../components/Chatter/lines'
import { shownMood, useBuddyStore } from '../stores/buddyStore'

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
/** Looked at for this long, it goes shy. */
const HOVER_SHY_MS = 4_000

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
  music: 0.6,
  musicVibe: 0.25,
  video: 0.5,
  videoReact: 0.35,
  returned: 0.4,
  busy: 0.7,
  calm: 0.4,
  full: 0.7,
  roomy: 0.4,
}
/** A reading counts as high at `high`% or more for `forMs`; it has eased off below `low`% for `easedMs`. */
interface Limits {
  high: number
  forMs: number
  low: number
  easedMs: number
}
/** The CPU flat out. */
const BUSY: Limits = { high: 85, forMs: 20_000, low: 60, easedMs: 10_000 }
/** The memory nearly full. Plenty of PCs sit in the 80s all day, so it takes more than that. */
const FULL: Limits = { high: 90, forMs: 30_000, low: 85, easedMs: 15_000 }
/** It mentions a busy CPU, or full memory, at most this often. */
const LOAD_LINE_REST_MS = 10 * 60_000
/** Clicked while it's feeling something other than idle, it's keener to say so. */
const MOOD_CLICK_CHANCE = 0.4

/** It mentions music or a video starting at most this often, so pausing and playing again doesn't keep setting it off. */
const MEDIA_LINE_REST_MS = 10 * 60_000
/** While music plays it closes its eyes and vibes now and then, at a random gap between these... */
const VIBE_GAP_MS = [18_000, 40_000] as const
/** ...and while a video plays it reacts to what's happening, at a random gap between these. */
const WATCH_GAP_MS = [20_000, 45_000] as const
/** What it might do at a moment in a video, and how likely each one is. */
const WATCH_MOMENTS: [BuddyState, number, number][] = [
  // mood, how long (ms), weight
  ['surprised', 900, 0.28],
  ['happy', 1_400, 0.24],
  ['curious', 1_200, 0.18],
  ['confused', 1_400, 0.1],
  ['scared', 1_400, 0.08],
  ['sad', 1_600, 0.07],
  ['love', 2_000, 0.05],
]
/** Now and then while it's sitting quietly, it stops to think, at a random gap between these. */
const THINK_GAP_MS = [45_000, 120_000] as const
/** Back from stepping aside for something full screen, it waits a moment before saying hi. */
const RETURN_LINE_MS = 700

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
/** A reading it keeps an eye on: high since when, whether it's noticed, eased since when, and when it last said so. */
type Load = { since: number; on: boolean; easedSince: number; said: number }

/** Follows one reading against its limits, and says when it has just gone high or just eased off. */
function follow(load: Load, value: number, limits: Limits, now: number): 'high' | 'eased' | null {
  if (value >= limits.high) {
    load.easedSince = 0
    if (!load.since) load.since = now
    if (load.on || now - load.since < limits.forMs) return null
    load.on = true
    return 'high'
  }
  load.since = 0
  if (!load.on || value >= limits.low) {
    load.easedSince = 0
    return null
  }
  if (!load.easedSince) load.easedSince = now
  if (now - load.easedSince < limits.easedMs) return null
  load.on = false
  load.easedSince = 0
  return 'eased'
}

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
    /** Looked at for a good while, so it's gone shy. */
    shy: false,
    shyTimer: 0,
    /** The cursor is over the buddy right now (`hovering` waits for it to settle). */
    over: false,
    idle: 'awake' as Idle,
    lastMove: Date.now(),
    lastChat: 0,
    point: null as Point | null,
    rub: { dir: 0, travel: 0, strokes: [] as number[], since: 0, loved: false, timer: 0 },
    whip: { dir: { x: 0, y: 0 }, turns: [] as number[], steps: [] as { at: number; px: number }[], restUntil: 0 },
    battery: { low: false, veryLow: false, charging: true },
    /** When it last mentioned music, and a video, starting. */
    mediaSaid: { music: 0, video: 0 },
    /** The CPU working flat out, and the memory nearly full (see `follow`). */
    busy: { since: 0, on: false, easedSince: 0, said: 0 } as Load,
    full: { since: 0, on: false, easedSince: 0, said: 0 } as Load,
  })

  const handlers = useMemo(() => {
    const s = state.current
    const store = useBuddyStore.getState

    // Bored and asleep come from being left alone (music keeps boredom away); stressed by a computer
    // working flat out, stuffed by its memory filling up (both still showing while you hover to see the
    // stats); curious from a lingering cursor, then shy if it stays; the watching face from a video;
    // drained from a low battery.
    const refreshAmbient = () => {
      const { media } = store()
      store().setAmbient(
        s.idle === 'asleep'
          ? 'sleepy'
          : s.idle === 'bored' && !media
            ? 'bored'
            : s.busy.on
              ? 'stressed'
              : s.full.on
                ? 'stuffed'
                : s.hovering
                  ? s.shy
                    ? 'shy'
                    : 'curious'
                  : media === 'video'
                    ? 'watching'
                    : s.battery.low
                      ? 'sad'
                      : null,
      )
    }

    /**
     * Says a line, as long as nothing else has the floor: not during the intro, an update message or
     * the what's new card, not while it's stepped aside, and not over the customise panel unless
     * `overPanel`. Never in quiet mode; a milestone then waits until it's switched off.
     */
    const speak = (text: string, overPanel = false) => {
      const { quiet, onboarded, panelOpen, whatsNew, updateBusy, chatter, aside, say } = store()
      if (quiet || !onboarded || (panelOpen && !overPanel) || whatsNew || updateBusy || chatter || aside) return false
      s.lastChat = Date.now()
      say(text)
      return true
    }

    /**
     * Sometimes says something about what just happened. `always` skips the dice and the rest between
     * lines. A click line fits `mood`.
     */
    const talk = (topic: Topic, always = false, mood: BuddyState = 'idle') => {
      const chance = topic === 'click' && mood !== 'idle' ? MOOD_CLICK_CHANCE : CHAT_CHANCE[topic]
      if (!always && (Date.now() - s.lastChat < CHAT_REST_MS || Math.random() >= chance)) return false
      return speak(lineFor(topic, store().name, mood), topic === 'secret')
    }

    /**
     * Mentions a milestone the first time it can, looking proud of itself (except mid belly rub, where
     * it's busy melting). If something else has the floor, it waits for next time.
     */
    const celebrateMilestone = (id: Milestone) => {
      if (store().milestones.includes(id) || !speak(MILESTONES[id])) return false
      store().markMilestone(id)
      if (id !== 'first-rub') store().react('proud', 2_200)
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
      // Back after a proper break: it's excited to see you, and says welcome back, or mentions an
      // anniversary if one came round meanwhile.
      if (wasAsleep) {
        window.setTimeout(() => {
          store().react('excited', 1_500)
          if (!anniversary()) talk('back')
        }, WELCOME_BACK_MS)
      }
    }

    const endRub = () => {
      const r = s.rub
      window.clearTimeout(r.timer)
      if (!r.since) return
      r.since = 0
      store().setMelting(false)
      // A short rub leaves it content; a long one, in love.
      store().react(r.loved ? 'love' : 'content', r.loved ? 2_400 : 2_000)
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
        // How it was feeling when you clicked, before the click changes it.
        const mood = shownMood(store())
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
        if (topic) talk(topic, false, mood)
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
          } else if (next.veryLow && !was.veryLow) {
            // Nearly flat: a proper fright.
            store().react('scared', 1_800)
            talk('batteryVeryLow', true)
          } else if (next.low && !was.low) talk('battery', true)
        }
        if (next.low !== was.low) refreshAmbient()
      },
      /** Given one of the secret names. */
      discovered() {
        store().celebrate()
        talk('secret', true)
      },
      /** Music or a video started or stopped, or the video's window moved. */
      noticeMedia(next: MediaNow) {
        const was = store().media
        store().setMedia(next)
        if (next.playing === was) return
        refreshAmbient()
        const kind = next.playing
        // Asleep, it sleeps right through it.
        if (!kind || s.idle === 'asleep') return
        store().react(kind === 'music' ? 'excited' : 'curious', kind === 'music' ? 1_400 : 900)
        if (Date.now() - s.mediaSaid[kind] > MEDIA_LINE_REST_MS && talk(kind)) s.mediaSaid[kind] = Date.now()
      },
      /** A moment while music or a video plays: it vibes along, or reacts to the video. */
      mediaMoment(kind: MediaKind) {
        // Not while it's asleep, or busy reacting to you.
        if (s.idle === 'asleep' || store().reaction) return
        if (kind === 'music') {
          // Eyes shut and grooving, or just quietly loving it.
          if (Math.random() < 0.4) store().react('content', 2_200)
          else store().react('happy', 1_600)
          talk('musicVibe')
          return
        }
        let roll = Math.random() * WATCH_MOMENTS.reduce((sum, [, , weight]) => sum + weight, 0)
        const [mood, ms] = WATCH_MOMENTS.find(([, , weight]) => (roll -= weight) < 0) ?? WATCH_MOMENTS[0]
        store().react(mood, ms)
        talk('videoReact')
      },
      /** Faded out for something full screen, or back again afterwards. */
      stepAside(aside: boolean) {
        const was = store().aside
        store().setAside(aside)
        if (was && !aside) window.setTimeout(() => talk('returned'), RETURN_LINE_MS)
      },
      hover(on: boolean) {
        s.over = on
        if (!on) endRub()
        window.clearTimeout(s.hoverTimer)
        window.clearTimeout(s.shyTimer)
        if (!on) {
          s.hovering = false
          s.shy = false
          refreshAmbient()
          return
        }
        s.hoverTimer = window.setTimeout(() => {
          s.hovering = true
          refreshAmbient()
          // Now and then it winks at you instead of just looking.
          if (Math.random() < 0.15) store().react('wink', 900)
          // Looked at for long enough, it goes a bit shy.
          s.shyTimer = window.setTimeout(() => {
            s.shy = true
            refreshAmbient()
          }, HOVER_SHY_MS)
        }, HOVER_DWELL_MS)
      },
      /**
       * A reading of how hard the computer is working. The CPU flat out for a while stresses it; the
       * memory nearly full leaves it stuffed. It might say so, and once both have properly eased off,
       * it relaxes with a sigh of relief.
       */
      noticeStats({ cpu, ram }: SystemStats) {
        const now = Date.now()
        const busy = follow(s.busy, cpu, BUSY, now)
        const full = follow(s.full, ram, FULL, now)
        if (!busy && !full) return
        refreshAmbient()
        if (busy === 'high' && now - s.busy.said > LOAD_LINE_REST_MS && talk('busy')) s.busy.said = now
        if (full === 'high' && now - s.full.said > LOAD_LINE_REST_MS && talk('full')) s.full.said = now
        if ((busy === 'eased' || full === 'eased') && !s.busy.on && !s.full.on) {
          store().react('content', 1_800)
          talk(busy === 'eased' ? 'calm' : 'roomy')
        }
      },
      /** A quiet moment: it stops to think, as long as nothing else is going on. */
      ponder() {
        // Not while it's feeling something, like stressed by a busy computer or drained by the battery.
        const { reaction, ambient, media, melting } = store()
        if (s.idle !== 'awake' || s.hovering || reaction || ambient || media || melting) return
        store().react('thinking', 2_400)
      },
    }
  }, [])

  // Now and then, sitting quietly, it has a little think.
  useEffect(() => {
    let timer = 0
    const later = () => {
      timer = window.setTimeout(() => {
        handlers.ponder()
        later()
      }, THINK_GAP_MS[0] + Math.random() * (THINK_GAP_MS[1] - THINK_GAP_MS[0]))
    }
    later()
    return () => window.clearTimeout(timer)
  }, [handlers])

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
      // Sitting back watching a video counts as being around, even with no input for a while.
      const watching = useBuddyStore.getState().media === 'video'
      const away = watching ? 0 : bridge ? (await bridge.getIdleSeconds()) * 1000 : Date.now() - s.lastMove
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
      window.clearTimeout(s.hoverTimer)
      window.clearTimeout(s.shyTimer)
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

  // Music, videos and full-screen apps, from the helper (Windows only).
  useEffect(() => {
    const bridge = window.buddy
    if (!bridge) return
    const offMedia = bridge.onMedia(handlers.noticeMedia)
    const offAside = bridge.onStepAside(handlers.stepAside)
    const offStats = bridge.onStats(handlers.noticeStats)
    return () => {
      offMedia()
      offAside()
      offStats()
    }
  }, [handlers])

  // While something plays, a moment now and then: vibing to the music, or reacting to the video.
  const media = useBuddyStore((s) => s.media)
  useEffect(() => {
    if (!media) return
    const [min, max] = media === 'music' ? VIBE_GAP_MS : WATCH_GAP_MS
    let timer = 0
    const later = () => {
      timer = window.setTimeout(() => {
        handlers.mediaMoment(media)
        later()
      }, min + Math.random() * (max - min))
    }
    later()
    return () => window.clearTimeout(timer)
  }, [media, handlers])

  // Perks up to see what you're doing when the customise panel opens.
  const panelOpen = useBuddyStore((s) => s.panelOpen)
  useEffect(() => {
    if (panelOpen) useBuddyStore.getState().react('curious', 1_200)
  }, [panelOpen])

  return handlers
}
