import { motion } from 'framer-motion'
import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BuddyStill } from '../Buddy/BuddyStill'
import { BUDDY_STATES } from '../Buddy/BuddyStates'
import { toHex } from '../Buddy/blob/color'
import {
  generateLook,
  EXTRA_SHAPES,
  EYE_STYLES,
  GENERATED_SHAPES,
  TONE_NAMES,
  toneColour,
  type BuddyLook,
  type EyeStyle,
  type LookOverrides,
  type PinnableTrait,
  type ShapeName,
} from '../Buddy/blob/generate'
import { traitsFor } from '../Buddy/blob/hash'
import { randomBuddyName } from '../Buddy/names'
import { secretLook } from '../Buddy/secretNames'
import { OPACITY_RANGE, SIZE_RANGE, useBuddyStore } from '../../stores/buddyStore'
import { placePanel } from './placePanel'
import './SettingsPanel.css'

const PANEL_WIDTH = 288
const PANEL_MAX_HEIGHT = 560

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
  { key: 'eye.size', label: 'size' },
  { key: 'eye.ratio', label: 'width' },
  { key: 'eye.separation', label: 'spacing' },
  { key: 'eye.squareness', label: 'squareness' },
  { key: 'eye.lean', label: 'tilt', hiddenFor: ['visor'] },
  { key: 'eye.gazeY', label: 'height', invert: true },
  { key: 'eye.gazeX', label: 'sideways' },
]

/** Drops unset keys and empty objects, so "unpinned" never lingers in saved settings. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && !(typeof v === 'object' && Object.keys(v).length === 0)),
  ) as T
}

function countPins(look: LookOverrides): number {
  const picked = [look.shape, look.eyes, look.tone, look.hue].filter((v) => v !== undefined).length
  return picked + Object.keys(look.traits ?? {}).length
}

export function SettingsPanel() {
  const { name, look, size, opacity, followCursor, alwaysOnTop, state, screenSpace } = useBuddyStore(
    useShallow((s) => ({
      name: s.name,
      look: s.look,
      size: s.size,
      opacity: s.opacity,
      followCursor: s.followCursor,
      alwaysOnTop: s.alwaysOnTop,
      state: s.state,
      screenSpace: s.screenSpace,
    })),
  )
  const { update, setName, setState, closePanel, celebrate } = useBuddyStore.getState()

  // Read the latest look from the store, not this render's copy, so quick successive edits never undo each other.
  const setLook = (patch: LookOverrides) => update({ look: compact({ ...useBuddyStore.getState().look, ...patch }) })
  const setTrait = (key: PinnableTrait, value: number | undefined) =>
    setLook({ traits: compact({ ...useBuddyStore.getState().look.traits, [key]: value }) })
  // Picking something new (not dragging a slider) gets a surprised little pop.
  const pick = (patch: LookOverrides) => {
    setLook(patch)
    celebrate()
  }

  // The side is picked once on open, so resizing the buddy slides the panel along instead of flipping it.
  const [side] = useState(() => placePanel(size, screenSpace, PANEL_WIDTH, PANEL_MAX_HEIGHT).side)
  const place = placePanel(size, screenSpace, PANEL_WIDTH, PANEL_MAX_HEIGHT, side)

  const hashed = useMemo(() => traitsFor(name), [name])
  const current = useMemo(() => generateLook(name, look), [name, look])
  // The colour the name gives when none is pinned (a secret name may bring its own).
  const fromName = useMemo(() => generateLook(name, { ...look, hue: undefined }), [name, look])
  // Each tile previews this buddy as it would look with that choice.
  const tiles = useMemo(() => {
    const shape = (value?: ShapeName) => ({ value, label: value ?? 'auto', look: generateLook(name, { ...look, shape: value }) })
    const eyes = (value?: EyeStyle) => ({ value, label: value ?? 'auto', look: generateLook(name, { ...look, eyes: value }) })
    return {
      shapes: [shape(), ...GENERATED_SHAPES.map(shape)],
      extras: EXTRA_SHAPES.map(shape),
      eyes: [eyes(), ...EYE_STYLES.map(eyes)],
    }
  }, [name, look])
  const pins = countPins(look)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    // In the desktop app, clicking anywhere else closes the panel, like a popover.
    // A browser tab blurs for unrelated reasons (devtools), so only listen in Electron.
    // During the intro it stays open, so a stray click on the desktop can't cut the customise step short.
    const onBlur = () => {
      if (useBuddyStore.getState().onboarded) closePanel()
    }
    const listenBlur = Boolean(window.buddy)
    if (listenBlur) window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (listenBlur) window.removeEventListener('blur', onBlur)
    }
  }, [closePanel])

  const offset = place.side === 'right' ? -12 : 12

  return (
    <motion.div
      data-hit
      role="dialog"
      aria-label="Customise buddy"
      className="panel"
      style={{
        left: place.x,
        top: place.y,
        height: place.height,
        transformOrigin: place.side === 'right' ? 'left center' : 'right center',
      }}
      initial={{ opacity: 0, x: offset, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: offset, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <header className="panel-head">
        <label className="panel-name">
          <span className="panel-caption">name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} maxLength={40} />
        </label>
        <button
          className="icon-btn"
          aria-label="Random name"
          title="Random name"
          onClick={() => {
            setName(randomBuddyName())
            celebrate()
          }}
        >
          <ShuffleIcon />
        </button>
        <button className="icon-btn" aria-label="Close" title="Close" onClick={closePanel}>
          <CloseIcon />
        </button>
      </header>

      <div className="panel-pins">
        <span>{pins === 0 ? 'nothing pinned, all from the name' : `${pins} pinned`}</span>
        <button
          disabled={pins === 0}
          onClick={() => {
            update({ look: {} })
            celebrate()
          }}
        >
          unpin all
        </button>
      </div>

      <div className="panel-body">
        <Section title="shape" onReset={look.shape ? () => setLook({ shape: undefined }) : undefined}>
          <TileGrid tiles={tiles.shapes} selected={look.shape} onPick={(shape) => pick({ shape })} />
          <h4 className="panel-subhead">extras</h4>
          <TileGrid tiles={tiles.extras} selected={look.shape} onPick={(shape) => pick({ shape })} />
        </Section>

        <Section
          title="colour"
          onReset={look.hue !== undefined || look.tone ? () => setLook({ hue: undefined, tone: undefined }) : undefined}
        >
          <div className="swatches">
            <button
              className="swatch swatch-auto"
              aria-pressed={look.hue === undefined}
              aria-label="Colour from the name"
              title="From the name"
              style={{ '--auto': toHex(toneColour(current.tone, fromName.hue)) } as CSSProperties}
              onClick={() => pick({ hue: undefined })}
            />
            {HUES.map((hue) => (
              <button
                key={hue}
                className="swatch"
                aria-pressed={look.hue === hue}
                aria-label={`Hue ${hue}°`}
                style={{ background: toHex(toneColour(current.tone, hue)) }}
                onClick={() => pick({ hue })}
              />
            ))}
          </div>
          <div className="chips">
            <Chip selected={!look.tone} onClick={() => pick({ tone: undefined })}>
              auto
            </Chip>
            {TONE_NAMES.map((tone) => (
              <Chip key={tone} selected={look.tone === tone} onClick={() => pick({ tone })}>
                {tone}
              </Chip>
            ))}
          </div>
        </Section>

        <Section
          title="eyes"
          onReset={look.eyes || look.traits ? () => setLook({ eyes: undefined, traits: undefined }) : undefined}
        >
          <TileGrid tiles={tiles.eyes} selected={look.eyes} onPick={(eyes) => pick({ eyes })} columns={3} />
          <h4 className="panel-subhead">fine-tune</h4>
          {EYE_SLIDERS.filter((s) => !s.hiddenFor?.includes(current.eyeStyle)).map(({ key, label, invert }) => {
            const pinned = look.traits?.[key]
            const flip = (v: number) => (invert ? 1 - v : v)
            return (
              <Slider
                key={key}
                label={label}
                value={flip(pinned ?? secretLook(name)?.traits?.[key] ?? hashed(key))}
                min={0}
                max={1}
                step={0.001}
                format={(v) => v.toFixed(2)}
                pinned={pinned !== undefined}
                onChange={(v) => setTrait(key, flip(v))}
                onReset={() => setTrait(key, undefined)}
              />
            )
          })}
        </Section>

        <Section title="buddy">
          <Slider
            label="size"
            value={size}
            min={SIZE_RANGE.min}
            max={SIZE_RANGE.max}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => update({ size: v })}
          />
          <Slider
            label="opacity"
            value={opacity}
            min={OPACITY_RANGE.min}
            max={OPACITY_RANGE.max}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => update({ opacity: v })}
          />
        </Section>

        <Section title="mood">
          <div className="chips">
            {BUDDY_STATES.map((mood) => (
              <Chip key={mood} selected={state === mood} onClick={() => setState(mood)}>
                {mood}
              </Chip>
            ))}
          </div>
          <p className="hint">Picked by hand for now, until system stats drive it.</p>
        </Section>

        <Section title="behaviour">
          <Toggle label="eyes follow cursor" checked={followCursor} onChange={(v) => update({ followCursor: v })} />
          <Toggle label="always on top" checked={alwaysOnTop} onChange={(v) => update({ alwaysOnTop: v })} />
        </Section>
      </div>
    </motion.div>
  )
}

function Section({ title, onReset, children }: { title: string; onReset?: () => void; children: ReactNode }) {
  return (
    <section className="panel-section">
      <div className="panel-section-head">
        <h3>{title}</h3>
        {onReset && (
          <button className="reset-btn" onClick={onReset} title={`Use the name's ${title}`}>
            <ResetIcon /> auto
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

interface Tile<T> {
  /** Undefined is the "auto" tile: whatever the name picks. */
  value: T | undefined
  label: string
  look: BuddyLook
}

