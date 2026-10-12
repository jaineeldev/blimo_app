import { contrast, oklch, type Lab } from './color'
import {
  bodyPoints,
  dropletPath,
  roundedPolygonPath,
  smoothClosedPath,
  stadiumPath,
  superellipsePath,
  type Pt,
} from './geometry'
import { traitsFor, type TraitFn } from './hash'
import { secretLook } from '../secretNames'

/** Ten silhouettes, weighted so rounds and pebbles are everyday and the louder shapes stay a find. */
const SHAPE_WEIGHTS = {
  round: 0.24,
  organic: 0.22,
  boxy: 0.12,
  capsule: 0.08,
  nub: 0.08,
  cloud: 0.07,
  droplet: 0.06,
  hexagon: 0.05,
  sun: 0.04,
  triangle: 0.04,
}

/** Shapes a name can land on. */
export const GENERATED_SHAPES = Object.keys(SHAPE_WEIGHTS) as (keyof typeof SHAPE_WEIGHTS)[]

/** Hand-drawn characters that only appear when picked in the panel; no name ever lands on them. */
export const EXTRA_SHAPES = ['mochi', 'bean', 'ghost', 'kitty', 'sprout', 'slime'] as const

export type ShapeName = (typeof GENERATED_SHAPES)[number] | (typeof EXTRA_SHAPES)[number]

/** Dots are the everyday eye; capsules and the visor are rarer finds. */
const EYE_WEIGHTS = {
  dots: 0.3,
  domes: 0.2,
  squares: 0.2,
  capsules: 0.16,
  visor: 0.14,
}

export type EyeStyle = keyof typeof EYE_WEIGHTS
export const EYE_STYLES = Object.keys(EYE_WEIGHTS) as EyeStyle[]

const TONE_WEIGHTS = {
  pastel: 0.36,
  mid: 0.18,
  bright: 0.14,
  pale: 0.12,
  deep: 0.12,
  ink: 0.08,
}

export type ToneName = keyof typeof TONE_WEIGHTS
export const TONE_NAMES = Object.keys(TONE_WEIGHTS) as ToneName[]

const TONES: Record<ToneName, { l: number; c: number }> = {
  pastel: { l: 0.86, c: 0.095 },
  mid: { l: 0.76, c: 0.13 },
  bright: { l: 0.8, c: 0.18 },
  pale: { l: 0.93, c: 0.045 },
  deep: { l: 0.5, c: 0.12 },
  ink: { l: 0.3, c: 0.035 },
}

/** Eyes clear this against the body, whatever the hue and tone. */
const MIN_EYE_CONTRAST = 4.5

/** Traits the editor can pin, as 0–1 positions read through the same ranges as hashed values. */
export type PinnableTrait =
  | 'eye.size'
  | 'eye.ratio'
  | 'eye.separation'
  | 'eye.squareness'
  | 'eye.lean'
  | 'eye.gazeX'
  | 'eye.gazeY'

/** Anything left out still comes from the name. */
export interface LookOverrides {
  shape?: ShapeName
  eyes?: EyeStyle
  tone?: ToneName
  /** Degrees. */
  hue?: number
  traits?: Partial<Record<PinnableTrait, number>>
}

export interface EyeSpec {
  cx: number
  cy: number
  /** Half-width and half-height of the resting eye. */
  hw: number
  hh: number
  /** Superellipse exponent: 2 is an oval, higher is squarer. */
  n: number
  /** 1 flattens the lower half into a dome sitting on `cy`. */
  flat: number
  /** Resting lean in degrees, shared by both eyes. */
  lean: number
}

