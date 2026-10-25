import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuddyState } from '../components/Buddy/BuddyStates'
import type { LookOverrides } from '../components/Buddy/blob/generate'

/** Screen edges relative to the window's content area, so the panel can open on the side with room. */
export interface ScreenSpace {
  left: number
  top: number
  right: number
  bottom: number
}

/** Everything the settings panel edits. Saved between restarts. */
export interface BuddySettings {
  /** Decides the buddy's face: the same name always draws the same buddy. */
  name: string
  /** Traits pinned in the panel. Anything not pinned comes from the name. */
  look: LookOverrides
  /** Rendered size in px. */
  size: number
  opacity: number
  followCursor: boolean
  alwaysOnTop: boolean
  /** No chatter: greetings, click lines, milestones and the like. Update news still shows. */
  quiet: boolean
  /** Bops along to music and watches videos with you, going by Windows' media info. */
  reactToMedia: boolean
  /** Fades out of the way while a full-screen app or game is on its screen. */
  stepAside: boolean
  /** Shows how busy your computer is (CPU, memory, GPU) while you hover over it. */
  showStats: boolean
  /** Bops in time with the music, listening to it for the beat. Off until you switch it on. */
  bopToBeat: boolean
  /** Shows the song that's playing while you hover, reading its title and artist. Off until you switch it on. */
  showSong: boolean
  /** Whether the first-run intro has been finished or skipped. */
  onboarded: boolean
  /** The intro step you'd reached, so a restart picks up there instead of starting over. */
  introStep: string | null
  /** The app version that last ran, so the buddy can tell when it has just been updated. */
  lastVersion: string | null
  /** When you first met (ms since 1970), for anniversaries. */
  firstMet: number | null
  /** Milestones it has already mentioned, so each one is said only once. */
  milestones: string[]
  /** Every pet it's ever had, for the pet milestones. */
  lifetimePets: number
}

interface BuddyStore extends BuddySettings {
  /** The mood picked in the panel (later, the one system stats suggest). */
  state: BuddyState
  /** A short-lived mood that plays over everything else, like happy when petted. */
  reaction: BuddyState | null
  /** A background mood from what's going on around it: bored or asleep when you're away, curious when hovered. Only shows over `idle`. */
  ambient: BuddyState | null
  /** Bumped to play a squash-and-stretch. */
  bounce: number
  /** Running counts of pets and drops, so the intro can wait for you to try each one. */
  pets: number
  drops: number
  panelOpen: boolean
  /** The version whose what's new card is open, if any. */
  whatsNew: string | null
  screenSpace: ScreenSpace | null
  /** The screen edge it's tucked behind after being pushed there, if any. */
  peek: PeekSide | null
  /** Being stroked back and forth, so it melts. */
  melting: boolean
  /** A passing comment it's making, such as when clicked. */
  chatter: { text: string; id: number } | null
  /** An update ring or update message is showing, so chatter waits its turn. */
  updateBusy: boolean
  /** Music or a video playing right now (only while `reactToMedia` is on). */
  media: MediaKind | null
  /** The middle of the video's window, relative to the buddy's window, so it can watch along. */
  videoAt: { x: number; y: number } | null
  /** The music's beat, while `bopToBeat` is on and it can hear one. */
  beat: Beat | null
  /** The song that's playing, while `showSong` is on. */
  song: Song | null
  /** Faded out for a full-screen app. */
  aside: boolean
  update: (settings: Partial<BuddySettings>) => void
  setName: (name: string) => void
  setState: (state: BuddyState) => void
  /** Plays `mood` for `ms`, or until the next reaction when `ms` is Infinity. `null` ends the current one. */
  react: (mood: BuddyState | null, ms?: number) => void
  setAmbient: (mood: BuddyState | null) => void
  bump: () => void
  /** A surprised little pop, for when it gets a new look. */
  celebrate: () => void
  notePet: () => void
  noteDrop: () => void
  openPanel: () => Promise<void>
  closePanel: () => void
  openWhatsNew: (version: string) => Promise<void>
  closeWhatsNew: () => void
  setPeek: (peek: PeekSide | null) => void
  setMelting: (melting: boolean) => void
  /** Says `text` in a bubble, replacing any comment already up. */
  say: (text: string) => void
  /** Ends the comment with this id, or whatever comment is up when no id is given. */
  hush: (id?: number) => void
  setUpdateBusy: (busy: boolean) => void
  markMilestone: (id: string) => void
  setMedia: (media: MediaNow) => void
  setAside: (aside: boolean) => void
}

export const SIZE_RANGE = { min: 120, max: 280 } as const
export const OPACITY_RANGE = { min: 0.3, max: 1 } as const

/** A new buddy's name, and so its face: a bright cyan squircle with dot eyes, matching the app icon. */
export const DEFAULT_NAME = 'Sora'
/** The default name before version 2 of the saved settings. */
const OLD_DEFAULT_NAME = 'buddy'
/** Version 2's default, before it was capitalised. */
const LOWERCASE_DEFAULT_NAME = 'sora'

let reactionTimer = 0
let chatterId = 0

/**
 * The helper sends the beat every second. One within a hair of the tempo and a few ms of the timing it
 * already has changes nothing, so it's kept and the buddy isn't redrawn for it; small drift adds up
 * until it isn't.
 */
