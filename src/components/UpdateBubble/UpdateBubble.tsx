import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toHex } from '../Buddy/blob/color'
import { generateLook } from '../Buddy/blob/generate'
import { SpeechBubble, TYPE_MS } from '../SpeechBubble/SpeechBubble'
import { useBubblePlacement } from '../SpeechBubble/useBubblePlacement'
import { useBuddyStore } from '../../stores/buddyStore'
import { notesFor } from '../../whatsNew'
import './UpdateBubble.css'

/** How long a passing line stays up once it has finished typing. */
const LINGER_MS = 2_600
/** Finishes leaving even if the fade never completes, for example while the window isn't drawing. */
const LEAVE_FALLBACK_MS = 600
/** After an update, the hello waits until the buddy has finished waking up. */
const HELLO_AFTER_MS = 1_800
/** The hello has buttons, so it lingers longer before stepping aside on its own. */
const HELLO_LINGER_MS = 9_000

/** A few ways to say each thing, so the buddy doesn't sound like a recording. */
const LINES: Record<UpdateNotice['status'], ((version: string) => string)[]> = {
  ready: [
    (v) => `I've got an update! Restart me to get v${v}, or I'll update next time I close.`,
    (v) => `Psst, v${v} is ready. Restart me now, or I'll sort it out next time I close.`,
    (v) => `New version downloaded! Restart me for v${v}, or I'll do it when I close.`,
    (v) => `v${v} is all set. Restart me whenever you're ready, or I'll update when I close.`,
  ],
  downloading: [
    (v) => `Found v${v}! Downloading it now…`,
    (v) => `Ooh, v${v} is out. Grabbing it now…`,
    (v) => `There's a v${v}! Fetching it for you…`,
  ],
  current: [
    () => "I'm already up to date!",
    () => "Nothing new yet. I'm the latest me.",
    () => 'All up to date. Check back another time!',
    () => "No updates right now. I'm as fresh as it gets.",
  ],
  failed: [
    () => "I couldn't check for updates just now. Try again later?",
    () => "Hmm, I couldn't reach the update server. Maybe try again in a bit?",
    () => 'No luck checking for updates. Are you online?',
  ],
  restarting: [
    () => 'Brb, getting my upgrade!',
    () => 'Back in a sec, just updating!',
    () => "Hold that thought, I'm updating!",
    () => 'See you on the other side!',
  ],
  updated: [
    (v) => `Ta-da! I'm v${v} now.`,
    (v) => `I'm back, and I'm v${v} now!`,
    (v) => `Fresh update installed. Say hi to v${v}!`,
    (v) => `All done! I'm running v${v}.`,
  ],
}

const lastLine: Partial<Record<UpdateNotice['status'], number>> = {}
// Each notice keeps the line it was given, however many times React asks (strict mode asks twice).
const chosen = new WeakMap<UpdateNotice, string>()

/** Picks one of the lines for a notice at random, never the same one twice in a row. */
function lineFor(notice: UpdateNotice): string {
  const already = chosen.get(notice)
  if (already) return already
  const options = LINES[notice.status]
  let i = Math.floor(Math.random() * options.length)
  if (options.length > 1 && i === lastLine[notice.status]) i = (i + 1) % options.length
  lastLine[notice.status] = i
  const line = options[i]('version' in notice ? notice.version : '')
  chosen.set(notice, line)
  return line
}

/**
 * Everything the buddy shows about updates: a ring over its head while one downloads, its news when
 * one is ready or when you asked it to check, goodbye before it restarts, and hello again after.
 */
export function UpdateBubble() {
  const { onboarded, size, name, look } = useBuddyStore(
    useShallow((s) => ({ onboarded: s.onboarded, size: s.size, name: s.name, look: s.look })),
  )
  // Each notice gets its own id, so saying the same kind of thing twice still brings a fresh bubble and line.
  const [shown, setShown] = useState<{ notice: UpdateNotice; id: number } | null>(null)
  const nextId = useRef(0)
  const show = useCallback((notice: UpdateNotice) => setShown({ notice, id: ++nextId.current }), [])
  const [percent, setPercent] = useState<number | null>(null)
  useEffect(() => window.buddy?.onUpdate(show), [show])
  useEffect(() => window.buddy?.onUpdateProgress(setPercent), [])
  useHelloAfterUpdate(show)
  const done = useCallback(() => setShown(null), [])
  // While the ring or a message is up, the buddy's own chatter waits.
  useEffect(() => useBuddyStore.getState().setUpdateBusy(Boolean(shown) || percent !== null), [shown, percent])

  // The ring takes the buddy's colour, unless that's too dark to see on the ring's dark badge.
  const ringColour = useMemo(() => {
    const body = generateLook(name, look).body
    return body[0] < 0.55 ? '#ececef' : toHex(body)
  }, [name, look])

  // The intro has the floor until it's finished; the news waits, and the ring would sit under its bubble.
  if (!onboarded) return null
  return (
    <>
      <AnimatePresence>
        {percent !== null && !shown && <DownloadRing key="ring" percent={percent} size={size} colour={ringColour} />}
      </AnimatePresence>
      {shown && <NoticeBubble key={shown.id} notice={shown.notice} size={size} onDone={done} />}
    </>
  )
}

