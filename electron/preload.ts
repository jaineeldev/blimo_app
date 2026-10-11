import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

// Each subscription hands back its own unsubscribe, so React effects can clean up exactly what they added.
function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

contextBridge.exposeInMainWorld('buddy', {
  onCursor: (callback: (point: { x: number; y: number }) => void) => subscribe('cursor:move', callback),
  onNewFace: (callback: () => void) => subscribe('buddy:new-face', callback),
  onOpenPanel: (callback: () => void) => subscribe('buddy:open-panel', callback),
  onShaken: (callback: () => void) => subscribe('buddy:shaken', callback),
  onCarried: (callback: (speed: { vx: number; vy: number }) => void) => subscribe('buddy:carried', callback),
  onReplayIntro: (callback: () => void) => subscribe('buddy:replay-intro', callback),
  onWhatsNew: (callback: () => void) => subscribe('buddy:whats-new', callback),
  onUpdate: (callback: (notice: UpdateNotice) => void) => subscribe('buddy:update', callback),
  onUpdateProgress: (callback: (percent: number | null) => void) => subscribe('buddy:update-progress', callback),
  getVersion: () => ipcRenderer.invoke('app:version'),
  installUpdate: () => ipcRenderer.send('update:install'),
  setClickThrough: (through: boolean) => ipcRenderer.send('window:click-through', through),
  dragStart: () => ipcRenderer.send('window:drag-start'),
  dragEnd: () => ipcRenderer.send('window:drag-end'),
  getIdleSeconds: () => ipcRenderer.invoke('system:idle-seconds'),
  setAlwaysOnTop: (onTop: boolean) => ipcRenderer.send('window:always-on-top', onTop),
  getScreenSpace: () => ipcRenderer.invoke('window:screen-space'),
  setTrayIcon: (icon: { x1: string; x2: string; tooltip: string }) => ipcRenderer.send('tray:set-icon', icon),
})
