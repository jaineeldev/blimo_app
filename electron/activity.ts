import { ipcMain, powerMonitor } from 'electron'

/**
 * Lets the renderer ask how long it's been since any keyboard or mouse input anywhere on the
 * computer, so typing counts as being around. Windows only reports the time, never what was pressed.
 */
export function registerActivity() {
  ipcMain.handle('system:idle-seconds', () => powerMonitor.getSystemIdleTime())
}
