import { useEffect } from 'react'
import { toHex } from '../components/Buddy/blob/color'
import { restingEyePaths } from '../components/Buddy/blob/eyes'
import type { BuddyLook } from '../components/Buddy/blob/generate'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Waits for the look to settle, so dragging a slider doesn't redraw the tray on every frame. */
const DEBOUNCE_MS = 250

/** The resting buddy, cropped tight to its body. Bigger `eyeBoost` keeps the face readable at tray sizes. */
function iconSvg(look: BuddyLook, eyeBoost: number, size: number): string {
  const body = look.parts.map((d) => `<path d="${d}"/>`).join('')
  const eyes = restingEyePaths(look, eyeBoost)
    .map((d) => `<path d="${d}"/>`)
    .join('')

  // Measure the real outline in the DOM, which handles every shape's path commands.
  const probe = document.createElementNS(SVG_NS, 'svg')
  probe.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden')
  probe.innerHTML = `<g>${body}</g>`
  document.body.appendChild(probe)
  const box = (probe.firstChild as SVGGElement).getBBox()
  probe.remove()

  const side = Math.max(box.width, box.height) * 1.04
  const x = box.x + box.width / 2 - side / 2
  const y = box.y + box.height / 2 - side / 2
  return (
    `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${side} ${side}" width="${size}" height="${size}">` +
    `<g fill="${toHex(look.body)}">${body}</g><g fill="${toHex(look.eye)}">${eyes}</g></svg>`
  )
}

async function rasterize(svg: string, size: number): Promise<string> {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.drawImage(img, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

/** Keeps the tray icon and its tooltip matching the buddy on screen. */
export function useTrayIcon(look: BuddyLook, name: string) {
  useEffect(() => {
    const bridge = window.buddy
    if (!bridge) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      // Windows wants 16px on standard displays and 32px on high-DPI ones.
      const [x1, x2] = await Promise.all([rasterize(iconSvg(look, 1.45, 16), 16), rasterize(iconSvg(look, 1.3, 32), 32)])
      if (!cancelled) bridge.setTrayIcon({ x1, x2, tooltip: `${name.trim() || 'buddy'} · Blimo` })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [look, name])
}
