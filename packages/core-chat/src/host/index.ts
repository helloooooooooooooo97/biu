import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dataDir, dataPath } from '@biu/host-plugin-loader/data-dir'
import { Service, type Context } from 'cordis'
import type { ChatMessage } from './chat-types.ts'
import { isAgentToolMode, normalizeAgentMode, type AgentToolMode } from '@biu/host-tools'
import type { LlmConfig } from '@biu/host-llm'
import { probeLlmConnection } from '@biu/host-llm'
import { LLM_MODEL_CATALOG, LLM_ENDPOINT_PRESETS, describeProvider, defaultModelFor, CHAT_PROVIDERS, findEndpointPreset, normalizeBaseUrl, inferModelCapabilities, defaultModeValues, applyModeToLlm, hasKnob } from './model-catalog.ts'
import type { ChatProvider, LlmModelDef, LlmEndpointDef, ReasoningEffort, ThinkingMode, ContextWindow, SpeedMode, ModelModeValues } from './model-catalog.ts'
export type { ChatProvider, LlmModelDef, LlmEndpointDef, ReasoningEffort, ThinkingMode, ContextWindow, SpeedMode, ModelCapabilities } from './model-catalog.ts'
export { LLM_ENDPOINT_PRESETS, LLM_MODEL_CATALOG } from './model-catalog.ts'
import { currentSessionId } from '@biu/host-sessions/scope'
import { isSessionCompactPoint, sanitizeLiveUiContext, type SessionConfig, type SessionEvent } from '@biu/type-session'
import { DEFAULT_TAIL_TURNS, sliceBeforeTurns, sliceTailTurns } from '@biu/host-sessions/window'
import {
  DEFAULT_TRAJECTORY_TURNS,
  buildRequestMessages,
  buildTrajectoryBefore,
  buildTrajectoryWindow,
  findEvent,
} from '@biu/host-sessions/trajectory'
import { estimateTokens } from '@biu/host-sessions'
import { readArtifactFile } from '@biu/host-sessions/artifacts'
import { collectLiveDispatchedTasks } from '@biu/host-live-sessions/usage'
import { loadLiveDispatchTasks, registerChatInspectorRoutes } from './inspector.ts'

export type { ChatMessage }

export type { AgentToolMode }

const DEFAULT_PROVIDER: ChatProvider = 'deepseek'
/** 当前选中入口 id；内置三家与 preset id 对齐，自定义入口为 custom-*。 */
type EndpointId = string

interface ChatConfig {
  /** 入口 id（官方 / 中转 / 自定义）；兼容旧值 deepseek|openai|anthropic。 */
  endpointId: EndpointId
  /**
   * 协议分流用的 provider（deepseek|openai|anthropic）。
   * 由入口决定；保留字段以兼容旧持久化与会话覆盖。
   */
  provider: ChatProvider
  /** 每个入口独立存一份 apiKey。 */
  apiKeys: Record<string, string>
  /** 用户覆盖的 baseUrl（未覆盖则用 preset / customEndpoints 默认）。 */
  baseUrls: Record<string, string>
  /** 用户自定义入口（中转站自建 URL 等）。 */
  customEndpoints: LlmEndpointDef[]
  /** 用户在某入口下追加的模型名。 */
  customModels: LlmModelDef[]
  /**
   * 探测失败 / 用户主动断开的入口：强制视为未配置，
   * 避免坏 Key（含环境变量）仍显示绿点并出现在模型下拉。
   */
  blockedEndpoints: string[]
  model: string
  systemPrompt: string
  agentMode: AgentToolMode
  /** 极简模式下常驻额外工具（不含 minimal 底座与 live 调度工具） */
  extraTools: string[]
  /** 当前模型的思考开关；能思考的模型默认 enabled（对齐上游）。 */
  thinking: ThinkingMode
  reasoningEffort: ReasoningEffort
  contextWindow: ContextWindow
  speed: SpeedMode
  /** 按「入口::模型」记住档位，切模型时带回。 */
  modelPrefs: Record<
    string,
    { thinking?: ThinkingMode; reasoningEffort?: ReasoningEffort; contextWindow?: ContextWindow; speed?: SpeedMode }
  >
}

function configPath() {
  return dataPath(process.cwd(), 'chat-config.json')
}

function emptyKeys(): Record<string, string> {
  return { deepseek: '', openai: '', anthropic: '' }
}

function defaults(): ChatConfig {
  const envKeys = emptyKeys()
  if (process.env.DEEPSEEK_API_KEY) envKeys.deepseek = process.env.DEEPSEEK_API_KEY
  if (process.env.OPENAI_API_KEY) envKeys.openai = process.env.OPENAI_API_KEY
  if (process.env.ANTHROPIC_API_KEY) envKeys.anthropic = process.env.ANTHROPIC_API_KEY
  const deepseek = Boolean(envKeys.deepseek)
  const openai = Boolean(envKeys.openai)
  const anthropic = Boolean(envKeys.anthropic)
  const provider: ChatProvider = deepseek ? 'deepseek' : openai ? 'openai' : anthropic ? 'anthropic' : 'deepseek'
  return {
    endpointId: provider,
    provider,
    apiKeys: envKeys,
    baseUrls: {},
    customEndpoints: [],
    customModels: [],
    blockedEndpoints: [],
    model:
      process.env.CHAT_MODEL ||
      (provider === 'openai' ? 'gpt-4o-mini' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'deepseek-v4-flash'),
    systemPrompt: '你是控制台里的助手。需要时调用当前已注册的 tools；插件卸载后对应 tool 会消失。回答简洁。',
    agentMode: 'standard',
    extraTools: [],
    thinking: 'enabled',
    reasoningEffort: 'high',
    contextWindow: '200k',
    speed: 'slow',
    modelPrefs: {},
  }
}

function hint(key: string) {
  if (!key) return ''
  if (key.length <= 8) return '已配置'
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}

function readPersisted(): Partial<ChatConfig> | null {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<ChatConfig>
  } catch {
    return null
  }
}