function sameBeat(a: Beat | null, b: Beat | null): boolean {
  if (!a || !b) return a === b
  const period = 60_000 / a.bpm
  const off = (((b.at - a.at) % period) + period) % period
  return Math.abs(a.bpm - b.bpm) < 0.3 && Math.min(off, period - off) < 12
}

/** What the buddy is actually showing: a reaction, else its ambient mood over idle, else its set mood. */
export function shownMood(s: Pick<BuddyStore, 'reaction' | 'ambient' | 'state'>): BuddyState {
  return s.reaction ?? (s.state === 'idle' ? s.ambient : null) ?? s.state
}

export const useBuddyStore = create<BuddyStore>()(
  persist(
    (set, get) => ({
      name: DEFAULT_NAME,
      look: {},
      size: 200,
      opacity: 1,
      followCursor: true,
      alwaysOnTop: true,
      quiet: false,
      reactToMedia: true,
      stepAside: true,
      showStats: true,
      bopToBeat: false,
      showSong: false,
      onboarded: false,
      introStep: null,
      lastVersion: null,
      firstMet: null,
      milestones: [],
      lifetimePets: 0,
      state: 'idle',
      reaction: null,
      ambient: null,
      bounce: 0,
      pets: 0,
      drops: 0,
      panelOpen: false,
      whatsNew: null,
      screenSpace: null,
      peek: null,
      melting: false,
      chatter: null,
      updateBusy: false,
      media: null,
      videoAt: null,
      beat: null,
      song: null,
      aside: false,
      update: (settings) => set(settings),
      setName: (name) => set({ name }),
      setState: (state) => set({ state }),
      react: (mood, ms = 1400) => {
        window.clearTimeout(reactionTimer)
        set({ reaction: mood })
        if (mood && Number.isFinite(ms)) reactionTimer = window.setTimeout(() => set({ reaction: null }), ms)
      },
      setAmbient: (ambient) => set({ ambient }),
      bump: () => set((s) => ({ bounce: s.bounce + 1 })),
      celebrate: () => {
        get().react('surprised', 700)
        get().bump()
      },
      notePet: () => set((s) => ({ pets: s.pets + 1 })),
      noteDrop: () => set((s) => ({ drops: s.drops + 1 })),
      openPanel: async () => {
        // Ask where the screen edges are first, so the panel opens on the right side straight away.
        const screenSpace = (await window.buddy?.getScreenSpace()) ?? null
        // One card beside the buddy at a time, and it stops chattering to let you get on with it.
        set({ panelOpen: true, whatsNew: null, chatter: null, screenSpace })
      },
      closePanel: () => set({ panelOpen: false }),
      openWhatsNew: async (version) => {
        const screenSpace = (await window.buddy?.getScreenSpace()) ?? null
        set({ whatsNew: version, panelOpen: false, chatter: null, screenSpace })
      },
      closeWhatsNew: () => set({ whatsNew: null }),
      setPeek: (peek) => set({ peek }),
      setMelting: (melting) => set({ melting }),
      say: (text) => set({ chatter: { text, id: ++chatterId } }),
      hush: (id) => set((s) => (id === undefined || s.chatter?.id === id ? { chatter: null } : {})),
      // Update news always gets the floor.
      setUpdateBusy: (busy) => set(busy ? { updateBusy: true, chatter: null } : { updateBusy: false }),
      markMilestone: (id) => set((s) => (s.milestones.includes(id) ? {} : { milestones: [...s.milestones, id] })),
      setMedia: ({ playing, lookAt, beat, song }) =>
        set((s) => ({
          media: playing,
          videoAt: lookAt,
          beat: sameBeat(s.beat, beat) ? s.beat : beat,
          // The same song arrives every time anything else changes; keeping it saves a redraw.
          song: song && s.song && song.title === s.song.title && song.artist === s.song.artist ? s.song : song,
        })),
      setAside: (aside) => set({ aside }),
    }),
    {
      name: 'desktop-buddy/settings',
      version: 3,
      migrate: (saved, version) => {
        const settings = saved as BuddySettings
        // Version 2 changed the default buddy. Anyone who hadn't finished the intro still has the
        // old default rather than a name they chose, so they get the new one.
        if (version < 2 && settings.name === OLD_DEFAULT_NAME && !settings.onboarded) settings.name = DEFAULT_NAME
        // Version 3 capitalised it. Names don't care about case, so the face stays exactly the same.
        if (version < 3 && settings.name === LOWERCASE_DEFAULT_NAME) settings.name = DEFAULT_NAME
        return settings as BuddyStore
      },
      // Settings saved before a field existed simply pick up its default, so new fields need no migration.
      partialize: (s): BuddySettings => ({
        name: s.name,
        look: s.look,
        size: s.size,
        opacity: s.opacity,
        followCursor: s.followCursor,
        alwaysOnTop: s.alwaysOnTop,
        quiet: s.quiet,
        reactToMedia: s.reactToMedia,
        stepAside: s.stepAside,
        showStats: s.showStats,
        bopToBeat: s.bopToBeat,
        showSong: s.showSong,
        onboarded: s.onboarded,
        introStep: s.introStep,
        lastVersion: s.lastVersion,
        firstMet: s.firstMet,
        milestones: s.milestones,
        lifetimePets: s.lifetimePets,
      }),
    },
  ),
)
