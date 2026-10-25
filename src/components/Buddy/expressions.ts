import type { BuddyState } from './BuddyStates'

/**
 * How one eye departs from its resting shape. Values are mirrored per side,
 * so `tilt` and `inward` mean the same thing on both eyes.
 */
export interface EyePose {
  /** Width and height multipliers. */
  sx: number
  sy: number
  /** 0 is straight, 1 bends the eye into a closed, upturned arc. */
  bend: number
  /** 0–1 toward a heart shape. */
  heart: number
  /** Degrees. Positive drops the inner ends, as in a frown. */
  tilt: number
  /** Shift toward the middle of the face, in eye heights. */
  inward: number
  /** Shift upward, in eye heights. */
  lift: number
  /** 0–1, how much of the eye's own resting lean is cancelled. */
  lock: number
}

/**
 * A pose moves parts the buddy already has: eye shape, tilt and offset, a body
 * shift and head tilt, a tremor and a tint. The one extra mark is love's hearts.
 */
export interface Pose {
  left: EyePose
  right: EyePose
  /** Whole-face glance, in eye heights. */
  lookX: number
  lookY: number
  /** Body shift in viewBox units. Positive sinks. */
  bodyY: number
  /** Head tilt in degrees, pivoting on the ground. */
  bodyTilt: number
  /** Positive is wider and shorter, anchored at the ground. */
  squash: number
  /** Tremor amplitude. */
  shake: number
  /** Dizzy eyes circling, amplitude in viewBox units. */
  wobble: number
  /** 0–1 toward `tintHue` at `tintChroma`. A tiny chroma drains the colour instead. */
  tint: number
  tintHue: number
  tintChroma: number
  /** How much the eyes follow the cursor. */
  gaze: number
}

export interface Expression {
  pose: Pose
  /** Multiplier on idle loop durations: above 1 is slower. */
  rate: number
  blink: boolean
  /** Floating marks drawn around the buddy. */
  effect?: 'hearts' | 'zzz'
}

const EYE: EyePose = { sx: 1, sy: 1, bend: 0, heart: 0, tilt: 0, inward: 0, lift: 0, lock: 0 }

const REST: Pose = {
  left: EYE,
  right: EYE,
  lookX: 0,
  lookY: 0,
  bodyY: 0,
  bodyTilt: 0,
  squash: 0,
  shake: 0,
  wobble: 0,
  tint: 0,
  tintHue: 28,
  tintChroma: 0.2,
  gaze: 1,
}

type Rest = Partial<Omit<Pose, 'left' | 'right'>>

/** Both eyes alike. */
function pose(eye: Partial<EyePose>, rest: Rest = {}): Pose {
  const e = { ...EYE, ...eye }
  return { ...REST, ...rest, left: e, right: e }
}

/** Each eye its own way, for lopsided looks like a wink. */
function lopsided(left: Partial<EyePose>, right: Partial<EyePose>, rest: Rest = {}): Pose {
  return { ...REST, ...rest, left: { ...EYE, ...left }, right: { ...EYE, ...right } }
}

