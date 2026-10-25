import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { GAZE_TRAVEL, useGaze } from '../../hooks/useGaze'
import type { BuddyState } from './BuddyStates'
import { mixLab, oklch, toHex } from './blob/color'
import { CX, CY, generateLook, type BuddyLook, type EyeSpec, type LookOverrides } from './blob/generate'
import { visorPath } from './blob/eyes'
import { eyePath } from './blob/geometry'
import { EXPRESSIONS, lerpPose, type EyePose, type Pose } from './expressions'
import './buddy.css'

/** Quick, and slightly underdamped, so a new mood snaps in and lands with a small wobble. */
const MORPH = { type: 'spring', stiffness: 480, damping: 26 } as const
const POP_IN = { type: 'spring', stiffness: 420, damping: 18 } as const

/** Loose and bouncy: the squish wobbles like jelly a few times before it settles. */
const WOBBLE = { type: 'spring', stiffness: 380, damping: 9 } as const
/** Firm and fast, so a press squashes the moment the button goes down. */
const PRESS = { type: 'spring', stiffness: 700, damping: 32 } as const
/** How flat a press squashes it, in squish units (1 is a big squash). */
const PRESSED = 0.55
/** Starting speeds for the squish: a bump squashes it, noticing the cursor makes it perk up. */
const BUMP_KICK = 20
const PERK_KICK = -6
/** A belly rub melts it flatter than a press, and slowly, like butter in the sun. */
const MELTED = 0.85
const MELT = { type: 'spring', stiffness: 90, damping: 13 } as const

/** Tucked behind a screen edge, it leans out this many degrees to peek around it. */
const PEEK_LEAN = 10
const PEEK = { stiffness: 160, damping: 14 }

/** The body trails the eyes a little and overshoots, which reads as the head turning to look. */
const FOLLOW = { stiffness: 120, damping: 11 }
/** Degrees of lean per viewBox unit the eyes have turned. */
const LEAN = 0.5
/** How far the body rises or dips with the eyes, as a share of their travel. */
const BODY_RISE = 0.25
/** Squish per viewBox unit the eyes look down; looking up gives the same amount of stretch. */
const CRANE = 0.06

/** A loose pendulum, so a carried buddy swings behind the cursor and sways to rest after. */
const SWING = { stiffness: 140, damping: 7 }
/** Degrees of swing, and squish, per px/s of carrying speed. */
const SWING_PER_SPEED = 0.014
const MAX_SWING = 18
const SQUISH_PER_SPEED = 0.0001
const MAX_CARRY_SQUISH = 0.1

interface BuddyProps {
  /** The same name always draws the same face. */
  name: string
  /** Pinned traits. Changing these updates the face in place. */
  overrides?: LookOverrides
  mood: BuddyState
  /** Rendered width and height in px. */
  size?: number
  /** Let the eyes follow the cursor. */
  gaze?: boolean
  /** Bump this number to play a squash-and-stretch, e.g. when dropped. */
  bounce?: number
  /** Held down by the mouse: it squashes, then springs back when let go. */
  pressed?: boolean
  /** The cursor is over it: it perks up a little as it arrives. */
  hovered?: boolean
  /** Getting a belly rub: it melts flat, and springs back up after. */
  melting?: boolean
  /** Tucked behind this screen edge, so it leans out to peek around it. */
  peek?: PeekSide | null
  /** It has a secret name, so it sparkles now and then. */
  sparkle?: boolean
  /** Music is playing: it bops along, with notes floating up. */
  groove?: boolean
  /** The music's beat, when it can be heard: the bops land on it. Without one, it bops at its own pace. */
  beat?: Beat | null
  /** Somewhere to watch instead of the cursor (a video), relative to the window. */
  lookAt?: { x: number; y: number } | null
  /** A video is on: it holds a bucket of popcorn, and eats from it while it watches. */
  snacking?: boolean
}

export function Buddy({ name, overrides, ...rest }: BuddyProps) {
  const look = useMemo(() => generateLook(name, overrides), [name, overrides])
  // A new name is a new creature, so it pops in fresh instead of morphing from the old one.
  return <Face key={name} name={name} look={look} {...rest} />
}

