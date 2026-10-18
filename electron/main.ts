import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createTray } from './tray'
import { startCursorFeed } from './cursor'
import { registerWindowControls, stayOnTop } from './interaction'
import { registerActivity } from './activity'
import { startMediaWatch } from './media'
import { startUpdates } from './updater'
import { keepOnScreen, savedPosition } from './windowState'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

/** Matches `appId` in electron-builder.json5, so Windows treats the running app and its Start menu shortcut as one. */
const APP_ID = 'com.jaineel.desktopbuddy'
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

// One buddy at a time: launching again (say, from the Start menu while it already started with Windows)
// just brings back the one that's running.
const isFirstInstance = app.requestSingleInstanceLock()
if (!isFirstInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    win?.show()
    win?.focus()
  })
}

/**
 * Room for the buddy in the middle and the settings panel on either side, clear of a speech bubble
 * over the buddy. Empty space is click-through, so the extra size never gets in the way.
 */
const WINDOW_SIZE = { width: 920, height: 620 }

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
    frame: false,
    ...WINDOW_SIZE,
    // Back where you left it; the very first time, the middle of the screen.
    ...savedPosition(WINDOW_SIZE),
    resizable: false,
    transparent: true,
    // A tool window, like a desktop widget: no taskbar button to minimise it by accident, out of Alt+Tab,
    // still there after Show desktop (Win+D), and on every virtual desktop rather than just the first.
    type: 'toolbar',
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      // The only text box is the buddy's name, which wouldn't be in a dictionary anyway.
      spellcheck: false,
    },
  })

  // Not the constructor's `alwaysOnTop`, which uses the level that tucks it under the taskbar.
  // The renderer then applies your own setting.
  stayOnTop(win)

  // With no taskbar button there would be no way to get it back, so it never stays minimised
  // (by "minimise all", say).
  win.on('minimize', () => win?.restore())

  // Clicks pass through until the renderer sees the cursor over the buddy or the panel.
  win.setIgnoreMouseEvents(true, { forward: true })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  createTray(win, startUpdates(win))
  startCursorFeed(win)
  keepOnScreen(win)
  startMediaWatch(win)
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  if (!isFirstInstance) return
  registerWindowControls()
  registerActivity()
  createWindow()
})
