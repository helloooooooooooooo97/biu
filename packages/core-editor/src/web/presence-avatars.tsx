import type { PresenceViewer } from './use-page-presence.ts'

function labelOf(viewer: PresenceViewer) {
  const name = String(viewer.name ?? '').trim()
  if (name) return name.slice(0, 2)
  return viewer.id.slice(-2)
}

export function PresenceAvatars({ viewers, selfId }: { viewers: PresenceViewer[]; selfId: string }) {
  if (!viewers.length) return null
  return (
    <div className="page-presence" data-testid="page-presence" title={`${viewers.length} 人在看`}>
      {viewers.map((viewer, index) => (
        <span
          key={viewer.id}
          className={`page-presence-dot${viewer.id === selfId ? ' is-self' : ''}`}
          style={{ background: viewer.color, zIndex: index + 1 }}
          title={viewer.name || viewer.id}
        >
          {labelOf(viewer)}
        </span>
      ))}
    </div>
  )
}
