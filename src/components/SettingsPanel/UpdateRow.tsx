import { useEffect, useState, type ReactNode } from 'react'

/** How long "No updates available" stays before the button offers to check again. */
const NOTHING_NEW_MS = 4_000

/** Where a check you asked for is up to, as the button shows it. */
type Step =
  | { status: 'idle' | 'checking' | 'current' | 'failed' | 'restarting' }
  | { status: 'downloading'; version: string | null; percent: number | null }
  | { status: 'ready'; version: string }
  /** A Mac: out, for downloading from the website. */
  | { status: 'available'; version: string }

/** Picks up an update that was already under way when the panel opened. */
function stepFrom(state: MenuState['update']): Step {
  if (state.status === 'downloading') return { status: 'downloading', version: state.version, percent: null }
  if (state.status === 'ready') return { status: 'ready', version: state.version }
  if (state.status === 'available') return { status: 'available', version: state.version }
  return { status: 'idle' }
}

/**
 * The updates row on the panel's home page. It checks when pressed, then says what happened right in
 * the row: up to date, or the usual update steps (downloading, then restart to update).
 */
export function UpdateRow({ menu }: { menu: MenuState }) {
  const [step, setStep] = useState<Step>(() => stepFrom(menu.update))

  useEffect(() => {
    const bridge = window.buddy
    if (!bridge) return
    const offNotice = bridge.onUpdate((notice) => {
      if (notice.status === 'ready') setStep({ status: 'ready', version: notice.version })
      else if (notice.status === 'available') setStep({ status: 'available', version: notice.version })
      else if (notice.status === 'downloading')
        setStep((s) => ({
          status: 'downloading',
          version: notice.version,
          percent: s.status === 'downloading' ? s.percent : null,
        }))
      else if (notice.status !== 'updated') setStep({ status: notice.status })
    })
    // Progress comes for background downloads too. It stops (null) when one finishes, with "ready"
    // right behind it, or when it fails.
    const offProgress = bridge.onUpdateProgress((percent) =>
      setStep((s) => {
        if (percent === null) return s.status === 'downloading' ? { status: 'idle' } : s
        return {
          status: 'downloading',
          version: s.status === 'downloading' ? s.version : null,
          percent,
        }
      }),
    )
    return () => {
      offNotice()
      offProgress()
    }
  }, [])

  // "Up to date" steps aside after a moment, so you can check again another time.
  useEffect(() => {
    if (step.status !== 'current') return
    const timer = window.setTimeout(() => setStep({ status: 'idle' }), NOTHING_NEW_MS)
    return () => window.clearTimeout(timer)
  }, [step.status])

  const check = () => {
    setStep({ status: 'checking' })
    window.buddy?.checkForUpdates()
  }
  const install = () => window.buddy?.installUpdate()

  if (!menu.canUpdate) return <Row icon={<RefreshIcon />} value="Installed app only" />
  switch (step.status) {
    case 'idle':
      return <Row icon={<RefreshIcon />} value="Check now" onClick={check} />
    case 'checking':
      return <Row icon={<RefreshIcon spinning />} value="Checking…" />
    case 'current':
      return <Row icon={<CheckIcon />} value="Up to date" />
    case 'failed':
      return <Row icon={<RefreshIcon />} value="Couldn't check. Retry" onClick={check} />
    case 'downloading':
      return <Row icon={<DownloadIcon />} value={`Downloading${step.percent === null ? '…' : ` ${step.percent}%`}`} />
    case 'ready':
      return <Row icon={<RefreshIcon />} value={`Restart for v${step.version}`} onClick={install} strong />
    case 'available':
      return <Row icon={<DownloadIcon />} value={`Get v${step.version}`} onClick={install} strong />
    case 'restarting':
      return <Row icon={<RefreshIcon spinning />} value="Restarting…" />
  }
}

/** A home-page row. Without `onClick` it's a status line in the row's place, not greyed out like a disabled one. */
function Row({ icon, value, onClick, strong = false }: { icon: ReactNode; value: string; onClick?: () => void; strong?: boolean }) {
  return (
    <button className="nav-row" aria-disabled={!onClick || undefined} onClick={onClick}>
      {icon}
      <span className="nav-label">Updates</span>
      <span className={strong ? 'nav-value nav-value--strong' : 'nav-value'} aria-live="polite">
        {value}
      </span>
    </button>
  )
}

const iconProps = {
  width: 16,
  height: 16,
  className: 'icon',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg {...iconProps} className={spinning ? 'icon spin' : 'icon'}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  )
}
