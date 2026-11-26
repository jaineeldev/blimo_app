import { useId, type CSSProperties, type ReactNode, type Ref } from 'react'
import { BuddyStill } from '../Buddy/BuddyStill'
import type { BuddyLook } from '../Buddy/blob/generate'

/** The pieces the panel's pages are built from. */

export function Section({ title, onReset, children }: { title: string; onReset?: () => void; children: ReactNode }) {
  return (
    <section className="panel-section">
      <div className="panel-section-head">
        <h3>{title}</h3>
        {onReset && (
          <button className="text-btn" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

export interface Tile<T> {
  /** Undefined is the tile that keeps whatever the name picks. */
  value: T | undefined
  label: string
  look: BuddyLook
}

export function TileGrid<T extends string>({
  tiles,
  selected,
  onPick,
  columns = 4,
  label,
}: {
  tiles: Tile<T>[]
  selected: T | undefined
  onPick: (value: T | undefined) => void
  columns?: number
  label: string
}) {
  return (
    <div className="tile-grid" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {tiles.map((tile) => (
        <button key={tile.label} className="tile" aria-pressed={selected === tile.value} onClick={() => onPick(tile.value)}>
          <BuddyStill look={tile.look} size={34} />
          <span className="tile-label">{tile.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
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
  /** For a trait the name sets: whether it's been changed here. Hollow while it still comes from the name. */
  pinned?: boolean
  onChange: (value: number) => void
  onReset?: () => void
}

export function Slider({ label, value, min, max, step, format, pinned, onChange, onReset }: SliderProps) {
  const id = useId()
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <div className="slider" data-solid={pinned !== false || undefined}>
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        {pinned && onReset && (
          <button className="slider-reset" aria-label={`Reset ${label.toLowerCase()}`} title="Back to the name’s own" onClick={onReset}>
            <ResetIcon />
          </button>
        )}
        <span className="slider-value">{format(value)}</span>
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

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  nested = false,
}: {
  label: string
  /** A line under the label saying what it does. */
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Indented under the switch it depends on. */
  nested?: boolean
}) {
  const hintId = useId()
  return (
    <label className={nested ? 'toggle toggle--nested' : 'toggle'}>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && (
          <span className="toggle-hint" id={hintId}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  )
}

/** A row on the home page: what it is, what it's set to, and a way in. */
export function NavRow({
  icon,
  label,
  value,
  onClick,
  page,
  buttonRef,
}: {
  icon: ReactNode
  label: string
  value?: ReactNode
  onClick: () => void
  /** The page it opens, so focus can come back to it. */
  page?: string
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button ref={buttonRef} className="nav-row" data-page={page} onClick={onClick}>
      {icon}
      <span className="nav-label">{label}</span>
      {value !== undefined && <span className="nav-value">{value}</span>}
      <ChevronIcon />
    </button>
  )
}

/** The top of every page but home: back, the page's name, close. */
export function PageHead({ title, onBack, onClose }: { title: string; onBack: () => void; onClose: () => void }) {
  return (
    <header className="page-head">
      <button className="back-btn" onClick={onBack} autoFocus>
        <BackIcon /> Back
      </button>
      <h2>{title}</h2>
      <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
        <CloseIcon />
      </button>
    </header>
  )
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'icon',
} as const

const icon = (paths: ReactNode, size = 16) =>
  function Icon() {
    return (
      <svg {...iconProps} width={size} height={size}>
        {paths}
      </svg>
    )
  }

export const ShuffleIcon = icon(
  <>
    <path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c4 0 6-10 10-10h3" />
    <path d="m17 4 3 3-3 3M17 14l3 3-3 3" />
  </>,
  15,
)
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />, 15)
export const ChevronIcon = icon(<path d="m9.5 6 6 6-6 6" />, 14)
export const BackIcon = icon(<path d="m14.5 6-6 6 6 6" />, 15)
export const LookIcon = icon(
  <>
    <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8.2-9-8.2Z" />
    <circle cx="7.5" cy="11.5" r="1.2" />
    <circle cx="10.5" cy="7.5" r="1.2" />
    <circle cx="15.5" cy="8.5" r="1.2" />
  </>,
)
export const MoodIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5s1.3 1.6 3.5 1.6 3.5-1.6 3.5-1.6M9 9.5h.01M15 9.5h.01" />
  </>,
)
export const SizeIcon = icon(<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />)
export const MusicIcon = icon(
  <>
    <path d="M9 18V5.5l11-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </>,
)
export const BehaviourIcon = icon(
  <>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </>,
)
export const ShareIcon = icon(<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 13v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6" />)
export const NewsIcon = icon(
  <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9L12 3.5ZM18.5 15.5l.8 1.9 1.7.6-1.7.7-.8 1.8-.7-1.8-1.8-.7 1.8-.6.7-1.9Z" />,
)
export const HideIcon = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M4 20 20 4" />
  </>,
  14,
)
export const PowerIcon = icon(<path d="M12 3v8M6.3 7.5a8 8 0 1 0 11.4 0" />, 14)
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
    <path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5" />
  </>,
  14,
)
export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, 14)
export const ResetIcon = icon(
  <>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </>,
  12,
)
