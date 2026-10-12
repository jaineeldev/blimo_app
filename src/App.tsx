import { AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Buddy } from './components/Buddy/Buddy'
import { generateLook } from './components/Buddy/blob/generate'
import { randomBuddyName } from './components/Buddy/names'
import { isSecretName } from './components/Buddy/secretNames'
import { Chatter } from './components/Chatter/Chatter'
import { Onboarding } from './components/Onboarding/Onboarding'
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel'
import { UpdateBubble } from './components/UpdateBubble/UpdateBubble'
import { WhatsNew } from './components/WhatsNew/WhatsNew'
import { useDesktopInteraction } from './hooks/useDesktopInteraction'
import { useReactions } from './hooks/useReactions'
import { useTrayIcon } from './hooks/useTrayIcon'
import { shownMood, useBuddyStore } from './stores/buddyStore'
import './App.css'

/** On launch the intro waits for the wake-up stretch; replayed from the tray, it starts almost at once. */
const INTRO_DELAY_AT_LAUNCH_MS = 1_700
const INTRO_DELAY_REPLAY_MS = 300

function App() {
  const { name, look, size, opacity, followCursor, alwaysOnTop, onboarded, mood, bounce, panelOpen, whatsNew, melting, peek } =
    useBuddyStore(
      useShallow((s) => ({
        name: s.name,
        look: s.look,
        size: s.size,
        opacity: s.opacity,
        followCursor: s.followCursor,
        alwaysOnTop: s.alwaysOnTop,
        onboarded: s.onboarded,
        mood: shownMood(s),
        bounce: s.bounce,
        panelOpen: s.panelOpen,
        whatsNew: s.whatsNew,
        melting: s.melting,
        peek: s.peek,
      })),
    )
  const launchedAt = useRef(Date.now())
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)

  const reactions = useReactions()
  const interaction = useDesktopInteraction({
    onClick: reactions.pet,
    onMenu: () => {
      const { panelOpen, openPanel, closePanel } = useBuddyStore.getState()
      if (panelOpen) closePanel()
      else void openPanel()
    },
    onHoverChange: (on) => {
      setHovered(on)
      reactions.hover(on)
    },
    onPressChange: setPressed,
    onDragStart: reactions.grab,
    onDragEnd: reactions.drop,
  })

  useTrayIcon(
    useMemo(() => generateLook(name, look), [name, look]),
    name,
  )
  const sparkle = useMemo(() => isSecretName(name), [name])

  // The day you met, for anniversaries. Anyone updating from before this counts from today.
  useEffect(() => {
    const { firstMet, update } = useBuddyStore.getState()
    if (firstMet === null) update({ firstMet: Date.now() })
  }, [])

  useEffect(() => {
    const bridge = window.buddy
    if (!bridge) return
    const { setName, openPanel, openWhatsNew, celebrate, update, hush, setPeek } = useBuddyStore.getState()
    const offFace = bridge.onNewFace(() => {
      setName(randomBuddyName())
      celebrate()
    })
    const offPanel = bridge.onOpenPanel(() => void openPanel())
    const offIntro = bridge.onReplayIntro(() => {
      hush()
      update({ onboarded: false, introStep: null })
    })
    const offWhatsNew = bridge.onWhatsNew(() => void bridge.getVersion().then(openWhatsNew))
    // Peeking from a screen edge: tucked in there from last time, or just pushed there.
    void bridge.getPeek().then(setPeek)
    const offPeek = bridge.onPeek((side) => {
      setPeek(side)
      if (side) reactions.peeked()
    })
    return () => {
      offFace()
      offPanel()
      offIntro()
      offWhatsNew()
      offPeek()
    }
  }, [reactions])

  useEffect(() => {
    window.buddy?.setAlwaysOnTop(alwaysOnTop)
  }, [alwaysOnTop])

  const introDelay = Date.now() - launchedAt.current < 3_000 ? INTRO_DELAY_AT_LAUNCH_MS : INTRO_DELAY_REPLAY_MS

  return (
    <div className="stage">
      <div className="stage-buddy" style={{ opacity }} {...interaction}>
        <Buddy
          name={name}
          overrides={look}
          mood={mood}
          size={size}
          gaze={followCursor}
          bounce={bounce}
          pressed={pressed}
          hovered={hovered}
          melting={melting}
          peek={peek}
          sparkle={sparkle}
        />
      </div>
      {!onboarded && <Onboarding startDelay={introDelay} />}
      <UpdateBubble />
      <Chatter />
      <AnimatePresence>{panelOpen && <SettingsPanel key="settings" />}</AnimatePresence>
      <AnimatePresence>{whatsNew && <WhatsNew key="whats-new" />}</AnimatePresence>
    </div>
  )
}

export default App