export const EXPRESSIONS: Record<BuddyState, Expression> = {
  idle: { pose: REST, rate: 1, blink: true },

  // Closed, upturned arcs and a small hop.
  happy: {
    pose: pose({ sx: 2.1, sy: 0.42, bend: 1, lift: 0.2, lock: 1 }, { bodyY: -1.6, squash: -0.03, gaze: 0.3 }),
    rate: 0.75,
    blink: false,
  },

  // Level lids, low, over a sunk and spread body.
  sleepy: {
    pose: pose({ sx: 1.6, sy: 0.16, lift: -0.3, lock: 1 }, { bodyY: 1.8, squash: 0.06, gaze: 0.05 }),
    rate: 1.9,
    blink: false,
    effect: 'zzz',
  },

  // Small, drawn together and shivering.
  stressed: {
    pose: pose({ sx: 0.72, sy: 0.6, inward: 0.45, lift: 0.12, lock: 1 }, { shake: 1, squash: -0.02, gaze: 0.5 }),
    rate: 0.55,
    blink: true,
  },

  // Wide flat bars in a \ /, flushed red and trembling. The flush is strong because cool
  // colours sit opposite red, and a lighter mix only reaches grey-beige on them.
  angry: {
    pose: pose({ sx: 2, sy: 0.4, tilt: 20, inward: 0.15, lock: 1 }, { shake: 0.55, tint: 0.82, squash: 0.03, gaze: 0.6 }),
    rate: 0.7,
    blink: false,
  },

  // Half-lidded and looking off to one side.
  bored: {
    pose: pose({ sx: 1.35, sy: 0.45, lift: -0.12, lock: 1 }, { lookX: 0.6, lookY: 0.2, gaze: 0.15 }),
    rate: 1.4,
    blink: true,
  },

  // Big round eyes and a stretch upward.
  surprised: {
    pose: pose({ sx: 1.4, sy: 1.4, lift: 0.35, lock: 1 }, { bodyY: -1.6, squash: -0.07 }),
    rate: 0.8,
    blink: false,
  },

  // The mirror of angry: bars in a / \, slumped, with the colour drained out.
  sad: {
    pose: pose(
      { sx: 1.6, sy: 0.42, tilt: -20, lift: -0.35, inward: 0.1, lock: 1 },
      { bodyY: 1.6, squash: 0.05, tint: 0.55, tintChroma: 0.015, lookY: 0.25, gaze: 0.3 },
    ),
    rate: 1.6,
    blink: true,
  },

  // One eye wider, looking up, head tilted.
  curious: {
    pose: lopsided({ sx: 1.18, sy: 1.18, lift: 0.18, lock: 1 }, { sx: 0.92, sy: 0.92, lock: 1 }, { lookY: -0.3, bodyTilt: 9 }),
    rate: 0.9,
    blink: true,
  },

  // One eye wide, one squinting, head tilted the other way.
  confused: {
    pose: lopsided({ sy: 1.2, lift: 0.25, lock: 1 }, { sx: 1.1, sy: 0.5, lift: -0.1, lock: 1 }, { bodyTilt: -10, gaze: 0.4 }),
    rate: 1.1,
    blink: true,
  },

  // Heart eyes and hearts floating up. No tint: a flush muddies cool-coloured buddies.
  love: {
    pose: pose({ sx: 1.3, sy: 1.25, heart: 1, lift: 0.1, lock: 1 }, { bodyY: -1, squash: -0.02, gaze: 0.5 }),
    rate: 0.8,
    blink: false,
    effect: 'hearts',
  },

  // One eye shut in a happy arc, the other open.
  wink: {
    pose: lopsided({ sx: 1.7, sy: 0.36, bend: 0.9, lift: 0.1, lock: 1 }, { lock: 1 }, { bodyTilt: 5 }),
    rate: 1,
    blink: false,
  },

  // Narrowed, determined eyes.
  focused: {
    pose: pose({ sx: 1.25, sy: 0.5, tilt: 8, inward: 0.12, lock: 1 }, { squash: 0.02, lookY: -0.1 }),
    rate: 0.8,
    blink: true,
  },

  // Lazy, uneven lids and a cocky head tilt.
  smug: {
    pose: lopsided(
      { sx: 1.2, sy: 0.45, tilt: 6, lift: -0.05, lock: 1 },
      { sx: 1.2, sy: 0.6, tilt: 6, lift: 0.05, lock: 1 },
      { lookX: 0.35, bodyTilt: -7, gaze: 0.4 },
    ),
    rate: 1.3,
    blink: true,
  },

  // Eyes circling after being shaken about.
  dizzy: {
    pose: pose({ sx: 0.9, sy: 0.9, lock: 1 }, { wobble: 1, gaze: 0 }),
    rate: 1.2,
    blink: false,
  },

  // Big, bright open eyes with a smile in them, up on its toes and buzzing.
  excited: {
    pose: pose({ sx: 1.3, sy: 1.32, bend: 0.3, lift: 0.36, lock: 1 }, { bodyY: -2.4, squash: -0.08, shake: 0.35, gaze: 0.3 }),
    rate: 0.5,
    blink: false,
  },

  // Small eyes looking away and down, leaning in on itself. No blush: a flush muddies cool colours.
  shy: {
    pose: pose({ sx: 0.74, sy: 0.74, lift: -0.15, inward: 0.1, lock: 1 }, { lookX: -0.55, lookY: 0.55, bodyTilt: -7, bodyY: 0.8, squash: 0.04, gaze: 0.15 }),
    rate: 1.3,
    blink: true,
  },

  // Eyes calmly shut, chin up, standing tall.
  proud: {
    pose: pose({ sx: 1.6, sy: 0.3, bend: 0.25, lift: 0.32, lock: 1 }, { lookY: -0.45, bodyY: -1.5, squash: -0.06, bodyTilt: 4, gaze: 0 }),
    rate: 1.2,
    blink: false,
  },

  // Tall eyes set wide, cowering and trembling, the colour drained out.
  scared: {
    pose: pose({ sx: 0.76, sy: 1.45, lift: 0.15, inward: -0.12, lock: 1 }, { shake: 1.3, squash: 0.08, bodyY: 1.4, tint: 0.35, tintChroma: 0.015, gaze: 0.8 }),
    rate: 0.45,
    blink: true,
  },

  // A soft, half-closed smile, sinking in, breathing slowly.
  content: {
    pose: pose({ sx: 1.5, sy: 0.55, bend: 0.55, lift: -0.05, lock: 1 }, { bodyY: 0.6, squash: 0.03, gaze: 0.2 }),
    rate: 1.6,
    blink: false,
  },

  // Looking up and off to one side, one eye narrowed, head tilted.
  thinking: {
    pose: lopsided({ sy: 0.95, lift: 0.1, lock: 1 }, { sx: 1.1, sy: 0.55, lift: 0.25, lock: 1 }, { lookX: 0.55, lookY: -0.6, bodyTilt: 5, gaze: 0 }),
    rate: 1.1,
    blink: true,
  },

  // Watching a video: bright, wide eyes on the screen, sitting up a little, quite taken with it.
  watching: {
    pose: pose({ sx: 1.12, sy: 1.22, lift: 0.18, lock: 1 }, { bodyY: -0.8, squash: -0.025 }),
    rate: 0.85,
    blink: true,
  },

  // The memory nearly full: puffed out wide and low, small eyes pushed up, slow heavy breaths.
  stuffed: {
    pose: pose({ sx: 0.82, sy: 0.82, lift: 0.5, lock: 1 }, { squash: 0.24, bodyY: 1.6, lookY: 0.2, gaze: 0.2 }),
    rate: 1.8,
    blink: true,
  },
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

function lerpEye(a: EyePose, b: EyePose, t: number): EyePose {
  return {
    sx: mix(a.sx, b.sx, t),
    sy: mix(a.sy, b.sy, t),
    bend: mix(a.bend, b.bend, t),
    heart: mix(a.heart, b.heart, t),
    tilt: mix(a.tilt, b.tilt, t),
    inward: mix(a.inward, b.inward, t),
    lift: mix(a.lift, b.lift, t),
    lock: mix(a.lock, b.lock, t),
  }
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    left: lerpEye(a.left, b.left, t),
    right: lerpEye(a.right, b.right, t),
    lookX: mix(a.lookX, b.lookX, t),
    lookY: mix(a.lookY, b.lookY, t),
    bodyY: mix(a.bodyY, b.bodyY, t),
    bodyTilt: mix(a.bodyTilt, b.bodyTilt, t),
    squash: mix(a.squash, b.squash, t),
    shake: mix(a.shake, b.shake, t),
    wobble: mix(a.wobble, b.wobble, t),
    tint: mix(a.tint, b.tint, t),
    tintHue: mix(a.tintHue, b.tintHue, t),
    tintChroma: mix(a.tintChroma, b.tintChroma, t),
    gaze: mix(a.gaze, b.gaze, t),
  }
}
