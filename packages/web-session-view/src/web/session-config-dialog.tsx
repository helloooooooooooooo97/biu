import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import {
  bindSessionView,
  type SessionViewService,
} from './index.ts'
import { ChatOutlineFilterFields } from './chat-outline-fields.tsx'

type ToolSourceId = 'minimal' | 'db' | 'plugin' | 'store'
type AgentMode = 'standard' | 'file' | 'minimal'
type ChatProvider = 'deepseek' | 'openai'
type ConfigTab = 'general' | 'messages' | 'tools'

interface InspectorTool {
  name: string
  description: string
  source: ToolSourceId
  active: boolean
  configurable: boolean
}

interface InspectorSource {
  id: ToolSourceId
  label: string
  description: string
}

interface SessionConfigFields {
  title?: string
  provider?: ChatProvider
  model?: string
  systemPrompt?: string
  agentMode?: AgentMode
  extraTools?: string[]
  tags?: string[]
  pinned?: boolean
  autoCompactInputTokens?: number
}

interface InspectorPayload {
  sessionId: string
  title?: string | null
  agentMode: AgentMode
  extraTools: string[]
  defaults?: SessionConfigFields & { agentMode: AgentMode; extraTools: string[]; provider: ChatProvider; model: string; systemPrompt: string }
  config?: SessionConfigFields | null
  effective?: SessionConfigFields & { agentMode: AgentMode; extraTools: string[]; provider: ChatProvider; model: string; systemPrompt: string }
  sources: InspectorSource[]
  tools: InspectorTool[]
  contextWindow?: '200k' | '1m'
  contextWindowTokens?: number
}

const TABS: Array<{ id: ConfigTab; label: string; Icon: typeof Cog6ToothIcon }> = [
  { id: 'general', label: '常规', Icon: Cog6ToothIcon },
  { id: 'messages', label: '消息', Icon: ChatBubbleLeftRightIcon },
  { id: 'tools', label: '工具', Icon: WrenchScrewdriverIcon },
]

function PropertyRow({
  label,
  stack,
  children,
}: {
  label: string
  stack?: boolean
  children: ReactNode
}) {
  return (
    <div className={`session-config-row${stack ? ' is-stack' : ''}`}>
      <span className="session-config-k">{label}</span>
      <div className="session-config-v">{children}</div>
    </div>
  )
}

export type SessionConfigDialogProps = {
  open: boolean
  onClose: () => void
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
}

