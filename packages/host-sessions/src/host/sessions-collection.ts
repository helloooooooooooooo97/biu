import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, normalizeSchemaValue } from '@biu/type-file-system'
import {
  isSessionCompactPoint,
  nameFromSessionMascot,
  type SessionConfig,
  type SessionEvent,
  type SessionSummary,
} from '@biu/type-session'
import { COMPACT_GUIDE, lastUsageBeforeCompact, retrieveHistory } from './session-compact.ts'
import { GROK_COLORS, GROK_SHAPES, ensureSessionMascot, isSessionMascot, mascotFromSessionId } from './session-mascot.ts'

type SessionRecordLike = {
  id: string
  events: SessionEvent[]
  config?: SessionConfig | null
  project?: { path?: string; name?: string } | null
}

type SessionsLike = {
  listSummaries: () => Promise<SessionSummary[]>
  rename: (id: string, title: string) => Promise<unknown>
  patchConfig: (id: string, patch: SessionConfig) => Promise<unknown>
  delete: (id: string) => Promise<boolean>
  create?: (opts?: { title?: string; config?: SessionConfig }) => Promise<{ id: string }>
  require?: (id: string) => Promise<SessionRecordLike>
  setProject?: (id: string, project: { path: string } | null) => Promise<unknown>
  isBusy?: (id: string) => boolean
  inboxPending?: (id: string) => number
}

function sessionCreatedAt(row: SessionSummary) {
  const fromConfig = Number(row.config?.createdAt)
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig
  const fromUpdated = Number(row.updatedAt)
  return Number.isFinite(fromUpdated) && fromUpdated > 0 ? fromUpdated : 0
}

function asRecord(row: SessionSummary): DbRecord {
  const mascot =
    row.mascot && isSessionMascot(row.mascot) ? ensureSessionMascot(row.id, row.mascot) : mascotFromSessionId(row.id)
  return {
    id: row.id,
    title: row.title,
    pinned: Boolean(row.config?.pinned),
    eventCount: row.eventCount,
    project: row.project?.name ?? '',
    projectPath: row.project?.path ?? '',
    model: row.config?.model ?? '',
    provider: row.config?.provider ?? '',
    systemPrompt: row.config?.systemPrompt ?? '',
    agentMode: row.config?.agentMode ?? '',
    extraTools: Array.isArray(row.config?.extraTools) ? row.config.extraTools.map(String) : [],
    autoCompactInputTokens: row.config?.autoCompactInputTokens ?? 0,
    mascot,
    mascotName: nameFromSessionMascot(mascot),
    mascotShape: mascot.shape,
    mascotColor: mascot.color,
    mascotEye: mascot.eye,
    ...recordBuiltinValues({
      createdAt: sessionCreatedAt(row),
      updatedAt: row.updatedAt,
      emoji: row.config?.emoji,
      tags: row.config?.tags,
      facet: row.config?.facet,
    }),
  }
}

function recentMessages(events: SessionEvent[], limit = 12) {
  const out: Array<{ role: string; text: string; kind?: string }> = []
  for (let i = events.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const event = events[i]!
    if (event.type === 'user/message') {
      out.push({ role: 'user', text: event.text, kind: event.kind })
    } else if (event.type === 'assistant/message' && event.text.trim()) {
      out.push({ role: 'assistant', text: event.text.slice(0, 800) })
    }
  }
  return out.reverse()
}

