import { traitsFor } from './blob/hash'
import type { LookOverrides } from './blob/generate'

/**
 * Names that make a buddy sparkle now and then. They're kept as hashes, so they stay a secret for
 * people to stumble on rather than something to read off the source. Case and spaces don't matter.
 * Some come with a look of their own instead of the one the name would generate; anything pinned in
 * the customise panel still changes it.
 */
const SECRETS = new Map<number, LookOverrides | null>([
  [
    0xb082a657,
    { shape: 'boxy', eyes: 'capsules', tone: 'mid', hue: 240, traits: { 'eye.size': 0.547, 'eye.ratio': 0.7, 'eye.separation': 0.166 } },
  ],
  [0x61bbdb75, null],
  [0x40e10dd4, null],
  [0xe4d48427, null],
])

const hashOf = (name: string) => Math.floor(traitsFor(name)('secret') * 0x100000000)

export const isSecretName = (name: string) => SECRETS.has(hashOf(name))

/** The look a secret name comes with, if it has one. */
export const secretLook = (name: string): LookOverrides | undefined => SECRETS.get(hashOf(name)) ?? undefined
