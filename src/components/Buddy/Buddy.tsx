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
 * when let go; a bump or the cursor arriving kicks it, keeping whatever wobble is already going.
 */
function useSquish(bounce: number, pressed: boolean, hovered: boolean): MotionValue<number> {
  const squish = useMotionValue(0)
  const seen = useRef({ bounce, pressed, hovered })

  useEffect(() => {
    const last = seen.current
    seen.current = { bounce, pressed, hovered }
    const kick = (speed: number) => animate(squish, 0, { ...WOBBLE, velocity: squish.getVelocity() + speed })
    if (pressed !== last.pressed) animate(squish, pressed ? PRESSED : 0, pressed ? PRESS : WOBBLE)
    else if (bounce !== last.bounce) kick(BUMP_KICK)
    else if (hovered && !last.hovered && !pressed) kick(PERK_KICK)
  }, [bounce, pressed, hovered, squish])

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

interface FaceProps extends Omit<BuddyProps, 'name' | 'overrides'> {
  name: string
  look: BuddyLook
}

function Face({ name, look, mood, size = 200, gaze = true, bounce = 0, pressed = false, hovered = false }: FaceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const eyesRef = useRef<SVGGElement>(null)
  const bodyRef = useRef<SVGGElement>(null)
  const expression = EXPRESSIONS[mood]
  const pose = usePose(expression.pose)
  const squish = useSquish(bounce, pressed, hovered)
  const carry = useCarry()
  const [left, right] = look.eyes
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const eyesAt = useGaze(svgRef, {
    center: { x: (left.cx + right.cx) / 2, y: (left.cy + right.cy) / 2 },
    enabled: gaze && !reducedMotion,
  })

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
  const rotate = useTransform(() => pose.get().bodyTilt + followX.get() * pose.get().gaze * LEAN)
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
  // Carried by the top of its head. Every shape's outline is different, so it's measured once drawn;
  // until then, the top is guessed to sit as far above the centre as the ground is below.
  const [hangY, setHangY] = useState(2 * CY - look.ground)
  useLayoutEffect(() => {
    const box = bodyRef.current?.getBBox()
    if (box) setHangY(box.y)
  }, [look.parts])

  // Breathing, bobbing and swaying move the whole picture, so they run on plain HTML wrappers, which
  // the GPU can animate on its own. The same loops on SVG groups would redraw the buddy every frame.
  return (
    <div className="b-breathe" style={{ ...timing, transformOrigin: ground }}>
      <div className="b-bob">
        <div className="b-sway" style={{ transformOrigin: ground }}>
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
                </motion.g>
              </motion.g>
            </motion.g>
            <AnimatePresence>
              {expression.effect === 'hearts' && <Hearts key="hearts" look={look} />}
              {expression.effect === 'zzz' && <Zzz key="zzz" look={look} top={hangY} />}
            </AnimatePresence>
          </motion.svg>
        </div>
      </div>
    </div>
  )
}