/** Animates between poses, starting from wherever the last morph had got to. */
function usePose(target: Pose): MotionValue<Pose> {
  const progress = useMotionValue(1)
  const from = useRef(target)
  const to = useRef(target)
  const pose = useTransform(() => lerpPose(from.current, to.current, progress.get()))

  useEffect(() => {
    if (to.current === target) return
    from.current = lerpPose(from.current, to.current, progress.get())
    to.current = target
    progress.jump(0)
    const controls = animate(progress, 1, MORPH)
    return () => controls.stop()
  }, [target, progress])

  return pose
}

/**
 * Squash (positive) and stretch (negative). It squashes while pressed and springs back past flat
 * when let go, and sinks flat while melting; a bump or the cursor arriving kicks it, keeping whatever
 * wobble is already going.
 */
function useSquish(bounce: number, pressed: boolean, hovered: boolean, melting: boolean): MotionValue<number> {
  const squish = useMotionValue(0)
  const seen = useRef({ bounce, pressed, hovered, melting })

  useEffect(() => {
    const last = seen.current
    seen.current = { bounce, pressed, hovered, melting }
    // Where it comes to rest: melted flat during a belly rub, round otherwise.
    const rest = melting ? MELTED : 0
    const kick = (speed: number) => animate(squish, rest, { ...WOBBLE, velocity: squish.getVelocity() + speed })
    if (pressed !== last.pressed) animate(squish, pressed ? PRESSED : rest, pressed ? PRESS : WOBBLE)
    else if (melting !== last.melting) animate(squish, rest, melting ? MELT : WOBBLE)
    else if (bounce !== last.bounce) kick(BUMP_KICK)
    else if (hovered && !last.hovered && !pressed) kick(PERK_KICK)
  }, [bounce, pressed, hovered, melting, squish])

  useEffect(() => () => squish.stop(), [squish])
  return squish
}

/** While carried, the buddy swings behind the cursor like it's hanging from your hand. */
function useCarry(): { swing: MotionValue<number>; squish: MotionValue<number> } {
  const swing = useSpring(0, SWING)
  const squish = useSpring(0, SWING)
  useEffect(
    () =>
      window.buddy?.onCarried(({ vx, vy }) => {
        const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v))
        swing.set(clamp(vx * SWING_PER_SPEED, MAX_SWING))
        // Lifted fast, it stretches out below your hand; lowered fast, it bunches up.
        squish.set(clamp(vy * SQUISH_PER_SPEED, MAX_CARRY_SQUISH))
      }),
    [swing, squish],
  )
  return { swing, squish }
}

/**
 * Whether a pose value is far enough from zero to see. The tremor and dizzy loops only run
 * while it is, because an endless CSS animation costs CPU every frame even at zero amplitude.
 */
function useShowing(value: MotionValue<number>): boolean {
  const [showing, setShowing] = useState(() => Math.abs(value.get()) > 0.02)
  useMotionValueEvent(value, 'change', (v) => setShowing(Math.abs(v) > 0.02))
  return showing
}

const BLINK: Keyframe[] = [
  { transform: 'scaleY(1)', easing: 'ease-in' },
  { transform: 'scaleY(0.08)', easing: 'ease-out' },
  { transform: 'scaleY(1)' },
]

/** A quick second blink this often, and the gap between blinks varies this much either way. */
const DOUBLE_BLINK_CHANCE = 0.15
const BLINK_VARIANCE = 0.3

/**
 * Blinks on a timer, so nothing has to animate in the long gaps between blinks. The gaps vary
 * and now and then it double-blinks, which looks far less mechanical than a steady beat.
 */
function useBlink(eyes: RefObject<SVGGElement>, { blink, blinkPhase }: BuddyLook['motion'], enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const duration = blink * 0.034
    const shut = () => eyes.current?.querySelectorAll('.b-eye').forEach((eye) => eye.animate(BLINK, duration))
    let again = 0
    let timer = window.setTimeout(function close() {
      shut()
      if (Math.random() < DOUBLE_BLINK_CHANCE) again = window.setTimeout(shut, duration + 90)
      timer = window.setTimeout(close, blink * (1 + (Math.random() * 2 - 1) * BLINK_VARIANCE))
    }, blink + blinkPhase)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(again)
    }
  }, [eyes, blink, blinkPhase, enabled])
}