function writePersisted(config: ChatConfig) {
  const dir = dataDir(process.cwd())
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    configPath(),
    `${JSON.stringify(
      {
        endpointId: config.endpointId,
        provider: config.provider,
        model: config.model,
        systemPrompt: config.systemPrompt,
        agentMode: config.agentMode,
        extraTools: config.extraTools,
        thinking: config.thinking,
        reasoningEffort: config.reasoningEffort,
        contextWindow: config.contextWindow,
        speed: config.speed,
        modelPrefs: config.modelPrefs,
        apiKeys: config.apiKeys,
        baseUrls: config.baseUrls,
        customEndpoints: config.customEndpoints,
        customModels: config.customModels,
        blockedEndpoints: config.blockedEndpoints,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function parseAgentMode(value: unknown, fallback: AgentToolMode): AgentToolMode {
  return normalizeAgentMode(value, fallback)
}

function parseProvider(value: unknown): ChatProvider | null {
  return CHAT_PROVIDERS.includes(value as ChatProvider) ? (value as ChatProvider) : null
}

function prefKey(endpointId: string, model: string) {
  return `${endpointId}::${model}`
}

function parseThinking(value: unknown): ThinkingMode | undefined {
  return value === 'enabled' || value === 'disabled' ? value : undefined
}

function parseEffort(value: unknown): ReasoningEffort | undefined {
  return value === 'high' || value === 'max' ? value : undefined
}

function parseContext(value: unknown): ContextWindow | undefined {
  return value === '200k' || value === '1m' ? value : undefined
}

function parseSpeed(value: unknown): SpeedMode | undefined {
  return value === 'fast' || value === 'slow' ? value : undefined
}

function mergeModelPrefs(saved: Partial<ChatConfig> | null): ChatConfig['modelPrefs'] {
  const out: ChatConfig['modelPrefs'] = {}
  if (!saved?.modelPrefs || typeof saved.modelPrefs !== 'object') return out
  for (const [key, raw] of Object.entries(saved.modelPrefs)) {
    if (!raw || typeof raw !== 'object') continue
    const thinking = parseThinking(raw.thinking)
    const reasoningEffort = parseEffort(raw.reasoningEffort)
    const contextWindow = parseContext((raw as { contextWindow?: unknown }).contextWindow)
    const speed = parseSpeed((raw as { speed?: unknown }).speed)
    if (thinking || reasoningEffort || contextWindow || speed) {
      out[key] = {
        ...(thinking ? { thinking } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(contextWindow ? { contextWindow } : {}),
        ...(speed ? { speed } : {}),
      }
    }
  }
  return out
}

function hydrateModelMode(config: ChatConfig) {
  const caps = inferModelCapabilities(config.model, config.provider)
  const saved = config.modelPrefs[prefKey(config.endpointId, config.model)]
  const defaults = defaultModeValues(caps)
  config.thinking = saved?.thinking ?? defaults.thinking
  config.reasoningEffort = saved?.reasoningEffort ?? defaults.effort
  config.contextWindow = saved?.contextWindow ?? defaults.context
  config.speed =
    saved?.speed ??
    (hasKnob(caps, 'speed') && config.thinking === 'disabled' ? 'fast' : defaults.speed)
}

function rememberModelPrefs(config: ChatConfig) {
  config.modelPrefs[prefKey(config.endpointId, config.model)] = {
    thinking: config.thinking,
    reasoningEffort: config.reasoningEffort,
    contextWindow: config.contextWindow,
    speed: config.speed,
  }
}

function isLocalEndpoint(endpoint: LlmEndpointDef): boolean {
  return endpoint.group === 'local'
}

/** 取某个入口的持久化 key；环境变量始终优先（不会被磁盘文件覆盖 UI 清空）。 */
function keyFor(endpointId: string, saved: Partial<ChatConfig> | null): string {
  const envMap: Record<string, string | undefined> = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  }
  if (envMap[endpointId]) return envMap[endpointId]!
  const savedKeys = saved?.apiKeys
  if (savedKeys && typeof savedKeys === 'object' && typeof savedKeys[endpointId] === 'string') {
    const key = savedKeys[endpointId] || ''
    if (key.trim()) return key.trim()
  }
  // 老格式：单一 apiKey 迁移到 deepseek（或默认 provider 所在）
  const legacy = saved as unknown as { apiKey?: unknown; provider?: unknown } | null
  if (legacy && typeof legacy.apiKey === 'string' && legacy.apiKey.trim()) {
    const owner =
      legacy.provider && CHAT_PROVIDERS.includes(legacy.provider as ChatProvider)
        ? (legacy.provider as ChatProvider)
        : DEFAULT_PROVIDER
    if (endpointId === owner) return legacy.apiKey.trim()
  }
  return ''
}

function mergeCustomEndpoints(saved: Partial<ChatConfig> | null): LlmEndpointDef[] {
  if (!Array.isArray(saved?.customEndpoints)) return []
  const out: LlmEndpointDef[] = []
  for (const raw of saved.customEndpoints) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    const baseUrl = typeof raw.baseUrl === 'string' ? normalizeBaseUrl(raw.baseUrl) : ''
    if (!id || !label || !baseUrl) continue
    const protocol = raw.protocol === 'anthropic' ? 'anthropic' : 'openai-compat'
    const provider: ChatProvider =
      raw.provider === 'deepseek' || raw.provider === 'anthropic' || raw.provider === 'openai'
        ? raw.provider
        : protocol === 'anthropic'
          ? 'anthropic'
          : 'openai'
    out.push({
      id,
      label,
      group: 'custom',
      protocol,
      baseUrl,
      provider,
      note: typeof raw.note === 'string' ? raw.note : undefined,
      placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : 'sk-…',
      builtin: false,
    })
  }
  return out
}

function mergeCustomModels(saved: Partial<ChatConfig> | null): LlmModelDef[] {
  if (!Array.isArray(saved?.customModels)) return []
  const out: LlmModelDef[] = []
  for (const raw of saved.customModels) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const model = typeof raw.model === 'string' ? raw.model.trim() : ''
    const endpointId = typeof raw.endpointId === 'string' ? raw.endpointId.trim() : ''
    if (!id || !model || !endpointId) continue
    const provider: ChatProvider =
      raw.provider === 'deepseek' || raw.provider === 'openai' || raw.provider === 'anthropic'
        ? raw.provider
        : 'openai'
    out.push({
      id,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : model,
      endpointId,
      provider,
      model,
      category: typeof raw.category === 'string' ? raw.category : 'custom',
      note: typeof raw.note === 'string' ? raw.note : undefined,
      builtin: false,
    })
  }
  return out
}

function mergePersisted(base: ChatConfig, saved: Partial<ChatConfig> | null): ChatConfig {
  if (!saved) return base
  const customEndpoints = mergeCustomEndpoints(saved)
  const customModels = mergeCustomModels(saved)
  const apiKeys: Record<string, string> = { ...emptyKeys() }
  // 合并所有已知入口的 key
  const allEndpointIds = new Set<string>([
    ...CHAT_PROVIDERS,
    ...LLM_ENDPOINT_PRESETS.map((e) => e.id),
    ...customEndpoints.map((e) => e.id),
    ...(saved.apiKeys && typeof saved.apiKeys === 'object' ? Object.keys(saved.apiKeys) : []),
  ])
  for (const id of allEndpointIds) apiKeys[id] = keyFor(id, saved)

  const baseUrls: Record<string, string> = {}
  if (saved.baseUrls && typeof saved.baseUrls === 'object') {
    for (const [id, url] of Object.entries(saved.baseUrls)) {
      if (typeof url === 'string' && url.trim()) baseUrls[id] = normalizeBaseUrl(url)
    }
  }

  const endpointId =
    typeof saved.endpointId === 'string' && saved.endpointId.trim()
      ? saved.endpointId.trim()
      : parseProvider(saved.provider) ?? base.endpointId

  const endpoint =
    findEndpointPreset(endpointId) ??
    customEndpoints.find((e) => e.id === endpointId) ??
    findEndpointPreset(base.endpointId)

  const next: ChatConfig = {
    endpointId,
    provider: endpoint?.provider ?? parseProvider(saved.provider) ?? base.provider,
    apiKeys,
    baseUrls,
    customEndpoints,
    customModels,
    blockedEndpoints: Array.isArray(saved.blockedEndpoints)
      ? [...new Set(saved.blockedEndpoints.map((id) => String(id).trim()).filter(Boolean))]
      : [],
    model: !process.env.CHAT_MODEL && typeof saved.model === 'string' && saved.model.trim() ? saved.model.trim() : base.model,
    systemPrompt: typeof saved.systemPrompt === 'string' ? saved.systemPrompt : base.systemPrompt,
    agentMode: parseAgentMode(saved.agentMode, base.agentMode),
    extraTools: Array.isArray(saved.extraTools)
      ? [...new Set(saved.extraTools.map((name) => String(name).trim()).filter(Boolean))]
      : base.extraTools,
    thinking: parseThinking(saved.thinking) ?? base.thinking,
    reasoningEffort: parseEffort(saved.reasoningEffort) ?? base.reasoningEffort,
    contextWindow: parseContext(saved.contextWindow) ?? base.contextWindow,
    speed: parseSpeed(saved.speed) ?? base.speed,
    modelPrefs: mergeModelPrefs(saved),
  }
  hydrateModelMode(next)
  return next
}

function allEndpoints(config: ChatConfig): LlmEndpointDef[] {
  const customIds = new Set(config.customEndpoints.map((e) => e.id))
  return [
    ...LLM_ENDPOINT_PRESETS.filter((e) => !customIds.has(e.id)),
    ...config.customEndpoints,
  ]
}

function allModels(config: ChatConfig): LlmModelDef[] {
  const customIds = new Set(config.customModels.map((m) => m.id))
  return [
    ...LLM_MODEL_CATALOG.filter((m) => !customIds.has(m.id)),
    ...config.customModels,
  ]
}

function resolveEndpoint(config: ChatConfig, endpointId: string): LlmEndpointDef | undefined {
  return allEndpoints(config).find((e) => e.id === endpointId)
}

function effectiveBaseUrl(config: ChatConfig, endpoint: LlmEndpointDef): string {
  const override = config.baseUrls[endpoint.id]
  return override?.trim() ? normalizeBaseUrl(override) : endpoint.baseUrl
}

/** 入口是否已配置：有 Key，且未被探测失败拉黑。本地入口不自动算已接入。 */
function endpointConfigured(config: ChatConfig, endpoint: LlmEndpointDef): boolean {
  if (config.blockedEndpoints.includes(endpoint.id)) return false
  return Boolean((config.apiKeys[endpoint.id] ?? '').trim())
}

function unblockEndpoint(config: ChatConfig, id: string) {
  config.blockedEndpoints = config.blockedEndpoints.filter((x) => x !== id)
}

function blockEndpoint(config: ChatConfig, id: string) {
  if (!config.blockedEndpoints.includes(id)) config.blockedEndpoints.push(id)
}

export class ChatService extends Service {
  private config = mergePersisted(defaults(), readPersisted())

  constructor(ctx: Context) {
    super(ctx, 'chat')
    ctx.systemPrompt.register('chat.persona', () => {
      const sessionId = currentSessionId()
      if (sessionId) {
        const override = this.ctx.sessions.peek(sessionId)?.config?.systemPrompt
        if (typeof override === 'string' && override.trim()) return override
      }
      return this.config.systemPrompt
    })
    this.syncLlm()
    this.syncToolsMode()
  }

  publicView() {
    const endpoints = allEndpoints(this.config)
    const models = allModels(this.config)
    const current = resolveEndpoint(this.config, this.config.endpointId)
    const providers: Record<string, { label: string; configured: boolean; hint: string; baseUrl: string; group: string; protocol: string }> = {}
    for (const ep of endpoints) {
      providers[ep.id] = {
        label: ep.label,
        configured: endpointConfigured(this.config, ep),
        hint: hint(this.config.apiKeys[ep.id] ?? ''),
        baseUrl: effectiveBaseUrl(this.config, ep),
        group: ep.group,
        protocol: ep.protocol,
      }
    }
    // 兼容旧前端：三家协议维度也暴露
    for (const p of CHAT_PROVIDERS) {
      if (!providers[p]) {
        providers[p] = {
          label: describeProvider(p),
          configured: Boolean((this.config.apiKeys[p] ?? '').trim()),
          hint: hint(this.config.apiKeys[p] ?? ''),
          baseUrl: findEndpointPreset(p)?.baseUrl ?? '',
          group: 'official',
          protocol: p === 'anthropic' ? 'anthropic' : 'openai-compat',
        }
      }
    }
    return {
      endpointId: this.config.endpointId,
      provider: this.config.provider,
      model: this.config.model,
      systemPrompt: this.config.systemPrompt,
      agentMode: this.config.agentMode,
      thinking: this.config.thinking,
      reasoningEffort: this.config.reasoningEffort,
      contextWindow: this.config.contextWindow,
      speed: this.config.speed,
      capabilities: inferModelCapabilities(this.config.model, this.config.provider),
      /** 当前默认入口是否已配置（兼容旧语义，供 banner 等使用）。 */
      configured: current ? endpointConfigured(this.config, current) : Boolean((this.config.apiKeys[this.config.provider] ?? '').trim()),
      hint: hint(this.config.apiKeys[this.config.endpointId] ?? this.config.apiKeys[this.config.provider] ?? ''),
      baseUrl: current ? effectiveBaseUrl(this.config, current) : '',
      /** 各入口是否已配置 key + baseUrl。 */
      providers,
      endpoints: endpoints.map((ep) => ({
        id: ep.id,
        label: ep.label,
        group: ep.group,
        protocol: ep.protocol,
        provider: ep.provider,
        baseUrl: effectiveBaseUrl(this.config, ep),
        defaultBaseUrl: ep.baseUrl,
        configured: endpointConfigured(this.config, ep),
        hint: hint(this.config.apiKeys[ep.id] ?? ''),
        placeholder: ep.placeholder ?? 'sk-…',
        note: ep.note,
        builtin: ep.builtin !== false && ep.group !== 'custom',
      })),
      modelCatalog: models.map((m) => ({
        ...m,
        capabilities: inferModelCapabilities(m.model, m.provider),
        // 方便前端按入口过滤
        endpointConfigured: (() => {
          const ep = resolveEndpoint(this.config, m.endpointId)
          return ep ? endpointConfigured(this.config, ep) : false
        })(),
      })),
      tools: this.ctx.tools.names(),
      toolCatalog: this.ctx.tools.catalog(),
      extraTools: this.config.extraTools,
    }
  }

  /** 全局默认 + 会话覆盖（不含 apiKey）。 */
  resolveEffective(sessionId?: string | null) {
    const defaultsView = {
      endpointId: this.config.endpointId,
      provider: this.config.provider,
      model: this.config.model,
      systemPrompt: this.config.systemPrompt,
      agentMode: this.config.agentMode,
      extraTools: [...this.config.extraTools],
    }
    if (!sessionId) return { defaults: defaultsView, config: undefined as SessionConfig | undefined, effective: defaultsView }
    const config = this.ctx.sessions.peek(sessionId)?.config
    // 会话仍可覆盖 provider/model；endpoint 跟随模型所属入口或全局
    const provider = (config?.provider as ChatProvider | undefined) ?? defaultsView.provider
    const model = config?.model ?? defaultsView.model
    let endpointId = defaultsView.endpointId
    const matched = allModels(this.config).find((m) => m.model === model && m.provider === provider)
    if (matched) endpointId = matched.endpointId
    else if (config?.provider && CHAT_PROVIDERS.includes(config.provider as ChatProvider)) {
      endpointId = config.provider as string
    }
    const effective = {
      endpointId,
      provider,
      model,
      systemPrompt:
        typeof config?.systemPrompt === 'string' ? config.systemPrompt : defaultsView.systemPrompt,
      agentMode: config?.agentMode ?? defaultsView.agentMode,
      extraTools: config?.extraTools ? [...config.extraTools] : [...defaultsView.extraTools],
      ...(config?.title ? { title: config.title } : {}),
    }
    return { defaults: defaultsView, config, effective }
  }

  resolverKey(provider: ChatProvider): string {
    return this.config.apiKeys[provider] ?? ''
  }

  /** 根据有效入口取对应 apiKey + baseUrl。 */
  resolveLlm(sessionId?: string | null): LlmConfig {
    const { effective } = this.resolveEffective(sessionId)
    const endpointId = (effective as { endpointId?: string }).endpointId ?? this.config.endpointId
    const endpoint = resolveEndpoint(this.config, endpointId) ?? resolveEndpoint(this.config, effective.provider)
    const provider: ChatProvider = endpoint?.provider ?? effective.provider
    const apiKey =
      (endpoint ? this.config.apiKeys[endpoint.id] : undefined) ??
      this.config.apiKeys[provider] ??
      ''
    // 本地入口允许空 Key：上游常不校验，填占位避免部分网关拒空 Authorization
    const key = apiKey.trim() || (endpoint && isLocalEndpoint(endpoint) ? 'local' : '')
    const caps = inferModelCapabilities(effective.model, provider)
    const prefs = this.config.modelPrefs[prefKey(endpointId, effective.model)]
    const mode: ModelModeValues = {
      thinking: prefs?.thinking ?? this.config.thinking,
      speed: prefs?.speed ?? this.config.speed,
      effort: prefs?.reasoningEffort ?? this.config.reasoningEffort,
      context: prefs?.contextWindow ?? this.config.contextWindow,
    }
    return {
      provider,
      apiKey: key,
      model: effective.model,
      ...(endpoint ? { baseUrl: effectiveBaseUrl(this.config, endpoint) } : {}),
      ...applyModeToLlm(caps, mode),
    }
  }

  /** 探测指定入口连通性；可临时覆盖草稿 Key / URL / model（不落盘）。 */
  async testConnection(opts?: {
    endpointId?: string
    apiKey?: string
    baseUrl?: string
    model?: string
  }) {
    const endpointId = (opts?.endpointId || this.config.endpointId || this.config.provider).trim()
    const endpoint = resolveEndpoint(this.config, endpointId)
    if (!endpoint) {
      return { ok: false as const, latencyMs: 0, detail: `未知入口：${endpointId}`, endpointId }
    }
    const draftKey = typeof opts?.apiKey === 'string' ? opts.apiKey.trim() : ''
    const storedKey = (this.config.apiKeys[endpointId] ?? '').trim()
    const apiKey = draftKey || storedKey || (isLocalEndpoint(endpoint) ? 'local' : '')
    const baseUrl =
      typeof opts?.baseUrl === 'string' && opts.baseUrl.trim()
        ? normalizeBaseUrl(opts.baseUrl)
        : effectiveBaseUrl(this.config, endpoint)
    const model =
      (typeof opts?.model === 'string' && opts.model.trim()) ||
      allModels(this.config).find((m) => m.endpointId === endpointId)?.model ||
      this.config.model ||
      defaultModelFor(endpoint.provider)

    const result = await probeLlmConnection({
      provider: endpoint.provider,
      apiKey,
      model,
      baseUrl,
    })
    return { ...result, endpointId, baseUrl, model }
  }

  /**
   * 探测失败：拉黑入口（绿点变灰、模型下拉不可选）。
   * 保留已存 Key 便于改 URL 后重试；若当前默认就是该入口，切到其它已配置入口。
   */
  invalidateEndpoint(endpointId: string, opts?: { persist?: boolean }) {
    const id = endpointId.trim()
    if (!id) return this.publicView()
    blockEndpoint(this.config, id)
    if (this.config.endpointId === id) {
      const fallback =
        allEndpoints(this.config).find((ep) => ep.id !== id && endpointConfigured(this.config, ep)) ??
        findEndpointPreset(DEFAULT_PROVIDER)
      if (fallback) {
        this.config.endpointId = fallback.id
        this.config.provider = fallback.provider
        this.config.model =
          allModels(this.config).find((m) => m.endpointId === fallback.id)?.model ??
          defaultModelFor(fallback.provider)
      }
    }
    this.syncLlm()
    if (opts?.persist !== false) {
      try {
        writePersisted(this.config)
      } catch (error) {
        console.warn('[chat] failed to persist config', error)
      }
    }
    return this.publicView()
  }

  /** 探测成功：解除拉黑（Key 仍由调用方决定是否写入）。 */
  markEndpointReachable(endpointId: string, opts?: { persist?: boolean; apiKey?: string; baseUrl?: string }) {
    const id = endpointId.trim()
    if (!id) return this.publicView()
    unblockEndpoint(this.config, id)
    if (typeof opts?.apiKey === 'string' && opts.apiKey.trim()) {
      this.config.apiKeys[id] = opts.apiKey.trim()
    }
    if (typeof opts?.baseUrl === 'string' && opts.baseUrl.trim()) {
      this.config.baseUrls[id] = normalizeBaseUrl(opts.baseUrl)
    }
    this.syncLlm()
    if (opts?.persist !== false) {
      try {
        writePersisted(this.config)
      } catch (error) {
        console.warn('[chat] failed to persist config', error)
      }
    }
    return this.publicView()
  }

  /**
   * 更新配置。endpointId/provider/model/systemPrompt/agentMode/extraTools 直接覆盖；
   * setApiKey / setBaseUrl 按入口写入；空串表示保留原值，仅非空时更新。
   * addEndpoint / addModel / removeCustom* 管理自定义入口与模型。
   */
  patch(
    next: Partial<{
      endpointId: string
      provider: ChatProvider
      apiKey: string
      model: string
      baseUrl: string
      systemPrompt: string
      agentMode: AgentToolMode
      extraTools: string[]
      thinking: ThinkingMode
      reasoningEffort: ReasoningEffort
      contextWindow: ContextWindow
      speed: SpeedMode
      /** 按入口更新 key；空串 / null 清除 */
      setApiKey: Partial<Record<string, string | null>>
      /** 按入口覆盖 baseUrl；空串清除覆盖、回到 preset 默认 */
      setBaseUrl: Partial<Record<string, string | null>>
      /** 追加自定义入口 */
      addEndpoint: { id?: string; label: string; baseUrl: string; protocol?: 'openai-compat' | 'anthropic'; provider?: ChatProvider; note?: string }
      /** 追加模型到某入口 */
      addModel: { endpointId: string; model: string; label?: string; note?: string }
      removeCustomEndpoint: string
      removeCustomModel: string
    }>,
    opts?: { persist?: boolean },
  ) {
    const beforeKey = prefKey(this.config.endpointId, this.config.model)
    rememberModelPrefs(this.config)
    if (typeof next.endpointId === 'string' && next.endpointId.trim()) {
      const id = next.endpointId.trim()
      const ep = resolveEndpoint(this.config, id)
      this.config.endpointId = id
      if (ep) this.config.provider = ep.provider
      // 未指定 model 时，切到该入口第一个模型
      if (typeof next.model !== 'string' || !next.model.trim()) {
        const first = allModels(this.config).find((m) => m.endpointId === id)
        if (first) this.config.model = first.model
        else if (ep) this.config.model = defaultModelFor(ep.provider)
      }
    } else if (next.provider) {
      this.config.provider = next.provider
      this.config.endpointId = next.provider
      if (typeof next.model !== 'string' || !next.model.trim()) {
        this.config.model = defaultModelFor(next.provider)
      }
    }
    if (typeof next.model === 'string' && next.model.trim()) this.config.model = next.model.trim()
    if (typeof next.systemPrompt === 'string') this.config.systemPrompt = next.systemPrompt
    if (typeof next.baseUrl === 'string' && next.baseUrl.trim()) {
      this.config.baseUrls[this.config.endpointId] = normalizeBaseUrl(next.baseUrl)
    }
    if (next.setApiKey && typeof next.setApiKey === 'object') {
      for (const [id, key] of Object.entries(next.setApiKey)) {
        // 空串 / null：清除 Key（测试失败或断开时用）
        if (key === null || key === '') {
          delete this.config.apiKeys[id]
          blockEndpoint(this.config, id)
        } else if (typeof key === 'string' && key.trim()) {
          this.config.apiKeys[id] = key.trim()
          unblockEndpoint(this.config, id)
        }
      }
    }
    if (next.setBaseUrl && typeof next.setBaseUrl === 'object') {
      for (const [id, url] of Object.entries(next.setBaseUrl)) {
        if (url === null || url === '') {
          delete this.config.baseUrls[id]
        } else if (typeof url === 'string' && url.trim()) {
          this.config.baseUrls[id] = normalizeBaseUrl(url)
        }
      }
    }
    // 兼容旧调用：单一 apiKey 写入当前入口
    if (typeof next.apiKey === 'string' && next.apiKey.trim()) {
      this.config.apiKeys[this.config.endpointId] = next.apiKey.trim()
      unblockEndpoint(this.config, this.config.endpointId)
    }
    if (next.addEndpoint && typeof next.addEndpoint === 'object') {
      const label = String(next.addEndpoint.label ?? '').trim()
      const baseUrl = normalizeBaseUrl(String(next.addEndpoint.baseUrl ?? ''))
      if (label && baseUrl) {
        const protocol = next.addEndpoint.protocol === 'anthropic' ? 'anthropic' : 'openai-compat'
        const provider: ChatProvider =
          next.addEndpoint.provider === 'deepseek' ||
          next.addEndpoint.provider === 'anthropic' ||
          next.addEndpoint.provider === 'openai'
            ? next.addEndpoint.provider
            : protocol === 'anthropic'
              ? 'anthropic'
              : 'openai'
        const id =
          (typeof next.addEndpoint.id === 'string' && next.addEndpoint.id.trim()) ||
          `custom-${Date.now().toString(36)}`
        const existing = this.config.customEndpoints.findIndex((e) => e.id === id)
        const def: LlmEndpointDef = {
          id,
          label,
          group: 'custom',
          protocol,
          baseUrl,
          provider,
          note: next.addEndpoint.note,
          placeholder: 'sk-…',
          builtin: false,
        }
        if (existing >= 0) this.config.customEndpoints[existing] = def
        else this.config.customEndpoints.push(def)
        this.config.endpointId = id
        this.config.provider = provider
        // 自定义入口默认挂一批常用模型名，避免下拉空空如也
        const hasModels = allModels(this.config).some((m) => m.endpointId === id)
        if (!hasModels) {
          const seeds = [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4.1',
            'o3-mini',
            'claude-sonnet-4-20250514',
            'claude-opus-4-20250514',
            'gemini-2.5-pro',
            'deepseek-chat',
            'deepseek-reasoner',
          ]
          for (const modelName of seeds) {
            this.config.customModels.push({
              id: `custom-model-${id}-${modelName}`.replace(/[^a-zA-Z0-9._:-]+/g, '-'),
              label: modelName,
              endpointId: id,
              provider,
              model: modelName,
              category: 'custom',
              builtin: false,
            })
          }
          this.config.model = seeds[0]!
        }
      }
    }
    if (next.addModel && typeof next.addModel === 'object') {
      const endpointId = String(next.addModel.endpointId ?? '').trim()
      const model = String(next.addModel.model ?? '').trim()
      if (endpointId && model) {
        const ep = resolveEndpoint(this.config, endpointId)
        const provider = ep?.provider ?? 'openai'
        const id = `custom-model-${endpointId}-${model}`.replace(/[^a-zA-Z0-9._:-]+/g, '-')
        const def: LlmModelDef = {
          id,
          label: (next.addModel.label ?? model).trim() || model,
          endpointId,
          provider,
          model,
          category: 'custom',
          note: next.addModel.note,
          builtin: false,
        }
        const existing = this.config.customModels.findIndex((m) => m.id === id || (m.endpointId === endpointId && m.model === model))
        if (existing >= 0) this.config.customModels[existing] = def
        else this.config.customModels.push(def)
        this.config.endpointId = endpointId
        this.config.provider = provider
        this.config.model = model
      }
    }
    if (typeof next.removeCustomEndpoint === 'string' && next.removeCustomEndpoint.trim()) {
      const id = next.removeCustomEndpoint.trim()
      this.config.customEndpoints = this.config.customEndpoints.filter((e) => e.id !== id)
      this.config.customModels = this.config.customModels.filter((m) => m.endpointId !== id)
      delete this.config.apiKeys[id]
      delete this.config.baseUrls[id]
      unblockEndpoint(this.config, id)
      if (this.config.endpointId === id) {
        this.config.endpointId = DEFAULT_PROVIDER
        this.config.provider = DEFAULT_PROVIDER
        this.config.model = defaultModelFor(DEFAULT_PROVIDER)
      }
    }
    if (typeof next.removeCustomModel === 'string' && next.removeCustomModel.trim()) {
      const id = next.removeCustomModel.trim()
      this.config.customModels = this.config.customModels.filter((m) => m.id !== id)
    }
    if (isAgentToolMode(next.agentMode)) this.config.agentMode = next.agentMode
    if (Array.isArray(next.extraTools)) {
      this.config.extraTools = [...new Set(next.extraTools.map((name) => String(name).trim()).filter(Boolean))]
    }
    const afterKey = prefKey(this.config.endpointId, this.config.model)
    const thinkingPatch = parseThinking(next.thinking)
    const effortPatch = parseEffort(next.reasoningEffort)
    const contextPatch = parseContext(next.contextWindow)
    const speedPatch = parseSpeed(next.speed)
    if (
      afterKey !== beforeKey &&
      thinkingPatch == null &&
      effortPatch == null &&
      contextPatch == null &&
      speedPatch == null
    ) {
      hydrateModelMode(this.config)
    }
    if (thinkingPatch) this.config.thinking = thinkingPatch
    if (effortPatch) this.config.reasoningEffort = effortPatch
    if (contextPatch) this.config.contextWindow = contextPatch
    if (speedPatch) this.config.speed = speedPatch
    rememberModelPrefs(this.config)
    this.syncLlm()
    this.syncToolsMode()
    if (opts?.persist !== false) {
      try {
        writePersisted(this.config)
      } catch (error) {
        console.warn('[chat] failed to persist config', error)
      }
    }
    return this.publicView()
  }

  async complete(messages: ChatMessage[], sessionId?: string) {
    this.syncLlm()
    this.syncToolsMode()
    const last = messages.filter((item) => item.role === 'user').at(-1)?.content?.trim() ?? ''
    const agent = await this.ctx.agents.create(sessionId)
    const result = await agent.send(last)
    return { text: result.text, sessionId: agent.sessionId, steps: result.steps }
  }

  private syncLlm() {
    const llm = this.resolveLlm()
    this.ctx.agents.configure(llm)
  }

  private syncToolsMode() {
    this.ctx.tools.setMode(this.config.agentMode)
    this.ctx.tools.setPinnedExtras(this.config.extraTools)
  }
}

export interface TurnStat {
  turn: number
  stepCount: number
  startTs?: number
  endTs?: number
  durationMs?: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
}

/**
 * 按 turn 计算会话运行统计（纯函数）：
 * - stepCount：该 turn 内 step/start 数
 * - startTs/endTs/durationMs：turn/start → turn/end 的起止与耗时
 * - 额度消耗：该 turn 内所有 assistant/message 事件 usage 的 input/output/cacheRead 汇总
 * targetTurn 传入时只计算/返回该 turn 的单条统计；否则返回 { turn → stat } 映射。
 */
export function computeTurnStats(events: SessionEvent[], targetTurn?: number): Record<string, TurnStat> | TurnStat {
  const stats: Record<string, TurnStat> = {}
  let turn: number | null = null
  let stepCount = 0
  let startTs: number | null = null
  let endTs: number | null = null
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let totalTokens = 0
  const flush = (t: number) => {
    if (!turn || turn !== t) return
    if (targetTurn != null && turn !== targetTurn) return
    stats[String(turn)] = {
      turn,
      stepCount,
      ...(startTs != null ? { startTs } : {}),
      ...(endTs != null ? { endTs } : {}),
      ...(startTs != null && endTs != null ? { durationMs: endTs - startTs } : {}),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      totalTokens,
    }
  }
  for (const event of events) {
    if (event.type === 'turn/start') {
      if (turn != null) flush(turn)
      turn = event.turn
      stepCount = 0
      startTs = event.ts
      endTs = null
      inputTokens = 0
      outputTokens = 0
      cacheReadTokens = 0
      totalTokens = 0
    } else if (event.type === 'turn/end' && turn === event.turn) {
      endTs = event.ts
    } else if (event.type === 'step/start' && turn === event.turn) {
      stepCount += 1
    } else if (event.type === 'assistant/message' && event.usage && turn != null) {
      inputTokens += event.usage.inputTokens || 0
      outputTokens += event.usage.outputTokens || 0
      cacheReadTokens += event.usage.cacheReadTokens || 0
      totalTokens += event.usage.totalTokens || (event.usage.inputTokens || 0) + (event.usage.outputTokens || 0)
    }
  }
  if (turn != null) flush(turn)
  if (targetTurn != null) return stats[String(targetTurn)]
  return stats
}

export const name = 'chat'
export const inject = ['http', 'hub', 'agents', 'sessions', 'systemPrompt', 'tools', 'tasks']

declare module 'cordis' {
  interface Context {
    chat: ChatService
  }
}

export function apply(ctx: Context) {
  const chat = new ChatService(ctx)
  const unknownSession = async (id: string, route: { send: (status: number, body: unknown) => void }) => {
    if (await ctx.sessions.getVisible(id)) return false
    route.send(404, { error: 'unknown session' })
    return true
  }
  ctx.hub.register({
    id: 'chat',
    title: '对话',
    subtitle: 'session + ctx.agents',
    plugin: 'chat',
    kind: 'chat',
  })

  ctx.http.route('GET', '/api/chat/config', (route) => {
    route.send(200, chat.publicView())
  })
  ctx.http.route('POST', '/api/chat/config', async (route) => {
    const payload = (await route.json()) as Partial<{
      endpointId: string
      provider: ChatProvider
      apiKey: string
      model: string
      baseUrl: string
      systemPrompt: string
      agentMode: AgentToolMode
      extraTools: string[]
      setApiKey: Partial<Record<string, string | null>>
      setBaseUrl: Partial<Record<string, string | null>>
      addEndpoint: { id?: string; label: string; baseUrl: string; protocol?: 'openai-compat' | 'anthropic'; provider?: ChatProvider; note?: string }
      addModel: { endpointId: string; model: string; label?: string; note?: string }
      removeCustomEndpoint: string
      removeCustomModel: string
    }>
    route.send(200, chat.patch(payload ?? {}))
  })
  ctx.http.route('POST', '/api/chat/config/test', async (route) => {
    const payload = ((await route.json().catch(() => null)) ?? {}) as {
      endpointId?: string
      apiKey?: string
      baseUrl?: string
      model?: string
    }
    try {
      const result = await chat.testConnection(payload)
      if (result.ok) {
        const config = chat.markEndpointReachable(result.endpointId, {
          ...(typeof payload.apiKey === 'string' && payload.apiKey.trim()
            ? { apiKey: payload.apiKey.trim() }
            : {}),
          ...(typeof payload.baseUrl === 'string' && payload.baseUrl.trim()
            ? { baseUrl: payload.baseUrl.trim() }
            : {}),
        })
        route.send(200, { ...result, config })
        return
      }
      const config = chat.invalidateEndpoint(result.endpointId)
      route.send(400, { ...result, config })
    } catch (error) {
      route.send(500, { ok: false, detail: String(error) })
    }
  })
  ctx.http.route('PATCH', '/api/sessions/:id/config', async (route) => {
    try {
      if (await unknownSession(route.params.id, route)) return
      const payload = ((await route.json().catch(() => null)) ?? {}) as Record<string, unknown>
      const patch: {
        title?: string | null
        model?: string
        provider?: SessionConfig['provider']
        systemPrompt?: string | null
        agentMode?: AgentToolMode
        extraTools?: string[]
        tags?: string[]
        pinned?: boolean
        inspector?: SessionConfig['inspector'] | null
      } = {}
      if (typeof payload.title === 'string' || payload.title === null) patch.title = payload.title as string | null
      if (typeof payload.model === 'string') patch.model = payload.model
      if (payload.provider === 'deepseek' || payload.provider === 'openai' || payload.provider === 'anthropic') {
        patch.provider = payload.provider
      }
      if (typeof payload.systemPrompt === 'string' || payload.systemPrompt === null) {
        patch.systemPrompt = payload.systemPrompt as string | null
      }
      if (isAgentToolMode(payload.agentMode)) patch.agentMode = payload.agentMode
      if (Array.isArray(payload.extraTools)) patch.extraTools = payload.extraTools.map((name) => String(name))
      if (Array.isArray(payload.tags)) patch.tags = payload.tags.map((name) => String(name))
      if (typeof payload.pinned === 'boolean') patch.pinned = payload.pinned
      if (payload.inspector === null) patch.inspector = null
      else if (payload.inspector && typeof payload.inspector === 'object' && !Array.isArray(payload.inspector)) {
        patch.inspector = payload.inspector as SessionConfig['inspector']
      }
      const record = await ctx.sessions.patchConfig(
        route.params.id,
        patch as SessionConfig & { title?: string | null; systemPrompt?: string | null; inspector?: SessionConfig['inspector'] | null },
      )
      const resolved = chat.resolveEffective(record.id)
      route.send(200, {
        id: record.id,
        config: record.config ?? null,
        defaults: resolved.defaults,
        effective: resolved.effective,
      })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  })
  ctx.http.route('GET', '/api/sessions/:id', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const turnsRaw = route.query.get('turns')
    const limitTurns =
      turnsRaw == null || turnsRaw === ''
        ? DEFAULT_TAIL_TURNS
        : turnsRaw === 'all'
          ? 0
          : Math.max(0, Number(turnsRaw) || DEFAULT_TAIL_TURNS)
    const window = sliceTailTurns(record.events, limitTurns)
    const payload: Record<string, unknown> = {
      id: record.id,
      version: record.version,
      events: window.events,
      hasMore: window.hasMore,
      totalTurns: window.totalTurns,
      totalEvents: window.totalEvents,
      oldestSeq: window.oldestSeq,
      newestSeq: window.newestSeq,
      ...(record.project ? { project: record.project } : {}),
      ...(record.mascot ? { mascot: record.mascot } : {}),
      ...(record.config ? { config: record.config } : {}),
    }
    const summaries = await ctx.sessions.listSummaries()
    const workers = []
    const titles = new Map<string, string>()
    const mascots = new Map<string, NonNullable<(typeof summaries)[number]['mascot']>>()
    const projects = new Map<string, { name: string; path?: string }>()
    for (const item of summaries) {
      titles.set(item.id, item.title)
      if (item.mascot) mascots.set(item.id, item.mascot)
      if (item.project?.name) {
        projects.set(item.id, {
          name: item.project.name,
          ...(item.project.path ? { path: item.project.path } : {}),
        })
      }
      if (item.id === record.id) continue
      const worker = await ctx.sessions.require(item.id)
      workers.push({ id: item.id, events: worker.events })
    }
    const liveTasks = await loadLiveDispatchTasks(ctx, record.id)
    const dispatched = collectLiveDispatchedTasks(record.id, record.events, workers, liveTasks)
    payload.dispatchedUsage = dispatched.total
    payload.dispatchedUsageByTurn = Object.fromEntries(
      Object.entries(dispatched.byLiveTurn).map(([key, value]) => [key, value.usage]),
    )
    payload.dispatchedTasksByTurn = Object.fromEntries(
      Object.entries(dispatched.byLiveTurn).map(([key, value]) => [
        key,
        value.tasks.map((task) => ({
          ...task,
          title: titles.get(task.sessionId) ?? task.sessionId.slice(0, 8),
          ...(mascots.get(task.sessionId) ? { mascot: mascots.get(task.sessionId) } : {}),
          ...(projects.get(task.sessionId) ? { project: projects.get(task.sessionId) } : {}),
        })),
      ]),
    )
    route.send(200, payload)
  })
  ctx.http.route('GET', '/api/sessions/:id/events', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const beforeSeq = Number(route.query.get('beforeSeq'))
    if (!Number.isFinite(beforeSeq)) return route.send(400, { error: 'beforeSeq required' })
    const turnsRaw = route.query.get('turns')
    const limitTurns =
      turnsRaw == null || turnsRaw === ''
        ? DEFAULT_TAIL_TURNS
        : Math.max(1, Number(turnsRaw) || DEFAULT_TAIL_TURNS)
    const window = sliceBeforeTurns(record.events, beforeSeq, limitTurns)
    route.send(200, {
      id: record.id,
      events: window.events,
      hasMore: window.hasMore,
      totalTurns: window.totalTurns,
      totalEvents: window.totalEvents,
      oldestSeq: window.oldestSeq,
      newestSeq: window.newestSeq,
    })
  })
  ctx.http.route('GET', '/api/sessions/:id/trajectory', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const beforeSeqRaw = route.query.get('beforeSeq')
    const turnsRaw = route.query.get('turns')
    const limitTurns =
      turnsRaw == null || turnsRaw === ''
        ? DEFAULT_TRAJECTORY_TURNS
        : turnsRaw === 'all'
          ? 0
          : Math.max(0, Number(turnsRaw) || DEFAULT_TRAJECTORY_TURNS)
    const window =
      beforeSeqRaw != null && beforeSeqRaw !== ''
        ? buildTrajectoryBefore(record.events, Number(beforeSeqRaw), limitTurns || DEFAULT_TRAJECTORY_TURNS)
        : buildTrajectoryWindow(record.events, limitTurns)
    route.send(200, {
      id: record.id,
      rows: window.rows,
      hasMore: window.hasMore,
      totalTurns: window.totalTurns,
      totalEvents: window.totalEvents,
      oldestSeq: window.oldestSeq,
      newestSeq: window.newestSeq,
    })
  })
  // 全量 usage 趋势：提取本会话所有 step（assistant/message 带 usage）的 input/output/cacheRead，供前端折线图。
  ctx.http.route('GET', '/api/sessions/:id/usage-trend', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const points: Array<{ seq: number; turn: number; input: number; output: number; cache: number }> = []
    const compactions: number[] = []
    let turn = 0
    for (const event of record.events) {
      if (event.type === 'step/start') turn = event.turn
      if (isSessionCompactPoint(event)) {
        compactions.push(event.seq)
        continue
      }
      if (event.type !== 'assistant/message' || !event.usage) continue
      points.push({
        seq: event.seq,
        turn,
        input: event.usage.inputTokens || 0,
        output: event.usage.outputTokens || 0,
        cache: event.usage.cacheReadTokens || 0,
      })
    }
    route.send(200, { points, compactions })
  })
  // 按 turn 取跨 session 统计：给定某 turn，返回 step 数 / 起止 / 耗时 / token 与额度消耗。
  // 供任务面板在展示 task_report 回传条时定位到 report.sessionId 所属 session 的该 turn 运行统计。
  ctx.http.route('GET', '/api/sessions/:id/turn-stats', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const turnsRaw = route.query.get('turn')
    const targetTurn =
      turnsRaw != null && turnsRaw !== '' && Number.isFinite(Number(turnsRaw)) ? Number(turnsRaw) : undefined
    const result = computeTurnStats(record.events, targetTurn)
    if (targetTurn != null) {
      if (!result) return route.send(404, { error: 'unknown turn' })
      return route.send(200, result)
    }
    route.send(200, { turns: result as Record<string, TurnStat> })
  })
  ctx.http.route('GET', '/api/sessions/:id/artifacts/:name', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const file = await readArtifactFile(route.params.id, route.params.name)
    if (!file) return route.send(404, { error: 'unknown artifact' })
    if (route.res.headersSent) return
    route.res.writeHead(200, {
      'content-type': file.mime,
      'cache-control': 'private, max-age=3600',
      'content-length': file.data.byteLength,
    })
    route.res.end(file.data)
  })
  ctx.http.route('GET', '/api/sessions/:id/events/:seq', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const seq = Number(route.params.seq)
    if (!Number.isFinite(seq)) return route.send(400, { error: 'invalid seq' })
    const event = findEvent(record.events, seq)
    if (!event) return route.send(404, { error: 'unknown event' })
    route.send(200, { id: record.id, event })
  })
  ctx.http.route('GET', '/api/sessions/:id/events/:seq/request', async (route) => {
    const record = await ctx.sessions.getVisible(route.params.id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const seq = Number(route.params.seq)
    if (!Number.isFinite(seq)) return route.send(400, { error: 'invalid seq' })
    const event = findEvent(record.events, seq)
    if (!event) return route.send(404, { error: 'unknown event' })
    if (event.type !== 'assistant/message') {
      return route.send(400, { error: 'request derivation only for assistant/message' })
    }
    // 工具定义 token 估算：当前可见工具集合 schema 序列化后的估算值（轨迹回放时各 step 近似恒定）。
    // 与 agent-loop 实际传给 LLM 的 ctx.tools.schemas() 对齐，作为第 4 类「工具定义」占比基线。
    const toolsSchemaTokens = estimateTokens(JSON.stringify(ctx.tools.schemas()))
    route.send(200, {
      id: record.id,
      seq,
      messages: buildRequestMessages(record.events, seq),
      toolsTokens: toolsSchemaTokens,
    })
  })
  ctx.http.route('PUT', '/api/sessions/:id/project', async (route) => {
    const payload = (await route.json()) as { path?: string | null; name?: string | null }
    try {
      if (await unknownSession(route.params.id, route)) return
      // path 优先；兼容旧客户端误传 name=null 解绑
      const rawPath = payload.path !== undefined ? payload.path : payload.name
      if (rawPath == null || rawPath === '') {
        await ctx.sessions.setProject(route.params.id, null)
        return route.send(200, { ok: true, project: null })
      }
      const project = await ctx.sessions.setProject(route.params.id, { path: String(rawPath) })
      route.send(200, { ok: true, project })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/sessions/:id/project/pick', async (route) => {
    try {
      if (await unknownSession(route.params.id, route)) return
      const { pickHostDirectory } = await import('@biu/host-fs/workspace-pick')
      const current = (await ctx.sessions.getVisible(route.params.id))?.project?.path
      const path = await pickHostDirectory(current)
      const project = await ctx.sessions.setProject(route.params.id, { path })
      route.send(200, { ok: true, project })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'DirectoryPickCancelled') return route.send(200, { ok: false, cancelled: true })
      if (name === 'DirectoryPickUnavailable') return route.send(501, { error: String(error) })
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/sessions/:id/fork', async (route) => {
    try {
      if (await unknownSession(route.params.id, route)) return
      const child = await ctx.sessions.fork(route.params.id)
      route.send(201, {
        id: child.id,
        version: child.version,
        parentId: route.params.id,
        ...(child.mascot ? { mascot: child.mascot } : {}),
      })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('DELETE', '/api/sessions/:id', async (route) => {
    const id = route.params.id
    if (await unknownSession(id, route)) return
    ctx.agents.get(id)?.dispose()
    const ok = await ctx.sessions.delete(id)
    if (!ok) return route.send(404, { error: 'unknown session' })
    route.send(200, { ok: true, id })
  })
  ctx.http.route('POST', '/api/sessions/:id/messages', async (route) => {
    if (await unknownSession(route.params.id, route)) return
    const payload = (await route.json()) as {
      text?: string
      kind?: 'wake' | 'inject'
      wait?: boolean
      extraTools?: string[]
      images?: Array<{ name?: string; mime?: string; url?: string }>
      liveContext?: unknown
    }
    const agent = await ctx.agents.create(route.params.id)
    // re-sync in-memory LLM without rewriting disk
    chat.patch({}, { persist: false })
    const extraTools = Array.isArray(payload.extraTools)
      ? [...new Set(payload.extraTools.map((name) => String(name).trim()).filter(Boolean))]
      : []
    const images = Array.isArray(payload.images)
      ? payload.images
          .map((img) => ({
            name: String(img.name ?? '').trim(),
            mime: String(img.mime ?? '').trim(),
            url: String(img.url ?? '').trim(),
          }))
          .filter((img) => img.name && img.mime && img.url)
      : []
    const liveContext = sanitizeLiveUiContext(payload.liveContext)
    const sendOpts = {
      ...(extraTools.length ? { extraTools } : {}),
      // 默认不等待整回合：聊天要靠 WS 推 chunk。显式 wait:true 才阻塞 HTTP。
      wait: payload.wait === true,
      ...(images.length ? { images } : {}),
      ...(liveContext ? { liveContext } : {}),
    }
    if (payload.kind === 'inject') {
      agent.inject(payload.text ?? '', sendOpts)
      return route.send(200, {
        sessionId: agent.sessionId,
        queued: true,
        inbox: ctx.agents.listInbox(agent.sessionId),
      })
    }
    try {
      const turn = await agent.send(payload.text ?? '', sendOpts)
      route.send(200, {
        sessionId: agent.sessionId,
        text: turn.text,
        steps: turn.steps,
        queued: Boolean(sendOpts.wait === false || ctx.agents.isBusy(agent.sessionId)),
        inbox: ctx.agents.listInbox(agent.sessionId),
      })
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/sessions/:id/inbox', async (route) => {
    const id = route.params.id
    if (!(await ctx.sessions.getVisible(id))) return route.send(404, { error: 'unknown session' })
    await ctx.agents.create(id)
    route.send(200, { sessionId: id, inbox: ctx.agents.listInbox(id) })
  })
  ctx.http.route('POST', '/api/sessions/:id/cancel', async (route) => {
    const id = route.params.id
    if (!(await ctx.sessions.getVisible(id))) return route.send(404, { error: 'unknown session' })
    const agent = await ctx.agents.create(id)
    agent.cancel()
    route.send(200, { ok: true })
  })
  // 清空上下文：不经过大模型，仅向会话事件日志插入一条 context_clear tool/call 记录（作为压缩点）。
  ctx.http.route('POST', '/api/sessions/:id/clear-context', async (route) => {
    const id = route.params.id
    if (!(await ctx.sessions.getVisible(id))) return route.send(404, { error: 'unknown session' })
    const event = await ctx.sessions.append(id, {
      type: 'tool/call',
      id: crypto.randomUUID(),
      name: 'context_clear',
      arguments: '{}',
    })
    route.send(200, { ok: true, sessionId: id, seq: event.seq, ts: event.ts })
  })
  ctx.http.route('POST', '/api/sessions/:id/inbox/flush', async (route) => {
    const id = route.params.id
    if (!(await ctx.sessions.getVisible(id))) return route.send(404, { error: 'unknown session' })
    const agent = await ctx.agents.create(id)
    chat.patch({}, { persist: false })
    try {
      const result = await agent.flush({ wait: false })
      route.send(200, {
        sessionId: id,
        flushed: result.flushed,
        inbox: ctx.agents.listInbox(id),
      })
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/chat', async (route) => {
    const payload = (await route.json()) as { messages?: ChatMessage[]; sessionId?: string; text?: string }
    const messages = Array.isArray(payload?.messages)
      ? payload.messages
      : [{ role: 'user' as const, content: payload.text ?? '' }]
    try {
      route.send(200, await chat.complete(messages, payload.sessionId))
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })
  registerChatInspectorRoutes(ctx)
}