export interface BuddyLook {
  shape: ShapeName
  eyeStyle: EyeStyle
  /** Body pieces, all drawn in the body colour. Overlapping fills stand in for boolean geometry. */
  parts: string[]
  /** Lowest point of the body, which breathing and squashing anchor to. */
  ground: number
  eyes: readonly [left: EyeSpec, right: EyeSpec]
  /** How far the pair of eyes rests from the middle of the face. Part of each buddy's character. */
  eyeRest: { x: number; y: number }
  body: Lab
  eye: Lab
  hue: number
  tone: ToneName
  /** Per-buddy timings in ms, so two buddies side by side never breathe in step. */
  motion: { breathePhase: number; bobPhase: number; swayPhase: number; blink: number; blinkPhase: number }
}

interface Face {
  x: number
  y: number
  rx: number
  ry: number
}

interface Silhouette {
  parts: string[]
  /** An ellipse the eyes must stay inside. */
  face: Face
  ground: number
}

/** All geometry lives in a 100 × 100 viewBox. */
export const CX = 50
export const CY = 53

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const signed = (t: TraitFn, key: string) => t(key) * 2 - 1
const rad = (deg: number) => (deg * Math.PI) / 180

function pick<K extends string>(u: number, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  let acc = 0
  for (const [key, weight] of entries) {
    acc += weight
    if (u < acc) return key
  }
  return entries[entries.length - 1][0]
}

function circle(cx: number, cy: number, r: number): string {
  return superellipsePath(cx, cy, r, r, 2)
}