/** Wide poses are capped so the two eyes never run into each other. */
function eyeOutline(eye: EyeSpec, p: EyePose, side: -1 | 1, gap: number, look: Pose): string {
  const apart = gap * 0.4
  const cap = Math.max(eye.hw, apart) * (1 - p.lock) + apart * p.lock
  let w = Math.max(eye.hw * p.sx, 0.4)
  let h = Math.max(eye.hh * p.sy, 0.35)
  // Hearts read best near-square, whatever the eye style's proportions.
  if (p.heart > 0) {
    const square = ((w + h) / 2) * 1.1
    w += (square - w) * p.heart
    h += (square - h) * p.heart
  }
  w = Math.min(w, cap)
  // Squashed domes get their lower half back, so sleepy lids don't thin out to a hairline.
  const flat = eye.flat * Math.min(1, Math.max(0, (p.sy - 0.1) / 0.5))
  const rot = eye.lean * (1 - p.lock) - side * p.tilt
  const cx = eye.cx + (-side * p.inward + look.lookX) * eye.hh
  const cy = eye.cy + (-p.lift + look.lookY) * eye.hh
  return eyePath(cx, cy, w, h, eye.n, flat, p.bend, rot, p.heart)
}

const HEART = eyePath(0, 0, 4.2, 4.2, 2, 0, 0, 0, 1)
const HEART_COLOUR = toHex(oklch(0.68, 0.2, 10))
/** Where each floating heart starts relative to the eyes, how far it drifts sideways, and when. */
const FLOATERS = [
  { x: -24, y: -6, drift: -6, delay: 0 },
  { x: 22, y: -10, drift: 7, delay: 0.45 },
  { x: -6, y: -16, drift: -3, delay: 0.9 },
  { x: 12, y: -4, drift: 4, delay: 1.35 },
]

/** Little hearts that rise and fade around the buddy while it's in love. */
function Hearts({ look }: { look: BuddyLook }) {
  const [left, right] = look.eyes
  const cx = (left.cx + right.cx) / 2
  const cy = Math.min(left.cy, right.cy) - left.hh
  return (
    <motion.g fill={HEART_COLOUR} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      {FLOATERS.map((h, i) => (
        <g key={i} transform={`translate(${cx + h.x} ${cy + h.y})`}>
          <path className="b-heart" d={HEART} style={{ '--drift': h.drift, animationDelay: `${h.delay}s` } as CSSProperties} />
        </g>
      ))}
    </motion.g>
  )
}

const ZZZ_COLOUR = toHex(oklch(0.72, 0.09, 265))
/** A z, drawn with one stroke. */
const ZED = 'M-2.8 -2.8H2.8L-2.8 2.8H2.8'
/** Waits this long after nodding off, so the brief sleepy face at startup doesn't flash them. */
const ZZZ_DELAY_S = 1.4
/** Three z's on one path, a third of a loop apart, so they rise in a steady stream. */
const ZZZ_STAGGER_S = [0, 0.9, 1.8]

/** Little z's that drift up from above its head while it sleeps. `top` is the top of its body. */
function Zzz({ look, top }: { look: BuddyLook; top: number }) {
  // Off the top corner of the head, so they rise clear of the body instead of over it.
  const x = look.eyes[1].cx + look.eyes[1].hw + 2
  const y = top + 1
  return (
    <motion.g
      stroke={ZZZ_COLOUR}
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: ZZZ_DELAY_S, duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      {ZZZ_STAGGER_S.map((delay, i) => (
        <g key={i} className="b-zzz-slot" transform={`translate(${x} ${y})`} style={{ '--i': i } as CSSProperties}>
          <path className="b-zzz" d={ZED} style={{ animationDelay: `${ZZZ_DELAY_S + delay}s` }} />
        </g>
      ))}
    </motion.g>
  )
}

const SPARKLE_COLOUR = toHex(oklch(0.9, 0.1, 95))
/** A four-pointed star with pinched sides. */
const STAR = 'M0 -4.2Q0.7 -0.7 4.2 0Q0.7 0.7 0 4.2Q-0.7 0.7 -4.2 0Q-0.7 -0.7 0 -4.2Z'
/** Where each star of a burst twinkles, around the top of the body, how big, and when. */
const TWINKLES = [
  { x: -34, y: 4, size: 1, delay: 0 },
  { x: 31, y: -3, size: 0.8, delay: 0.22 },
  { x: 36, y: 22, size: 0.6, delay: 0.44 },
]
/** A burst every so often, at a random gap between these, and how long one lasts. */
const SPARKLE_GAP_MS = [12_000, 24_000] as const
const SPARKLE_BURST_MS = 1_500

