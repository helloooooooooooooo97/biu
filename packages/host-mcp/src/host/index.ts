import { Service, type Context } from 'cordis'
import { mcpCollection } from './collection.ts'
import { McpConnection, type McpToolInfo } from './client.ts'
import {
  incompleteReason,
  mcpConfigPath,
  normalizeServerConfig,
  normalizeToolFilter,
  readMcpConfig,
  toolAllowed,
  writeMcpConfig,
  type McpServerConfig,
  type McpToolFilter,
} from './config.ts'

export type McpStatus = 'idle' | 'connecting' | 'ready' | 'error'

export type McpServerRow = {
  id: string
  transport: McpServerConfig['transport']
  command: string
  args: string[]
  url: string
  cwd: string
  enabled: boolean
  builtin: boolean
  status: McpStatus
  error: string
  serverName: string
  serverVersion: string
  connectedAt: number
  /** 过滤后暴露给 Agent 的工具数 / 服务器实际提供的工具数 */
  toolCount: number
  totalToolCount: number
  allow: string[]
  deny: string[]
}

/** 进程内 echo：不依赖子进程，让 MCP 这条缝在没有任何外部 server 时也可自检。 */
const ECHO_TOOLS: McpToolInfo[] = [
  {
    name: 'mcp_echo',
    description: 'echo arguments',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  },
]

type ServerState = {
  config: McpServerConfig
  status: McpStatus
  error: string
  tools: McpToolInfo[]
  connection?: McpConnection
  connectedAt: number
  builtin: boolean
}

function echoState(): ServerState {
  return {
    config: normalizeServerConfig('echo', { command: 'builtin:echo' })!,
    status: 'ready',
    error: '',
    tools: ECHO_TOOLS,
    connectedAt: Date.now(),
    builtin: true,
  }
}

export class McpService extends Service {
  private servers = new Map<string, ServerState>()
  private configPath: string

  constructor(ctx: Context) {
    super(ctx, 'mcp')
    this.configPath = mcpConfigPath()
    this.servers.set('echo', echoState())
    ctx.effect(() => () => void this.closeAll(), 'mcp.dispose-all')
    ctx.inject(['database'], (inner) => {
      inner.database.register(mcpCollection(this))
    })
  }

  /** 读 .biu/mcp.json 并连上所有 enabled 的 server。连接失败只记在行上，不拖住启动。 */
  async restore() {
    for (const config of readMcpConfig(this.configPath)) {
      if (config.id === 'echo') continue
      this.servers.set(config.id, {
        config,
        status: 'idle',
        error: '',
        tools: [],
        connectedAt: 0,
        builtin: false,
      })
    }
    this.changed()
    const pending = [...this.servers.values()]
      // 草稿行（字段还没填齐）不去连，留在 idle 等用户补完。
      .filter((state) => !state.builtin && state.config.enabled && !incompleteReason(state.config))
      .map((state) => this.connect(state.config.id).catch(() => undefined))
    await Promise.all(pending)
  }

  private changed() {
    this.ctx.emit('hub/change')
    try {
      this.ctx.emit('database/change')
    } catch {
      // File System 还没挂上时不影响 MCP 自身。
    }
  }

  private require(id: string) {
    const state = this.servers.get(id)
    if (!state) throw new Error(`unknown mcp server: ${id}`)
    return state
  }

  private persist() {
    const servers = [...this.servers.values()].filter((state) => !state.builtin).map((state) => state.config)
    writeMcpConfig(servers, this.configPath)
  }

  async connect(id: string) {
    const state = this.require(id)
    if (state.builtin) return this.row(state)
    const missing = incompleteReason(state.config)
    if (missing) {
      state.status = 'error'
      state.error = missing
      this.changed()
      throw new Error(`mcp server not configured yet: ${id} — ${missing}`)
    }
    if (state.connection) await this.disconnect(id)
    state.status = 'connecting'
    state.error = ''
    this.changed()
    try {
      const connection = await McpConnection.open(state.config)
      connection.onClosed((reason) => {
        // server 连上之后自己退出：留下痕迹，等下次显式 connect 再拉起。
        if (state.connection !== connection) return
        state.connection = undefined
        state.status = 'error'
        state.error = reason || 'mcp server closed'
        state.tools = []
        this.changed()
      })
      state.connection = connection
      state.tools = await connection.listTools()
      state.status = 'ready'
      state.connectedAt = Date.now()
      state.error = ''
    } catch (error) {
      state.status = 'error'
      state.error = String(error instanceof Error ? error.message : error)
      state.tools = []
      state.connection = undefined
      this.changed()
      throw error
    }
    this.changed()
    return this.row(state)
  }

