import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { randomBuddyName } from '../Buddy/names'
import { SpeechBubble, TYPE_MS } from '../SpeechBubble/SpeechBubble'
import { useBubblePlacement } from '../SpeechBubble/useBubblePlacement'
import { useBuddyStore } from '../../stores/buddyStore'

const STEPS = [
  'hello',
  'name',
  'named',
  'pet',
  'petted',
  'carry',
  'carried',
  'customise',
  'customising',
  'customised',
  'done',
] as const

type Step = (typeof STEPS)[number]

/** Steps that move on by themselves: how long to linger once the line has finished typing. */
const AUTO_NEXT: Partial<Record<Step, [Step | 'finish', number]>> = {
  named: ['pet', 1800],
  petted: ['carry', 1600],
  carried: ['customise', 1600],
  customised: ['done', 1600],
  done: ['finish', 3200],
}

/** Where to pick up after a restart. Passing moments resume at the next thing to try. */
const RESUME_AT: Partial<Record<Step, Step>> = {
  named: 'pet',
  petted: 'carry',
  carried: 'customise',
  customising: 'customise',
  customised: 'done',
}

function resumeFrom(saved: string | null): Step | null {
  const step = STEPS.find((s) => s === saved)
  return step ? (RESUME_AT[step] ?? step) : null
}

/**
 * The first-run intro: the buddy talks you through naming it, petting it,
 * carrying it and customising it, waiting for you to try each one.
 */
export function Onboarding({ startDelay }: { startDelay: number }) {
  const { name, size, pets, drops, panelOpen } = useBuddyStore(
    useShallow((s) => ({ name: s.name, size: s.size, pets: s.pets, drops: s.drops, panelOpen: s.panelOpen })),
  )
  // Picks up where you left off if the app restarted mid-intro.
  const [resumed] = useState(() => resumeFrom(useBuddyStore.getState().introStep))
  const [step, setStep] = useState<Step | null>(resumed)
  const [draft, setDraft] = useState('')
  const placement = useBubblePlacement(size)
  const [leaving, setLeaving] = useState(false)
  const originalName = useRef(name)
  // Counts when a "try it" step began, so only a new pet or drop moves things on.
  const mark = useRef({ pets: useBuddyStore.getState().pets, drops: useBuddyStore.getState().drops })
  // The line on screen, so a passing moment can wait for it to finish typing.
  const shownText = useRef('')

  const go = useCallback((next: Step | 'finish') => {
    const store = useBuddyStore.getState()
    if (next === 'finish') {
      setLeaving(true)
      return
    }
    mark.current = { pets: store.pets, drops: store.drops }
    setStep(next)
  }, [])

  const skip = () => {
    useBuddyStore.getState().react(null)
    go('finish')
  }

  // Starts once the buddy has finished waking up. The delay is read once, so later renders can't restart the intro.
  const [delay] = useState(startDelay)
  useEffect(() => {
    if (resumed) return
    const timer = window.setTimeout(() => setStep('hello'), delay)
    return () => window.clearTimeout(timer)
  }, [delay, resumed])

  // Remember progress as it happens.
  useEffect(() => {
    if (step) useBuddyStore.getState().update({ introStep: step })
  }, [step])

  // How the buddy feels as each step begins.
  useEffect(() => {
    const { react, bump } = useBuddyStore.getState()
    if (step === 'hello') react('happy', 1_200)
    if (step === 'name') react('curious', Infinity)
    if (step === 'named') {
      react('happy', 1_600)
      bump()
    }
    if (step === 'carried' || step === 'customised') react('happy', 1_400)
    if (step === 'done') react('wink', 1_400)
  }, [step])

  useEffect(() => {
    const auto = step && AUTO_NEXT[step]
    if (!auto) return
    const timer = window.setTimeout(() => go(auto[0]), shownText.current.length * TYPE_MS + auto[1])
    return () => window.clearTimeout(timer)
  }, [step, go])

  // The "try it" steps wait for you to actually do the thing.
  useEffect(() => {
    if (step === 'pet' && pets > mark.current.pets) setStep('petted')
    if (step === 'carry' && drops > mark.current.drops) setStep('carried')
    if (step === 'customise' && panelOpen) setStep('customising')
    if (step === 'customising' && !panelOpen) setStep('customised')
  }, [step, pets, drops, panelOpen])

  // Once the goodbye fade starts, finish regardless, in case the window isn't drawing frames to complete it.
  const finish = useCallback(() => useBuddyStore.getState().update({ onboarded: true, introStep: null }), [])
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(finish, 600)
    return () => window.clearTimeout(timer)
  }, [leaving, finish])

  const rename = (value: string) => {
    setDraft(value)
    // The face changes as you type, because the name decides the face.
    useBuddyStore.getState().setName(value.trim() ? value : originalName.current)
  }

  const submitName = (e: FormEvent) => {
    e.preventDefault()
    go('named')
  }

  if (!step) return null

  const skipLink = (
    <button type="button" className="bubble-skip" onClick={skip}>
      skip intro
    </button>
  )

  const lines: Record<Step, { text: string; extra?: ReactNode }> = {
    hello: {
      text: 'Oh! Hi there.',
      extra: (
        <div className="bubble-actions">
          <button type="button" className="bubble-btn" onClick={() => go('name')}>
            Hi!
          </button>
          {skipLink}
        </div>
      ),
    },
    name: {
      text: "I'm brand new here. What should I be called?",
      extra: (
        <form onSubmit={submitName}>
          <input
            className="bubble-input"
            value={draft}
            onChange={(e) => rename(e.target.value)}
            placeholder={originalName.current}
            aria-label="Buddy name"
            maxLength={40}
            spellCheck={false}
            autoFocus
          />
          <div className="bubble-actions">
            <button type="submit" className="bubble-btn">
              That's me
            </button>
            <button
              type="button"
              className="bubble-btn bubble-btn--ghost"
              onClick={() => {
                rename(randomBuddyName())
                useBuddyStore.getState().celebrate()
              }}
            >
              Random
            </button>
            {skipLink}
          </div>
        </form>
      ),
    },
    named: { text: `${name.trim() || originalName.current}! I love it.` },
    pet: { text: 'Try giving me a pet. Just click on me.', extra: <div className="bubble-actions">{skipLink}</div> },
    petted: { text: 'Hehe, that tickles.' },
    carry: {
      text: 'I go wherever you put me. Grab me and drag me somewhere.',
      extra: <div className="bubble-actions">{skipLink}</div>,
    },
    carried: { text: 'Wheee! Thanks for the ride.' },
    customise: { text: 'Want me to look different? Right-click me.', extra: <div className="bubble-actions">{skipLink}</div> },
    customising: {
      text: 'Take your time and pick anything you like.',
      extra: (
        <div className="bubble-actions">
          <button type="button" className="bubble-btn" onClick={() => useBuddyStore.getState().closePanel()}>
            Done
          </button>
          {skipLink}
        </div>
      ),
    },
    customised: { text: 'Ooh, looking good!' },
    done: { text: "That's everything. I'll be right here if you need me." },
  }
  const line = lines[step]
  shownText.current = line.text

  return (
    <div className="bubble-anchor" style={placement.style}>
      <SpeechBubble text={line.text} tail={placement.tail} within={placement.within} leaving={leaving} onLeft={finish}>
        {line.extra}
      </SpeechBubble>
    </div>
  )
}
