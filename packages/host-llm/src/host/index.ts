import { Service, type Context } from 'cordis'

export type ChatProvider = 'deepseek' | 'openai' | 'anthropic'

export interface LlmConfig {
  provider: ChatProvider
  apiKey: string
  model: string
  /**
   * 可选自定义 API 根地址（官方 / 中转站 / 本地）。
   * openai-compat：拼 `/chat/completions`；anthropic：拼 `/messages`。
   * 也可直接传入已含后缀的完整 URL。
   */
  baseUrl?: string
  /** DeepSeek V4 / Claude 扩展思考：显式开关，避免上游默认开思考把页面卡死。 */
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'high' | 'max'
}

export function attachProviderOptions(
  body: Record<string, unknown>,
  config: LlmConfig,
  protocol: 'openai-compat' | 'anthropic',
) {
  if (protocol === 'anthropic') {
    if (config.thinking === 'enabled') {
      body.thinking = { type: 'enabled', budget_tokens: 10_000 }
    } else if (config.thinking === 'disabled') {
      body.thinking = { type: 'disabled' }
    }
    return
  }
  if (config.thinking === 'disabled') {
    body.thinking = { type: 'disabled' }
    return
  }
  if (config.thinking === 'enabled') {
    body.thinking = { type: 'enabled' }
  }
  if (config.reasoningEffort === 'high' || config.reasoningEffort === 'max') {
    body.reasoning_effort = config.reasoningEffort
  }
}

/** 把用户配置的 baseUrl 解析成 chat.completions 完整地址。 */
export function resolveChatCompletionsUrl(baseUrl: string | undefined, provider: ChatProvider): string {
  if (baseUrl?.trim()) {
    const trimmed = baseUrl.trim().replace(/\/+$/, '')
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed
    return `${trimmed}/chat/completions`
  }
  return provider === 'deepseek'
    ? 'https://api.deepseek.com/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
}

/** 把用户配置的 baseUrl 解析成 Anthropic messages 完整地址。 */
export function resolveAnthropicMessagesUrl(baseUrl: string | undefined): string {
  if (baseUrl?.trim()) {
    const trimmed = baseUrl.trim().replace(/\/+$/, '')
    if (/\/messages$/i.test(trimmed)) return trimmed
    return `${trimmed}/messages`
  }
  return 'https://api.anthropic.com/v1/messages'
}

/** OpenAI 兼容：列出模型的 GET 地址（…/models）。 */
export function resolveModelsListUrl(baseUrl: string | undefined, provider: ChatProvider): string {
  if (baseUrl?.trim()) {
    const trimmed = baseUrl.trim().replace(/\/+$/, '')
    if (/\/models$/i.test(trimmed)) return trimmed
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, '/models')
    return `${trimmed}/models`
  }
  return provider === 'deepseek' ? 'https://api.deepseek.com/models' : 'https://api.openai.com/v1/models'
}

export type LlmProbeResult =
  | { ok: true; latencyMs: number; detail: string }
  | { ok: false; latencyMs: number; detail: string }

/**
 * 轻量连通性探测：优先 GET /models；失败则发一条极短非流式 chat。
 * Anthropic 走一条 max_tokens=1 的 Messages 请求。
 */