  async disconnect(id: string) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot disconnect built-in echo server')
    await state.connection?.close()
    state.connection = undefined
    state.tools = []
    state.status = 'idle'
    state.connectedAt = 0
    this.changed()
    return this.row(state)
  }

  /** 挂载/覆盖一台 server，落盘到 .biu/mcp.json。enabled 时立刻连。 */
  async upsert(raw: Record<string, unknown> & { id: string }) {
    const config = normalizeServerConfig(raw.id, raw)
    if (!config) throw new Error(`invalid mcp server config: ${raw.id}`)
    if (config.id === 'echo') throw new Error('echo is reserved for the built-in server')
    const existing = this.servers.get(config.id)
    if (existing?.connection) await this.disconnect(config.id)
    this.servers.set(config.id, {
      config,
      status: 'idle',
      error: '',
      tools: [],
      connectedAt: 0,
      builtin: false,
    })
    this.persist()
    if (config.enabled) await this.connect(config.id)
    return this.row(this.require(config.id))
  }

  async setEnabled(id: string, enabled: boolean) {
    const state = this.require(id)
    if (state.builtin) throw new Error('built-in echo server is always enabled')
    state.config = { ...state.config, enabled }
    this.persist()
    if (!enabled) return this.disconnect(id)
    return this.connect(id)
  }

  configOf(id: string): McpServerConfig {
    const state = this.require(id)
    return { ...state.config, args: [...state.config.args], tools: { ...state.config.tools } }
  }

  /** 改 id：迁移配置并按需重连。表格里改「服务器」列走这条。 */
  async rename(id: string, nextId: string) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot rename the built-in echo server')
    const wanted = String(nextId ?? '').trim()
    if (wanted === id) return this.row(state)
    if (this.servers.has(wanted)) throw new Error(`mcp server already exists: ${wanted}`)
    const config = normalizeServerConfig(wanted, { ...state.config, id: wanted })
    if (!config) throw new Error(`invalid mcp server id: ${nextId}`)
    const wasConnected = Boolean(state.connection)
    await state.connection?.close()
    this.servers.delete(id)
    this.servers.set(wanted, {
      config,
      status: 'idle',
      error: '',
      tools: [],
      connectedAt: 0,
      builtin: false,
    })
    this.persist()
    if (wasConnected || (config.enabled && !incompleteReason(config))) {
      await this.connect(wanted).catch(() => undefined)
    }
    this.changed()
    return this.row(this.require(wanted))
  }

  /**
   * 合并配置字段。只有连接参数变了才重连；工具选择与开关各走各的路，
   * 这样在表格里改一个 deny 不会白白掐断一条正常连接。
   */
  async patchConfig(id: string, patch: Partial<McpServerConfig>) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot edit the built-in echo server')
    const before = state.config
    const merged = normalizeServerConfig(id, { ...before, ...patch, id })
    if (!merged) throw new Error(`invalid mcp server config: ${id}`)
    const dialKeys = ['transport', 'command', 'args', 'env', 'cwd', 'url', 'headers'] as const
    const redial = dialKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(merged[key]))
    state.config = merged
    this.persist()
    this.changed()
    if (redial) {
      if (state.connection) await this.disconnect(id)
      if (merged.enabled && !incompleteReason(merged)) await this.connect(id).catch(() => undefined)
      return this.row(this.require(id))
    }
    if (merged.enabled !== before.enabled) return this.setEnabled(id, merged.enabled).catch(() => this.row(state))
    return this.row(state)
  }

  /** 工具选择：只改配置，读时过滤立即生效，不需要重连。 */
  setToolFilter(id: string, filter: unknown) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot filter the built-in echo server')
    state.config = { ...state.config, tools: normalizeToolFilter(filter) }
    this.persist()
    this.changed()
    return this.row(state)
  }

  async remove(id: string) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot remove built-in echo server')
    await state.connection?.close()
    this.servers.delete(id)
    this.persist()
    this.changed()
    return { id, removed: true }
  }

  /** 重新拉取工具清单（server 端热更新了工具时用）。 */
  async refresh(id: string) {
    const state = this.require(id)
    if (state.builtin) return this.row(state)
    if (!state.connection) return this.connect(id)
    state.tools = await state.connection.listTools()
    this.changed()
    return this.row(state)
  }

  /** 界面「新建」用：先落一行停用的 stdio 草稿，字段在表格里慢慢填。 */
  draft() {
    let id = 'new-server'
    for (let n = 2; this.servers.has(id); n++) id = `new-server-${n}`
    const config = normalizeServerConfig(id, { transport: 'stdio', command: '', enabled: false })
    if (!config) throw new Error(`cannot create mcp draft: ${id}`)
    this.servers.set(id, {
      config,
      status: 'idle',
      error: '',
      tools: [],
      connectedAt: 0,
      builtin: false,
    })
    this.persist()
    this.changed()
    return this.row(this.require(id))
  }

  /** 兼容旧签名：等价于 upsert 一台 stdio server 并连上。 */
  async addStdio(id: string, command: string, args: string[] = [], extra: Record<string, unknown> = {}) {
    await this.upsert({ ...extra, id, command, args, transport: 'stdio' })
    return this.listTools()
  }

  private visibleTools(state: ServerState) {
    if (state.builtin) return state.tools
    return state.tools.filter((tool) => toolAllowed(state.config.tools, tool.name))
  }

  listTools(serverId?: string) {
    const states = serverId ? [this.require(serverId)] : [...this.servers.values()]
    return states.flatMap((state) =>
      this.visibleTools(state).map((tool) => ({ server: state.config.id, ...tool })),
    )
  }

  /** 未过滤的全量清单，供 /mcp 表勾选工具用。 */
  catalog(serverId: string) {
    const state = this.require(serverId)
    return state.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      allowed: state.builtin || toolAllowed(state.config.tools, tool.name),
    }))
  }

  private row(state: ServerState): McpServerRow {
    const info = state.connection?.serverInfo()
    // 草稿行没有真错误，但要在 error 列告诉用户还差什么。
    const missing = state.builtin ? '' : incompleteReason(state.config)
    return {
      id: state.config.id,
      transport: state.config.transport,
      command: state.config.command,
      args: [...state.config.args],
      url: state.config.url,
      cwd: state.config.cwd,
      enabled: state.builtin ? true : state.config.enabled,
      builtin: state.builtin,
      status: state.status,
      error: state.error || missing,
      serverName: info?.name ?? '',
      serverVersion: info?.version ?? '',
      connectedAt: state.connectedAt,
      toolCount: this.visibleTools(state).length,
      totalToolCount: state.tools.length,
      allow: [...state.config.tools.allow],
      deny: [...state.config.tools.deny],
    }
  }

  listServers(): McpServerRow[] {
    return [...this.servers.values()]
      .map((state) => this.row(state))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  serverIds() {
    return [...this.servers.keys()].sort()
  }

  async call(serverId: string, name: string, args: Record<string, unknown>) {
    const state = this.require(serverId)
    if (state.builtin) {
      if (name !== 'mcp_echo') throw new Error(`unknown mcp tool: ${name}`)
      return { text: String(args.text ?? '') }
    }
    // 工具选择是硬约束：被排除的工具即使 Agent 猜到名字也调不动。
    if (!toolAllowed(state.config.tools, name)) {
      throw new Error(`mcp tool disabled by server config: ${serverId}/${name}`)
    }
    if (!state.connection) throw new Error(`mcp server not connected: ${serverId} (${state.error || state.status})`)
    return state.connection.callTool(name, args)
  }

  private async closeAll() {
    for (const state of this.servers.values()) await state.connection?.close()
    this.servers.clear()
  }
}

