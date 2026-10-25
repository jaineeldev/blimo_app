import { BrowserWindow, ipcMain } from 'electron'
import os from 'node:os'
import type { GpuReader } from './media'

/** How often it reads the CPU and memory, and how often while the stats are showing. */
const EVERY_MS = 2_000
const SHOWING_EVERY_MS = 1_000
/** When the stats appear, the first reading comes almost straight away. */
const FIRST_SHOWING_MS = 250

/** Time every core has spent working and idle so far; CPU use is the change between two of these. */
function cpuTimes() {
  let idle = 0
  let total = 0
  for (const { times } of os.cpus()) {
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total }
}

/**
 * How busy the computer is: CPU and memory from the system, and on Windows the GPU from the helper.
 * The renderer gets a reading every couple of seconds, so the buddy can notice a busy PC, and every
 * second while you hover over it with the stats showing. Only numbers, never what's running.
 */
export function startStats(win: BrowserWindow, gpu: GpuReader) {
  let last = cpuTimes()
  let showing = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const read = () => {
    if (win.isDestroyed()) return
    const now = cpuTimes()
    const spent = now.total - last.total
    const cpu = spent > 0 ? 100 * (1 - (now.idle - last.idle) / spent) : 0
    last = now
    // In KB. "free" is what's available to apps, including memory the system would give up for them.
    const memory = process.getSystemMemoryInfo()
    const used = memory.total - memory.free
    const stats: SystemStats = {
      cpu: Math.round(Math.max(0, Math.min(100, cpu))),
      ram: Math.round((100 * used) / memory.total),
      ramUsedGb: used / 1024 / 1024,
      ramTotalGb: memory.total / 1024 / 1024,
      gpu: showing ? gpu.latest() : null,
    }
    // Hidden (you hid it, or it stepped aside for a game), it has no use for them.
    if (win.isVisible()) win.webContents.send('buddy:stats', stats)
    timer = setTimeout(read, showing ? SHOWING_EVERY_MS : EVERY_MS)
  }

  ipcMain.removeAllListeners('stats:showing')
  ipcMain.on('stats:showing', (_event, on: boolean) => {
    if (on === showing) return
    showing = on
    gpu.watch(on)
    clearTimeout(timer)
    timer = setTimeout(read, on ? FIRST_SHOWING_MS : EVERY_MS)
  })
  timer = setTimeout(read, EVERY_MS)
  win.on('closed', () => clearTimeout(timer))
}
