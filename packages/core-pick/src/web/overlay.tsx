import { useEffect } from 'react'
import type { SlotProps } from '@biu/type-slots'
import { getPick, usePickState } from './service.ts'
import { boxFromPoints, pickSurfaceAtPoint, resolvePickAtPoint, resolvePicksInRect, visiblePickBox } from './resolve.ts'

const DRAG_PX = 6

export const PICK_NAV_GUARD =
  '[data-biu-ignore], .brand-corner-cluster, .page-bubble, [data-testid="inspector-toggle"], [data-testid="fsdb-inspector-toggle"], [data-testid="chat-overlay-panel"]'

export function ignorePickCapture(target: EventTarget | null, event?: Event) {
  const path = event && 'composedPath' in event ? event.composedPath() : []
  const nodes = path.length ? path : target instanceof Element ? [target] : []
  return nodes.some((node) => node instanceof Element && node.closest(PICK_NAV_GUARD))
}

function hoverBox(el: HTMLElement) {
  const box = visiblePickBox(el) ?? el.getBoundingClientRect()
  return { top: box.top, left: box.left, width: box.width, height: box.height }
}

export function PickOverlay(_props: SlotProps) {
  const pick = getPick()
  const { picking, hover, marquee, marqueeHits } = usePickState(pick)

  useEffect(() => {
    if (!pick || !picking) {
      document.documentElement.classList.remove('pick-mode')
      return
    }
    document.documentElement.classList.add('pick-mode')
    const route = () => window.location.pathname
    const EDITOR_SEL = '.page-editor, .tiptap, [data-testid="page-editor"], .cm-editor'
    const inEditor = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(EDITOR_SEL))

    let drag: { x: number; y: number; boxed: boolean; editor: boolean } | null = null

    const onMove = (event: PointerEvent) => {
      if (drag) {
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!drag.boxed && dx * dx + dy * dy >= DRAG_PX * DRAG_PX) drag.boxed = true
        if (!drag.boxed || drag.editor) return
        const box = boxFromPoints(drag.x, drag.y, event.clientX, event.clientY)
        const root = pickSurfaceAtPoint(drag.x, drag.y) ?? document
        const hits = resolvePicksInRect(box, route(), root)
        pick.setMarquee(
          { top: box.top, left: box.left, width: box.width, height: box.height },
          hits.map((hit) => hoverBox(hit.el)),
        )
        return
      }
      const hit = resolvePickAtPoint(event.clientX, event.clientY, route())
      if (!hit) {
        pick.setHover(null)
        return
      }
      pick.setHover(hoverBox(hit.el))
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (ignorePickCapture(event.target, event)) return
      const inReadable =
        event.target instanceof Element &&
        Boolean(event.target.closest('.chat-stage, .page-editor, .tiptap, [data-testid="page-editor"], .cm-editor'))
      if (!inReadable) event.preventDefault()
      drag = { x: event.clientX, y: event.clientY, boxed: false, editor: inEditor(event.target) }
    }

    const onUp = (event: PointerEvent) => {
      if (!drag) return
      const started = drag
      drag = null
      if (!pick.picking) return
      if (started.boxed) {
        pick.addMany(
          resolvePicksInRect(
            boxFromPoints(started.x, started.y, event.clientX, event.clientY),
            route(),
            pickSurfaceAtPoint(started.x, started.y) ?? document,
          ).map((hit) => hit.ref),
        )
        return
      }
      const hit = resolvePickAtPoint(event.clientX, event.clientY, route())
      if (hit) pick.add(hit.ref)
    }

    const onClick = (event: MouseEvent) => {
      if (ignorePickCapture(event.target, event)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        pick.exit()
        const active = document.activeElement
        if (active instanceof HTMLElement) active.blur()
      }
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.documentElement.classList.remove('pick-mode')
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [picking, pick])

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!pick) return
      const key = event.key.toLowerCase()
      const pickChord = (event.metaKey || event.ctrlKey) && key === 'q'
      const legacy = event.altKey && key === 'c'
      if (!pickChord && !legacy) return
      event.preventDefault()
      pick.toggle()
    }
    window.addEventListener('keydown', onHotkey)
    return () => window.removeEventListener('keydown', onHotkey)
  }, [pick])

  if (!picking) return null
  return (
    <>
      {marquee ? (
        <div
          className="pick-overlay-box pick-overlay-marquee"
          data-biu-ignore
          data-testid="pick-marquee"
          style={{
            top: marquee.top,
            left: marquee.left,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      ) : null}
      {(marquee ? marqueeHits : hover ? [hover] : []).map((box, index) => (
        <div
          key={`${box.left}-${box.top}-${index}`}
          className="pick-overlay-box pick-overlay-hit"
          data-biu-ignore
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }}
        />
      ))}
    </>
  )
}
