import { useSyncExternalStore } from 'react'
import { Service, type Context } from 'cordis'
import { startMascotDance } from '@biu/public-mascot'

export interface PluginRow {
  id: string
  name: string
  layer: string
  blurb: string
  inject: string[]
  togglable: boolean
  enabled: boolean
  state: string
  /** cordis.plugins.json 的 web 入口 */
  web?: string
  packageName?: string
}

export interface Snapshot {
  seq?: number
  plugins: PluginRow[]
  pages: Array<{ id: string; title: string; plugin: string }>
  routes: Array<{ method: string; pattern: string }>
  events: Array<{ ts: number; mode: string; name: string; args: unknown[] }>
  tools?: string[]
  services: string[]
  clockIso?: string
  lastSessionId?: string
  lastSessionEvent?: string
  /** File System 已登记表，启动时随 snapshot 一起到，导航不必再等一轮 /api/db/stat。 */
  collections?: Array<{
    id: string
    path: string
    kind?: string
    label: string
    view?: { moduleId?: string; route?: string; title?: string; blurb?: string; order?: number; icon?: string } | null
  }>
}

const empty: Snapshot = { seq: 0, plugins: [], pages: [], routes: [], events: [], services: [] }

export class SnapshotService extends Service {
  private value: Snapshot = empty
  private listeners = new Set<() => void>()
  private messageHandlers = new Map<string, Set<(payload: unknown) => void>>()

  constructor(ctx: Context) {
    super(ctx, 'snapshot')
    void this.boot()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.value

  /**
   * 订阅某类 WS 推送消息（如 'tasks'、'session'、'agent'……）。
   * 供其他插件（如 core-task-system）注册自己的业务处理器，避免在 snapshot 总线里硬编码各业务分支。
   * 返回取消订阅函数。
   */
  onMessage = (type: string, handler: (payload: unknown) => void) => {
    let set = this.messageHandlers.get(type)
    if (!set) {
      set = new Set()
      this.messageHandlers.set(type, set)
    }
    set.add(handler)
    return () => {
      set?.delete(handler)
    }
  }

  private dispatch(type: string, payload: unknown) {
    const handlers = this.messageHandlers.get(type)
    if (!handlers) return
    for (const fn of handlers) {
      try {
        fn(payload)
      } catch {
        /* 单个处理器异常不影响总线 */
      }
    }
  }

  async setEnabled(id: string, enabled: boolean) {
    const res = await fetch(`/api/plugins/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    this.replace(await res.json())
  }

  private replace(next: Partial<Snapshot>) {
    if (typeof next.seq === 'number' && typeof this.value.seq === 'number' && next.seq < this.value.seq) return
    this.value = { ...this.value, ...next }
    for (const fn of this.listeners) fn()
  }

  private async pull() {
    try {
      const res = await fetch('/api/snapshot')
      if (res.ok) this.replace(await res.json())
    } catch {
      /* 无 host 时控制台为空 */
    }
  }

  private async boot() {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('/api/snapshot')
        if (res.ok) {
          this.replace(await res.json())
          break
        }
      } catch {
        /* host 尚未就绪 */
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    this.connect()
  }

  private connect() {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const workspaceId = sessionStorage.getItem('biu.workspaceId') ?? ''
      const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
      const ws = new WebSocket(`${proto}://${location.host}/ws${query}`)
      ws.onopen = () => {
        void this.pull()
      }
      ws.onmessage = (message) => {
        const parsed = JSON.parse(message.data) as { type: string; payload: unknown }
        if (parsed.type === 'snapshot') this.replace(parsed.payload as Snapshot)
        if (parsed.type === 'plugins/changed') void this.pull()
        if (parsed.type === 'event') {
          this.replace({
            events: [parsed.payload as Snapshot['events'][number], ...this.value.events].slice(0, 80),
          })
        }
        if (parsed.type === 'clock') this.replace({ clockIso: (parsed.payload as { iso: string }).iso })
        if (parsed.type === 'mascot') {
          const payload = parsed.payload as
            | { action?: string; durationMs?: number; shape?: import('@biu/public-mascot').MascotDanceShape }
            | undefined
          if (payload?.action === 'dance') {
            startMascotDance(payload.durationMs, payload.shape)
          }
        }
        if (parsed.type === 'session') {
          const detail = parsed.payload as { sessionId?: string; event?: SessionEventLike }
          if (detail.sessionId && detail.event && typeof detail.event.seq === 'number') {
            // chunk 不写 snapshot 元数据，避免 Settings 里订阅整表 snapshot 的组件跟着抖
            if (detail.event.type !== 'assistant/chunk') {
              this.replace({ lastSessionId: detail.sessionId, lastSessionEvent: detail.event.type })
            }
            const view = this.ctx.get('sessionView') as
              | { ingest: (sessionId: string, event: SessionEventLike) => void }
              | undefined
            view?.ingest(detail.sessionId, detail.event)
          }
        }
        if (parsed.type === 'approval') {
          const item = parsed.payload as { id: string; name: string; args: Record<string, unknown> }
          const view = this.ctx.get('sessionView') as
            | { upsertApproval: (item: { id: string; name: string; args: Record<string, unknown> }) => void }
            | undefined
          view?.upsertApproval(item)
        }
        if (parsed.type === 'agent') {
          const status = parsed.payload as {
            sessionId?: string
            status: 'idle' | 'running'
            step?: number
          }
          const view = this.ctx.get('sessionView') as
            | {
                setAgentStatus: (
                  status: 'idle' | 'running',
                  step?: number,
                  sessionId?: string,
                ) => void
              }
            | undefined
          view?.setAgentStatus(status.status, status.step, status.sessionId)
        }
        if (parsed.type === 'inbox') {
          const detail = parsed.payload as {
            sessionId?: string
            inbox?: Array<{ id: string; kind: 'wake' | 'inject'; text: string }>
          }
          const view = this.ctx.get('sessionView') as
            | {
                setInbox: (
                  inbox: Array<{ id: string; kind: 'wake' | 'inject'; text: string }>,
                  sessionId?: string,
                ) => void
              }
            | undefined
          if (detail.sessionId && Array.isArray(detail.inbox)) {
            view?.setInbox(detail.inbox, detail.sessionId)
          }
        }
        // 通用总线：把消息转发给外部通过 onMessage 注册的处理器（如 core-task-system 的 tasks/view-switch）
        this.dispatch(parsed.type, parsed.payload)
      }
      ws.onclose = () => {
        if (import.meta.env.MODE === 'test') return
        setTimeout(() => this.connect(), 1200)
      }
    } catch {
      /* jsdom 无 WebSocket 实现时跳过 */
    }
  }
}

type SessionEventLike = { type: string; seq: number; ts: number; [key: string]: unknown }

export function bindSnapshot(source: SnapshotService) {
  return function useSnapshot<S>(sel: (state: Snapshot) => S): S {
    return useSyncExternalStore(source.subscribe, () => sel(source.get()), () => sel(source.get()))
  }
}

export const name = 'snapshot'
export const inject = [] as const

export function apply(ctx: Context) {
  new SnapshotService(ctx)
}