export const name = 'mcp'
export const inject = ['tools']

export function apply(ctx: Context) {
  const mcp = new McpService(ctx)
  void mcp.restore()

  ctx.tools.register({
    name: 'mcp_servers',
    description:
      '列出已挂载的 MCP 服务器及连接状态（status: ready/idle/connecting/error）。toolCount 是工具选择后暴露的数量，totalToolCount 是服务器实际提供的数量。',
    parameters: { type: 'object', properties: {} },
    execute: () => mcp.listServers(),
  })
  ctx.tools.register({
    name: 'mcp_list',
    description:
      '列出 MCP 工具（已按各服务器的工具选择过滤）。不传 server 就列全部。拿到 server + name + inputSchema 后用 mcp_call 调用。',
    parameters: {
      type: 'object',
      properties: { server: { type: 'string', description: '只列这台服务器的工具' } },
    },
    execute: (args) => {
      const server = String(args.server ?? '').trim()
      return mcp.listTools(server || undefined)
    },
  })
  ctx.tools.register({
    name: 'mcp_call',
    description: '调用 MCP 工具。server 与 name 取自 mcp_list；被工具选择排除的工具会直接报错。',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string' },
        name: { type: 'string' },
        arguments: { type: 'object' },
      },
      required: ['server', 'name'],
    },
    execute: (args) =>
      mcp.call(String(args.server), String(args.name), (args.arguments as Record<string, unknown>) ?? {}),
  })
  ctx.tools.register({
    name: 'mcp_add_stdio',
    description:
      '挂载 stdio MCP 服务（command + args），写入 .biu/mcp.json 后重启仍在。远端服务器请用 /mcp 表的 add 动作填 url。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object', description: '追加的环境变量' },
        cwd: { type: 'string', description: '子进程工作目录' },
      },
      required: ['id', 'command'],
    },
    execute: (args) =>
      mcp.addStdio(String(args.id), String(args.command), Array.isArray(args.args) ? args.args.map(String) : [], {
        env: args.env,
        cwd: args.cwd,
      }),
  })
  ctx.tools.register({
    name: 'mcp_remove',
    description: '卸载 MCP 服务：断开连接并从 .biu/mcp.json 删掉。只想临时停用请改用 /mcp 表的 disable 动作。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => mcp.remove(String(args.id)),
  })
}

export type { McpServerConfig, McpToolFilter }
export { mcpConfigPath, parseMcpConfig, serializeMcpConfig, toolAllowed } from './config.ts'
