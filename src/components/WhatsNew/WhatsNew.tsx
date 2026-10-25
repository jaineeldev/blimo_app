import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useBuddyStore } from '../../stores/buddyStore'
import { WHATS_NEW, notesFor } from '../../whatsNew'
import { placePanel } from '../SettingsPanel/placePanel'
import '../SettingsPanel/SettingsPanel.css'
import './WhatsNew.css'

const CARD_WIDTH = 268
const HAS_HELPER = window.buddy?.platform === 'win32'
/** Roughly how tall the card draws for a given number of notes (most wrap to two or three lines), so it can be centred on the buddy. */
const cardHeight = (notes: number) => 120 + notes * 62

/** A card beside the buddy listing what changed in a version, in the buddy's own words. */
export function WhatsNew() {
  const { version, size, screenSpace, bopToBeat } = useBuddyStore(
    useShallow((s) => ({ version: s.whatsNew, size: s.size, screenSpace: s.screenSpace, bopToBeat: s.bopToBeat })),
  )
  const { closeWhatsNew } = useBuddyStore.getState()
  // Without notes for this exact version (a development build, say), show the newest ones.
  const entry = (version && notesFor(version)) || WHATS_NEW[0]
  // Bopping to the beat needs the Windows helper, and is offered until it's on.
  const offerBeat = entry.offer === 'bopToBeat' && HAS_HELPER && !bopToBeat
  // The side is picked once on open, like the customise panel.
  const [side] = useState(() => placePanel(size, screenSpace, CARD_WIDTH, cardHeight(entry.notes.length)).side)
  const place = placePanel(size, screenSpace, CARD_WIDTH, cardHeight(entry.notes.length), side)

  useEffect(() => {
    useBuddyStore.getState().react('happy', 1_200)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWhatsNew()
    }
    // Clicking anywhere else closes it, like the customise panel.
    const listenBlur = Boolean(window.buddy)
    window.addEventListener('keydown', onKey)
    if (listenBlur) window.addEventListener('blur', closeWhatsNew)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (listenBlur) window.removeEventListener('blur', closeWhatsNew)
    }
  }, [closeWhatsNew])

  const offset = place.side === 'right' ? -12 : 12
  return (
    <motion.div
      data-hit
      role="dialog"
      aria-labelledby="whats-new-title"
      className="panel whats-new"
      style={{
        left: place.x,
        top: place.y,
        maxHeight: place.height,
        transformOrigin: place.side === 'right' ? 'left center' : 'right center',
      }}
      initial={{ opacity: 0, x: offset, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: offset, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <header className="whats-new-head">
        <span className="panel-caption">what's new</span>
        <h2 id="whats-new-title">v{entry.version}</h2>
      </header>
      <ul className="whats-new-list">
        {entry.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <footer className="whats-new-foot">
        {offerBeat && (
          <button
            type="button"
            className="whats-new-offer"
            onClick={() => {
              const { update, react } = useBuddyStore.getState()
              update({ bopToBeat: true, reactToMedia: true })
              react('excited', 1_400)
            }}
          >
            Bop to the beat
          </button>
        )}
        <button type="button" className="whats-new-done" onClick={closeWhatsNew} autoFocus>
          Got it
        </button>
      </footer>
    </motion.div>
  )
}