function silhouette(shape: ShapeName, t: TraitFn, R: number): Silhouette {
  const aspect = lerp(0.92, 1.12, t('body.proportion'))
  const sa = Math.sqrt(aspect)

  switch (shape) {
    case 'round': {
      const a = R * sa
      const b = R / sa
      return {
        parts: [superellipsePath(CX, CY, a, b, lerp(2, 2.7, t('body.squareness')))],
        face: { x: CX, y: CY - b * 0.04, rx: a * 0.76, ry: b * 0.7 },
        ground: CY + b,
      }
    }

    case 'organic': {
      const count = 7 + Math.floor(t('organic.points') * 3)
      const turn = t('organic.turn') * Math.PI * 2
      const radii = Array.from({ length: count }, (_, i) => R * (1 + 0.16 * signed(t, `organic.r${i}`)))
      const pts: Pt[] = radii.map((r, i) => {
        const angle = turn + (i / count) * Math.PI * 2
        return [CX + Math.cos(angle) * r * sa, CY + (Math.sin(angle) * r) / sa]
      })
      const inner = Math.min(...radii)
      return {
        parts: [smoothClosedPath(pts)],
        face: { x: CX, y: CY - R * 0.03, rx: inner * 0.72 * sa, ry: (inner * 0.66) / sa },
        ground: Math.max(...pts.map((p) => p[1])),
      }
    }

    case 'boxy': {
      const a = R * 0.94 * sa
      const b = (R * 0.94) / sa
      const tilt = signed(t, 'body.tilt') * 7
      return {
        parts: [superellipsePath(CX, CY, a, b, lerp(3.4, 5, t('body.squareness')), tilt)],
        face: { x: CX, y: CY - b * 0.03, rx: a * 0.74, ry: b * 0.7 },
        ground: CY + b,
      }
    }

    case 'capsule': {
      const hw = R * 1.2
      const hh = R * lerp(0.66, 0.84, t('capsule.squat'))
      return {
        parts: [stadiumPath(CX, CY, hw, hh)],
        face: { x: CX, y: CY - hh * 0.04, rx: hw * 0.6, ry: hh * 0.72 },
        ground: CY + hh,
      }
    }

    case 'nub': {
      const r = R * 0.94
      const count = 1 + Math.floor(t('nub.count') * 3)
      const size = r * lerp(0.2, 0.3, t('nub.size'))
      const spread = lerp(28, 52, t('nub.angle'))
      const lean = signed(t, 'nub.lean') * 12
      const angles = [[-90], [-90 - spread, -90 + spread], [-90 - spread, -90, -90 + spread]][count - 1]
      const nubs = angles.map((deg) => {
        const a = rad(deg + lean)
        return circle(CX + Math.cos(a) * r * 0.96, CY + Math.sin(a) * r * 0.96, size)
      })
      return {
        parts: [...nubs, superellipsePath(CX, CY, r, r * 0.97, 2.3)],
        face: { x: CX, y: CY, rx: r * 0.75, ry: r * 0.68 },
        ground: CY + r * 0.97,
      }
    }

    case 'cloud': {
      const a = R * 1.12
      const b = R * 0.8
      const cy = CY + R * 0.1
      const lobes = 3 + Math.floor(t('cloud.lobes') * 3)
      const parts: string[] = []
      for (let i = 0; i < lobes; i++) {
        const a0 = rad(lerp(200, 340, i / (lobes - 1)))
        const size = R * lerp(0.42, 0.56, t(`cloud.lobe${i}`))
        parts.push(circle(CX + Math.cos(a0) * a * 0.66, cy + Math.sin(a0) * b * 0.62, size))
      }
      parts.push(superellipsePath(CX, cy, a, b, 2.6))
      return {
        parts,
        face: { x: CX, y: cy - b * 0.02, rx: a * 0.66, ry: b * 0.62 },
        ground: cy + b,
      }
    }

    case 'droplet': {
      const r = R * 0.92
      const tip = r * lerp(0.5, 0.78, t('droplet.tip'))
      const cy = CY + tip * 0.3
      return {
        parts: [dropletPath(CX, cy, r, tip)],
        face: { x: CX, y: cy + r * 0.04, rx: r * 0.74, ry: r * 0.66 },
        ground: cy + r,
      }
    }

    case 'hexagon': {
      const rc = R * 1.1
      const start = (t('hexagon.orientation') < 0.5 ? 0 : 30) + signed(t, 'body.tilt') * 6
      const verts: Pt[] = Array.from({ length: 6 }, (_, i) => {
        const a = rad(start + i * 60)
        return [CX + Math.cos(a) * rc, CY + Math.sin(a) * rc]
      })
      return {
        parts: [roundedPolygonPath(verts, lerp(0.2, 0.36, t('body.rounding')))],
        face: { x: CX, y: CY, rx: rc * 0.62, ry: rc * 0.56 },
        ground: Math.max(...verts.map((v) => v[1])),
      }
    }

    case 'sun': {
      const r = R * 0.82
      const petals = 8 + Math.floor(t('sun.petals') * 5)
      const size = r * lerp(0.2, 0.28, t('sun.size'))
      const dist = r * lerp(0.98, 1.08, t('sun.distance'))
      const turn = (t('sun.rotation') * 360) / petals
      const parts = Array.from({ length: petals }, (_, i) => {
        const a = rad(turn + (i * 360) / petals)
        return circle(CX + Math.cos(a) * dist, CY + Math.sin(a) * dist, size)
      })
      parts.push(circle(CX, CY, r))
      return {
        parts,
        face: { x: CX, y: CY, rx: r * 0.74, ry: r * 0.7 },
        ground: CY + dist + size,
      }
    }

    case 'triangle': {
      const rc = R * 1.36
      const tilt = signed(t, 'body.tilt') * 6
      // A triangle's weight sits low, so the centroid drops to look centred.
      const cy = CY + rc * 0.1
      const verts: Pt[] = [-90, 30, 150].map((deg) => {
        const a = rad(deg + tilt)
        return [CX + Math.cos(a) * rc, cy + Math.sin(a) * rc]
      })
      return {
        parts: [roundedPolygonPath(verts, lerp(0.26, 0.42, t('body.rounding')))],
        face: { x: CX, y: cy + rc * 0.1, rx: rc * 0.36, ry: rc * 0.33 },
        ground: Math.max(...verts.map((v) => v[1])),
      }
    }

    // The extras below are drawn by hand in body radii; the name only stretches them a little.

    case 'mochi': {
      const p = bodyPoints(CX, CY, R * sa, R / sa)
      return {
        parts: [
          `M${p(-1, 0.56)}C${p(-1, -0.36)} ${p(-0.6, -0.84)} ${p(0, -0.84)}C${p(0.6, -0.84)} ${p(1, -0.36)} ${p(1, 0.56)}` +
            `Q${p(1, 0.76)} ${p(0.8, 0.76)}L${p(-0.8, 0.76)}Q${p(-1, 0.76)} ${p(-1, 0.56)}Z`,
        ],
        face: { x: CX, y: CY + R * 0.06, rx: R * sa * 0.7, ry: (R / sa) * 0.48 },
        ground: CY + (R / sa) * 0.76,
      }
    }

    case 'bean': {
      const flip = t('bean.flip') < 0.5 ? -1 : 1
      const p = bodyPoints(CX, CY, flip * R * sa, R / sa)
      return {
        parts: [
          `M${p(-0.96, -0.08)}C${p(-0.96, -0.64)} ${p(-0.28, -0.84)} ${p(0.2, -0.68)}C${p(0.8, -0.48)} ${p(1.08, -0.08)} ${p(0.96, 0.32)}` +
            `C${p(0.84, 0.72)} ${p(0.2, 0.8)} ${p(-0.24, 0.7)}C${p(-0.72, 0.6)} ${p(-0.96, 0.36)} ${p(-0.96, -0.08)}Z`,
        ],
        face: { x: CX, y: CY - R * 0.02, rx: R * sa * 0.6, ry: (R / sa) * 0.48 },
        ground: CY + (R / sa) * 0.76,
      }
    }

    case 'ghost': {
      const p = bodyPoints(CX, CY, R * sa, R / sa)
      return {
        parts: [
          `M${p(-0.84, 0.68)}L${p(-0.84, -0.12)}C${p(-0.84, -0.64)} ${p(-0.44, -0.88)} ${p(0, -0.88)}` +
            `C${p(0.44, -0.88)} ${p(0.84, -0.64)} ${p(0.84, -0.12)}L${p(0.84, 0.68)}` +
            `Q${p(0.7, 0.52)} ${p(0.56, 0.68)}Q${p(0.42, 0.84)} ${p(0.28, 0.68)}Q${p(0.14, 0.52)} ${p(0, 0.68)}` +
            `Q${p(-0.14, 0.84)} ${p(-0.28, 0.68)}Q${p(-0.42, 0.52)} ${p(-0.56, 0.68)}Q${p(-0.7, 0.84)} ${p(-0.84, 0.68)}Z`,
        ],
        face: { x: CX, y: CY - R * 0.12, rx: R * sa * 0.58, ry: (R / sa) * 0.46 },
        ground: CY + (R / sa) * 0.76,
      }
    }

    case 'kitty': {
      const a = R * sa
      const b = (R * 0.9) / sa
      const ear = (side: number) =>
        roundedPolygonPath(
          [
            [CX + side * 0.82 * R, CY - 0.3 * R],
            [CX + side * 0.74 * R, CY - 1.02 * R],
            [CX + side * 0.22 * R, CY - 0.74 * R],
          ],
          0.3,
        )
      return {
        parts: [ear(-1), ear(1), superellipsePath(CX, CY, a, b, 2.3)],
        face: { x: CX, y: CY + b * 0.02, rx: a * 0.74, ry: b * 0.66 },
        ground: CY + b,
      }
    }

    case 'sprout': {
      const a = R * sa
      const b = (R * 0.9) / sa
      const p = bodyPoints(CX, CY, R, R)
      return {
        parts: [
          `M${p(-0.02, -0.8)}Q${p(-0.32, -1.24)} ${p(-0.6, -1.02)}Q${p(-0.36, -0.76)} ${p(-0.02, -0.8)}Z`,
          `M${p(0.02, -0.8)}Q${p(0.24, -1.16)} ${p(0.5, -1)}Q${p(0.28, -0.76)} ${p(0.02, -0.8)}Z`,
          superellipsePath(CX, CY, a, b, 2.3),
        ],
        face: { x: CX, y: CY + b * 0.02, rx: a * 0.74, ry: b * 0.66 },
        ground: CY + b,
      }
    }

    case 'slime': {
      const p = bodyPoints(CX, CY, R * sa, R / sa)
      return {
        parts: [
          `M${p(-0.96, 0.36)}C${p(-0.96, -0.48)} ${p(-0.52, -0.88)} ${p(0, -0.88)}C${p(0.52, -0.88)} ${p(0.96, -0.48)} ${p(0.96, 0.36)}` +
            `Q${p(0.96, 0.56)} ${p(0.76, 0.58)}Q${p(0.68, 0.6)} ${p(0.68, 0.72)}Q${p(0.68, 0.88)} ${p(0.56, 0.88)}` +
            `Q${p(0.44, 0.88)} ${p(0.44, 0.72)}L${p(0.44, 0.62)}Q${p(0.2, 0.58)} ${p(0, 0.62)}Q${p(-0.12, 0.64)} ${p(-0.12, 0.76)}` +
            `Q${p(-0.12, 0.9)} ${p(-0.24, 0.9)}Q${p(-0.36, 0.9)} ${p(-0.36, 0.76)}L${p(-0.36, 0.62)}Q${p(-0.6, 0.58)} ${p(-0.76, 0.58)}` +
            `Q${p(-0.96, 0.56)} ${p(-0.96, 0.36)}Z`,
        ],
        face: { x: CX, y: CY - R * 0.06, rx: R * sa * 0.66, ry: (R / sa) * 0.48 },
        ground: CY + (R / sa) * 0.9,
      }
    }
  }
}

