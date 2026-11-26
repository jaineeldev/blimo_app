import { useMemo, useState, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toHex } from '../../Buddy/blob/color'
import {
  generateLook,
  EXTRA_SHAPES,
  EYE_STYLES,
  GENERATED_SHAPES,
  TONE_NAMES,
  toneColour,
  type EyeStyle,
  type LookOverrides,
  type PinnableTrait,
  type ShapeName,
} from '../../Buddy/blob/generate'
import { traitsFor } from '../../Buddy/blob/hash'
import { secretLook } from '../../Buddy/secretNames'
import { useBuddyStore } from '../../../stores/buddyStore'
import { Chip, ChevronIcon, Section, Slider, TileGrid } from '../controls'
import { colourName, possessive } from '../describe'
import { compact, countPicks } from '../picks'

/** Ten hues spread around the wheel, each drawn in the buddy's current tone. */
const HUES = [20, 50, 85, 130, 165, 200, 240, 275, 305, 340]

interface EyeSlider {
  key: PinnableTrait
  label: string
  /** Show the trait flipped, so dragging right always reads as "more" (height: right is higher). */
  invert?: boolean
  /** Eye styles the trait has no effect on, where the slider is hidden. */
  hiddenFor?: EyeStyle[]
}

const EYE_SLIDERS: EyeSlider[] = [
  { key: 'eye.size', label: 'Size' },
  { key: 'eye.ratio', label: 'Width' },
  { key: 'eye.separation', label: 'Spacing' },
  { key: 'eye.squareness', label: 'Squareness' },
  { key: 'eye.lean', label: 'Tilt', hiddenFor: ['visor'] },
  { key: 'eye.gazeY', label: 'Height', invert: true },
  { key: 'eye.gazeX', label: 'Sideways' },
]

/** Shape, colour and eyes. Anything left alone comes from the name; each tile previews this buddy with that pick. */
export function LookPage() {
  const { name, look } = useBuddyStore(useShallow((s) => ({ name: s.name, look: s.look })))
  const { update, celebrate } = useBuddyStore.getState()
  const [fineTune, setFineTune] = useState(() => Object.keys(look.traits ?? {}).length > 0)

  // Read the latest look from the store, not this render's copy, so quick successive edits never undo each other.
  const setLook = (patch: LookOverrides) => update({ look: compact({ ...useBuddyStore.getState().look, ...patch }) })
  const setTrait = (key: PinnableTrait, value: number | undefined) =>
    setLook({
      traits: compact({
        ...useBuddyStore.getState().look.traits,
        [key]: value,
      }),
    })
  // Picking something new (not dragging a slider) gets a surprised little pop.
  const pick = (patch: LookOverrides) => {
    setLook(patch)
    celebrate()
  }

  const own = possessive(name)
  const hashed = useMemo(() => traitsFor(name), [name])
  const current = useMemo(() => generateLook(name, look), [name, look])
  // The colour the name gives when none is picked (a secret name may bring its own).
  const fromName = useMemo(() => generateLook(name, { ...look, hue: undefined }), [name, look])
  const tiles = useMemo(() => {
    const shape = (value?: ShapeName) => ({
      value,
      label: value ?? own,
      look: generateLook(name, { ...look, shape: value }),
    })
    const eyes = (value?: EyeStyle) => ({
      value,
      label: value ?? own,
      look: generateLook(name, { ...look, eyes: value }),
    })
    return {
      shapes: [shape(), ...GENERATED_SHAPES.map(shape)],
      characters: EXTRA_SHAPES.map(shape),
      eyes: [eyes(), ...EYE_STYLES.map(eyes)],
    }
  }, [name, look, own])
  const picks = countPicks(look)

  return (
    <div className="panel-body">
      <Section title="Shape" onReset={look.shape ? () => pick({ shape: undefined }) : undefined}>
        <TileGrid label="Shape" tiles={tiles.shapes} selected={look.shape} onPick={(shape) => pick({ shape })} />
      </Section>

      <Section title="Characters">
        <TileGrid label="Characters" tiles={tiles.characters} selected={look.shape} onPick={(shape) => pick({ shape })} columns={3} />
      </Section>

      <Section title="Colour" onReset={look.hue !== undefined || look.tone ? () => pick({ hue: undefined, tone: undefined }) : undefined}>
        <div className="swatches" role="group" aria-label="Colour">
          <button
            className="swatch swatch-auto"
            aria-pressed={look.hue === undefined}
            aria-label={`${own} colour`}
            title={`${own} colour`}
            style={
              {
                '--auto': toHex(toneColour(current.tone, fromName.hue)),
              } as CSSProperties
            }
            onClick={() => pick({ hue: undefined })}
          />
          {HUES.map((hue) => (
            <button
              key={hue}
              className="swatch"
              aria-pressed={look.hue === hue}
              aria-label={colourName(hue, current.tone)}
              title={colourName(hue, current.tone)}
              style={{ background: toHex(toneColour(current.tone, hue)) }}
              onClick={() => pick({ hue })}
            />
          ))}
        </div>
        <div className="chips" role="group" aria-label="Shade">
          <Chip selected={!look.tone} onClick={() => pick({ tone: undefined })}>
            {own}
          </Chip>
          {TONE_NAMES.map((tone) => (
            <Chip key={tone} selected={look.tone === tone} onClick={() => pick({ tone })}>
              {tone}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Eyes" onReset={look.eyes || look.traits ? () => pick({ eyes: undefined, traits: undefined }) : undefined}>
        <TileGrid label="Eyes" tiles={tiles.eyes} selected={look.eyes} onPick={(eyes) => pick({ eyes })} columns={3} />
        <button className="disclose" aria-expanded={fineTune} onClick={() => setFineTune((open) => !open)}>
          Fine-tune eyes <ChevronIcon />
        </button>
        {fineTune &&
          EYE_SLIDERS.filter((s) => !s.hiddenFor?.includes(current.eyeStyle)).map(({ key, label, invert }) => {
            const picked = look.traits?.[key]
            const flip = (v: number) => (invert ? 1 - v : v)
            return (
              <Slider
                key={key}
                label={label}
                value={flip(picked ?? secretLook(name)?.traits?.[key] ?? hashed(key))}
                min={0}
                max={1}
                step={0.001}
                format={(v) => `${Math.round(v * 100)}`}
                pinned={picked !== undefined}
                onChange={(v) => setTrait(key, flip(v))}
                onReset={() => setTrait(key, undefined)}
              />
            )
          })}
      </Section>

      <p className="page-note">
        {picks === 0
          ? `All of this comes from the name ${name.trim() || 'you gave it'}.`
          : 'Anything you haven’t picked comes from the name.'}{' '}
        {picks > 0 && (
          <button
            className="text-btn"
            onClick={() => {
              update({ look: {} })
              celebrate()
            }}
          >
            Back to {own} own look
          </button>
        )}
      </p>
    </div>
  )
}
