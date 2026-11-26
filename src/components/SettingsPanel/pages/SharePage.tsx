import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BuddyStill } from '../../Buddy/BuddyStill'
import { generateLook, type LookOverrides } from '../../Buddy/blob/generate'
import { useBuddyStore } from '../../../stores/buddyStore'
import { buddyCode, readBuddyCode } from '../../../shareCode'
import { CheckIcon, CopyIcon, Section } from '../controls'
import { describeLook } from '../describe'

/** How long "Copied" shows on the button. */
const COPIED_MS = 2_000

/** Your buddy as a code to send someone, and a place to paste one you were sent. */
export function SharePage() {
  const { name, look } = useBuddyStore(useShallow((s) => ({ name: s.name, look: s.look })))
  const { setName, update, celebrate } = useBuddyStore.getState()
  const current = useMemo(() => generateLook(name, look), [name, look])
  const code = useMemo(() => buddyCode(name, look), [name, look])

  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])
  const codeRef = useRef<HTMLOutputElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Without clipboard access, select it so Ctrl+C (Cmd+C) copies it.
      const range = document.createRange()
      if (codeRef.current) range.selectNodeContents(codeRef.current)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
  }

  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // The buddy you had before using a code, to go back to.
  const [before, setBefore] = useState<{
    name: string
    look: LookOverrides
  } | null>(null)
  const use = () => {
    const read = readBuddyCode(pasted)
    if (!read.ok) {
      setProblem(
        read.reason === 'newer'
          ? 'That code is from a newer Blimo. Update to use it.'
          : 'That doesn’t look like a Blimo code. Check it’s all there.',
      )
      return
    }
    setBefore({ name, look })
    setName(read.name)
    update({ look: read.look })
    celebrate()
    setPasted('')
    setProblem(null)
  }
  const undo = () => {
    if (!before) return
    setName(before.name)
    update({ look: before.look })
    setBefore(null)
  }

  return (
    <div className="panel-body">
      <div className="share-card">
        <BuddyStill look={current} size={56} />
        <span>
          <span className="share-name">{name.trim() || 'Your buddy'}</span>
          <span className="share-look">{describeLook(current)}</span>
        </span>
      </div>
      <output ref={codeRef} className="share-code" aria-label="Buddy code">
        {code}
      </output>
      <button className="btn btn--solid btn--wide" onClick={copy} aria-live="polite">
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : 'Copy code'}
      </button>
      <p className="page-note">Anyone with Blimo can paste this in to get the same buddy. Only the name and look are in it.</p>

      <Section title="Got a code?">
        <form
          className="paste"
          onSubmit={(e) => {
            e.preventDefault()
            use()
          }}
        >
          <input
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value)
              setProblem(null)
            }}
            placeholder="Paste a code"
            aria-label="Buddy code to use"
            aria-invalid={problem ? true : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn btn--solid" type="submit" disabled={!pasted.trim()}>
            Use it
          </button>
        </form>
        {problem ? (
          <p className="page-note page-note--problem" role="alert">
            {problem}
          </p>
        ) : before ? (
          <p className="page-note" role="status">
            Now {name.trim()}.{' '}
            <button className="text-btn" onClick={undo}>
              Undo
            </button>
          </p>
        ) : (
          <p className="page-note">This changes your buddy’s name and look to the one in the code.</p>
        )}
      </Section>
    </div>
  )
}
