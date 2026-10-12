import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/** Movement under this many px is still a click; past it the press becomes a drag. */
const DRAG_THRESHOLD = 4

/** Anything inside a `data-hit` element is solid; everything else lets clicks through to the desktop. */
const isHit = (target: EventTarget | null) => target instanceof Element && target.closest('[data-hit]') !== null

/** Solid and part of the buddy itself, rather than the settings panel. */
const isBuddy = (target: EventTarget | null) => target instanceof Element && target.closest('.buddy [data-hit]') !== null

/** Where the painted buddy is in the window, so the main process can tell if it was pushed past a screen edge. */
function paintedBuddy(): BodyRect | undefined {
  const box = document.querySelector('.buddy [data-hit]')?.getBoundingClientRect()
  return box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
}

interface Options {
  /** A left-click that didn't turn into a drag. */
  onClick: () => void
  onMenu: () => void
  onHoverChange?: (hovering: boolean) => void
  /** The button went down on the buddy (true), or the press ended or became a drag (false). */
  onPressChange?: (pressed: boolean) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

/**
 * Desktop-pet mouse handling. Empty parts of the window are click-through,
 * while the buddy can be clicked, dragged around the screen and right-clicked.
 * Spread the returned handlers onto the element that wraps the buddy.
 */
export function useDesktopInteraction(options: Options) {
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  // Latest callbacks, so the window listeners below never go stale.
  const latest = useRef(options)
  latest.current = options
  const hovering = useRef(false)

  const setHover = useCallback((next: boolean) => {
    if (next === hovering.current) return
    hovering.current = next
    latest.current.onHoverChange?.(next)
  }, [])

  const pressing = useRef(false)
  const setPressed = (next: boolean) => {
    if (next === pressing.current) return
    pressing.current = next
    latest.current.onPressChange?.(next)
  }

  useEffect(() => {
    const bridge = window.buddy
    if (!bridge) return

    // The main process starts the window click-through.
    let through = true
    // While a button is held (dragging the buddy or a slider) the cursor can slip off
    // the solid area for a moment, and dropping the click then would break the drag.
    let held = false

    const update = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      setHover(isBuddy(el))
      if (held) return
      const next = !isHit(el)
      if (next === through) return
      through = next
      bridge.setClickThrough(through)
    }

    const onMove = (e: globalThis.MouseEvent) => {
      if (e.buttons === 0) held = false
      update(e.clientX, e.clientY)
    }
    const onDown = () => {
      held = true
    }
    const onUp = () => {
      held = false
    }

    // Forwarded mouse moves give instant updates; the cursor feed covers the cursor leaving the window.
    window.addEventListener('mousemove', onMove)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    const offCursor = bridge.onCursor((p) => update(p.x, p.y))

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      offCursor()
    }
  }, [setHover])

  const endDrag = () => {
    delete document.documentElement.dataset.dragging
    window.buddy?.dragEnd(paintedBuddy())
    latest.current.onDragEnd?.()
  }

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || !isHit(e.target)) return
      e.currentTarget.setPointerCapture(e.pointerId)
      press.current = { x: e.screenX, y: e.screenY, dragging: false }
      setPressed(true)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      // Outside Electron there's no cursor feed, so hover comes from the pointer itself.
      if (!window.buddy) setHover(isBuddy(e.target))
      const p = press.current
      if (!p || p.dragging) return
      if (Math.hypot(e.screenX - p.x, e.screenY - p.y) < DRAG_THRESHOLD) return
      p.dragging = true
      setPressed(false)
      document.documentElement.dataset.dragging = ''
      window.buddy?.dragStart()
      latest.current.onDragStart?.()
    },
    onPointerLeave() {
      if (!window.buddy) setHover(false)
    },
    onPointerUp() {
      const p = press.current
      press.current = null
      setPressed(false)
      if (!p) return
      if (p.dragging) endDrag()
      else latest.current.onClick()
    },
    onLostPointerCapture() {
      // Capture can vanish without a pointerup, for example when another window steals focus.
      if (press.current?.dragging) endDrag()
      press.current = null
      setPressed(false)
    },
    onContextMenu(e: MouseEvent<HTMLElement>) {
      e.preventDefault()
      if (isHit(e.target)) latest.current.onMenu()
    },
  }
}
