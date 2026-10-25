/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

/**
 * What the buddy should say about updates: one is ready, the answer to a check you asked for, goodbye
 * before it restarts to install, or hello again once it has (that last one comes from the renderer).
 */
type UpdateNotice =
  // 'available' is a Mac's news: a new version is out, to download by hand.
  | { status: 'ready' | 'downloading' | 'updated' | 'available'; version: string }
  | { status: 'current' | 'failed' | 'restarting' }

/** The screen edge the buddy is tucked behind, peeking out, after being pushed there. */
type PeekSide = 'left' | 'right'

/** What the settings panel needs to offer the same things as the tray menu. */
interface MenuState {
  /** How the hide shortcut reads ("Ctrl+Alt+B"), or null if another app already has it. */
  hideShortcut: string | null
  /** Whether it starts with Windows, or null where that can't be set (a dev copy). */
  startWithWindows: boolean | null
  /** Whether this copy can update itself, which only the installed app can. */
  canUpdate: boolean
  /** Where updating is up to right now, such as partway through a download. */
  update: import('./updater').UpdateState
}

/** What's playing, going by Windows' media info: music or a video (null for nothing). */
type MediaKind = 'music' | 'video'

/** The music's tempo, and when a recent beat played (ms since 1970); later beats follow every 60000 / bpm ms. */
interface Beat {
  bpm: number
  at: number
}

/** The music's title and artist, as the app playing it tells Windows. */
interface Song {
  title: string
  artist: string
}

interface MediaNow {
  playing: MediaKind | null
  /** The middle of the video's window, relative to the buddy's window, when it could be found. */
  lookAt: { x: number; y: number } | null
  /** The music's beat, while "bop to the beat" is on and the music has a clear one. */
  beat: Beat | null
  /** The song, while "show what's playing" is on and the app says. */
  song: Song | null
}

/** The panel's switches for noticing what's on screen. The helper only runs while one is on. */
interface MediaOptions {
  /** Bop to music and watch videos along with you. */
  react: boolean
  /** Fade out of the way while something is full screen on the buddy's screen. */
  stepAside: boolean
  /** Stats on hover, which on Windows include the GPU, read by the helper. */
  stats: boolean
  /** Bop in time with the music, which means listening to it for the beat. Only counts with `react` on. */
  beat: boolean
  /** Show the song that's playing, which means reading its title and artist. Only counts with `react` on. */
  song: boolean
}

/** How busy the computer is, as percentages, plus memory in GB. `gpu` is only read while the stats show, and only on Windows. */
interface SystemStats {
  cpu: number
  ram: number
  ramUsedGb: number
  ramTotalGb: number
  gpu: number | null
}

/** A box in px, relative to the window's content area. */
interface BodyRect {
  left: number
  top: number
  right: number
  bottom: number
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  /** Missing when the renderer runs in a plain browser, such as the face gallery. */
  buddy?: {
    /** Which system it's running on ('win32', 'darwin'), for things that differ, like wording. */
    platform: string
    /** Cursor position relative to the window's content area, even when it is outside the window. */
    onCursor(callback: (point: { x: number; y: number }) => void): () => void
    onNewFace(callback: () => void): () => void
    onOpenPanel(callback: () => void): () => void
    /** Fires once per drag when the buddy is shaken back and forth. */
    onShaken(callback: () => void): () => void
    /** How fast the buddy is being carried, in px per second; zero once it's let go. */
    onCarried(callback: (speed: { vx: number; vy: number }) => void): () => void
    onReplayIntro(callback: () => void): () => void
    /** The tray asked to show what's new in this version. */
    onWhatsNew(callback: () => void): () => void
    onUpdate(callback: (notice: UpdateNotice) => void): () => void
    /** How much of an update has downloaded, 0 to 100, or null once it's done or failed. */
    onUpdateProgress(callback: (percent: number | null) => void): () => void
    /** The running app's version, such as "0.2.0". */
    getVersion(): Promise<string>
    /** Restarts into a downloaded update. */
    installUpdate(): void
    /** While true, clicks fall through the window to whatever is behind it. */
    setClickThrough(through: boolean): void
    /**
     * The main process moves the window with the cursor between these two calls. `body` is where the
     * buddy was let go, so it can tuck in if it was pushed past a screen edge.
     */
    dragStart(): void
    dragEnd(body?: BodyRect): void
    /** Fires when the buddy tucks in behind a screen edge after a drag, or is dropped away from one. */
    onPeek(callback: (side: PeekSide | null) => void): () => void
    /** The edge it's tucked behind right now, if any. It stays tucked in between launches. */
    getPeek(): Promise<PeekSide | null>
    /** Seconds since any keyboard or mouse input on the computer. */
    getIdleSeconds(): Promise<number>
    setAlwaysOnTop(onTop: boolean): void
    getScreenSpace(): Promise<import('../src/stores/buddyStore').ScreenSpace>
    /** Your buddy drawn at 16px and 32px as PNG data URLs, plus the tray tooltip. */
    setTrayIcon(icon: { x1: string; x2: string; tooltip: string }): void
    getMenuState(): Promise<MenuState>
    /** Hides the buddy, like Hide in the tray menu; the shortcut or the tray brings it back. */
    hide(): void
    setStartWithWindows(on: boolean): void
    /** Checks for a new version now; the answer arrives through `onUpdate`. */
    checkForUpdates(): void
    /** Closes Blimo completely, like Quit in the tray menu. */
    quit(): void
    /** Music or a video started or stopped, or the video's window moved. Windows only. */
    onMedia(callback: (media: MediaNow) => void): () => void
    /** A full-screen app took over the buddy's screen (fade out), or it's gone again (fade back in). */
    onStepAside(callback: (aside: boolean) => void): () => void
    setMediaOptions(options: MediaOptions): void
    /** CPU, memory and (while the stats show, on Windows) GPU use: every couple of seconds, every second while shown. */
    onStats(callback: (stats: SystemStats) => void): () => void
    /** The stats are showing (hovered), or not; while they are, readings come faster and include the GPU. */
    setStatsShowing(showing: boolean): void
  }
}
