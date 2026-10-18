import { app, BrowserWindow, ipcMain, screen, type Rectangle } from 'electron'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { keepOnTop } from './interaction'

/** [left, top, right, bottom] in real screen pixels, the way the helper reports boxes. */
type Box = [number, number, number, number]

/** One line from the helper (see helper/DesktopBuddyHelper.cs). */
interface Report {
  playing: MediaKind | null
  /** The window the video is in, if it could be found. */
  video: Box | null
  /** The screen a full-screen app or game is covering, if any. */
  fullscreen: Box | null
}

/** After a crash the helper starts again after this long, up to this many times in a row. */
const RESTART_MS = 5_000
const MAX_RESTARTS = 5
/** Running this long counts as healthy, so earlier crashes are forgiven. */
const HEALTHY_MS = 60_000
/** The buddy's fade (in the renderer) gets this long before the window hides for a full-screen app. */
const FADE_MS = 400

const helperPath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'helper', 'DesktopBuddyHelper.exe')
    : path.join(process.env.APP_ROOT, 'helper', 'bin', 'DesktopBuddyHelper.exe')

/** A helper box as a screen rectangle in the scaled units Electron uses for windows. */
function toDip([left, top, right, bottom]: Box): Rectangle {
  return screen.screenToDipRect(null, { x: left, y: top, width: right - left, height: bottom - top })
}

/**
 * Lets the buddy notice music, videos and full-screen apps, through a small helper program (Windows
 * only). It runs while either option is on in the panel: reacting to music and videos, or stepping
 * aside for full screen. Stepping aside fades the buddy out and hides the window, so it's not sitting
 * invisible over a game; it comes back, without taking the focus, once the full-screen app is gone.
 */
export function startMediaWatch(win: BrowserWindow) {
  if (process.platform !== 'win32') return

  let options: MediaOptions = { react: false, stepAside: false }
  let helper: ChildProcessByStdio<Writable, Readable, null> | null = null
  let restarts = 0
  let report: Report = { playing: null, video: null, fullscreen: null }
  /** Faded out for a full-screen app on its screen, and which screen that is. */
  let aside = false
  let asideFor: string | null = null
  /** The full-screen screen you brought the buddy back on by hand, so it doesn't step aside again for it. */
  let keepFor: string | null = null
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  const wanted = () => options.react || options.stepAside

  const start = () => {
    const file = helperPath()
    if (helper || !existsSync(file)) return
    const startedAt = Date.now()
    const child = spawn(file, [String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    helper = child
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        report = JSON.parse(line) as Report
      } catch {
        return
      }
      sendMedia()
      checkFullScreen()
    })
    child.on('error', () => {})
    child.on('exit', () => {
      if (helper === child) helper = null
      report = { playing: null, video: null, fullscreen: null }
      sendMedia()
      checkFullScreen()
      if (Date.now() - startedAt > HEALTHY_MS) restarts = 0
      if (wanted() && !win.isDestroyed() && restarts++ < MAX_RESTARTS) setTimeout(() => wanted() && start(), RESTART_MS)
    })
  }

  const stop = () => {
    const child = helper
    helper = null
    child?.kill()
  }

  /** What's playing, and where the video is relative to the window, for the renderer. */
  const sendMedia = () => {
    if (win.isDestroyed()) return
    const playing = options.react ? report.playing : null
    const video = playing === 'video' && report.video ? toDip(report.video) : null
    const content = win.getContentBounds()
    const media: MediaNow = {
      playing,
      lookAt: video ? { x: video.x + video.width / 2 - content.x, y: video.y + video.height / 2 - content.y } : null,
    }
    win.webContents.send('buddy:media', media)
  }

  const comeBack = () => {
    aside = false
    clearTimeout(hideTimer)
    if (win.isDestroyed()) return
    if (!win.isVisible()) {
      win.showInactive()
      keepOnTop(win)
    }
    win.webContents.send('buddy:step-aside', false)
  }

  /** Steps aside for a full-screen app on the buddy's own screen; one on another screen is out of its way already. */
  const checkFullScreen = () => {
    if (win.isDestroyed()) return
    const full = options.stepAside && report.fullscreen ? toDip(report.fullscreen) : null
    const bounds = win.getBounds()
    const buddyAt = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const sameScreen = full && screen.getDisplayMatching(full).id === screen.getDisplayNearestPoint(buddyAt).id
    if (!full || !sameScreen) {
      // The buddy itself in front doesn't count as the game being gone: that's you clicking it after
      // bringing it back, and it should stay when you click back into the game.
      if (!win.isFocused()) keepFor = null
      if (aside) comeBack()
      return
    }
    const key = `${full.x},${full.y},${full.width},${full.height}`
    // Already aside, brought back for this one, or hidden by you anyway.
    if (aside || key === keepFor || !win.isVisible()) return
    aside = true
    asideFor = key
    win.webContents.send('buddy:step-aside', true)
    hideTimer = setTimeout(() => aside && !win.isDestroyed() && win.hide(), FADE_MS)
  }

  // Shown with the shortcut or the tray while a full-screen app is up: you want it there, so it stays.
  win.on('show', () => {
    if (!aside) return
    aside = false
    keepFor = asideFor
    clearTimeout(hideTimer)
    win.webContents.send('buddy:step-aside', false)
  })
  // Moved to another screen (or rescued from an unplugged one): where the video is relative to the buddy
  // changes, and so might whether a full-screen app is in its way.
  win.on('moved', () => {
    sendMedia()
    checkFullScreen()
  })

  // Sent when the renderer starts (and again after a reload), so it also hears where things stand.
  ipcMain.removeAllListeners('media:options')
  ipcMain.on('media:options', (_event, next: MediaOptions) => {
    options = next
    if (wanted()) start()
    else stop()
    sendMedia()
    checkFullScreen()
    if (!win.isDestroyed()) win.webContents.send('buddy:step-aside', aside)
  })

  app.once('will-quit', stop)
}
