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
  | { status: 'ready' | 'downloading' | 'updated'; version: string }
  | { status: 'current' | 'failed' | 'restarting' }

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  /** Missing when the renderer runs in a plain browser, such as the face gallery. */
  buddy?: {
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
    /** The main process moves the window with the cursor between these two calls. */
    dragStart(): void
    dragEnd(): void
    /** Seconds since any keyboard or mouse input on the computer. */
    getIdleSeconds(): Promise<number>
    setAlwaysOnTop(onTop: boolean): void
    getScreenSpace(): Promise<import('../src/stores/buddyStore').ScreenSpace>
    /** Your buddy drawn at 16px and 32px as PNG data URLs, plus the tray tooltip. */
    setTrayIcon(icon: { x1: string; x2: string; tooltip: string }): void
  }
}