export async function probeLlmConnection(
  config: LlmConfig,
  opts?: { signal?: AbortSignal },
): Promise<LlmProbeResult> {
  const started = Date.now()
  const apiKey = config.apiKey?.trim() || ''
  if (!apiKey) {
    return { ok: false, latencyMs: 0, detail: '未配置 API Key' }
  }

  try {
    if (config.provider === 'anthropic') {
      const url = resolveAnthropicMessagesUrl(config.baseUrl)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: opts?.signal,
      })
      const latencyMs = Date.now() - started
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const err = (await res.json()) as { error?: { message?: string } }
          if (err.error?.message) detail = err.error.message
        } catch {
          /* ignore */
        }
        return { ok: false, latencyMs, detail }
      }
      return { ok: true, latencyMs, detail: `Anthropic Messages · ${latencyMs}ms` }
    }

    // OpenAI 兼容：先试 /models
    const modelsUrl = resolveModelsListUrl(config.baseUrl, config.provider)
    const listRes = await fetch(modelsUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: opts?.signal,
    })
    if (listRes.ok) {
      const latencyMs = Date.now() - started
      let count = 0
      try {
        const body = (await listRes.json()) as { data?: unknown[] }
        if (Array.isArray(body.data)) count = body.data.length
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        latencyMs,
        detail: count > 0 ? `GET /models · ${count} 个模型 · ${latencyMs}ms` : `GET /models · ${latencyMs}ms`,
      }
    }

    // /models 不可用时回退 chat/completions
    const chatUrl = resolveChatCompletionsUrl(config.baseUrl, config.provider)
    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: opts?.signal,
    })
    const latencyMs = Date.now() - started
    if (!chatRes.ok) {
      let detail = `HTTP ${chatRes.status}`
      try {
        const err = (await chatRes.json()) as { error?: { message?: string } }
        if (err.error?.message) detail = err.error.message
      } catch {
        /* ignore */
      }
      // 附带 /models 失败信息，便于排查
      detail = `${detail}（/models → ${listRes.status}）`
      return { ok: false, latencyMs, detail }
    }
    return { ok: true, latencyMs, detail: `chat/completions · ${latencyMs}ms` }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/** DeepSeek 视觉模型：检测到图片输入时自动路由到它。 */
export const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp'

/** 多模态内容块：文本 或 图片（data URL / http URL）。 */
export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type LlmMessageContent = string | LlmContentPart[] | null