function placeEyes(style: EyeStyle, t: TraitFn, R: number, face: Face): Pick<BuddyLook, 'eyes' | 'eyeRest'> {
  const size = t('eye.size')
  const ratio = t('eye.ratio')
  const square = t('eye.squareness')
  let sep = R * lerp(0.26, 0.42, t('eye.separation'))
  let hh: number
  let hw: number
  let n: number
  let flat = 0
  let lean = 0
  // Domes sit on their flat edge, so their baseline drops to centre their weight on the face.
  let drop = 0

  switch (style) {
    case 'dots':
      hh = R * lerp(0.11, 0.17, size)
      hw = hh * lerp(0.85, 1.2, ratio)
      n = lerp(2, 2.5, square)
      lean = signed(t, 'eye.lean') * 8
      break
    case 'squares':
      hh = R * lerp(0.12, 0.17, size)
      hw = hh * lerp(0.85, 1.25, ratio)
      n = lerp(4, 6, square)
      lean = signed(t, 'eye.lean') * 8
      break
    case 'domes':
      hh = R * lerp(0.15, 0.21, size)
      hw = hh * lerp(0.95, 1.25, ratio)
      n = lerp(2, 2.8, square)
      flat = 1
      lean = signed(t, 'eye.lean') * 5
      drop = hh * 0.42
      break
    case 'capsules':
      hh = R * lerp(0.22, 0.34, size)
      hw = hh * lerp(0.36, 0.62, ratio)
      n = lerp(2.2, 4.6, square)
      sep = R * lerp(0.28, 0.42, t('eye.separation'))
      lean = signed(t, 'eye.lean') * 11
      break
    case 'visor': {
      hh = R * lerp(0.075, 0.11, size)
      // Two halves overlapping in the middle read as one bar, and moods can still pull them apart.
      const span = R * lerp(0.34, 0.5, t('eye.separation')) * lerp(0.92, 1.08, ratio)
      hw = span / 2 + hh * 0.6
      sep = span - hw
      n = lerp(2.4, 4, square)
      break
    }
  }
  if (style !== 'visor') sep = Math.max(sep, hw * 1.8)
  let gx = signed(t, 'eye.gazeX') * R * 0.1
  let gy = signed(t, 'eye.gazeY') * R * 0.1 + drop

  // Shrink the whole cluster about the face centre until every corner sits inside the face.
  const c = Math.cos(rad(lean))
  const s = Math.sin(rad(lean))
  let worst = 0
  for (const side of [-1, 1]) {
    for (const [ox, oy] of [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]]) {
      const x = side * sep + gx + ox * c - oy * s
      const y = gy + ox * s + oy * c
      worst = Math.max(worst, Math.hypot(x / face.rx, y / face.ry))
    }
  }
  if (worst > 1) {
    hh /= worst
    hw /= worst
    sep /= worst
    gx /= worst
    gy /= worst
    drop /= worst
  }

  const eye = (side: number): EyeSpec => ({ cx: face.x + side * sep + gx, cy: face.y + gy, hw, hh, n, flat, lean })
  // The rest leaves out a dome's drop, which only centres its weight on the face.
  return { eyes: [eye(-1), eye(1)], eyeRest: { x: gx, y: gy - drop } }
}

