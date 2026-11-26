import type { BuddyLook, ToneName } from '../Buddy/blob/generate'

/** Colour names around the (OKLCH) hue wheel, each up to the hue it ends at. */
const HUE_NAMES: [end: number, name: string][] = [
  [35, 'red'],
  [70, 'orange'],
  [105, 'yellow'],
  [150, 'green'],
  [185, 'mint'],
  [225, 'cyan'],
  [262, 'blue'],
  [290, 'violet'],
  [322, 'purple'],
  [355, 'pink'],
  [360, 'red'],
]

/** Tones that change how a colour is said; the everyday ones just use its name. */
const TONE_WORDS: Partial<Record<ToneName, string>> = {
  pale: 'pale',
  deep: 'deep',
  ink: 'dark',
}

/** A hue (degrees) and tone in everyday words: "cyan", "deep blue". */
export function colourName(hue: number, tone: ToneName): string {
  const h = ((hue % 360) + 360) % 360
  const name = HUE_NAMES.find(([end]) => h < end)?.[1] ?? 'red'
  const word = TONE_WORDS[tone]
  return word ? `${word} ${name}` : name
}

/** A look in a few words, for the home list and the share card: "Boxy, cyan, dots". */
export function describeLook(look: BuddyLook): string {
  const shape = look.shape.charAt(0).toUpperCase() + look.shape.slice(1)
  return `${shape}, ${colourName(look.hue, look.tone)}, ${look.eyeStyle}`
}

/** "Sora's", for labels like the tile that keeps the name's own pick. */
export const possessive = (name: string) => `${name.trim() || 'Your buddy'}’s`

/** The switches on the behaviour page, as the home row counts them: which are on, out of those there are here. */
export function behaviourSwitches(s: {
  followCursor: boolean
  alwaysOnTop: boolean
  stepAside: boolean
  showStats: boolean
  quiet: boolean
  startWithWindows: boolean | null | undefined
  hasHelper: boolean
}): boolean[] {
  return [
    s.followCursor,
    s.alwaysOnTop,
    ...(s.hasHelper ? [s.stepAside] : []),
    ...(typeof s.startWithWindows === 'boolean' ? [s.startWithWindows] : []),
    s.showStats,
    s.quiet,
  ]
}