function TileGrid<T extends string>({
  tiles,
  selected,
  onPick,
  columns = 4,
}: {
  tiles: Tile<T>[]
  selected: T | undefined
  onPick: (value: T | undefined) => void
  columns?: number
}) {
  return (
    <div className="tile-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {tiles.map((tile) => (
        <button key={tile.label} className="tile" aria-pressed={selected === tile.value} onClick={() => onPick(tile.value)}>
          <BuddyStill look={tile.look} size={34} />
          {tile.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="chip" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  /** Pinned sliders override the name. Leave undefined for plain settings that are never "auto". */
  pinned?: boolean
  onChange: (value: number) => void
  onReset?: () => void
}

function Slider({ label, value, min, max, step, format, pinned, onChange, onReset }: SliderProps) {
  const id = useId()
  const fill = `${((value - min) / (max - min)) * 100}%`
  const solid = pinned !== false
  return (
    <div className="slider" data-solid={solid || undefined}>
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <span className="slider-value">{pinned === false ? `auto · ${format(value)}` : format(value)}</span>
        {pinned && onReset && (
          <button className="slider-reset" aria-label={`Unpin ${label}`} title="Back to the name's value" onClick={onReset}>
            <ResetIcon />
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': fill } as CSSProperties}
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  )
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function ShuffleIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c4 0 6-10 10-10h3" />
      <path d="m17 4 3 3-3 3M17 14l3 3-3 3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </svg>
  )
}