/** Says hello once the app has restarted into a new version. */
function useHelloAfterUpdate(show: (notice: UpdateNotice) => void) {
  // Read once, so a second run of the effect (React's strict mode) still sees the version from before.
  const [previous] = useState(() => useBuddyStore.getState().lastVersion)
  useEffect(() => {
    const bridge = window.buddy
    if (!bridge) return
    let timer = 0
    void bridge.getVersion().then((version) => {
      const { onboarded, update } = useBuddyStore.getState()
      update({ lastVersion: version })
      // Only after updating from a version that remembered itself (v0.2.0 on). Anyone coming from
      // v0.1.0 installed this one by hand and has already read the notes on GitHub, and a brand-new
      // buddy has the intro to get through instead. The notes are in the tray either way.
      if (!previous || version === previous || !onboarded) return
      timer = window.setTimeout(() => show({ status: 'updated', version }), HELLO_AFTER_MS)
    })
    return () => window.clearTimeout(timer)
  }, [previous, show])
}

const RING_RADIUS = 10
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** A small badge floating over the buddy's head that fills up as an update downloads. */
function DownloadRing({ percent, size, colour }: { percent: number; size: number; colour: string }) {
  return (
    <motion.div
      className="update-ring"
      style={{ bottom: `calc(50% + ${size * 0.3 + 8}px)` }}
      initial={{ opacity: 0, scale: 0.6, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.3 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      role="progressbar"
      aria-label="Downloading an update"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">
        <circle className="update-ring-track" cx="15" cy="15" r={RING_RADIUS} />
        <motion.circle
          className="update-ring-fill"
          cx="15"
          cy="15"
          r={RING_RADIUS}
          stroke={colour}
          strokeDasharray={RING_LENGTH}
          initial={{ strokeDashoffset: RING_LENGTH }}
          animate={{ strokeDashoffset: RING_LENGTH * (1 - percent / 100) }}
          transition={{ duration: 0.3 }}
          transform="rotate(-90 15 15)"
        />
        <path className="update-ring-arrow" d="M15 10.5v8M11.8 15.6 15 18.8l3.2-3.2" stroke={colour} />
      </svg>
    </motion.div>
  )
}

function NoticeBubble({ notice, size, onDone }: { notice: UpdateNotice; size: number; onDone: () => void }) {
  // Placed when it appears, so it suits wherever the buddy is sitting by then.
  const placement = useBubblePlacement(size)
  const [leaving, setLeaving] = useState(false)
  const leave = useCallback(() => setLeaving(true), [])

  useEffect(() => {
    const { react, bump } = useBuddyStore.getState()
    if (notice.status === 'ready' || notice.status === 'updated') {
      react('happy', 1_400)
      bump()
    }
    if (notice.status === 'downloading') react('surprised', 900)
    if (notice.status === 'current' || notice.status === 'restarting') react('wink', 1_200)
    if (notice.status === 'failed') react('confused', 1_400)
  }, [notice])

  // Chosen once, so the line doesn't change under you while the bubble is up.
  const [text] = useState(() => lineFor(notice))
  let extra: ReactNode = null
  if (notice.status === 'ready') {
    extra = (
      <div className="bubble-actions">
        <button type="button" className="bubble-btn" onClick={() => window.buddy?.installUpdate()}>
          Restart now
        </button>
        <button type="button" className="bubble-btn bubble-btn--ghost" onClick={leave}>
          Later
        </button>
      </div>
    )
  }
  if (notice.status === 'updated' && notesFor(notice.version)) {
    const { version } = notice
    extra = (
      <div className="bubble-actions">
        <button
          type="button"
          className="bubble-btn"
          onClick={() => {
            leave()
            void useBuddyStore.getState().openWhatsNew(version)
          }}
        >
          What's new?
        </button>
        <button type="button" className="bubble-btn bubble-btn--ghost" onClick={leave}>
          Nice!
        </button>
      </div>
    )
  }

  // Lines without buttons step aside on their own once you've had time to read them. The goodbye
  // stays up instead: the app is about to close.
  const staysUp = notice.status === 'ready' || notice.status === 'restarting'
  const linger = notice.status === 'updated' ? HELLO_LINGER_MS : LINGER_MS
  useEffect(() => {
    if (staysUp) return
    const timer = window.setTimeout(leave, text.length * TYPE_MS + linger)
    return () => window.clearTimeout(timer)
  }, [staysUp, linger, text, leave])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onDone, LEAVE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, onDone])

  return (
    <div className="bubble-anchor" style={placement.style}>
      <SpeechBubble text={text} tail={placement.tail} within={placement.within} leaving={leaving} onLeft={onDone}>
        {extra}
      </SpeechBubble>
    </div>
  )
}