function sessionProgress(record: SessionRecordLike, opts: { afterSeq?: number; textLimit?: number; busy?: boolean; inboxPending?: number }) {
  const textLimit = Math.min(2000, Math.max(80, opts.textLimit ?? 600))
  const afterSeq = opts.afterSeq == null || !Number.isFinite(opts.afterSeq) ? undefined : opts.afterSeq
  let turn: number | null = null
  let step: number | null = null
  let reason: string | undefined
  let openTurn = false
  let lastTool: { name: string; ok?: boolean } | null = null
  let assistantText = ''
  for (const event of record.events) {
    const inDelta = afterSeq == null || event.seq > afterSeq
    if (event.type === 'turn/start') {
      turn = event.turn
      step = null
      reason = undefined
      openTurn = true
      assistantText = ''
    } else if (event.type === 'turn/end') {
      turn = event.turn
      reason = event.reason
      openTurn = false
      step = null
    } else if (event.type === 'step/start') {
      turn = event.turn
      step = event.step
      openTurn = true
    } else if (event.type === 'step/end') {
      turn = event.turn
      step = event.step
    } else if (event.type === 'tool/call' && inDelta) lastTool = { name: event.name }
    else if (event.type === 'tool/result' && inDelta) lastTool = { name: event.name, ok: event.ok }
    else if (event.type === 'assistant/message' && event.text.trim() && inDelta) assistantText = event.text
  }
  if (assistantText.length > textLimit) assistantText = `${assistantText.slice(0, textLimit)}…`
  const newest = record.events.at(-1)
  const busy = Boolean(opts.busy) || openTurn
  return {
    status: busy ? 'running' : 'idle',
    turn,
    step,
    ...(reason ? { reason } : {}),
    lastTool,
    assistantText,
    eventCount: record.events.length,
    newestSeq: newest?.seq ?? -1,
    updatedAt: newest?.ts ?? 0,
    inboxPending: opts.inboxPending ?? 0,
  }
}

