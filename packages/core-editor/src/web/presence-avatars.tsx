import { useLayoutEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { PresenceViewer } from './use-page-presence.ts'

export function PresenceAvatars({ viewers, selfId }: { viewers: PresenceViewer[]; selfId: string }) {
  if (!viewers.length) return null
  return (
    <div className="page-presence" data-testid="page-presence" title={`${viewers.length} 人在看`}>
      {viewers.map((viewer, index) => (
        <span
          key={viewer.id}
          className={`page-presence-dot${viewer.id === selfId ? ' is-self' : ''}`}
          style={{ background: viewer.color, zIndex: index + 1 }}
          title={viewer.id}
        >
          {viewer.id.slice(-2)}
        </span>
      ))}
    </div>
  )
}

export function PresenceCarets({
  editor,
  viewers,
  selfId,
}: {
  editor: Editor
  viewers: PresenceViewer[]
  selfId: string
}) {
  const [, bump] = useState(0)
  useLayoutEffect(() => {
    const onUpdate = () => bump((n) => n + 1)
    editor.on('transaction', onUpdate)
    return () => {
      editor.off('transaction', onUpdate)
    }
  }, [editor])
  if (editor.isDestroyed) return null
  const size = editor.state.doc.content.size
  const host = editor.view.dom.closest('.page-editor')
  const root = (host instanceof HTMLElement ? host : editor.view.dom).getBoundingClientRect()
  return (
    <div className="page-presence-carets" data-testid="page-presence-carets">
      {viewers
        .filter((viewer) => viewer.id !== selfId && viewer.from != null && viewer.from >= 1 && viewer.from <= size)
        .map((viewer) => {
          try {
            const pos = Math.min(Math.max(1, viewer.from!), size)
            const coord = editor.view.coordsAtPos(pos)
            return (
              <span
                key={viewer.id}
                className="page-presence-caret"
                style={{
                  left: coord.left - root.left,
                  top: coord.top - root.top,
                  height: Math.max(14, coord.bottom - coord.top),
                  background: viewer.color,
                }}
              >
                <span className="page-presence-caret-label" style={{ background: viewer.color }}>
                  {viewer.id.slice(-4)}
                </span>
              </span>
            )
          } catch {
            return null
          }
        })}
    </div>
  )
}