/**
 * A buddy with a secret name sparkles now and then: a short burst of twinkling stars, starting soon
 * after it gets the name. Returns the key of the burst showing, or null between bursts.
 */
function useSparkleBursts(on: boolean): number | null {
  const [burst, setBurst] = useState<number | null>(null)
  useEffect(() => {
    if (!on) return
    let next = 0
    let end = 0
    let count = 0
    const go = () => {
      setBurst(++count)
      end = window.setTimeout(() => setBurst(null), SPARKLE_BURST_MS)
      next = window.setTimeout(go, SPARKLE_GAP_MS[0] + Math.random() * (SPARKLE_GAP_MS[1] - SPARKLE_GAP_MS[0]))
    }
    next = window.setTimeout(go, 500)
    return () => {
      window.clearTimeout(next)
      window.clearTimeout(end)
      setBurst(null)
    }
  }, [on])
  return burst
}

/** One burst of stars twinkling in and out around the buddy. `top` is the top of its body. */
function Sparkles({ top }: { top: number }) {
  return (
    <motion.g fill={SPARKLE_COLOUR} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      {TWINKLES.map((s, i) => (
        <g key={i} transform={`translate(${CX + s.x} ${top + s.y}) scale(${s.size})`}>
          <path className="b-twinkle" d={STAR} style={{ animationDelay: `${s.delay}s` }} />
        </g>
      ))}
    </motion.g>
  )
}

/** One bop to the left and one to the right, at a steady 109 beats a minute. Matches .b-groove in buddy.css. */
const GROOVE_MS = 1_100

/**
 * Bops while `on`. Switched off, it finishes the bop it's in rather than snapping back mid-dip; the
 * timer is there in case the window isn't drawing, when animation events don't come.
 */
function useGroove(on: boolean, wrapper: RefObject<HTMLDivElement>): boolean {
  const [grooving, setGrooving] = useState(on)
  useEffect(() => {
    if (on) {
      setGrooving(true)
      return
    }
    const el = wrapper.current
    const stop = () => setGrooving(false)
    // The face's own loops (tremor, dizzy eyes, hearts) send these events up through the wrapper too.
    const onIteration = (e: AnimationEvent) => e.target === el && stop()
    el?.addEventListener('animationiteration', onIteration)
    const fallback = window.setTimeout(stop, GROOVE_MS + 100)
    return () => {
      el?.removeEventListener('animationiteration', onIteration)
      window.clearTimeout(fallback)
    }
  }, [on, wrapper])
  return grooving
}

/** Where in the groove loop each bop lands (its dip): the left one here, the right one half a loop on. Matches buddy.css. */
const BOP_AT = 0.14
/** Tempos outside these are bopped at double or half time, so it never thrashes about or crawls. */
const BOP_BPM = { min: 70, max: 140 } as const
/** Off the beat, it speeds up or slows down a touch (never more than this much) to catch up over about this long, checking this often. */
const MAX_NUDGE = 0.3
const CATCH_UP_MS = 1_000
const CHECK_MS = 250

/**
 * Keeps the groove in time with the music's beat while there is one: the loop takes two beats, and
 * each dip lands on a beat. Between checks it runs on its own, so a beat that drops out (a quiet bit)
 * leaves it bopping at the last tempo.
 */
function useBopToBeat(beat: Beat | null, wrapper: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = wrapper.current
    if (!beat || !el) return
    const groove = el
      .getAnimations()
      .find((a): a is CSSAnimation => a instanceof CSSAnimation && a.animationName === 'b-groove')
    if (!groove?.effect) return
    let bpm = beat.bpm
    while (bpm > BOP_BPM.max) bpm /= 2
    while (bpm < BOP_BPM.min) bpm *= 2
    const beatMs = 60_000 / bpm
    const loop = 2 * beatMs

    // The new tempo, carrying on from the same point in the loop.
    const duration = Number(groove.effect.getTiming().duration) || GROOVE_MS
    const at = Number(groove.currentTime ?? 0)
    groove.effect.updateTiming({ duration: loop })
    groove.currentTime = ((at % duration) / duration) * loop

    const check = () => {
      const now = Number(groove.currentTime ?? 0)
      // Where the loop should be: on a dip at every beat, and half a loop on at the next.
      const want = BOP_AT * loop + ((((Date.now() - beat.at) % beatMs) + beatMs) % beatMs)
      let off = (want - (now % loop)) % beatMs
      if (off >= beatMs / 2) off -= beatMs
      if (off < -beatMs / 2) off += beatMs
      groove.playbackRate = 1 + Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, off / CATCH_UP_MS))
    }
    check()
    const timer = window.setInterval(check, CHECK_MS)
    return () => {
      window.clearInterval(timer)
      groove.playbackRate = 1
    }
  }, [beat, wrapper])
}