export function sessionsCollection(sessions: SessionsLike): CollectionSpec {
  const list = async () => (await sessions.listSummaries()).map(asRecord)
  return {
    id: 'sessions',
    path: '/sessions',
    label: '会话',
    view: {
      moduleId: 'sessions-db',
      route: '/db-sessions',
      title: '会话',
      inspector: true,
      blurb: '这张表的每一行是一个会话，也就是一个代理（agent）。一个代理 = 一个 session，id 就是会话 id。用户说「再开一个 agent / 叫另一个代理去做」= 在本表 db_create 新建一行（caps.create 为真时），不要去建插件、不要去建任务。你自己也是其中一个会话。列表 db_list /sessions。改标题/置顶/标签/emoji/合集/模型/服务商/系统提示/模式/额外工具/自动压缩输入 token/项目路径：db_update /sessions/<id>。聊天记录不在这张表，不能用 db_update 写对话。删除 db_delete 进回收站（记录还在）；彻底删除用 purge=true 或 db_action /trash/sessions::<id> action=delete。本表动作（db_action path=/sessions/<会话id> action=…）：inspect=看这个代理的配置和最近几句对话（可选 args.limit）；progress=看它当前回合忙不忙、在用什么工具、刚说了什么（轮询时把上次返回的 newestSeq 当作 afterSeq）；status=看它上下文 token 用了多少；compact=压缩它的旧上下文（第一次不传 text 会返回该怎么写摘要，第二次把摘要放进 args.text）；clear=丢掉摘要、硬切压缩点；retrieve=按关键词找回被压缩的旧内容（必填 args.query）。',
      order: 18,
      icon: 'chat-bubble',
    },
    records: { update: true, create: Boolean(sessions.create), delete: true },
    schema: {
      labelField: 'title',
      contentField: 'events',
      contentBackend: 'computed',
      columns: ['title', 'pinned', 'tags', 'eventCount', 'project', 'updatedAt'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        events: { type: 'file', label: '对话', writable: false },
        title: { type: 'string', label: '标题', writable: true },
        pinned: { type: 'boolean', label: '置顶', writable: true },
        tags: { type: 'multi-select', label: '标签', writable: true },
        eventCount: { type: 'number', label: '事件数', computed: true, sortable: true },
        project: { type: 'string', label: '项目', computed: true },
        projectPath: { type: 'string', label: '项目路径', writable: true },
        model: { type: 'string', label: '模型', writable: true },
        provider: { type: 'select', label: '服务商', enum: ['deepseek', 'openai', 'anthropic'], writable: true },
        systemPrompt: { type: 'string', label: '系统提示', writable: true },
        agentMode: { type: 'select', label: '模式', enum: ['standard', 'file', 'minimal'], writable: true },
        extraTools: { type: 'multi-select', label: '额外工具', writable: true },
        autoCompactInputTokens: { type: 'number', label: '自动压缩输入 token', writable: true },
        updatedAt: { type: 'datetime', label: '更新时间', sortable: true },
        mascotName: { type: 'string', label: '形象', computed: true },
        mascotShape: { type: 'select', label: '外形', enum: [...GROK_SHAPES], computed: true },
        mascotColor: { type: 'select', label: '颜色', enum: [...GROK_COLORS], computed: true },
        mascotEye: { type: 'number', label: '眼睛', computed: true },
      },
    },
    list,
    get: async (id) => {
      const row = (await list()).find((item) => item.id === id) ?? null
      if (!row) return null
      if (!sessions.require) return row
      try {
        const full = await sessions.require(id)
        return { ...row, events: full.events }
      } catch {
        return row
      }
    },
    update: async (id, patch) => {
      if (typeof patch.title === 'string') await sessions.rename(id, patch.title)
      const config: SessionConfig = {}
      if (typeof patch.pinned === 'boolean') config.pinned = patch.pinned
      if (Array.isArray(patch.tags)) config.tags = patch.tags.map((item) => String(item))
      if ('emoji' in patch) config.emoji = String(patch.emoji ?? '')
      if ('facet' in patch) config.facet = normalizeSchemaValue(patch.facet)
      if (typeof patch.createdAt === 'number') config.createdAt = patch.createdAt
      if (typeof patch.model === 'string') config.model = patch.model
      if (patch.provider === 'deepseek' || patch.provider === 'openai' || patch.provider === 'anthropic') {
        config.provider = patch.provider
      }
      if (typeof patch.systemPrompt === 'string') config.systemPrompt = patch.systemPrompt
      if (patch.agentMode === 'minimal' || patch.agentMode === 'file') config.agentMode = patch.agentMode
      if (patch.agentMode === 'standard' || patch.agentMode === 'create') config.agentMode = 'standard'
      if (Array.isArray(patch.extraTools)) config.extraTools = patch.extraTools.map((item) => String(item))
      if ('autoCompactInputTokens' in patch) {
        const n = Number(patch.autoCompactInputTokens)
        config.autoCompactInputTokens = Number.isFinite(n) ? Math.floor(n) : 0
      }
      if (Object.keys(config).length) await sessions.patchConfig(id, config)
      if ('projectPath' in patch && sessions.setProject) {
        const path = String(patch.projectPath ?? '').trim()
        await sessions.setProject(id, path ? { path } : null)
      }
      const next = (await list()).find((row) => row.id === id)
      if (!next) throw new Error(`unknown session: ${id}`)
      return next
    },
    create: sessions.create
      ? async (rows) => {
          const out = []
          for (const fields of rows) {
            const rec = await sessions.create!({
              ...(typeof fields.title === 'string' ? { title: fields.title } : {}),
            })
            const next = (await list()).find((row) => row.id === rec.id)
            if (!next) throw new Error(`unknown session: ${rec.id}`)
            out.push(next)
          }
          return out
        }
      : undefined,
    remove: async (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        if (!(await sessions.delete(id))) throw new Error(`unknown session: ${id}`)
      }
      return ids
    },
    actions: [
      {
        id: 'inspect',
        label: '检查',
        for: 'agent',
        placement: [],
        description:
          '看这一个代理（这一行 session）的配置和最近几句对话。args.limit 默认 12、最大 40。要跟它当前回合用 progress。',
        parameters: {
          type: 'object',
          properties: { limit: { type: 'number', description: '最近消息条数，默认 12，最大 40' } },
        },
        run: async (id, _record, args) => {
          if (!sessions.require) throw new Error('session inspect unavailable')
          const record = await sessions.require(id)
          const limit = Math.min(40, Math.max(1, Number(args?.limit) || 12))
          return {
            id: record.id,
            status: sessions.isBusy?.(id) ? 'running' : 'idle',
            title: record.config?.title,
            config: record.config ?? null,
            project: record.project ?? null,
            tags: record.config?.tags ?? [],
            pinned: Boolean(record.config?.pinned),
            eventCount: record.events.length,
            recent: recentMessages(record.events, limit),
          }
        },
      },
      {
        id: 'progress',
        label: '进度',
        for: 'agent',
        placement: [],
        description:
          '看这一个代理当前回合：忙不忙、第几 turn、在用什么工具、刚说了什么。轮询时把上次 newestSeq 当作 afterSeq。',
        parameters: {
          type: 'object',
          properties: {
            afterSeq: { type: 'number', description: '只看该 seq 之后的工具/助手输出；轮询时用上次 newestSeq' },
            textLimit: { type: 'number', description: 'assistantText 字数上限，默认 600' },
          },
        },
        run: async (id, _record, args) => {
          if (!sessions.require) throw new Error('session progress unavailable')
          const record = await sessions.require(id)
          return {
            sessionId: record.id,
            ...sessionProgress(record, {
              afterSeq: args?.afterSeq == null ? undefined : Number(args.afterSeq),
              textLimit: args?.textLimit == null ? undefined : Number(args.textLimit),
              busy: sessions.isBusy?.(id),
              inboxPending: sessions.inboxPending?.(id),
            }),
          }
        },
      },
      {
        id: 'compact',
        label: '压缩上下文',
        for: 'agent',
        placement: [],
        description:
          '压缩这一个代理的旧上下文。第一次不要传 text，返回该怎么写摘要；再调用并把摘要放进 args.text。旧细节用 retrieve。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                '第 2 次调用必填。压缩摘要：当前位置/进度、关键决策、约束偏好、未完成事项。不传则只返回指南。',
            },
          },
        },
        run: async (id, _record, args) => {
          const text = String(args?.text ?? '').trim()
          if (!text) {
            return {
              kind: 'guide',
              note: '尚未压缩。按指南写摘要后，再 db_action action=compact 并传 args.text。',
              guide: COMPACT_GUIDE,
            }
          }
          if (!sessions.require) throw new Error('session compact unavailable')
          await sessions.require(id)
          return {
            ok: true,
            kind: 'compacted',
            sessionId: id,
            note: '已提交压缩点：本次 db_action 即新前缀。旧细节用 action=retrieve。',
          }
        },
      },
      {
        id: 'clear',
        label: '清空上下文',
        for: 'agent',
        placement: [],
        description:
          '丢掉这一个代理的摘要，硬切压缩点。比 compact 更狠。旧细节仍可用 retrieve。',
        run: async (id) => {
          if (!sessions.require) throw new Error('session clear unavailable')
          await sessions.require(id)
          return {
            ok: true,
            sessionId: id,
            note: '已清空上下文：本次 db_action 即压缩点，不保留摘要。旧细节用 action=retrieve。',
          }
        },
      },
      {
        id: 'retrieve',
        label: '检索历史',
        for: 'agent',
        placement: [],
        description:
          '按关键词从这一个代理被压缩的历史里找回片段。必填 args.query。只搜这一行 session，不是所有代理。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '关键词' },
            limit: { type: 'number', description: '最多几条，默认 5，最大 10' },
          },
          required: ['query'],
        },
        run: async (id, _record, args) => {
          if (!sessions.require) throw new Error('session retrieve unavailable')
          const query = String(args?.query ?? '')
          const limit = Math.min(10, Math.max(1, Number(args?.limit ?? 5) || 5))
          const hits = retrieveHistory((await sessions.require(id)).events, query, limit)
          if (hits.length === 0) {
            return { ok: true, hits: 0, sessionId: id, results: [], note: '未找到与查询相关的内容。' }
          }
          return {
            ok: true,
            hits: hits.length,
            sessionId: id,
            results: hits.map((item) => ({ kind: item.kind, ts: item.ts, excerpt: item.text.slice(0, 800) })),
          }
        },
      },
      {
        id: 'status',
        label: '上下文占用',
        for: 'agent',
        placement: [],
        description:
          '看这一个代理最近一次模型调用用了多少 token。超预算再 compact。',
        run: async (id) => {
          if (!sessions.require) throw new Error('session status unavailable')
          const events = (await sessions.require(id)).events
          const usage = lastUsageBeforeCompact(events)
          const tokens = usage.inputTokens
          const budget = Number(process.env.CTX_BUDGET ?? 1000000)
          const compacted = events.some((event) => isSessionCompactPoint(event))
          return {
            ok: true,
            sessionId: id,
            events: events.length,
            usage,
            budget,
            overBudget: tokens > budget,
            compactedAlready: compacted,
            note: !usage.found
              ? '当前会话暂无 LLM 调用 usage 数据。'
              : tokens > budget
                ? `最近一次输入上下文 ${tokens} token > 预算 ${budget}，已超界，建议按需压缩。`
                : `最近一次输入上下文 ${tokens} / ${budget} token，${budget - tokens} 余量，${tokens / budget > 0.8 ? '接近上限，可考虑尽早压缩' : '暂不紧迫'}`,
          }
        },
      },
    ],
  }
}
