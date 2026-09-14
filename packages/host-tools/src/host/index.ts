import { AsyncLocalStorage } from 'node:async_hooks'
import { Service, type Context } from 'cordis'

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, signal: AbortSignal) => unknown | Promise<unknown>
}

export type ToolOrigin = 'core' | 'store'

export interface ToolCatalogItem {
  name: string
  description: string
  origin: ToolOrigin
}

export interface ToolRequest {
  name: string
  args: Record<string, unknown>
  deny?: string
}

export type ToolGuard = (req: ToolRequest) => ToolRequest | Promise<ToolRequest>

/** 极简=底座两工具；文件=文件系统 db_*；标准=全部。旧创造配置并入标准。 */
export const AGENT_TOOL_MODES = ['minimal', 'file', 'standard'] as const
export type AgentToolMode = (typeof AGENT_TOOL_MODES)[number]

export function isAgentToolMode(value: unknown): value is AgentToolMode {
  return value === 'minimal' || value === 'file' || value === 'standard'
}

export function normalizeAgentMode(value: unknown, fallback: AgentToolMode = 'standard'): AgentToolMode {
  if (value === 'minimal' || value === 'file') return value
  if (value === 'standard' || value === 'create') return 'standard'
  return fallback
}

export const MINIMAL_TOOL_NAMES = ['bash', 'str_replace_editor'] as const

/** Biu 文件系统 DB 工具；文件模式下只开放这些。 */
export const FILE_TOOL_NAMES = [
  'db_list',
  'db_read',
  'db_update',
  'db_create',
  'db_delete',
  'db_stat',
  'db_action',
  'db_content',
  'db_asset',
] as const

/** 本回合 slash 选中的额外工具（极简模式下临时放开）。 */
const extraToolsStorage = new AsyncLocalStorage<ReadonlySet<string>>()

/** 当前 invoke 的增量汇报（agent-loop 写成 partial tool/result）。 */
const toolProgressStorage = new AsyncLocalStorage<(detail: string) => void>()

export function runWithToolProgress<T>(onProgress: (detail: string) => void, fn: () => T): T {
  return toolProgressStorage.run(onProgress, fn)
}

/** 回合级工具策略（会话 config 覆盖全局 mode/extras）。 */
const toolPolicyStorage = new AsyncLocalStorage<{
  mode: AgentToolMode
  extras: ReadonlySet<string>
}>()

const toolOriginStorage = new AsyncLocalStorage<ToolOrigin>()

/** 商店插件 apply 期间注册的工具标成 store，标准模式可见。 */
export function runWithToolOrigin<T>(origin: ToolOrigin, fn: () => T): T {
  return toolOriginStorage.run(origin, fn)
}

export function runWithExtraTools<T>(names: readonly string[], fn: () => T): T {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  return extraToolsStorage.run(new Set(cleaned), fn)
}

export function runWithToolPolicy<T>(
  policy: { mode: AgentToolMode; extras?: readonly string[] },
  fn: () => T,
): T {
  const extras = [...new Set((policy.extras ?? []).map((n) => n.trim()).filter(Boolean))]
  return toolPolicyStorage.run({ mode: policy.mode, extras: new Set(extras) }, () =>
    runWithExtraTools(extras, fn),
  )
}

export class ToolsService extends Service {
  private tools = new Map<string, ToolSpec>()
  private origins = new Map<string, ToolOrigin>()
  private guards: ToolGuard[] = []
  private mode: AgentToolMode = 'standard'
  /** 极简模式下常驻额外工具（配置面板勾选，跨回合生效）。 */
  private pinnedExtras: string[] = []

  constructor(ctx: Context) {
    super(ctx, 'tools')
  }

  getMode() {
    return this.mode
  }

  originOf(name: string): ToolOrigin {
    return this.origins.get(name) ?? 'core'
  }

  setMode(mode: AgentToolMode) {
    if (!isAgentToolMode(mode)) throw new Error(`unknown agent tool mode: ${mode}`)
    if (this.mode === mode) return
    this.mode = mode
    this.ctx.emit('hub/change')
  }

