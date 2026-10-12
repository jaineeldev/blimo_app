import { app, ipcMain, type BrowserWindow } from 'electron'
import updater from 'electron-updater'

// electron-updater is CommonJS; from an ES module its exports arrive on the default import.
const { autoUpdater } = updater

/** The first check waits until the buddy has settled in; after that it looks every few hours. */
const FIRST_CHECK_MS = 20_000
const CHECK_EVERY_MS = 4 * 60 * 60_000
/** Long enough for the buddy to say goodbye before the app closes to install. */
const GOODBYE_MS = 1_600

export type UpdateState =
  { status: 'idle' } | { status: 'checking' } | { status: 'downloading'; version: string } | { status: 'ready'; version: string }

export interface Updates {
  readonly state: UpdateState
  /** Only the installed app updates itself. */
  readonly enabled: boolean
  /** Checks now and has the buddy say how it went. */
  check(): void
  /** Restarts into the downloaded version. */
  install(): void
  onChange(listener: () => void): void
}

/**
 * Keeps the app up to date from GitHub releases. It checks in the background, downloads new
 * versions quietly and installs them on restart, or on quit if you'd rather wait. The buddy only
 * speaks up when an update is ready, or when you asked it to check.
 */
export function startUpdates(win: BrowserWindow): Updates {
  const listeners: (() => void)[] = []
  let state: UpdateState = { status: 'idle' }
  // Results of a check you asked for get an answer either way; background checks stay quiet.
  let asked = false

  const set = (next: UpdateState) => {
    state = next
    listeners.forEach((listener) => listener())
  }
  const tell = (notice: UpdateNotice) => {
    if (!win.isDestroyed()) win.webContents.send('buddy:update', notice)
  }
  // Whole percents only, so a fast download doesn't flood the renderer. Null hides the ring.
  let shownPercent: number | null = null
  const progress = (percent: number | null) => {
    if (percent === shownPercent || win.isDestroyed()) return
    shownPercent = percent
    win.webContents.send('buddy:update-progress', percent)
  }
  let restarting = false

  // The renderer asks this once at startup, to notice when it has just been updated.
  ipcMain.removeHandler('app:version')
  ipcMain.handle('app:version', () => app.getVersion())

  const check = (byHand: boolean) => {
    if (state.status === 'ready') {
      if (byHand) tell(state)
      return
    }
    if (state.status !== 'idle') return
    asked = byHand
    // Failures also arrive through the 'error' event, so the rejection needs no handling of its own.
    autoUpdater.checkForUpdates()?.catch(() => {})
  }

  // A dev build can try the whole flow against a test feed: point DESKTOP_BUDDY_UPDATE_CONFIG at an app-update.yml.
  const testConfig = app.isPackaged ? undefined : process.env.DESKTOP_BUDDY_UPDATE_CONFIG
  const enabled = app.isPackaged || Boolean(testConfig)

  const updates: Updates = {
    get state() {
      return state
    },
    enabled,
    check: () => check(true),
    install: () => {
      if (state.status !== 'ready' || restarting) return
      restarting = true
      tell({ status: 'restarting' })
      // Silent, since you already said yes, and straight back into the new version afterwards.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), GOODBYE_MS)
    },
    onChange: (listener) => listeners.push(listener),
  }
  if (!enabled) return updates

  if (testConfig) {
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.updateConfigPath = testConfig
  }
  // Full releases only, now that early access is over. The early-access versions still find these,
  // because they were set to take pre-releases and full releases alike.
  autoUpdater.allowPrerelease = false
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Releases ship the full installer, never the small web one that downloads the rest.
  autoUpdater.disableWebInstaller = true

  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-available', ({ version }) => {
    set({ status: 'downloading', version })
    progress(0)
    if (asked) tell({ status: 'downloading', version })
  })
  autoUpdater.on('download-progress', ({ percent }) => progress(Math.floor(percent)))
  autoUpdater.on('update-not-available', () => {
    set({ status: 'idle' })
    if (asked) tell({ status: 'current' })
    asked = false
  })
  autoUpdater.on('update-downloaded', ({ version }) => {
    set({ status: 'ready', version })
    progress(null)
    tell({ status: 'ready', version })
    asked = false
  })
  autoUpdater.on('error', (error) => {
    console.error('Update check failed:', error)
    if (state.status !== 'ready') set({ status: 'idle' })
    progress(null)
    if (asked) tell({ status: 'failed' })
    asked = false
  })

  ipcMain.removeAllListeners('update:install')
  ipcMain.on('update:install', () => updates.install())

  setTimeout(() => check(false), FIRST_CHECK_MS)
  setInterval(() => check(false), CHECK_EVERY_MS)
  return updates
}
