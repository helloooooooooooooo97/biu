import { useEffect, useState } from 'react'
import { ChatPane, ChatStage } from '@biu/public-ui'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { MASCOT_COLOR_NAME, MASCOT_EYE_NAME, MASCOT_SHAPE_NAME } from '@biu/type-session'
import type { CollectionChrome, FsCellProps, FsContentProps } from '@biu/type-file-system/ui'
import type { DbRecord } from '@biu/type-file-system'
import {
  mergeDispatchedUsageIntoNodes,
  projectNodes,
  SESSION_LOAD_TURNS,
  type ChatNode,
  type SessionEvent,
  type TrajectoryUsage,
} from '@biu/web-session-view'
import { ChatNodeList } from './thread.tsx'

function sessionMascot(record: DbRecord) {
  const raw = record.mascot
  if (!raw || typeof raw !== 'object') return undefined
  const mascot = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof mascot.shape !== 'string' || typeof mascot.color !== 'string') return undefined
  return {
    shape: mascot.shape,
    color: mascot.color,
    ...(typeof mascot.eye === 'number' ? { eye: mascot.eye } : {}),
  }
}

function SessionIcon({ record }: { record: DbRecord }) {
  const identity = resolveSessionMascot(String(record.id), sessionMascot(record))
  return <SidebarMascot size={20} sessionId={String(record.id)} identity={identity} animate={false} title="" />
}

function SessionTitle({ label }: { record: DbRecord; label: string }) {
  return <span className="sessions-title-label">{label}</span>
}

function MascotShapeCell({ value }: FsCellProps) {
  const key = String(value ?? '')
  return <span>{MASCOT_SHAPE_NAME[key] ?? key}</span>
}

function MascotColorCell({ value }: FsCellProps) {
  const key = String(value ?? '')
  return <span>{MASCOT_COLOR_NAME[key] ?? key}</span>
}

function MascotEyeCell({ value }: FsCellProps) {
  const n = Number(value)
  if (!Number.isFinite(n)) return <span>—</span>
  const name = MASCOT_EYE_NAME[Math.abs(Math.trunc(n)) % MASCOT_EYE_NAME.length]
  return <span>{name}</span>
}

function eventsFromContent(value: unknown): SessionEvent[] | null {
  if (Array.isArray(value)) return value as SessionEvent[]
  if (value && typeof value === 'object' && Array.isArray((value as { events?: unknown }).events)) {
    return (value as { events: SessionEvent[] }).events
  }
  return null
}

function usageFromContent(value: unknown): Record<string, TrajectoryUsage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = (value as { dispatchedUsageByTurn?: unknown }).dispatchedUsageByTurn
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, TrajectoryUsage>
}

function nodesFromContent(value: unknown): ChatNode[] | null {
  const events = eventsFromContent(value)
  if (!events) return null
  return mergeDispatchedUsageIntoNodes(projectNodes(events), usageFromContent(value))
}

function SessionRecordChat({ record, value }: FsContentProps) {
  const sessionId = String(record.id)
  const [nodes, setNodes] = useState<ChatNode[]>(() => nodesFromContent(value) ?? [])
  useEffect(() => {
    const seeded = nodesFromContent(value)
    if (seeded) setNodes(seeded)
    const ac = new AbortController()
    void fetch(`/api/sessions/${sessionId}?turns=${SESSION_LOAD_TURNS}`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body || !Array.isArray(body.events)) return
        setNodes(
          mergeDispatchedUsageIntoNodes(
            projectNodes(body.events as SessionEvent[]),
            (body.dispatchedUsageByTurn as Record<string, TrajectoryUsage>) ?? {},
          ),
        )
      })
      .catch(() => undefined)
    return () => ac.abort()
  }, [sessionId, value])
  return (
    <ChatPane
      embed
      thread={
        <ChatStage variant="pane">
          <ChatNodeList
            nodes={nodes}
            sessionId={sessionId}
            onInspect={() => undefined}
            onFork={() => undefined}
          />
        </ChatStage>
      }
    />
  )
}

export function sessionsChrome(): CollectionChrome {
  return {
    Title: SessionTitle,
    Icon: SessionIcon,
    Content: SessionRecordChat,
    cells: {
      mascotShape: MascotShapeCell,
      mascotColor: MascotColorCell,
      mascotEye: MascotEyeCell,
    },
  }
}

if (typeof document !== 'undefined') {
  const id = 'biu-sessions-chrome-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.sessions-title-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.fsdb-fileview:has(.chat-pane-embed){display:flex;flex-direction:column;flex:none;min-width:0;min-height:0;height:auto;width:100%;max-width:100%;background:var(--dsw-bg)}
.inspector-database-page .fsdb-fileview:has(.chat-pane-embed){min-height:0;flex:1}
.fsdb-detail-main:has(.chat-pane-embed),.fsdb-detail-screen:has(.chat-pane-embed){background:var(--dsw-bg)}
.fsdb-detail-main:has(.chat-pane-embed) .chat-pane-embed{padding-inline:0;min-width:0;min-height:0;width:100%;max-width:100%;box-sizing:border-box}
.fsdb-detail-main:has(.chat-pane-embed) .chat-pane-embed,.fsdb-detail-main:has(.chat-pane-embed) .chat-overlay-thread,.fsdb-detail-main:has(.chat-pane-embed) .chat-stage{overflow:visible;flex:none;min-width:0;min-height:0;height:auto;max-width:100%;overscroll-behavior:auto;align-items:stretch;scrollbar-gutter:auto}
.fsdb-detail-main:has(.chat-pane-embed) .chat-stage>*{max-width:100%;width:100%;min-width:0;box-sizing:border-box}
`
  document.head.appendChild(style)
}
