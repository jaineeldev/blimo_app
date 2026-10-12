import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SpeechBubble, TYPE_MS } from '../SpeechBubble/SpeechBubble'
import { useBubblePlacement } from '../SpeechBubble/useBubblePlacement'
import { useBuddyStore } from '../../stores/buddyStore'

/** How long a comment stays up once it has finished typing. */
const LINGER_MS = 2_400
/** Finishes leaving even if the fade never completes, for example while the window isn't drawing. */
const LEAVE_FALLBACK_MS = 600

/** The buddy's passing comments: a bubble that types the line, lingers a moment, then steps aside. */
export function Chatter() {
  const { chatter, size } = useBuddyStore(useShallow((s) => ({ chatter: s.chatter, size: s.size })))
  if (!chatter) return null
  return <ChatterBubble key={chatter.id} id={chatter.id} text={chatter.text} size={size} />
}

function ChatterBubble({ id, text, size }: { id: number; text: string; size: number }) {
  // Placed when it appears, so it suits wherever the buddy is sitting by then.
  const placement = useBubblePlacement(size)
  const [leaving, setLeaving] = useState(false)
  const done = () => useBuddyStore.getState().hush(id)

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), text.length * TYPE_MS + LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => useBuddyStore.getState().hush(id), LEAVE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, id])

  return (
    <div className="bubble-anchor" style={placement.style}>
      <SpeechBubble text={text} tail={placement.tail} within={placement.within} leaving={leaving} onLeft={done} />
    </div>
  )
}
