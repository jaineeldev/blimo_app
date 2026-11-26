import {
  EXTRA_SHAPES,
  EYE_STYLES,
  GENERATED_SHAPES,
  TONE_NAMES,
  type LookOverrides,
  type PinnableTrait,
  type ShapeName,
} from './components/Buddy/blob/generate'

/**
 * Buddy codes: a buddy's name and the parts of its look you picked, as a short code a friend can paste
 * into their own Blimo to get the same buddy. Everything else about a look comes from the name, so the
 * name and the picks are all it takes.
 *
 * A code reads like SORA-0A4K-7Q2X: the name in capitals, which is only there to recognise it by, then
 * the buddy itself, written in Crockford's base 32 (no I, L, O or U, so it's hard to misread) and split
 * into fours. Inside, in bytes: the format's version, which parts are in it, the name (UTF-8, after its
 * length), each picked part, then a checksum, so a mistyped code is turned away rather than giving
 * someone a different buddy.
 */

const VERSION = 1
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// What each part is stored as: its place in these lists. New entries only ever go on the end, so
// codes made by older versions still read the same.
const SHAPES: readonly ShapeName[] = [...GENERATED_SHAPES, ...EXTRA_SHAPES]
const TRAITS: readonly PinnableTrait[] = ['eye.size', 'eye.ratio', 'eye.separation', 'eye.squareness', 'eye.lean', 'eye.gazeX', 'eye.gazeY']

const HAS = { shape: 1, eyes: 2, tone: 4, hue: 8, traits: 16 } as const
/** Names are kept to this many characters, as in the panel. */
export const MAX_NAME = 40

export type ReadCode = { ok: true; name: string; look: LookOverrides } | { ok: false; reason: 'invalid' | 'newer' }

/** A small checksum (CRC-8) over the bytes before it. */
function checksum(bytes: number[]): number {
  let crc = 0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
  }
  return crc
}

function toBase32(bytes: number[]): string {
  let out = ''
  let value = 0
  let bits = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Reads base 32 back to bytes, forgiving the letters people mix up (O for 0, I and L for 1). Null if it isn't base 32. */
function fromBase32(text: string): number[] | null {
  const bytes: number[] = []
  let value = 0
  let bits = 0
  for (const raw of text) {
    const char = raw === 'O' ? '0' : raw === 'I' || raw === 'L' ? '1' : raw
    const digit = ALPHABET.indexOf(char)
    if (digit < 0) return null
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
    value &= (1 << bits) - 1
  }
  return bytes
}

/** The front of a code: the name's letters and digits in capitals, to recognise it by. */
function label(name: string): string {
  const plain = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)
  return plain || 'BLIMO'
}

/** The code for a buddy with this name and these picks. */
export function buddyCode(name: string, look: LookOverrides): string {
  const nameBytes = [...new TextEncoder().encode(name.slice(0, MAX_NAME))]
  const bytes = [VERSION, 0, nameBytes.length, ...nameBytes]
  let has = 0
  const shape = look.shape ? SHAPES.indexOf(look.shape) : -1
  if (shape >= 0) {
    has |= HAS.shape
    bytes.push(shape)
  }
  const eyes = look.eyes ? EYE_STYLES.indexOf(look.eyes) : -1
  if (eyes >= 0) {
    has |= HAS.eyes
    bytes.push(eyes)
  }
  const tone = look.tone ? TONE_NAMES.indexOf(look.tone) : -1
  if (tone >= 0) {
    has |= HAS.tone
    bytes.push(tone)
  }
  if (look.hue !== undefined) {
    const hue = ((Math.round(look.hue) % 360) + 360) % 360
    has |= HAS.hue
    bytes.push(hue >> 8, hue & 0xff)
  }
  const traits = TRAITS.map((key) => look.traits?.[key])
  if (traits.some((v) => v !== undefined)) {
    has |= HAS.traits
    bytes.push(traits.reduce<number>((mask, v, i) => (v === undefined ? mask : mask | (1 << i)), 0))
    // Each to the nearest 255th of its range: finer than the panel's sliders can tell apart.
    for (const v of traits) if (v !== undefined) bytes.push(Math.round(Math.min(1, Math.max(0, v)) * 255))
  }
  bytes[1] = has
  bytes.push(checksum(bytes))
  const groups = toBase32(bytes).match(/.{1,4}/g) ?? []
  return [label(name), ...groups].join('-')
}

/** Reads a code someone pasted: the buddy in it, or why it couldn't be read. */
export function readBuddyCode(input: string): ReadCode {
  const parts = input
    .toUpperCase()
    .replace(/[\s_.]+/g, '-')
    .split('-')
    .filter(Boolean)
  // Usually the name comes first and is skipped; a code pasted without it is read whole.
  const attempts = parts.length > 1 ? [parts.slice(1).join(''), parts.join('')] : [parts.join('')]
  let newer = false
  for (const attempt of attempts) {
    const read = parse(attempt)
    if (read.ok) return read
    if (read.reason === 'newer') newer = true
  }
  return { ok: false, reason: newer ? 'newer' : 'invalid' }
}

function parse(text: string): ReadCode {
  const invalid = { ok: false, reason: 'invalid' } as const
  const bytes = fromBase32(text)
  if (!bytes || bytes.length < 5) return invalid
  // Spare bits at the end of the last letter make at most one partial byte, which base 32 drops.
  const sum = bytes.length - 1
  if (checksum(bytes.slice(0, sum)) !== bytes[sum]) return invalid
  if (bytes[0] > VERSION) return { ok: false, reason: 'newer' }
  if (bytes[0] !== VERSION) return invalid

  let at = 1
  const has = bytes[at++]
  const length = bytes[at++]
  if (at + length > sum) return invalid
  let name: string
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes.slice(at, at + length))).trim()
  } catch {
    return invalid
  }
  at += length
  if (!name || name.length > MAX_NAME) return invalid

  const look: LookOverrides = {}
  const next = () => (at < sum ? bytes[at++] : -1)
  if (has & HAS.shape) {
    const shape = SHAPES[next()]
    if (!shape) return invalid
    look.shape = shape
  }
  if (has & HAS.eyes) {
    const eyes = EYE_STYLES[next()]
    if (!eyes) return invalid
    look.eyes = eyes
  }
  if (has & HAS.tone) {
    const tone = TONE_NAMES[next()]
    if (!tone) return invalid
    look.tone = tone
  }
  if (has & HAS.hue) {
    const hi = next()
    const lo = next()
    const hue = (hi << 8) | lo
    if (hi < 0 || lo < 0 || hue >= 360) return invalid
    look.hue = hue
  }
  if (has & HAS.traits) {
    const mask = next()
    if (mask <= 0 || mask >> TRAITS.length) return invalid
    const traits: LookOverrides['traits'] = {}
    for (const [i, key] of TRAITS.entries()) {
      if (!(mask & (1 << i))) continue
      const v = next()
      if (v < 0) return invalid
      traits[key] = v / 255
    }
    look.traits = traits
  }
  if (has & ~31 || at !== sum) return invalid
  return { ok: true, name, look }
}
