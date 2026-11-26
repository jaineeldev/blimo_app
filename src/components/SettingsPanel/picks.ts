import type { LookOverrides } from '../Buddy/blob/generate'

/** Drops unset keys and empty objects, so a reset part never lingers in saved settings. */
export function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && !(typeof v === 'object' && Object.keys(v).length === 0)),
  ) as T
}

/** How many parts of the look have been picked here rather than left to the name. */
export function countPicks(look: LookOverrides): number {
  const picked = [look.shape, look.eyes, look.tone, look.hue].filter((v) => v !== undefined).length
  return picked + Object.keys(look.traits ?? {}).length
}