/** The body colour a tone and hue produce, before any contrast correction. */
export function toneColour(tone: ToneName, hue: number): Lab {
  return oklch(TONES[tone].l, TONES[tone].c, hue)
}

function colours(t: TraitFn, overrides: LookOverrides): { body: Lab; eye: Lab; hue: number; tone: ToneName } {
  const hue = overrides.hue ?? t('hue') * 360
  const toneName = overrides.tone ?? pick(t('tone'), TONE_WEIGHTS)
  const tone = TONES[toneName]
  let l = tone.l
  let body = oklch(l, tone.c, hue)
  const dark = oklch(0.18, 0.025, hue)
  const light = oklch(0.97, 0.012, hue)
  const eye = contrast(body, dark) >= contrast(body, light) ? dark : light
  // Push the body away from the eye until the face reads clearly.
  const step = eye === dark ? 0.02 : -0.02
  for (let i = 0; i < 20 && contrast(body, eye) < MIN_EYE_CONTRAST; i++) {
    l += step
    body = oklch(l, tone.c, hue)
  }
  return { body, eye, hue, tone: toneName }
}

/** Pinned traits laid over a base look. Unset (undefined) pins leave the base showing through. */
function layered(base: LookOverrides, pinned: LookOverrides): LookOverrides {
  const set = Object.fromEntries(Object.entries(pinned).filter(([, v]) => v !== undefined)) as LookOverrides
  return { ...base, ...set, traits: { ...base.traits, ...pinned.traits } }
}

