import { Tray, Menu, BrowserWindow, app, globalShortcut, ipcMain, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Updates } from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Shows or hides the buddy from anywhere, for screen-sharing and presenting: Ctrl+Alt+B, or ⌥⌘B on a Mac. */
const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+B'
const IS_MAC = process.platform === 'darwin'
/** How the shortcut reads in the panel, the way each system writes it. */
const SHORTCUT_LABEL = IS_MAC ? '⌥⌘B' : 'Ctrl+Alt+B'

/** The menu's update line, which follows the updater from checking through to ready. */
function updateItem(updates: Updates): MenuItemConstructorOptions {
  if (!updates.enabled) return { label: 'Check for updates (installed app only)', enabled: false }
  const { state } = updates
  switch (state.status) {
    case 'checking':
      return { label: 'Checking for updates…', enabled: false }
    case 'downloading':
      return { label: `Downloading ${state.version}…`, enabled: false }
    case 'ready':
      return { label: `Restart to update to ${state.version}`, click: () => updates.install() }
    case 'available':
      return { label: `Download ${state.version}…`, click: () => updates.install() }
    default:
      return { label: 'Check for updates', click: () => updates.check() }
  }
}

export function createTray(win: BrowserWindow, updates: Updates) {
  // Shown for a moment at startup, until the app draws your own buddy for the tray.
  const iconPath = path.join(process.env.VITE_PUBLIC ?? path.join(__dirname, '../public'), 'tray-icon.png')
  const tray = new Tray(nativeImage.createFromPath(iconPath))
  const toggle = () => (win.isVisible() ? win.hide() : win.show())

  // Another app may already own the shortcut; then the menu just doesn't mention it.
  const shortcut = globalShortcut.register(TOGGLE_SHORTCUT, toggle) ? TOGGLE_SHORTCUT : undefined
  app.once('will-quit', () => globalShortcut.unregister(TOGGLE_SHORTCUT))

  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Show', click: () => win.show(), accelerator: shortcut, registerAccelerator: false },
      { label: 'Hide', click: () => win.hide(), accelerator: shortcut, registerAccelerator: false },
      { type: 'separator' },
      {
        label: 'Customise…',
        click: () => {
          win.show()
          win.focus()
          win.webContents.send('buddy:open-panel')
        },
      },
      { label: 'New face', click: () => win.webContents.send('buddy:new-face') },
      {
        label: 'Show intro again',
        click: () => {
          win.show()
          win.focus()
          win.webContents.send('buddy:replay-intro')
        },
      },
      {
        label: "What's new",
        click: () => {
          win.show()
          win.focus()
          win.webContents.send('buddy:whats-new')
        },
      },
      { type: 'separator' },
      {
        // Only the installed app can do this; in development it would register the dev copy of Electron.
        label: `${IS_MAC ? 'Open at login' : 'Start with Windows'}${app.isPackaged ? '' : ' (installed app only)'}`,
        type: 'checkbox',
        enabled: app.isPackaged,
        checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      updateItem(updates),
      { type: 'separator' },
      // Macs name the app in Quit.
      { label: IS_MAC ? 'Quit Blimo' : 'Quit', click: () => app.quit() },
    ])

  const refresh = () => {
    if (!tray.isDestroyed()) tray.setContextMenu(menu())
  }
  tray.setToolTip('Blimo')
  refresh()
  updates.onChange(refresh)
  // On a Mac, clicking a menu bar icon opens its menu, so a click there doesn't also hide the buddy.
  if (!IS_MAC) tray.on('click', toggle)

  // The settings panel offers the same things, for anyone who never finds the tray icon
  // (Windows 11 tucks new ones away under the ^ arrow).
  ipcMain.removeHandler('app:menu-state')
  ipcMain.handle(
    'app:menu-state',
    (): MenuState => ({
      hideShortcut: shortcut ? SHORTCUT_LABEL : null,
      startWithWindows: app.isPackaged ? app.getLoginItemSettings().openAtLogin : null,
      canUpdate: updates.enabled,
      update: updates.state,
    }),
  )
  ipcMain.removeAllListeners('window:hide')
  ipcMain.on('window:hide', () => win.hide())
  ipcMain.removeAllListeners('app:start-with-windows')
  ipcMain.on('app:start-with-windows', (_event, on: boolean) => {
    if (!app.isPackaged) return
    app.setLoginItemSettings({ openAtLogin: on })
    // So the tick in the tray menu matches.
    refresh()
  })
  ipcMain.removeAllListeners('update:check')
  ipcMain.on('update:check', () => updates.check())
  ipcMain.removeAllListeners('app:quit')
  ipcMain.on('app:quit', () => app.quit())

  // The renderer sends the buddy drawn at 1x and 2x, so it stays crisp on high-DPI screens.
  ipcMain.removeAllListeners('tray:set-icon')
  ipcMain.on('tray:set-icon', (_event, icon: { x1: string; x2: string; tooltip: string }) => {
    if (tray.isDestroyed()) return
    const image = nativeImage.createEmpty()
    image.addRepresentation({ scaleFactor: 1, dataURL: icon.x1 })
    image.addRepresentation({ scaleFactor: 2, dataURL: icon.x2 })
    tray.setImage(image)
    tray.setToolTip(icon.tooltip)
  })

  return tray
}