  getPinnedExtras() {
    return [...this.pinnedExtras]
  }

  setPinnedExtras(names: readonly string[]) {
    const cleaned = [
      ...new Set(
        names
          .map((name) => name.trim())
          .filter(Boolean)
          .filter((name) => !(MINIMAL_TOOL_NAMES as readonly string[]).includes(name))
          .filter((name) => !(FILE_TOOL_NAMES as readonly string[]).includes(name)),
      ),
    ]
    const same =
      cleaned.length === this.pinnedExtras.length && cleaned.every((name, i) => name === this.pinnedExtras[i])
    if (same) return
    this.pinnedExtras = cleaned
    this.ctx.emit('hub/change')
  }

  private visible(name: string) {
    const policy = toolPolicyStorage.getStore()
    const mode = policy?.mode ?? this.mode
    if (mode === 'standard') return true
    if (this.originOf(name) === 'store') return false
    if (mode === 'file') return (FILE_TOOL_NAMES as readonly string[]).includes(name)
    if ((MINIMAL_TOOL_NAMES as readonly string[]).includes(name)) return true
    if ((policy?.extras ?? new Set()).has(name)) return true
    if (!policy && this.pinnedExtras.includes(name)) return true
    return extraToolsStorage.getStore()?.has(name) ?? false
  }

  register(spec: ToolSpec) {
    return this.ctx.effect(() => {
      if (this.tools.has(spec.name)) throw new Error(`tool already registered: ${spec.name}`)
      this.tools.set(spec.name, spec)
      this.origins.set(spec.name, toolOriginStorage.getStore() ?? 'core')
      this.ctx.emit('hub/change')
      return () => {
        this.tools.delete(spec.name)
        this.origins.delete(spec.name)
        this.ctx.emit('hub/change')
      }
    }, `tools.register ${spec.name}`)
  }

  guard(fn: ToolGuard) {
    return this.ctx.effect(() => {
      this.guards.push(fn)
      return () => {
        this.guards = this.guards.filter((item) => item !== fn)
      }
    }, 'tools.guard')
  }

  /** 全量目录（不受 mode 过滤），供 slash 菜单。 */
  catalog(): ToolCatalogItem[] {
    return [...this.tools.values()]
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        origin: this.originOf(tool.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  schemas() {
    return [...this.tools.values()]
      .filter((tool) => this.visible(tool.name))
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))
  }

  names() {
    return [...this.tools.keys()].filter((name) => this.visible(name))
  }

  /** 工具执行中把当前结果推到 UI；无 listener 时为空操作。 */
  report(detail: unknown) {
    toolProgressStorage.getStore()?.(stringify(detail))
  }

  async invoke(name: string, args: Record<string, unknown> = {}, signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) throw new Error('cancelled')
    if (!this.visible(name)) {
      const mode = toolPolicyStorage.getStore()?.mode ?? this.mode
      throw new Error(`tool not available in ${mode} mode: ${name}`)
    }
    let req: ToolRequest = { name, args }
    for (const guard of this.guards) req = await raceAbort(signal, Promise.resolve(guard(req)))
    req = this.ctx.waterfall('tools/pre-execute', req, () => req)
    if (req.deny) {
      this.ctx.emit('tools/post-execute', { name, ok: false, detail: req.deny })
      throw new Error(req.deny)
    }
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`unknown tool: ${name}`)
    try {
      const result = await raceAbort(signal, Promise.resolve(tool.execute(req.args, signal)))
      this.ctx.emit('tools/post-execute', { name, ok: true, detail: stringify(result) })
      return result
    } catch (error) {
      this.ctx.emit('tools/post-execute', { name, ok: false, detail: String(error) })
      throw error
    }
  }
}

function raceAbort<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('cancelled'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function stringify(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const name = 'tools'
export const inject = [] as const

export function apply(ctx: Context) {
  new ToolsService(ctx)
}