export interface LlmMessage {
  role: string
  content?: LlmMessageContent
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

/** 若消息 content 含图片块则返回 true（用于触发视觉模型路由）。 */
export function hasImageContent(content: LlmMessageContent | undefined): boolean {
  if (typeof content !== 'object' || !Array.isArray(content)) return false
  return content.some((part) => part.type === 'image_url')
}

function textFromContent(content: LlmMessageContent | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : String(content)
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

function imagePartsFromContent(content: LlmMessageContent | undefined): LlmContentPart[] {
  if (!Array.isArray(content)) return []
  return content.filter((part): part is { type: 'image_url'; image_url: { url: string } } => part.type === 'image_url')
}

/**
 * Chat Completions 的 tool 角色只接受字符串。成熟做法：工具文本留在 tool，
 * 图像跟在该批 tool 消息之后的一条 user 多模态消息里（DeepSeek / GPT-4o 同款）。
 */
export function flattenToolImagesForChatCompletions(messages: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = []
  let pending: LlmContentPart[] = []
  const flush = () => {
    if (!pending.length) return
    out.push({
      role: 'user',
      content: [{ type: 'text', text: '（工具返回的图像）' }, ...pending],
    })
    pending = []
  }
  for (const message of messages) {
    if (message.role === 'tool') {
      const images = imagePartsFromContent(message.content)
      if (images.length) {
        out.push({ ...message, content: textFromContent(message.content) })
        pending.push(...images)
        continue
      }
      // 同一批 tool_calls 的后续 tool 即使没图也不能先 flush 图像 user，否则会拆对。
      out.push(message)
      continue
    }
    flush()
    out.push(message)
  }
  flush()
  return out
}

function anthropicImageBlock(url: string): Record<string, unknown> | null {
  const data = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(url)
  if (data) {
    const media = data[1]!.toLowerCase() === 'image/jpg' ? 'image/jpeg' : data[1]!.toLowerCase()
    return {
      type: 'image',
      source: { type: 'base64', media_type: media, data: data[2]!.replace(/\s+/g, '') },
    }
  }
  if (/^https?:\/\//i.test(url)) {
    return { type: 'image', source: { type: 'url', url } }
  }
  return null
}

/** OpenAI image_url → Anthropic image / text 块；tool 角色包成 tool_result。 */
export function toAnthropicContent(
  content: LlmMessageContent | undefined,
  toolCallId?: string,
): unknown {
  let blocks: unknown
  if (typeof content === 'string' || content == null) {
    blocks = content ?? ''
  } else if (Array.isArray(content)) {
    const parts: Record<string, unknown>[] = []
    for (const part of content) {
      if (part.type === 'text') {
        if (part.text) parts.push({ type: 'text', text: part.text })
      } else if (part.type === 'image_url') {
        const image = anthropicImageBlock(part.image_url.url)
        if (image) parts.push(image)
      }
    }
    blocks = parts.length ? parts : ''
  } else {
    blocks = ''
  }
  if (!toolCallId) return blocks
  return [{ type: 'tool_result', tool_use_id: toolCallId, content: blocks }]
}

/** OpenAI/DeepSeek：带 tool_calls 时 content 宜为 null，空字符串可能导致后续回合拒答。 */
export function assistantContentForApi(text: string | undefined | null, hasToolCalls: boolean): string | null {
  if (hasToolCalls && !text) return null
  return text ?? null
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

/** 对标 dsh：挂在 assistant/message 上的 provider usage（瘦字段）。 */
export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
}

export interface AssistantReply {
  content: string | null
  toolCalls: ToolCall[]
  usage?: LlmUsage
}

export interface ChatOptions {
  /** 文本 delta；agent-loop 用来即时 append `assistant/chunk`。 */
  onDelta?: (text: string) => void | Promise<void>
  /** 思考/reasoning delta（DeepSeek V4 `reasoning_content` 等）；不进最终 message。 */
  onReasoningDelta?: (text: string) => void | Promise<void>
  /** 工具调用增量（name 出现后就开始推，长参数不必等整段生成完）。 */
  onToolDelta?: (call: { id: string; name: string; arguments: string }) => void | Promise<void>
}

export interface LlmClient {
  chat(
    messages: LlmMessage[],
    tools?: unknown[],
    signal?: AbortSignal,
    options?: ChatOptions,
  ): Promise<AssistantReply>
}

export function parseProviderUsage(raw: unknown): LlmUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const u = raw as Record<string, unknown>
  const input = num(u.prompt_tokens ?? u.input_tokens ?? u.inputTokens)
  const output = num(u.completion_tokens ?? u.output_tokens ?? u.outputTokens)
  if (input == null && output == null) return undefined
  const total = num(u.total_tokens ?? u.totalTokens)
  const cacheRead = num(
    u.prompt_cache_hit_tokens ?? u.cache_read_input_tokens ?? u.cacheReadTokens,
  )
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    ...(total != null ? { totalTokens: total } : {}),
    ...(cacheRead != null ? { cacheReadTokens: cacheRead } : {}),
  }
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function formatUsage(usage: LlmUsage | undefined): string {
  if (!usage) return ''
  const parts = [`${usage.inputTokens}→${usage.outputTokens}`]
  if (usage.cacheReadTokens) parts.push(`cache ${usage.cacheReadTokens}`)
  return parts.join(' · ')
}

interface StreamToolAcc {
  id: string
  name: string
  arguments: string
}

/** 解析 OpenAI/DeepSeek chat.completions SSE；`[DONE]` 结束。不引入 eventsource-parser。 */
export async function consumeChatCompletionSse(
  stream: ReadableStream<Uint8Array>,
  options: {
    onDelta?: (text: string) => void | Promise<void>
    onReasoningDelta?: (text: string) => void | Promise<void>
    onToolDelta?: (call: { id: string; name: string; arguments: string }) => void | Promise<void>
    signal?: AbortSignal
  } = {},
): Promise<AssistantReply> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: LlmUsage | undefined
  const tools = new Map<number, StreamToolAcc>()
  let sawDone = false

  const onAbort = () => {
    void reader.cancel().catch(() => undefined)
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      if (options.signal?.aborted) throw new Error('cancelled')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const payload = sseDataLine(line)
        if (payload === undefined) continue
        if (payload === '[DONE]') {
          sawDone = true
          break
        }
        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null
              reasoning_content?: string | null
              reasoning?: string | null
              tool_calls?: Array<{
                index?: number
                id?: string
                function?: { name?: string; arguments?: string }
              }>
            }
          }>
          usage?: unknown
          error?: { message?: string }
        }
        try {
          chunk = JSON.parse(payload) as typeof chunk
        } catch {
          continue
        }
        if (chunk.error?.message) throw new Error(chunk.error.message)
        const delta = chunk.choices?.[0]?.delta
        const reasoning = delta?.reasoning_content ?? delta?.reasoning
        if (typeof reasoning === 'string' && reasoning.length) {
          await options.onReasoningDelta?.(reasoning)
        }
        const text = delta?.content
        if (typeof text === 'string' && text.length) {
          content += text
          await options.onDelta?.(text)
        }
        for (const call of delta?.tool_calls ?? []) {
          const index = typeof call.index === 'number' ? call.index : 0
          const acc = tools.get(index) ?? { id: '', name: '', arguments: '' }
          if (call.id) acc.id = call.id
          if (call.function?.name) acc.name = call.function.name
          if (typeof call.function?.arguments === 'string') acc.arguments += call.function.arguments
          tools.set(index, acc)
          if (acc.id && acc.name) await options.onToolDelta?.({ id: acc.id, name: acc.name, arguments: acc.arguments })
        }
        const nextUsage = parseProviderUsage(chunk.usage)
        if (nextUsage) usage = nextUsage
      }
      if (sawDone) break
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }

  if (options.signal?.aborted) throw new Error('cancelled')

  const toolCalls: ToolCall[] = [...tools.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: call.name,
      arguments: call.arguments || '{}',
    }))
    .filter((call) => call.name)

  return {
    content: content || null,
    toolCalls,
    ...(usage ? { usage } : {}),
  }
}