const NOTE_COLOUR = toHex(oklch(0.8, 0.14, 80))
/** A single note and a pair joined by a beam, flat like the rest of the buddy, in a 12-unit box. */
const QUAVER =
  'M7.6 1.2V8.6C7.6 10.5 5.9 11.6 4.1 11.4 2.5 11.2 1.5 10.1 1.9 8.9 2.3 7.6 4.2 6.8 5.9 7.3V1.2ZM7.6 1.2C9.2 2 10.6 3.3 10 6.2 9.6 4.8 8.8 4.1 7.6 3.9Z'
const QUAVERS =
  'M4.6 3V9.4C4.6 10.8 3.3 11.7 2 11.5.8 11.3.1 10.4.4 9.4.7 8.4 2 7.8 3.2 8V4.6ZM11.4 1.8V8.2C11.4 9.6 10.1 10.5 8.8 10.3 7.6 10.1 6.9 9.2 7.2 8.2 7.5 7.2 8.8 6.6 10 6.8V3.4ZM3.2 3 11.4.8V3L3.2 5.2Z'
/** Where each note starts relative to the top of the head, which way it drifts, how it tilts, and when. */
const NOTES = [
  { x: -24, y: 6, drift: -1, tilt: -14, d: QUAVER, delay: 0 },
  { x: 22, y: 2, drift: 1, tilt: 12, d: QUAVERS, delay: 0.8 },
  { x: -8, y: -4, drift: -0.5, tilt: -8, d: QUAVERS, delay: 1.6 },
]

/**
 * Music notes that float up and drift away while it bops. They're HTML layers rather than part of the
 * face's SVG, so the GPU can move them without redrawing the buddy, however long the music plays.
 * `top` is the top of its body.
 */
function Notes({ top }: { top: number }) {
  return (
    <motion.div
      className="b-notes"
      style={{ color: NOTE_COLOUR }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 0.5 }}
    >
      {NOTES.map((note, i) => (
        <div
          key={i}
          className="b-note"
          style={
            {
              left: `${CX + note.x}%`,
              top: `${top + note.y}%`,
              '--drift': note.drift,
              '--tilt': note.tilt,
              '--i': i,
              animationDelay: `${note.delay}s`,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 12 12">
            <path d={note.d} fill="currentColor" />
          </svg>
        </div>
      ))}
    </motion.div>
  )
}

const POPCORN_RED = toHex(oklch(0.6, 0.19, 25))
const POPCORN_PAPER = toHex(oklch(0.96, 0.02, 85))
const POPCORN_CORN = toHex(oklch(0.95, 0.05, 95))
const POPCORN_BUTTER = toHex(oklch(0.87, 0.11, 88))

type Point = { x: number; y: number }
type Box = { x: number; y: number; width: number; height: number }

/** Where the bucket sits, in viewBox units: its rim's middle, its base, and its width at each. */
interface Bucket {
  x: number
  top: number
  bottom: number
  topWidth: number
  bottomWidth: number
}

/** Against the lower right of the body, held there, with its rim (and the heap on it) below the eyes. */
function placeBucket(look: BuddyLook, body: Box): Bucket {
  const [left, right] = look.eyes
  const eyesBottom = Math.max(left.cy + left.hh, right.cy + right.hh)
  const bottom = body.y + body.height + 2
  const top = Math.min(bottom - 13, Math.max(eyesBottom + 9, bottom - 20))
  const topWidth = Math.min(26, Math.max(17, body.width * 0.4))
  return { x: body.x + body.width * 0.8, top, bottom, topWidth, bottomWidth: topWidth * 0.76 }
}

/** One puffed kernel, about 5 units across at size 1: a few overlapping blobs, flat like the buddy. */
function Kernel({ x, y, size = 1, fill = POPCORN_CORN }: { x: number; y: number; size?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} fill={fill}>
      <circle cx={0} cy={0} r={1.5} />
      <circle cx={1.3} cy={-0.7} r={1.25} />
      <circle cx={0.5} cy={1.1} r={1.2} />
      <circle cx={-1.1} cy={0.55} r={1.15} />
    </g>
  )
}