export function generateLook(name: string, pinned: LookOverrides = {}): BuddyLook {
  // A secret name can come with a look of its own; anything pinned in the panel still goes on top.
  const secret = secretLook(name)
  const overrides = secret ? layered(secret, pinned) : pinned
  const hashed = traitsFor(name)
  const t: TraitFn = (key) => overrides.traits?.[key as PinnableTrait] ?? hashed(key)
  const shape = overrides.shape ?? pick(t('shape'), SHAPE_WEIGHTS)
  const eyeStyle = overrides.eyes ?? pick(t('eye.style'), EYE_WEIGHTS)
  const R = lerp(27, 31, t('body.size'))
  const { parts, face, ground } = silhouette(shape, t, R)
  const blink = Math.round(lerp(3600, 6000, t('motion.blink')))
  return {
    shape,
    eyeStyle,
    parts,
    ground,
    ...placeEyes(eyeStyle, t, R, face),
    ...colours(t, overrides),
    motion: {
      breathePhase: -Math.round(t('motion.breathe') * 2800),
      bobPhase: -Math.round(t('motion.bob') * 3400),
      swayPhase: -Math.round(t('motion.sway') * 4600),
      blink,
      blinkPhase: -Math.round(t('motion.blinkPhase') * blink),
    },
  }
}