function sseDataLine(line: string): string | undefined {
  if (!line.startsWith('data:')) return undefined
  return line.slice(5).replace(/^ /, '')
}

export class OpenAiCompatLlm implements LlmClient {
  constructor(private config: LlmConfig) {}

  async chat(
    messages: LlmMessage[],
    tools: unknown[] = [],
    signal?: AbortSignal,
    options?: ChatOptions,
  ): Promise<AssistantReply> {
    const url = resolveChatCompletionsUrl(this.config.baseUrl, this.config.provider)
    // 仅 deepseek provider 支持自动路由到视觉模型；openai/anthropic 保持配置原状。
    const payload = flattenToolImagesForChatCompletions(messages)
    const hasImage = payload.some((m) => hasImageContent(m.content))
    const model =
      this.config.provider === 'deepseek' && hasImage
        ? DEEPSEEK_VISION_MODEL
        : this.config.model
    const body: Record<string, unknown> = {
      model,
      messages: payload,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (tools.length) {
      body.tools = tools
      body.tool_choice = 'auto'
    }
    attachProviderOptions(body, this.config, 'openai-compat')
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) {
      let detail = `llm http ${res.status}`
      try {
        const err = (await res.json()) as { error?: { message?: string } }
        if (err.error?.message) detail = err.error.message
      } catch {
        /* ignore */
      }
      throw new Error(detail)
    }
    if (!res.body) throw new Error('llm stream missing body')
    return consumeChatCompletionSse(res.body, { onDelta: options?.onDelta, onReasoningDelta: options?.onReasoningDelta, onToolDelta: options?.onToolDelta, signal })
  }
}

/**
 * Anthropic Messages API（/v1/messages，SSE）。请求体与事件格式均不同于 OpenAI 兼容接口：
 *  - 鉴权用 `x-api-key` + `anthropic-version` 头，不带 `authorization: Bearer`；
 *  - 顶层字段 `system`（字符串，放 system 消息）、`max_tokens`；
 *  - 工具参数通过 `content_block_delta` 里的 `input_json_delta.partial_json` 增量累积；
 *  - 结束由 `message_stop` 标志，无 `[DONE]`。
 */
export class AnthropicLlm implements LlmClient {
  constructor(private config: LlmConfig) {}

  async chat(
    messages: LlmMessage[],
    tools: unknown[] = [],
    signal?: AbortSignal,
    options?: ChatOptions,
  ): Promise<AssistantReply> {
    const endpoint = resolveAnthropicMessagesUrl(this.config.baseUrl)
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content ?? '')
      .filter((c) => c)
      .join('\n\n')
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'tool' ? 'user' : m.role,
          ...(m.content && !m.tool_call_id && !m.tool_calls?.length ? { content: toAnthropicContent(m.content) } : {}),
          ...(m.tool_call_id ? { content: toAnthropicContent(m.content, m.tool_call_id) } : {}),
          ...(m.tool_calls?.length
            ? {
                content: m.tool_calls.map((call) => ({
                  type: 'tool_use' as const,
                  id: call.id,
                  name: call.function.name,
                  input: parseToolJson(call.function.arguments),
                })),
              }
            : {}),
        })),
      stream: true,
    }
    if (tools.length) {
      body.tools = tools.map((item) => {
        const fn = (item as { function?: { name: string; description?: string; parameters?: unknown } })
          .function
        return {
          name: fn?.name ?? 'unknown',
          description: fn?.description ?? '',
          input_schema: (fn?.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} },
        }
      })
    }
    attachProviderOptions(body, this.config, 'anthropic')
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) {
      let detail = `llm http ${res.status}`
      try {
        const err = (await res.json()) as { error?: { message?: string } }
        if (err.error?.message) detail = err.error.message
      } catch {
        /* ignore */
      }
      throw new Error(detail)
    }
    if (!res.body) throw new Error('llm stream missing body')
    return consumeMessagesSse(res.body, { onDelta: options?.onDelta, onReasoningDelta: options?.onReasoningDelta, onToolDelta: options?.onToolDelta, signal })
  }
}

function parseToolJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // 返回暂存原串，避免构造请求直接抛出
    return { _raw: text }
  }
}

/** 解析 Anthropic Messages SSE：text（text_delta）+ 工具参数（input_json_delta）累积。 */
async function consumeMessagesSse(
  stream: ReadableStream<Uint8Array>,
  options: { onDelta?: (text: string) => void | Promise<void>; onReasoningDelta?: (text: string) => void | Promise<void>; onToolDelta?: (call: { id: string; name: string; arguments: string }) => void | Promise<void>; signal?: AbortSignal } = {},
): Promise<AssistantReply> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: LlmUsage | undefined
  const toolBlocks: Array<{ id?: string; name?: string; input: string }> = []
  let sawStop = false

  const onAbort = () => void reader.cancel().catch(() => undefined)
  options.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      if (options.signal?.aborted) throw new Error('cancelled')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payloadLine = line.slice(5).trim()
        if (!payloadLine) continue
        let evt: Record<string, unknown>
        try {
          evt = JSON.parse(payloadLine) as Record<string, unknown>
        } catch {
          continue
        }
        switch (evt.type) {
          case 'message_start': {
            const message = evt.message as { usage?: unknown } | undefined
            const nextUsage = parseProviderUsage(message?.usage)
            if (nextUsage) usage = nextUsage
            break
          }
          case 'message_delta': {
            const nextUsage = parseProviderUsage(evt.usage)
            if (nextUsage) usage = nextUsage
            break
          }
          case 'content_block_start': {
            const block = evt.content_block as { type?: string; id?: string; name?: string } | undefined
            if (block?.type === 'tool_use') {
              toolBlocks.push({ id: block.id, name: block.name, input: '' })
              if (block.id && block.name) {
                await options.onToolDelta?.({ id: block.id, name: block.name, arguments: '' })
              }
            }
            break
          }
          case 'content_block_delta': {
            const delta = evt.delta as { type?: string; text?: string; partial_json?: string; thinking?: string } | undefined
            if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length) {
              content += delta.text
              await options.onDelta?.(delta.text)
            } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking.length) {
              await options.onReasoningDelta?.(delta.thinking)
            } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
              const last = toolBlocks[toolBlocks.length - 1]
              if (last) {
                last.input += delta.partial_json
                if (last.id && last.name) {
                  await options.onToolDelta?.({ id: last.id, name: last.name, arguments: last.input })
                }
              }
            }
            break
          }
          case 'message_stop':
            sawStop = true
            break
        }
      }
      if (sawStop) break
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }

  if (options.signal?.aborted) throw new Error('cancelled')

  const toolCalls: ToolCall[] = toolBlocks
    .filter((block) => block.name)
    .map((block) => ({
      id: block.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: block.name ?? '',
      arguments: block.input.trim() || '{}',
    }))

  return {
    content: content || null,
    toolCalls,
    ...(usage ? { usage } : {}),
  }
}

export class LlmService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'llm')
  }

  forConfig(config: LlmConfig): LlmClient {
    const ctx = this.ctx
    const client =
      config.provider === 'anthropic'
        ? new AnthropicLlm(config)
        : new OpenAiCompatLlm(config)
    return {
      chat: async (messages, tools = [], signal, options) => {
        ctx.emit('llm/request', { model: config.model, provider: config.provider })
        const reply = await client.chat(messages, tools, signal, {
          onDelta: async (text) => {
            ctx.emit('llm/stream', { text })
            await options?.onDelta?.(text)
          },
          onReasoningDelta: options?.onReasoningDelta,
          onToolDelta: options?.onToolDelta,
        })
        return reply
      },
    }
  }
}

export const name = 'llm'
export const inject = [] as const

export function apply(ctx: Context) {
  new LlmService(ctx)
}
