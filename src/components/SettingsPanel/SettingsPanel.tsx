import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { generateLook } from '../Buddy/blob/generate'
import { randomBuddyName } from '../Buddy/names'
import { useBuddyStore } from '../../stores/buddyStore'
import { WHATS_NEW } from '../../whatsNew'
import { MAX_NAME } from '../../shareCode'
import {
  BehaviourIcon,
  CloseIcon,
  HideIcon,
  LookIcon,
  MoodIcon,
  MusicIcon,
  NavRow,
  NewsIcon,
  PageHead,
  PowerIcon,
  ShareIcon,
  ShuffleIcon,
  SizeIcon,
} from './controls'
import { behaviourSwitches, describeLook } from './describe'
import { LookPage } from './pages/LookPage'
import { BehaviourPage, MediaPage, MoodPage, SizePage } from './pages/SettingPages'
import { SharePage } from './pages/SharePage'
import { placePanel } from './placePanel'
import { HAS_HELPER } from './platform'
import { UpdateRow } from './UpdateRow'
import './SettingsPanel.css'

const PANEL_WIDTH = 300
const PANEL_MAX_HEIGHT = 560

type Page = 'home' | 'look' | 'mood' | 'size' | 'media' | 'behaviour' | 'share'

const TITLES: Record<Exclude<Page, 'home'>, string> = {
  look: 'Look',
  mood: 'Mood',
  size: 'Size',
  media: 'Music and videos',
  behaviour: 'Behaviour',
  share: 'Share',
}

/** Pages slide in from the side you're heading: deeper from the right, back home from the left. */
const slide = {
  enter: (dir: number) => ({ opacity: 0, x: 14 * dir }),
  centre: { opacity: 1, x: 0 },
  leave: (dir: number) => ({ opacity: 0, x: -14 * dir }),
}

/**
 * The customise panel beside the buddy: a short home list saying how each thing is set, each opening a
 * page of its own (the look, mood, size, music and videos, behaviour, sharing), with a way back.
 */
