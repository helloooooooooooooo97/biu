/**
 * Models 设置 UI（对齐 LobeChat / Open WebUI）
 *
 * 交互：
 * 1. 左侧选 Provider（官方置顶；已接入的第三方；+ 添加）
 * 2. 右侧只编辑当前 Provider：Key / Base URL / 模型列表 / 设为默认
 * 3. 一处保存，不再拆成三块互相抢焦点
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon, ArrowPathIcon, PlusIcon, MagnifyingGlassIcon, SignalSlashIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'

type ChatProvider = 'deepseek' | 'openai' | 'anthropic'

interface ModelDef {
  id: string
  label: string
  provider: ChatProvider
  endpointId: string
  model: string
  note?: string
  builtin?: boolean
}

interface EndpointView {
  id: string
  label: string
  group: string
  protocol: string
  provider: ChatProvider
  baseUrl: string
  defaultBaseUrl: string
  configured: boolean
  hint: string
  placeholder: string
  note?: string
  builtin: boolean
}

interface ProviderView {
  label: string
  configured: boolean
  hint: string
}

interface ChatPublicConfig {
  endpointId?: string
  provider: ChatProvider
  model: string
  configured: boolean
  hint: string
  baseUrl?: string
  providers?: Record<string, ProviderView>
  endpoints?: EndpointView[]
  modelCatalog?: ModelDef[]
}

const OFFICIAL_IDS = ['deepseek', 'anthropic', 'openai'] as const
type OfficialId = (typeof OFFICIAL_IDS)[number]

const OFFICIAL_META: Record<OfficialId, { label: string; placeholder: string }> = {
  deepseek: { label: 'DeepSeek', placeholder: 'sk-…' },
  anthropic: { label: 'Claude', placeholder: 'sk-ant-…' },
  openai: { label: 'OpenAI', placeholder: 'sk-…' },
}

function isOfficial(id: string): id is OfficialId {
  return (OFFICIAL_IDS as readonly string[]).includes(id)
}

const inputCls = [
  'w-full rounded-lg px-2.5 py-[7px] text-[13px] text-(--dsw-label)',
  'border border-(--dsw-border) bg-(--dsw-input) outline-none',
  'placeholder:text-(--dsw-placeholder) focus:border-(--dsw-business)',
].join(' ')

export function ChatConfig(props?: { onClose?: () => void }) {
  const [activeId, setActiveId] = useState('deepseek')
  const [defaultEndpointId, setDefaultEndpointId] = useState('deepseek')
  const [defaultModel, setDefaultModel] = useState('deepseek-v4-flash')
  const [endpoints, setEndpoints] = useState<EndpointView[]>([])
  const [modelCatalog, setModelCatalog] = useState<ModelDef[]>([])
  const [providers, setProviders] = useState<Record<string, ProviderView> | null>(null)

  const [keyDraft, setKeyDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testHint, setTestHint] = useState('')

  const [adding, setAdding] = useState(false)
  const [presetId, setPresetId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newProtocol, setNewProtocol] = useState<'openai-compat' | 'anthropic'>('openai-compat')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerInputRef = useRef<HTMLInputElement>(null)

  const active = endpoints.find((e) => e.id === activeId)
  const activeModels = useMemo(
    () => modelCatalog.filter((m) => m.endpointId === activeId),
    [modelCatalog, activeId],
  )
  const isDefaultProvider = defaultEndpointId === activeId
  const configured = active?.configured ?? providers?.[activeId]?.configured ?? false

  const officialList = useMemo(() => {
    return OFFICIAL_IDS.map((id) => {
      const found = endpoints.find((e) => e.id === id)
      if (found) return found
      return {
        id,
        label: OFFICIAL_META[id].label,
        group: 'official',
        protocol: id === 'anthropic' ? 'anthropic' : 'openai-compat',
        provider: id,
        baseUrl: '',
        defaultBaseUrl: '',
        configured: Boolean(providers?.[id]?.configured),
        hint: providers?.[id]?.hint ?? '',
        placeholder: OFFICIAL_META[id].placeholder,
        note: '官方',
        builtin: true,
      } satisfies EndpointView
    })
  }, [endpoints, providers])

  /** 已接入的第三方：配过 Key，或自定义，或当前默认 */
  const connectedThird = useMemo(
    () =>
      endpoints.filter(
        (e) =>
          !isOfficial(e.id) &&
          (e.configured || e.group === 'custom' || e.id === defaultEndpointId || e.id === activeId),
      ),
    [endpoints, defaultEndpointId, activeId],
  )

  const presets = useMemo(
    () =>
      endpoints.filter(
        (e) =>
          !isOfficial(e.id) &&
          !connectedThird.some((c) => c.id === e.id) &&
          (e.group === 'relay' || e.group === 'local' || e.group === 'official'),
      ),
    [endpoints, connectedThird],
  )

  const selectedPreset = useMemo(
    () => (presetId ? presets.find((e) => e.id === presetId) ?? endpoints.find((e) => e.id === presetId) : null),
    [presetId, presets, endpoints],
  )

  const filteredPresets = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return presets
    return presets.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q) ||
        (e.defaultBaseUrl || e.baseUrl || '').toLowerCase().includes(q),
    )
  }, [presets, pickerQuery])

  const presetGroups = useMemo(() => {
    const order = ['relay', 'local', 'official', 'custom'] as const
    const labels: Record<string, string> = {
      relay: '中转站',
      local: '本地',
      official: '厂商',
      custom: '其它',
    }
    const map = new Map<string, EndpointView[]>()
    for (const ep of filteredPresets) {
      const g = ep.group || 'custom'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(ep)
    }
    return order
      .filter((g) => map.has(g))
      .map((g) => ({ id: g, label: labels[g] || g, items: map.get(g)! }))
  }, [filteredPresets])

  const canCreateFromQuery = useMemo(() => {
    const q = pickerQuery.trim()
    if (!q) return false
    const exact = presets.some((e) => e.label.toLowerCase() === q.toLowerCase() || e.id === q)
    return !exact
  }, [pickerQuery, presets])

  function resetAddForm() {
    setPresetId('')
    setNewLabel('')
    setNewUrl('')
    setNewKey('')
    setNewProtocol('openai-compat')
    setPickerQuery('')
    setPickerOpen(false)
  }

  function pickPreset(ep: EndpointView) {
    setPresetId(ep.id)
    setNewLabel('')
    setNewUrl(ep.defaultBaseUrl || ep.baseUrl || '')
    setPickerQuery('')
    setPickerOpen(false)
    setError('')
  }

  function createCustom(name: string) {
    const label = name.trim()
    if (!label) return
    setPresetId('')
    setNewLabel(label)
    setNewUrl('')
    setPickerQuery('')
    setPickerOpen(false)
    setError('')
  }

  function clearConnectionPick() {
    setPresetId('')
    setNewLabel('')
    setNewUrl('')
    setPickerQuery('')
    setPickerOpen(true)
    requestAnimationFrame(() => pickerInputRef.current?.focus())
  }

  function applyPublic(data: ChatPublicConfig, preferActive?: string) {
    const eps = Array.isArray(data.endpoints) ? data.endpoints : []
    setEndpoints(eps)
    const cats = Array.isArray(data.modelCatalog) ? data.modelCatalog : []
    setModelCatalog(cats)
    if (data.providers) setProviders(data.providers)

    const eid = preferActive || data.endpointId || data.provider || 'deepseek'
    setDefaultEndpointId(data.endpointId || data.provider || eid)
    setDefaultModel(data.model)
    setActiveId(eid)

    const ep = eps.find((e) => e.id === eid)
    setUrlDraft(ep?.baseUrl ?? data.baseUrl ?? '')
    setKeyDraft('')
    // 通知 Composer 等刷新模型目录
    window.dispatchEvent(new CustomEvent('biu:chat-config-changed'))
  }

  function selectProvider(id: string) {
    setActiveId(id)
    setAdding(false)
    setError('')
    setStatus('')
    setTestHint('')
    setKeyDraft('')
    setNewModelName('')
    const ep = endpoints.find((e) => e.id === id)
    setUrlDraft(ep?.baseUrl ?? '')
  }

  useEffect(() => {
    void fetch('/api/chat/config')
      .then((res) => res.json())
      .then((data: ChatPublicConfig) => applyPublic(data))
      .catch(() => setError('加载配置失败'))
  }, [])

  async function saveCurrent(opts?: { makeDefault?: boolean; model?: string }) {
    if (!active) return
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const body: Record<string, unknown> = {}
      const nextModel = opts?.model ?? (isDefaultProvider ? defaultModel : activeModels[0]?.model)
      if (opts?.makeDefault || isDefaultProvider) {
        body.endpointId = activeId
        if (nextModel) body.model = nextModel
      }
      if (keyDraft.trim()) body.setApiKey = { [activeId]: keyDraft.trim() }
      if (!isOfficial(activeId)) {
        const base = urlDraft.trim()
        if (base && base !== active.defaultBaseUrl) body.setBaseUrl = { [activeId]: base }
        else if (base === active.defaultBaseUrl && active.baseUrl !== active.defaultBaseUrl) {
          body.setBaseUrl = { [activeId]: null }
        }
      }
      // 至少要有可写内容，或设为默认
      if (
        !body.endpointId &&
        !body.setApiKey &&
        !body.setBaseUrl &&
        !opts?.makeDefault
      ) {
        // 仅切换默认模型（当前已是默认入口）
        if (isDefaultProvider && opts?.model) {
          body.endpointId = activeId
          body.model = opts.model
        } else {
          setStatus('没有需要保存的更改')
          return
        }
      }

      const res = await fetch('/api/chat/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError(`保存失败：HTTP ${res.status}`)
        return
      }
      applyPublic((await res.json()) as ChatPublicConfig, activeId)
      setStatus(opts?.makeDefault ? '已设为默认并保存' : '已保存')
    } finally {
      setSaving(false)
    }
  }

  async function pickDefaultModel(m: ModelDef) {
    setDefaultModel(m.model)
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        endpointId: activeId,
        model: m.model,
      }
      if (keyDraft.trim()) body.setApiKey = { [activeId]: keyDraft.trim() }
      if (!isOfficial(activeId) && urlDraft.trim()) {
        body.setBaseUrl = { [activeId]: urlDraft.trim() }
      }
      const res = await fetch('/api/chat/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError(`保存失败：HTTP ${res.status}`)
        return
      }
      applyPublic((await res.json()) as ChatPublicConfig, activeId)
      setStatus(`默认模型：${m.label}`)
    } finally {
      setSaving(false)
    }
  }

  async function onTestConnection() {
    if (!active || testing) return
    setTesting(true)
    setTestHint('')
    setError('')
    try {
      const res = await fetch('/api/chat/config/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpointId: activeId,
          ...(keyDraft.trim() ? { apiKey: keyDraft.trim() } : {}),
          ...(!isOfficial(activeId) && urlDraft.trim() ? { baseUrl: urlDraft.trim() } : {}),
          ...(isDefaultProvider && defaultModel ? { model: defaultModel } : {}),
          ...(!isDefaultProvider && activeModels[0]?.model ? { model: activeModels[0].model } : {}),
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        detail?: string
        latencyMs?: number
        config?: ChatPublicConfig
      }
      // 失败：服务端拉黑入口（绿点变灰、下拉不可选）；成功：解除拉黑并可写入草稿 Key
      if (data.config) applyPublic(data.config, activeId)
      if (data.ok) {
        setKeyDraft('')
        setTestHint(data.detail || '连接成功')
        setStatus('连接正常')
      } else {
        setTestHint('')
        setError(data.detail || `连接失败（HTTP ${res.status}）· 已从可选模型中移除`)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setTesting(false)
    }
  }

  async function onAddModel() {
    const name = newModelName.trim()
    if (!name) {
      setError('请填写模型 ID')
      return
    }
    setError('')
    const res = await fetch('/api/chat/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addModel: { endpointId: activeId, model: name, label: name } }),
    })
    if (!res.ok) {
      setError(`添加失败：HTTP ${res.status}`)
      return
    }
    applyPublic((await res.json()) as ChatPublicConfig, activeId)
    setNewModelName('')
    setStatus(`已添加 ${name}`)
  }

  async function onRemoveModel(id: string) {
    const res = await fetch('/api/chat/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ removeCustomModel: id }),
    })
    if (!res.ok) {
      setError(`删除模型失败：HTTP ${res.status}`)
      return
    }
    applyPublic((await res.json()) as ChatPublicConfig, activeId)
    setStatus('已删除模型')
  }

  async function onAddConnection() {
    const fromPreset = presetId ? endpoints.find((e) => e.id === presetId) : null
    const label = newLabel.trim() || fromPreset?.label || ''
    const baseUrl = newUrl.trim() || fromPreset?.defaultBaseUrl || fromPreset?.baseUrl || ''
    if (!label || !baseUrl) {
      setError('请选择预设或填写名称与 Base URL')
      return
    }
    setError('')

    if (fromPreset && !newLabel.trim()) {
      const body: Record<string, unknown> = { endpointId: fromPreset.id }
      if (newKey.trim()) body.setApiKey = { [fromPreset.id]: newKey.trim() }
      else if (fromPreset.group === 'local') body.setApiKey = { [fromPreset.id]: 'local' }
      if (newUrl.trim() && newUrl.trim() !== fromPreset.defaultBaseUrl) {
        body.setBaseUrl = { [fromPreset.id]: newUrl.trim() }
      }
      const first = modelCatalog.find((m) => m.endpointId === fromPreset.id)
      if (first) body.model = first.model
      const res = await fetch('/api/chat/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError(`接入失败：HTTP ${res.status}`)
        return
      }
      applyPublic((await res.json()) as ChatPublicConfig, fromPreset.id)
    } else {
      const res = await fetch('/api/chat/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          addEndpoint: { label, baseUrl, protocol: newProtocol },
        }),
      })
      if (!res.ok) {
        setError(`添加失败：HTTP ${res.status}`)
        return
      }
      let data = (await res.json()) as ChatPublicConfig
      const newId = data.endpointId
      if (newKey.trim() && newId) {
        const res2 = await fetch('/api/chat/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ setApiKey: { [newId]: newKey.trim() }, endpointId: newId }),
        })
        if (res2.ok) data = (await res2.json()) as ChatPublicConfig
      }
      applyPublic(data, newId)
    }

    setAdding(false)
    resetAddForm()
    setStatus('已接入')
  }

  async function onRemoveConnection(id: string) {
    if (isOfficial(id)) return
    setError('')
    const res = await fetch('/api/chat/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ removeCustomEndpoint: id }),
    })
    if (!res.ok) {
      setError(`删除失败：HTTP ${res.status}`)
      return
    }
    applyPublic((await res.json()) as ChatPublicConfig, 'deepseek')
    setAdding(false)
    setStatus('已删除连接')
  }

  /** 凡能「添加」进列表的第三方连接，都可删除（含预设接入与自定义）。 */
  function canRemoveConnection(ep: EndpointView | undefined): boolean {
    return Boolean(ep && !isOfficial(ep.id))
  }

  function providerRow(ep: EndpointView, opts?: { removable?: boolean }) {
    const activeRow = ep.id === activeId && !adding
    const isDef = ep.id === defaultEndpointId
    const ok = ep.configured || providers?.[ep.id]?.configured
    const removable = opts?.removable ?? canRemoveConnection(ep)
    return (
      <div
        key={ep.id}
        className={`group flex w-full items-center gap-0.5 pr-1 ${
          activeRow
            ? 'bg-(--dsw-business-soft) text-(--dsw-business)'
            : 'text-(--dsw-label) hover:bg-(--dsw-hover)'
        }`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-[8px] text-left text-[12px] transition-colors"
          onClick={() => selectProvider(ep.id)}
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              ok ? 'bg-(--dsw-ok)' : 'bg-(--dsw-label-3) opacity-35'
            }`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{ep.label}</span>
          {isDef ? (
            <span className="shrink-0 text-[9px] font-semibold tracking-wide opacity-70">默认</span>
          ) : null}
          {activeRow && !removable ? <CheckIcon className="size-3 shrink-0 opacity-80" /> : null}
        </button>
        {removable ? (
          <button
            type="button"
            className={`grid size-7 shrink-0 place-items-center rounded-md text-(--dsw-label-3) transition-opacity hover:bg-(--dsw-hover) hover:text-(--dsw-danger,#b42318) ${
              activeRow ? 'opacity-100' : 'opacity-50 group-hover:opacity-100 focus:opacity-100'
            }`}
            title="删除连接"
            aria-label={`删除 ${ep.label}`}
            onClick={(e) => {
              e.stopPropagation()
              void onRemoveConnection(ep.id)
            }}
          >
            <TrashGlyph className="size-3" />
          </button>
        ) : null}
      </div>
    )
  }

  const asDialog = Boolean(props?.onClose)

  return (
    <div
      className={
        asDialog
          ? 'biu-float h-[min(72vh,640px)] w-[min(720px,calc(100vw-32px))]'
          : 'flex h-full min-h-[460px] flex-col overflow-hidden rounded-xl border border-(--dsw-border)'
      }
      data-testid="assistant-config"
      role={asDialog ? 'dialog' : undefined}
      aria-modal={asDialog ? true : undefined}
      aria-label={asDialog ? '模型配置' : undefined}
      onClick={asDialog ? (e) => e.stopPropagation() : undefined}
    >
      <div className="biu-float-head">
        <h2 className="biu-float-title">模型配置</h2>
        {asDialog ? (
          <button
            type="button"
            className="biu-float-close"
            title="关闭"
            aria-label="关闭"
            onClick={props?.onClose}
          >
            <XMarkIcon className="size-4 shrink-0" />
          </button>
        ) : (
          <span className="text-[11px] text-(--dsw-label-3)">官方 Key / 第三方 URL</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 左：Provider 列表 */}
        <aside className="flex w-[200px] shrink-0 flex-col border-r border-(--dsw-float-border)">
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-(--dsw-label-3) uppercase">
              官方
            </div>
            {officialList.map((ep) => providerRow(ep, { removable: false }))}

            {connectedThird.length > 0 ? (
              <>
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wide text-(--dsw-label-3) uppercase">
                  第三方
                </div>
                {connectedThird.map((ep) => providerRow(ep, { removable: true }))}
              </>
            ) : null}
          </div>

          <div className="border-t border-(--dsw-border) p-2">
            <button
              type="button"
              className={`flex w-full items-center justify-center gap-1 rounded-lg px-2.5 py-[7px] text-[12px] font-medium transition-colors ${
                adding
                  ? 'bg-(--dsw-business-soft) text-(--dsw-business)'
                  : 'text-(--dsw-label-2) hover:bg-(--dsw-hover) hover:text-(--dsw-label)'
              }`}
              onClick={() => {
                setAdding(true)
                resetAddForm()
                setError('')
                setStatus('')
                setPickerOpen(true)
                requestAnimationFrame(() => pickerInputRef.current?.focus())
              }}
            >
              <PlusIcon className="size-3.5" />
              添加连接
            </button>
          </div>
        </aside>

        {/* 右：详情 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {adding ? (
            <>
              <div className="border-b border-(--dsw-border) px-4 py-3">
                <h3 className="text-[14px] font-semibold text-(--dsw-label)">添加连接</h3>
                <p className="mt-0.5 text-[11px] text-(--dsw-label-3)">
                  搜索预设，或输入名称创建自定义连接
                </p>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
                {/* Notion 风格属性行：连接选择 */}
                <div className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-(--dsw-hover)">
                  <div className="w-18 shrink-0 pt-[7px] text-[12px] text-(--dsw-label-3)">连接</div>
                  <div className="relative min-w-0 flex-1" ref={pickerRef}>
                    {!pickerOpen && (selectedPreset || newLabel.trim()) ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-[6px] text-left transition-colors hover:border-(--dsw-border) hover:bg-(--dsw-muted-fill)"
                        onClick={() => {
                          setPickerOpen(true)
                          setPickerQuery(selectedPreset?.label || newLabel || '')
                          requestAnimationFrame(() => {
                            pickerInputRef.current?.focus()
                            pickerInputRef.current?.select()
                          })
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-(--dsw-label)">
                          {selectedPreset ? selectedPreset.label : newLabel.trim()}
                        </span>
                        {!selectedPreset ? (
                          <span className="shrink-0 rounded-sm bg-(--dsw-muted-fill) px-1.5 py-0.5 text-[10px] text-(--dsw-label-3)">
                            自定义
                          </span>
                        ) : null}
                        <span
                          role="button"
                          tabIndex={0}
                          className="grid size-5 shrink-0 place-items-center rounded-sm text-(--dsw-label-3) hover:bg-(--dsw-hover-strong) hover:text-(--dsw-label)"
                          aria-label="清除"
                          onClick={(e) => {
                            e.stopPropagation()
                            clearConnectionPick()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              clearConnectionPick()
                            }
                          }}
                        >
                          <XMarkIcon className="size-3" />
                        </span>
                      </button>
                    ) : (
                      <div
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-[5px] transition-colors ${
                          pickerOpen
                            ? 'border-(--dsw-label-3) bg-(--dsw-input) shadow-[0_0_0_1px_var(--dsw-border)]'
                            : 'border-(--dsw-border) bg-(--dsw-input) hover:border-(--dsw-label-3)'
                        }`}
                      >
                        <MagnifyingGlassIcon className="size-3.5 shrink-0 text-(--dsw-label-3)" />
                        <input
                          ref={pickerInputRef}
                          className="min-w-0 flex-1 bg-transparent text-[13px] text-(--dsw-label) outline-none placeholder:text-(--dsw-placeholder)"
                          placeholder="搜索或创建连接…"
                          value={pickerQuery}
                          onChange={(e) => {
                            setPickerQuery(e.target.value)
                            setPickerOpen(true)
                          }}
                          onFocus={() => setPickerOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (filteredPresets.length === 1) {
                                pickPreset(filteredPresets[0]!)
                              } else if (canCreateFromQuery) {
                                createCustom(pickerQuery)
                              }
                            }
                          }}
                          aria-label="搜索或创建连接"
                          aria-expanded={pickerOpen}
                          aria-controls="connection-picker-menu"
                        />
                        <ChevronDownIcon
                          className={`size-3.5 shrink-0 text-(--dsw-label-3) transition-transform ${
                            pickerOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    )}

                    {pickerOpen ? (
                      <HeadlessDismiss onDismiss={() => setPickerOpen(false)} insideRef={pickerRef}>
                      <div
                        id="connection-picker-menu"
                        role="listbox"
                        className="absolute z-20 mt-1 max-h-[280px] w-full overflow-y-auto rounded-lg border border-(--dsw-border) bg-(--dsw-surface) py-1 shadow-(--dsw-shadow-lv2)"
                      >
                        {presetGroups.length ? (
                          presetGroups.map((group) => (
                            <div key={group.id} className="py-1">
                              <div className="px-2.5 py-1 text-[10px] font-medium tracking-wide text-(--dsw-label-3)">
                                {group.label}
                              </div>
                              {group.items.map((ep) => {
                                const active = ep.id === presetId
                                return (
                                  <button
                                    key={ep.id}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    className={`flex w-full items-center gap-2 px-2.5 py-[7px] text-left transition-colors ${
                                      active
                                        ? 'bg-(--dsw-hover-strong)'
                                        : 'hover:bg-(--dsw-hover)'
                                    }`}
                                    onClick={() => pickPreset(ep)}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] text-(--dsw-label)">
                                        {ep.label}
                                      </span>
                                      <span className="block truncate font-mono text-[10px] text-(--dsw-label-3)">
                                        {ep.note || ep.defaultBaseUrl || ep.baseUrl}
                                      </span>
                                    </span>
                                    {active ? (
                                      <CheckIcon className="size-3.5 shrink-0 text-(--dsw-label)" />
                                    ) : null}
                                  </button>
                                )
                              })}
                            </div>
                          ))
                        ) : !canCreateFromQuery ? (
                          <div className="px-3 py-4 text-center text-[12px] text-(--dsw-label-3)">
                            没有匹配的预设
                          </div>
                        ) : null}

                        {canCreateFromQuery ? (
                          <>
                            {presetGroups.length ? (
                              <div className="mx-2 my-1 border-t border-(--dsw-border)" />
                            ) : null}
                            <button
                              type="button"
                              role="option"
                              className="flex w-full items-center gap-2 px-2.5 py-[8px] text-left hover:bg-(--dsw-hover)"
                              onClick={() => createCustom(pickerQuery)}
                            >
                              <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-(--dsw-muted-fill) text-(--dsw-label-2)">
                                <PlusIcon className="size-3" />
                              </span>
                              <span className="min-w-0 text-[13px] text-(--dsw-label)">
                                创建「
                                <span className="font-medium">{pickerQuery.trim()}</span>
                                」
                              </span>
                            </button>
                          </>
                        ) : null}

                        {!pickerQuery.trim() && presets.length > 0 ? (
                          <>
                            <div className="mx-2 my-1 border-t border-(--dsw-border)" />
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-2.5 py-[8px] text-left hover:bg-(--dsw-hover)"
                              onClick={() => {
                                setPickerOpen(false)
                                setPresetId('')
                                setNewLabel('')
                                setNewUrl('')
                              }}
                            >
                              <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-(--dsw-muted-fill) text-(--dsw-label-2)">
                                <PlusIcon className="size-3" />
                              </span>
                              <span className="text-[13px] text-(--dsw-label-2)">自定义 Base URL…</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                      </HeadlessDismiss>
                    ) : null}
                  </div>
                </div>

                {!selectedPreset ? (
                  <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-(--dsw-hover)">
                    <div className="w-18 shrink-0 text-[12px] text-(--dsw-label-3)">名称</div>
                    <input
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-[6px] text-[13px] text-(--dsw-label) outline-none placeholder:text-(--dsw-placeholder) hover:border-(--dsw-border) focus:border-(--dsw-label-3) focus:bg-(--dsw-input)"
                      placeholder="My OneAPI"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                  </div>
                ) : null}

                {!selectedPreset ? (
                  <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-(--dsw-hover)">
                    <div className="w-18 shrink-0 text-[12px] text-(--dsw-label-3)">协议</div>
                    <div className="flex gap-1">
                      {(
                        [
                          { id: 'openai-compat' as const, label: 'OpenAI 兼容' },
                          { id: 'anthropic' as const, label: 'Anthropic' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`rounded-md px-2.5 py-[5px] text-[12px] transition-colors ${
                            newProtocol === opt.id
                              ? 'bg-(--dsw-hover-strong) text-(--dsw-label)'
                              : 'text-(--dsw-label-3) hover:bg-(--dsw-hover) hover:text-(--dsw-label-2)'
                          }`}
                          onClick={() => setNewProtocol(opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-(--dsw-hover)">
                  <div className="w-18 shrink-0 text-[12px] text-(--dsw-label-3)">Base URL</div>
                  <input
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-[6px] font-mono text-[12px] text-(--dsw-label) outline-none placeholder:font-sans placeholder:text-(--dsw-placeholder) hover:border-(--dsw-border) focus:border-(--dsw-label-3) focus:bg-(--dsw-input)"
                    placeholder="https://api.example.com/v1"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-(--dsw-hover)">
                  <div className="w-18 shrink-0 text-[12px] text-(--dsw-label-3)">API Key</div>
                  <input
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-[6px] text-[13px] text-(--dsw-label) outline-none placeholder:text-(--dsw-placeholder) hover:border-(--dsw-border) focus:border-(--dsw-label-3) focus:bg-(--dsw-input)"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-…（可选，稍后可补）"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-(--dsw-border) px-4 py-2.5">
                {error ? (
                  <span className="mr-auto text-[11px] text-(--dsw-danger,#b42318)">{error}</span>
                ) : null}
                <button
                  type="button"
                  className="rounded-md px-3 py-[6px] text-[12px] text-(--dsw-label-2) hover:bg-(--dsw-hover)"
                  onClick={() => {
                    setAdding(false)
                    resetAddForm()
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-md px-3.5 py-[7px] text-[13px] font-medium text-(--dsw-bg)"
                  style={{ background: 'var(--dsw-business)' }}
                  onClick={() => void onAddConnection()}
                >
                  接入
                </button>
              </div>
            </>
          ) : active ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-(--dsw-border) px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-semibold text-(--dsw-label)">
                    {isOfficial(active.id) ? OFFICIAL_META[active.id].label : active.label}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] text-(--dsw-label-3)">
                    {active.note || active.baseUrl}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                      configured
                        ? 'bg-(color-mix(in_srgb,var(--dsw-ok)_16%,transparent)) text-(--dsw-ok)'
                        : 'bg-(--dsw-hover) text-(--dsw-label-3)'
                    }`}
                  >
                    {configured ? '已配置' : '未配置'}
                  </span>
                  {isDefaultProvider ? (
                    <span className="rounded-md bg-(--dsw-business-soft) px-2 py-0.5 text-[10px] font-medium text-(--dsw-business)">
                      当前默认
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between text-[11px] font-semibold text-(--dsw-label-3)">
                    <span>API Key</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-(--dsw-label-2) hover:bg-(--dsw-hover) hover:text-(--dsw-business) disabled:opacity-50"
                      title="测试连接"
                      aria-label="测试连接"
                      data-testid="test-connection"
                      disabled={testing}
                      onClick={() => void onTestConnection()}
                    >
                      {testing ? (
                        <ArrowPathIcon className="size-3.5 animate-spin" />
                      ) : (
                        <SignalSlashIcon className="size-3.5" />
                      )}
                      {testing ? '测试中' : '测试连接'}
                    </button>
                  </span>
                  <input
                    className={inputCls}
                    type="password"
                    autoComplete="off"
                    data-testid={isOfficial(active.id) ? `key-${active.id}` : 'key-third'}
                    placeholder={
                      configured
                        ? `已配置 · 输入新 Key 可覆盖（${active.hint || active.placeholder}）`
                        : isOfficial(active.id)
                          ? OFFICIAL_META[active.id].placeholder
                          : active.placeholder
                    }
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                  />
                  {testHint ? (
                    <span className="text-[11px] text-(--dsw-ok)">{testHint}</span>
                  ) : null}
                </label>

                {!isOfficial(active.id) ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-(--dsw-label-3)">Base URL</span>
                    <input
                      className={inputCls}
                      type="url"
                      data-testid="base-url"
                      value={urlDraft}
                      placeholder={active.defaultBaseUrl}
                      onChange={(e) => setUrlDraft(e.target.value)}
                    />
                  </label>
                ) : (
                  <p className="text-[11px] text-(--dsw-label-3)">
                    官方地址：<span className="font-mono text-[10px]">{active.defaultBaseUrl}</span>
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-(--dsw-label-3)">
                      模型
                      <span className="ml-1 font-normal">· {activeModels.length}</span>
                    </span>
                    <span className="text-[10px] text-(--dsw-label-3)">点击设为默认</span>
                  </div>

                  {activeModels.length ? (
                    <ul className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto rounded-lg border border-(--dsw-border) p-1">
                      {activeModels.map((m) => {
                        const selected = isDefaultProvider && m.model === defaultModel
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              data-testid={selected ? 'model-active' : undefined}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                                selected
                                  ? 'bg-(--dsw-business-soft) text-(--dsw-business)'
                                  : 'text-(--dsw-label) hover:bg-(--dsw-hover)'
                              }`}
                              onClick={() => void pickDefaultModel(m)}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-medium">{m.label}</span>
                                <span className="block truncate font-mono text-[10px] opacity-55">
                                  {m.model}
                                  {m.note ? ` · ${m.note}` : ''}
                                </span>
                              </span>
                              {m.builtin === false ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="grid size-6 shrink-0 place-items-center rounded-md text-(--dsw-label-3) hover:bg-(--dsw-hover) hover:text-(--dsw-danger,#b42318)"
                                  title="删除模型"
                                  aria-label={`删除 ${m.label}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void onRemoveModel(m.id)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      void onRemoveModel(m.id)
                                    }
                                  }}
                                >
                                  <TrashGlyph className="size-3" />
                                </span>
                              ) : selected ? (
                                <CheckIcon className="size-3.5 shrink-0" />
                              ) : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-(--dsw-label-3)">暂无模型，在下方添加 model id</p>
                  )}

                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      placeholder="添加模型 ID"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void onAddModel()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-(--dsw-border) px-2.5 py-[6px] text-[12px] text-(--dsw-label) hover:bg-(--dsw-hover)"
                      onClick={() => void onAddModel()}
                    >
                      <PlusIcon className="size-3.5" />
                      添加
                    </button>
                  </div>
                </div>

                {canRemoveConnection(active) ? (
                  <button
                    type="button"
                    className="inline-flex self-start items-center gap-1 text-[11px] text-(--dsw-danger,#b42318) hover:underline"
                    onClick={() => void onRemoveConnection(active.id)}
                  >
                    <TrashGlyph className="size-3" />
                    删除此连接
                  </button>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-(--dsw-border) px-4 py-2.5">
                {status ? <span className="mr-auto text-[11px] text-(--dsw-ok)">{status}</span> : null}
                {error ? (
                  <span className="mr-auto text-[11px] text-(--dsw-danger,#b42318)">{error}</span>
                ) : null}
                {!isDefaultProvider ? (
                  <button
                    type="button"
                    className="rounded-lg border border-(--dsw-border) px-3 py-[6px] text-[12px] text-(--dsw-label) hover:bg-(--dsw-hover)"
                    disabled={saving}
                    onClick={() => void saveCurrent({ makeDefault: true })}
                  >
                    设为默认
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg px-3.5 py-[7px] text-[13px] font-medium text-(--dsw-bg) transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--dsw-business)' }}
                  disabled={saving}
                  onClick={() => void saveCurrent()}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-[12px] text-(--dsw-label-3)">
              从左侧选择 Provider
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