export const SessionConfigDialog = memo(function SessionConfigDialog({
  open,
  onClose,
  useSessionView,
  sessionView,
}: SessionConfigDialogProps) {
  const sessionId = useSessionView((state) => state.sessionId)
  const [tab, setTab] = useState<ConfigTab>('general')
  const [data, setData] = useState<InspectorPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [compactDraft, setCompactDraft] = useState('')
  const titleFocusedRef = useRef(false)
  const promptFocusedRef = useRef(false)
  const compactFocusedRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!sessionId || !open) return
    try {
      const res = await fetch(`/api/sessions/${sessionId}/inspector`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as InspectorPayload
      setData(body)
      if (!titleFocusedRef.current) setTitleDraft(body.config?.title ?? '')
      if (!promptFocusedRef.current) {
        setPromptDraft(
          typeof body.config?.systemPrompt === 'string'
            ? body.config.systemPrompt
            : (body.defaults?.systemPrompt ?? ''),
        )
      }
      if (!compactFocusedRef.current) {
        const cap = body.contextWindowTokens && body.contextWindowTokens > 0 ? body.contextWindowTokens : 200_000
        const tokens = body.config?.autoCompactInputTokens
        setCompactDraft(String(tokens && tokens > 0 ? Math.min(tokens, cap) : cap))
      }
      setError('')
    } catch (err) {
      setError(String(err))
    }
  }, [sessionId, open])

  useEffect(() => {
    if (!open) return
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [open, sessionId, refresh])

  useEffect(() => {
    if (!open) setTab('general')
  }, [open])

  async function patchSessionConfig(patch: Record<string, unknown>) {
    if (!sessionId) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/sessions/${sessionId}/config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`保存失败 HTTP ${res.status}`)
      await refresh()
      void sessionView.refreshSessions()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleExtra(name: string, checked: boolean) {
    const current = data?.effective?.extraTools ?? data?.extraTools ?? []
    const next = checked
      ? [...new Set([...current, name])]
      : current.filter((item) => item !== name)
    void patchSessionConfig({ extraTools: next, agentMode: 'minimal' })
  }

  if (!open) return null

  const defaults = data?.defaults
  const effective = data?.effective
  const sources = data?.sources ?? []
  const tools = data?.tools ?? []
  const paneTitle = TABS.find((item) => item.id === tab)?.label ?? '配置'

  return (
    <div
      className="biu-float-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="会话配置"
      data-testid="session-config-dialog"
    >
      <div
        className="biu-float settings-float session-config-float"
        onClick={(event) => event.stopPropagation()}
      >
        <nav className="settings-rail" aria-label="配置分类">
          <p className="settings-rail-title">会话</p>
          <ul className="settings-rail-list">
            {TABS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`settings-nav-btn${tab === item.id ? ' is-on' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <item.Icon className="size-4" aria-hidden />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-body">
          <button
            type="button"
            className="biu-float-close settings-body-close"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <XMarkIcon className="size-4 shrink-0" />
          </button>
          <div className="settings-pane">
            <h2 className="settings-pane-title">{paneTitle}</h2>
            <p className="settings-pane-lead settings-muted">
              只改当前会话。空着的字段沿用全局默认。
            </p>
            {error ? <p className="settings-mcp-error">{error}</p> : null}
            {!sessionId ? (
              <p className="settings-muted">打开会话后可编辑配置。</p>
            ) : tab === 'general' ? (
              <>
                <PropertyRow label="名称">
                  <input
                    className="session-config-input"
                    value={titleDraft}
                    placeholder={defaults?.title || '未命名'}
                    disabled={busy}
                    data-testid="config-session-title"
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onFocus={() => {
                      titleFocusedRef.current = true
                    }}
                    onBlur={() => {
                      titleFocusedRef.current = false
                      const next = titleDraft.trim()
                      const prev = data?.config?.title ?? ''
                      if (next === prev) return
                      void patchSessionConfig({ title: next || null })
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      ;(event.target as HTMLInputElement).blur()
                    }}
                  />
                </PropertyRow>
                <PropertyRow label="标签">
                  <div className="session-config-tags">
                    {(data?.config?.tags ?? []).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="session-config-tag"
                        title="移除标签"
                        disabled={busy}
                        onClick={() => {
                          const next = (data?.config?.tags ?? []).filter((item) => item !== tag)
                          void patchSessionConfig({ tags: next })
                        }}
                      >
                        {tag} ×
                      </button>
                    ))}
                    <input
                      className="session-config-input"
                      value={tagInput}
                      placeholder="回车添加"
                      disabled={busy}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ',') return
                        event.preventDefault()
                        const parts = tagInput.split(',').map((s) => s.trim()).filter(Boolean)
                        if (!parts.length) return
                        const next = [...new Set([...(data?.config?.tags ?? []), ...parts])]
                        setTagInput('')
                        void patchSessionConfig({ tags: next })
                      }}
                    />
                  </div>
                </PropertyRow>
                <PropertyRow label="系统提示" stack>
                  <textarea
                    className="session-config-textarea"
                    value={promptDraft}
                    disabled={busy}
                    data-testid="config-system-prompt"
                    onChange={(event) => setPromptDraft(event.target.value)}
                    onFocus={() => {
                      promptFocusedRef.current = true
                    }}
                    onBlur={() => {
                      promptFocusedRef.current = false
                      const prev =
                        typeof data?.config?.systemPrompt === 'string'
                          ? data.config.systemPrompt
                          : (defaults?.systemPrompt ?? '')
                      if (promptDraft === prev) return
                      void patchSessionConfig({ systemPrompt: promptDraft })
                    }}
                  />
                </PropertyRow>
                <PropertyRow label="自动压缩" stack>
                  <input
                    className="session-config-input"
                    inputMode="numeric"
                    value={compactDraft}
                    disabled={busy}
                    data-testid="config-auto-compact"
                    onChange={(event) => setCompactDraft(event.target.value.replace(/[^\d]/g, ''))}
                    onFocus={() => {
                      compactFocusedRef.current = true
                    }}
                    onBlur={() => {
                      compactFocusedRef.current = false
                      const cap = data?.contextWindowTokens && data.contextWindowTokens > 0 ? data.contextWindowTokens : 200_000
                      const raw = compactDraft.trim() ? Number(compactDraft) : cap
                      const next = Number.isFinite(raw) ? Math.min(Math.max(1, Math.floor(raw)), cap) : cap
                      setCompactDraft(String(next))
                      const prev = data?.config?.autoCompactInputTokens
                      if (prev === next) return
                      void patchSessionConfig({ autoCompactInputTokens: next })
                    }}
                  />
                  <span className="session-config-hint">
                    关不掉，只能改上限。当前模型上下文 {data?.contextWindowTokens ?? 200000} token。
                  </span>
                </PropertyRow>
              </>
            ) : tab === 'messages' ? (
              <ChatOutlineFilterFields />
            ) : (
              <>
                <p className="settings-muted" style={{ margin: '0 0 12px' }}>
                  {sources.map((source) => source.label).join(' · ')}
                </p>
                <ul className="m-0 flex list-none flex-col p-0" data-testid="config-tools">
                  {tools.map((tool) => (
                    <li
                      key={tool.name}
                      className={`session-config-tool${tool.active ? ' is-on' : ''}`}
                      data-tool={tool.name}
                      title={tool.description || tool.name}
                    >
                      {tool.configurable ? (
                        <input
                          type="checkbox"
                          className="m-0 size-3.5 shrink-0 accent-(--dsw-business)"
                          checked={(effective?.extraTools ?? data?.extraTools ?? []).includes(tool.name)}
                          disabled={busy}
                          aria-label={`启用 ${tool.name}`}
                          onChange={(event) => toggleExtra(tool.name, event.target.checked)}
                        />
                      ) : (
                        <WrenchScrewdriverIcon className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="session-config-tool-name">{tool.name}</span>
                      <span className="session-config-tool-meta">
                        {sources.find((item) => item.id === tool.source)?.label ?? tool.source}
                        {tool.active ? ' · 可用' : ' · 未开'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
