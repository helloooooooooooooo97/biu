import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { WrenchScrewdriverIcon, XMarkIcon } from '@heroicons/react/16/solid'
import {
  bindSessionView,
  type SessionViewService,
} from './index.ts'
import { ChatOutlineFilterFields } from './chat-outline-fields.tsx'

type ToolSourceId = 'minimal' | 'db' | 'plugin' | 'store'
type AgentMode = 'standard' | 'file' | 'minimal'
type ChatProvider = 'deepseek' | 'openai'

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
}

const fieldClass =
  'rounded-lg border border-(--dsw-border) bg-(--dsw-surface) px-2 py-1.5 text-[12px] text-(--dsw-label) outline-none'

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
  const [data, setData] = useState<InspectorPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [tagInput, setTagInput] = useState('')
  const titleFocusedRef = useRef(false)
  const promptFocusedRef = useRef(false)

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
      setError('')
    } catch (err) {
      setError(String(err))
    }
  }, [sessionId, open])

  // 打开时刷新一次，并在打开期间轮询保持同步
  useEffect(() => {
    if (!open) return
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [open, sessionId, refresh])

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
        className="biu-float max-h-[min(72vh,640px)] w-[min(560px,calc(100vw-32px))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="biu-float-head">
          <h2 className="biu-float-title">配置</h2>
          <button
            type="button"
            className="biu-float-close"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <XMarkIcon className="size-4 shrink-0" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div className="mb-2 rounded-lg bg-(color-mix(in_srgb,#c44_16%,transparent)) p-2 text-[11px] text-[#f08888]">
              {error}
            </div>
          ) : null}
          {!sessionId ? (
            <div className="text-[11px] leading-[1.45] text-(--dsw-label-3)">打开会话后可编辑配置。</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[11px] leading-[1.45] text-(--dsw-label-3)">
                名称、提示词和工具只作用于当前 session；未改的字段沿用全局默认。
              </p>

              <ChatOutlineFilterFields />

              <label className="flex flex-col gap-1 text-[11px] text-(--dsw-label-3)">
                <span>名称</span>
                <input
                  className={fieldClass}
                  value={titleDraft}
                  placeholder={defaults?.title || '未命名（用最近消息推导）'}
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
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-(--dsw-label-3)">
                <span>标签 · 侧栏可按标签分组</span>
                <div className="flex flex-wrap gap-1">
                  {(data?.config?.tags ?? []).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="rounded-full border border-(--dsw-border) px-2 py-0.5 text-[11px] text-(--dsw-label-2) hover:border-(--dsw-danger) hover:text-(--dsw-danger)"
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
                </div>
                <input
                  className={fieldClass}
                  value={tagInput}
                  placeholder="输入后回车添加"
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
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-(--dsw-label-3)">
                <span>系统提示词</span>
                <textarea
                  className={`${fieldClass} min-h-[88px] resize-y font-mono text-[11px] leading-[1.45]`}
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
              </label>

              <div className="flex flex-col gap-px">
                {sources.map((source) => (
                  <div key={source.id} className="rounded-lg px-2 py-1.5 hover:bg-(--dsw-hover)">
                    <div className="text-[11px] font-semibold text-(--dsw-label-2)">{source.label}</div>
                    <div className="mt-0.5 text-[11px] leading-[1.4] text-(--dsw-label-3)">
                      {source.description}
                    </div>
                  </div>
                ))}
              </div>

              <ul className="m-0 flex list-none flex-col gap-px p-0" data-testid="config-tools">
                {tools.map((tool) => (
                  <li
                    key={tool.name}
                    className={`relative box-border flex h-[30px] min-h-[30px] w-full items-center gap-2 rounded-lg border-0 px-2 py-[5px] text-[12px] font-medium leading-[1.2] transition-none hover:bg-(--dsw-hover) hover:text-(--dsw-label) ${
                      tool.active ? 'text-(--dsw-label)' : 'text-(--dsw-label-2)'
                    }`}
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
                      <span
                        className={`grid size-4 shrink-0 place-items-center ${
                          tool.active ? 'text-(--dsw-label)' : 'text-(--dsw-label-3)'
                        }`}
                        aria-hidden
                      >
                        <WrenchScrewdriverIcon className="size-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">{tool.name}</span>
                    <span className="shrink-0 text-[10px] font-medium text-(--dsw-label-3)">
                      {sources.find((item) => item.id === tool.source)?.label ?? tool.source}
                    </span>
                    <span
                      className={`ml-auto shrink-0 text-[10px] font-semibold ${
                        tool.active ? 'text-(--dsw-ok,#448361)' : 'text-(--dsw-label-3)'
                      }`}
                    >
                      {tool.active ? '可用' : '未开'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