export function SettingsPanel() {
  const { size, screenSpace, onboarded } = useBuddyStore(
    useShallow((s) => ({
      size: s.size,
      screenSpace: s.screenSpace,
      onboarded: s.onboarded,
    })),
  )
  const { closePanel } = useBuddyStore.getState()

  // What the tray menu knows (the hide shortcut, start with Windows, updates), so the panel can offer the same.
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let open = true
    void window.buddy?.getMenuState().then((state) => open && setMenu(state))
    void window.buddy?.getVersion().then((v) => open && setVersion(v))
    return () => {
      open = false
    }
  }, [])

  // During the intro it's opened to change the buddy's look, so it opens on that.
  const [page, setPage] = useState<Page>(() => (onboarded ? 'home' : 'look'))
  const [dir, setDir] = useState(1)
  // The page you came back from, so focus returns to its row.
  const [cameFrom, setCameFrom] = useState<Page | null>(null)
  const go = (to: Page) => {
    setDir(to === 'home' ? -1 : 1)
    setCameFrom(to === 'home' ? page : null)
    setPage(to)
  }
  const pageRef = useRef(page)
  pageRef.current = page

  useEffect(() => {
    // Escape steps back to the home page, then closes.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pageRef.current === 'home') closePanel()
      else {
        setDir(-1)
        setCameFrom(pageRef.current)
        setPage('home')
      }
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

  // The side is picked once on open, so resizing the buddy slides the panel along instead of flipping it.
  const [side] = useState(() => placePanel(size, screenSpace, PANEL_WIDTH, PANEL_MAX_HEIGHT).side)
  const place = placePanel(size, screenSpace, PANEL_WIDTH, PANEL_MAX_HEIGHT, side)
  const offset = place.side === 'right' ? -12 : 12

  let content: ReactNode
  if (page === 'home') content = <Home go={go} cameFrom={cameFrom} menu={menu} version={version} />
  else {
    const body = {
      look: <LookPage />,
      mood: <MoodPage />,
      size: <SizePage />,
      media: <MediaPage />,
      behaviour: <BehaviourPage menu={menu} setMenu={setMenu} />,
      share: <SharePage />,
    }[page]
    content = (
      <>
        <PageHead title={TITLES[page]} onBack={() => go('home')} onClose={closePanel} />
        {body}
      </>
    )
  }

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
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={page}
          className="panel-page"
          custom={dir}
          variants={slide}
          initial="enter"
          animate="centre"
          exit="leave"
          transition={{ duration: 0.14, ease: 'easeOut' }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

function Home({
  go,
  cameFrom,
  menu,
  version,
}: {
  go: (page: Page) => void
  cameFrom: Page | null
  menu: MenuState | null
  version: string | null
}) {
  const s = useBuddyStore(
    useShallow((s) => ({
      name: s.name,
      look: s.look,
      state: s.state,
      size: s.size,
      opacity: s.opacity,
      reactToMedia: s.reactToMedia,
      followCursor: s.followCursor,
      alwaysOnTop: s.alwaysOnTop,
      stepAside: s.stepAside,
      showStats: s.showStats,
      quiet: s.quiet,
    })),
  )
  const { setName, celebrate, closePanel, openWhatsNew } = useBuddyStore.getState()
  const looks = useMemo(() => describeLook(generateLook(s.name, s.look)), [s.name, s.look])
  const switches = behaviourSwitches({
    ...s,
    startWithWindows: menu?.startWithWindows,
    hasHelper: HAS_HELPER,
  })
  const named = s.name.trim() || 'your buddy'
  const latest = version ?? WHATS_NEW[0].version

  // Back from a page, focus goes to the row that opened it.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (cameFrom) listRef.current?.querySelector<HTMLElement>(`[data-page="${cameFrom}"]`)?.focus()
  }, [cameFrom])

  return (
    <>
      <header className="panel-head">
        <label className="panel-name">
          <span className="panel-caption">Name</span>
          <input value={s.name} onChange={(e) => setName(e.target.value)} spellCheck={false} maxLength={MAX_NAME} />
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

      <div className="panel-body panel-body--home" ref={listRef}>
        <div className="nav-list">
          <NavRow page="look" icon={<LookIcon />} label="Look" value={looks} onClick={() => go('look')} />
          <NavRow
            page="mood"
            icon={<MoodIcon />}
            label="Mood"
            value={s.state === 'idle' ? 'Reacts to you' : s.state.charAt(0).toUpperCase() + s.state.slice(1)}
            onClick={() => go('mood')}
          />
          <NavRow
            page="size"
            icon={<SizeIcon />}
            label="Size"
            value={`${s.size} px${s.opacity < 1 ? `, ${Math.round(s.opacity * 100)}%` : ''}`}
            onClick={() => go('size')}
          />
        </div>
        <div className="nav-list">
          {HAS_HELPER && (
            <NavRow
              page="media"
              icon={<MusicIcon />}
              label="Music and videos"
              value={s.reactToMedia ? 'On' : 'Off'}
              onClick={() => go('media')}
            />
          )}
          <NavRow
            page="behaviour"
            icon={<BehaviourIcon />}
            label="Behaviour"
            value={`${switches.filter(Boolean).length} of ${switches.length} on`}
            onClick={() => go('behaviour')}
          />
        </div>
        <div className="nav-list">
          <NavRow page="share" icon={<ShareIcon />} label={`Share ${named}`} value="Get a code" onClick={() => go('share')} />
          {menu && <UpdateRow menu={menu} />}
          {window.buddy && <NavRow icon={<NewsIcon />} label="What’s new" value={`v${latest}`} onClick={() => void openWhatsNew(latest)} />}
        </div>
      </div>

      {/* Always in reach without hunting for the tray icon. */}
      {window.buddy && (
        <footer className="panel-foot">
          <button
            className="btn"
            onClick={() => {
              closePanel()
              window.buddy?.hide()
            }}
          >
            <HideIcon /> Hide
            {menu?.hideShortcut && <span className="btn-key">{menu.hideShortcut}</span>}
          </button>
          <button className="btn" onClick={() => window.buddy?.quit()}>
            <PowerIcon /> Quit
          </button>
          <p className="panel-about">{version && `Blimo ${version}`}</p>
        </footer>
      )}
    </>
  )
}