/** The heap on the rim, for a bucket 22 units wide: where each kernel sits, how big, and which colour. */
const HEAP: [number, number, number, string][] = [
  [-7.5, -0.6, 1, POPCORN_CORN],
  [-3.8, -2.6, 1.1, POPCORN_BUTTER],
  [0.2, -3.6, 1.15, POPCORN_CORN],
  [4.2, -2.4, 1.05, POPCORN_CORN],
  [7.6, -0.4, 0.95, POPCORN_BUTTER],
  [-1.8, 0.1, 1, POPCORN_CORN],
  [2.6, 0.3, 1, POPCORN_BUTTER],
]

/** A striped bucket heaped with popcorn, slipping in from below. */
function PopcornBucket({ bucket }: { bucket: Bucket }) {
  const { x, top, bottom, topWidth: wt, bottomWidth: wb } = bucket
  const r = 1.6
  const outline = `M${x - wt / 2} ${top}H${x + wt / 2}L${x + wb / 2} ${bottom - r}Q${x + wb / 2} ${bottom} ${x + wb / 2 - r} ${bottom}H${x - wb / 2 + r}Q${x - wb / 2} ${bottom} ${x - wb / 2} ${bottom - r}Z`
  // Five stripes that taper with the bucket: red, paper, red, paper, red. The red ones are the bucket itself.
  const at = (width: number, k: number) => x - width / 2 + (width * k) / 5
  const stripe = (i: number) => `M${at(wt, i)} ${top}H${at(wt, i + 1)}L${at(wb, i + 1)} ${bottom}H${at(wb, i)}Z`
  const k = wt / 22
  return (
    <motion.g initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.35 }}>
      <path d={outline} fill={POPCORN_RED} />
      <path d={stripe(1) + stripe(3)} fill={POPCORN_PAPER} />
      {HEAP.map(([dx, dy, size, fill], i) => (
        <Kernel key={i} x={x + dx * k} y={top + dy * k} size={size * k} fill={fill} />
      ))}
    </motion.g>
  )
}

/** A piece of popcorn hopping out of the bucket, up in an arc, and into its face. Matches .b-bite in buddy.css. */
function Bite({ from, to }: { from: Point; to: Point }) {
  return (
    <g transform={`translate(${from.x} ${from.y})`}>
      <g className="b-bite" style={{ '--dx': to.x - from.x, '--dy': to.y - from.y } as CSSProperties}>
        <Kernel x={0} y={0} />
      </g>
    </g>
  )
}

/** A bite every so often while it watches, at a random gap between these. */
const BITE_GAP_MS = [3_500, 7_500] as const
/** How long a bite's hop takes (.b-bite), and when in it the popcorn reaches its face. */
const BITE_MS = 800
const BITE_LANDS_MS = 620
/** Two quick squishes as it chews, anchored at its base. */
const CHEW: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.035, 0.965)' },
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.03, 0.97)' },
  { transform: 'scale(1, 1)' },
]
const CHEW_MS = 480

/**
 * Eats popcorn while `on`: every few seconds a bite hops into its face, and it blinks and chews as the
 * bite lands. Returns the bite in progress, or null between bites. Nothing animates in the gaps,
 * however long the film.
 */
function useBites(on: boolean, wrapper: RefObject<HTMLDivElement>, eyes: RefObject<SVGGElement>): number | null {
  const [bite, setBite] = useState<number | null>(null)
  useEffect(() => {
    if (!on) return
    let count = 0
    let next = 0
    let chew = 0
    let end = 0
    const go = () => {
      setBite(++count)
      chew = window.setTimeout(() => {
        wrapper.current?.animate(CHEW, { duration: CHEW_MS, easing: 'ease-in-out' })
        eyes.current?.querySelectorAll('.b-eye').forEach((eye) => eye.animate(BLINK, CHEW_MS / 2))
      }, BITE_LANDS_MS)
      end = window.setTimeout(() => setBite(null), BITE_MS)
      next = window.setTimeout(go, BITE_GAP_MS[0] + Math.random() * (BITE_GAP_MS[1] - BITE_GAP_MS[0]))
    }
    next = window.setTimeout(go, 1_500)
    return () => {
      for (const timer of [next, chew, end]) window.clearTimeout(timer)
      setBite(null)
    }
  }, [on, wrapper, eyes])
  return bite
}

