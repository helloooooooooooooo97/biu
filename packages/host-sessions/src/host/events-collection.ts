import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import type { SessionEvent } from '@biu/type-session'
import { projectTrajectoryRows } from './trajectory-index.ts'

type SessionRecordLike = {
  id: string
  events: SessionEvent[]
  config?: { ownerMemberId?: string }
}

type SessionsLike = {
  listSummaries: () => Promise<Array<{ id: string }>>
  require: (id: string) => Promise<SessionRecordLike>
}

export function eventRecordId(sessionId: string, seq: number) {
  return `${sessionId}:${seq}`
}

export function parseEventRecordId(id: string) {
  const cut = id.lastIndexOf(':')
  if (cut <= 0) return null
  const sessionId = id.slice(0, cut)
  const seq = Number(id.slice(cut + 1))
  if (!sessionId || !Number.isFinite(seq)) return null
  return { sessionId, seq }
}

function asRecord(
  sessionId: string,
  event: SessionEvent,
  summary: string,
  turn: number | null,
  step: number | null,
  ownerMemberId = '',
): DbRecord {
  return {
    id: eventRecordId(sessionId, event.seq),
    title: summary,
    sessionId,
    seq: event.seq,
    type: event.type,
    turn,
    step,
    ts: event.ts,
    ownerMemberId,
    ...recordBuiltinValues({ createdAt: event.ts, updatedAt: event.ts }),
  }
}

function ownerOf(record: SessionRecordLike) {
  return String(record.config?.ownerMemberId ?? '').trim()
}

export function eventsCollection(sessions: SessionsLike): CollectionSpec {
  const list = async (query?: { ids?: string[]; filter?: Record<string, unknown> }) => {
    const sessionFilter = String(query?.filter?.sessionId ?? '').trim()
    const summaries = await sessions.listSummaries()
    const wanted = sessionFilter ? summaries.filter((item) => item.id === sessionFilter) : summaries
    const out: DbRecord[] = []
    for (const item of wanted) {
      const record = await sessions.require(item.id)
      const rows = projectTrajectoryRows(record.events)
      const bySeq = new Map(record.events.map((event) => [event.seq, event]))
      for (const row of rows) {
        const event = bySeq.get(row.seq)
        if (!event) continue
        out.push(asRecord(record.id, event, row.summary, row.turn, row.step, ownerOf(record)))
      }
    }
    return out
  }
  return {
    id: 'events',
    path: '/events',
    label: '事件',
    view: {
      moduleId: 'events-db',
      route: '/db-events',
      title: '事件',
      inspector: false,
      blurb: '会话时间线日志。每一行是某会话里的一条 seq。列表 db_list /events（可用 filter.sessionId 只看一个会话，q 搜 type/摘要）。只读，没有 db_action。',
      order: 19,
      icon: 'bolt',
    },
    records: { update: false, create: false, delete: false },
    schema: {
      labelField: 'title',
      columns: ['title', 'sessionId', 'type', 'seq', 'ts'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '摘要' },
        sessionId: { type: 'string', label: '会话' },
        type: { type: 'string', label: '类型' },
        seq: { type: 'number', label: '序号', sortable: true },
        turn: { type: 'number', label: '回合' },
        step: { type: 'number', label: '步骤' },
        ts: { type: 'datetime', label: '时间', sortable: true },
      },
    },
    list,
    get: async (id) => {
      const parsed = parseEventRecordId(id)
      if (!parsed) return null
      try {
        const record = await sessions.require(parsed.sessionId)
        const event = record.events.find((item) => item.seq === parsed.seq)
        if (!event) return null
        const row = projectTrajectoryRows(record.events.filter((item) => item.seq === parsed.seq))[0]
        return asRecord(record.id, event, row?.summary ?? event.type, row?.turn ?? null, row?.step ?? null, ownerOf(record))
      } catch {
        return null
      }
    },
  }
}