interface FaceProps extends Omit<BuddyProps, 'name' | 'overrides'> {
  name: string
  look: BuddyLook
}

function Face({
  name,
  look,
  mood,
  size = 200,
  gaze = true,
  bounce = 0,
  pressed = false,
  hovered = false,
  melting = false,
  peek = null,
  sparkle = false,
  groove = false,
  beat = null,
  lookAt = null,
  snacking = false,
}: FaceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const grooveRef = useRef<HTMLDivElement>(null)
  const eyesRef = useRef<SVGGElement>(null)
  const bodyRef = useRef<SVGGElement>(null)
  const expression = EXPRESSIONS[mood]
  const pose = usePose(expression.pose)
  const squish = useSquish(bounce, pressed, hovered, melting)
  const carry = useCarry()
  const burst = useSparkleBursts(sparkle)
  // Leans out from behind the edge it's tucked behind: right from the left edge, left from the right.
  const peekLean = useSpring(0, PEEK)
  useEffect(() => peekLean.set(peek === 'left' ? PEEK_LEAN : peek === 'right' ? -PEEK_LEAN : 0), [peek, peekLean])
  const [left, right] = look.eyes
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const eyesAt = useGaze(svgRef, {
    center: { x: (left.cx + right.cx) / 2, y: (left.cy + right.cy) / 2 },
    enabled: gaze && !reducedMotion,
    target: lookAt,
  })
  const grooving = useGroove(groove && !reducedMotion, grooveRef)
  useBopToBeat(groove && !reducedMotion ? beat : null, grooveRef)
  // Bites only while it's calmly watching, not mid-gasp at what just happened.
  const bite = useBites(snacking && mood === 'watching' && !reducedMotion, grooveRef, eyesRef)

  const gap = right.cx - left.cx
  // A visor is one bar drawn as a single shape, so it never splits; the second eye stays empty.
  const isVisor = look.eyeStyle === 'visor'
  const leftD = useTransform(() => {
    const p = pose.get()
    return isVisor ? visorPath(left, right, p.left, p.right, p) : eyeOutline(left, p.left, -1, gap, p)
  })
  const rightD = useTransform(() => {
    const p = pose.get()
    return isVisor ? '' : eyeOutline(right, p.right, 1, gap, p)
  })

  // Each face rests with its eyes a little off-centre, which is part of its character. Left in
  // place while following the cursor, that offset would let a buddy look much further one way
  // than the other, so it fades out as the eyes turn, up and down as well as sideways.
  const { x: restX, y: restY } = look.eyeRest
  const settle = (turn: number, rest: number) => turn - rest * Math.min(1, Math.abs(turn) / GAZE_TRAVEL)

  // The eyes lead and the body follows a beat later, leaning in, which reads as the head turning.
  const followX = useSpring(eyesAt.x, FOLLOW)
  const followY = useSpring(eyesAt.y, FOLLOW)
  const eyesX = useTransform(() => settle(eyesAt.x.get() * pose.get().gaze, restX))
  const eyesY = useTransform(() => settle(eyesAt.y.get() * pose.get().gaze, restY))
  const bodyX = useTransform(() => followX.get() * pose.get().gaze * 0.2)
  const bodyY = useTransform(() => pose.get().bodyY + followY.get() * pose.get().gaze * BODY_RISE)
  const rotate = useTransform(() => pose.get().bodyTilt + followX.get() * pose.get().gaze * LEAN + peekLean.get())
  // Looking up it stretches tall, as if craning its neck; looking down it settles.
  const squishAll = () => squish.get() + carry.squish.get() + followY.get() * pose.get().gaze * CRANE
  const scaleX = useTransform(() => (1 + pose.get().squash) * (1 + 0.12 * squishAll()))
  const scaleY = useTransform(() => (1 - pose.get().squash) * (1 - 0.14 * squishAll()))
  const shake = useTransform(() => pose.get().shake)
  const wobble = useTransform(() => pose.get().wobble)
  const shaking = useShowing(shake)
  const dizzy = useShowing(wobble)
  const fill = useTransform(() => {
    const { tint, tintHue, tintChroma } = pose.get()
    return toHex(tint < 0.002 ? look.body : mixLab(look.body, oklch(look.body[0], tintChroma, tintHue), tint))
  })

  useBlink(eyesRef, look.motion, expression.blink && !reducedMotion)

  const timing = {
    '--b-rate': expression.rate,
    '--b-breathe-phase': `${look.motion.breathePhase}ms`,
    '--b-bob-phase': `${look.motion.bobPhase}ms`,
    '--b-sway-phase': `${look.motion.swayPhase}ms`,
  } as CSSProperties
  const ground = `50% ${look.ground}%`
  // Every shape's outline is different, so the body is measured once drawn: it's carried by the top of
  // its head, and holds the popcorn bucket against its side. Until then, the top is guessed to sit as far
  // above the centre as the ground is below.
  const [body, setBody] = useState<Box>(() => ({ x: CX - 25, y: 2 * CY - look.ground, width: 50, height: 2 * (look.ground - CY) }))
  useLayoutEffect(() => {
    const box = bodyRef.current?.getBBox()
    if (box) setBody({ x: box.x, y: box.y, width: box.width, height: box.height })
  }, [look.parts])
  const hangY = body.y
  const bucket = useMemo(() => placeBucket(look, body), [look, body])
  // The bite hops from the top of the heap to just under the middle of the eyes, where a mouth would be.
  const biteFrom = { x: bucket.x - 1.5, y: bucket.top - 3 }
  const biteTo = { x: (left.cx + right.cx) / 2, y: Math.max(left.cy + left.hh, right.cy + right.hh) + 2.5 }

  // Breathing, bobbing, swaying and bopping move the whole picture, so they run on plain HTML wrappers,
  // which the GPU can animate on its own. The same loops on SVG groups would redraw the buddy every frame.
  return (
    <div className="b-breathe" style={{ ...timing, transformOrigin: ground }}>
      <div className="b-bob">
        <div className="b-sway" style={{ transformOrigin: ground }}>
          <div ref={grooveRef} className={grooving ? 'b-groove' : undefined} style={{ transformOrigin: ground }}>
            <motion.svg
              ref={svgRef}
              className="buddy"
              viewBox="0 0 100 100"
              width={size}
              height={size}
              role="img"
              aria-label={`${name}, feeling ${mood}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={POP_IN}
            >
              <motion.g className={shaking ? 'b-shake' : undefined} style={{ '--b-shake': shake } as never}>
                <motion.g style={{ rotate: carry.swing, transformBox: 'view-box', originX: `${CX}px`, originY: `${hangY}px` }}>
                  {/* data-hit marks the painted buddy, so clicks on empty space can pass through to the desktop. */}
                  <motion.g
                    data-hit
                    style={{
                      x: bodyX,
                      y: bodyY,
                      rotate,
                      scaleX,
                      scaleY,
                      transformBox: 'view-box',
                      originX: '50px',
                      originY: `${look.ground}px`,
                    }}
                  >
                    <motion.g ref={bodyRef} style={{ fill }}>
                      {look.parts.map((d, i) => (
                        <path key={i} d={d} />
                      ))}
                    </motion.g>
                    {/* Held against the body, so it leans, squishes and swings along with it. */}
                    <AnimatePresence>{snacking && <PopcornBucket key="popcorn" bucket={bucket} />}</AnimatePresence>
                    <motion.g ref={eyesRef} fill={toHex(look.eye)} style={{ x: eyesX, y: eyesY, '--b-wobble': wobble } as never}>
                      <g className={dizzy ? 'b-orbit' : undefined}>
                        <g className="b-eye">
                          <motion.path d={leftD} />
                        </g>
                      </g>
                      <g className={dizzy ? 'b-orbit b-orbit--reverse' : undefined}>
                        <g className="b-eye">
                          <motion.path d={rightD} />
                        </g>
                      </g>
                    </motion.g>
                    {bite !== null && <Bite key={bite} from={biteFrom} to={biteTo} />}
                  </motion.g>
                </motion.g>
              </motion.g>
              <AnimatePresence>
                {expression.effect === 'hearts' && <Hearts key="hearts" look={look} />}
                {expression.effect === 'zzz' && <Zzz key="zzz" look={look} top={hangY} />}
                {burst !== null && <Sparkles key={`sparkle-${burst}`} top={hangY} />}
              </AnimatePresence>
            </motion.svg>
          </div>
          <AnimatePresence>{groove && !reducedMotion && <Notes key="notes" top={hangY} />}</AnimatePresence>
        </div>
      </div>
    </div>
  )
}
