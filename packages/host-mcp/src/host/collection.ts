import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import { envToList, headersToList, listToEnv, listToHeaders, type McpServerConfig } from './config.ts'
import type { McpServerRow, McpService } from './index.ts'

function asRecord(
  row: McpServerRow,
  config?: McpServerConfig,
  catalog: Array<{ name: string; description?: string; allowed: boolean }> = [],
): DbRecord {
  return {
    id: row.id,
    title: row.id,
    transport: row.transport,
    status: row.status,
    enabled: row.enabled,
    builtin: row.builtin,
    command: row.command,
    args: row.args,
    env: config ? envToList(config.env) : [],
    url: row.url,
    headers: config ? headersToList(config.headers) : [],
    cwd: row.cwd,
    serverName: row.serverName,
    serverVersion: row.serverVersion,
    toolCount: row.toolCount,
    totalToolCount: row.totalToolCount,
    allow: row.allow,
    deny: row.deny,
    error: row.error,
    catalog,
    ...recordBuiltinValues({ createdAt: row.connectedAt, updatedAt: row.connectedAt }),
  }
}

export function clipFilterToCatalog(list: unknown, names: Set<string>) {
  const items = Array.isArray(list) ? list.map((item) => String(item).trim()).filter(Boolean) : []
  if (!names.size) return items
  return items.filter((item) => item.includes('*') || names.has(item))
}

/**
 * 把表格里的编辑分派到各自的入口：改连接参数会重连，改开关只连/断，
 * 改工具选择完全不动连接。一次 patch 里混着改也能按这个顺序落地。
 */
async function applyPatch(mcp: McpService, id: string, patch: Record<string, unknown>) {
  let current = id
  if ('title' in patch) {
    const wanted = String(patch.title ?? '').trim()
    if (!wanted) throw new Error('服务器名不能为空')
    if (wanted !== current) {
      await mcp.rename(current, wanted)
      current = wanted
    }
  }
  const dial = connectionPatch(patch)
  if (Object.keys(dial).length) await mcp.patchConfig(current, dial)
  if (('allow' in patch || 'deny' in patch) && !mcp.listServers().find((item) => item.id === current)?.builtin) {
    const names = new Set(mcp.catalog(current).map((item) => item.name))
    const config = mcp.configOf(current)
    mcp.setToolFilter(current, {
      allow: 'allow' in patch ? clipFilterToCatalog(patch.allow, names) : config.tools.allow,
      deny: 'deny' in patch ? clipFilterToCatalog(patch.deny, names) : config.tools.deny,
    })
  }
  if ('enabled' in patch) {
    const enabled = patch.enabled !== false
    if (enabled !== mcp.configOf(current).enabled) {
      // 连接失败不该让这次编辑整体回滚：状态和原因已经落在行上了。
      await mcp.setEnabled(current, enabled).catch(() => undefined)
    }
  }
  const row = mcp.listServers().find((item) => item.id === current)
  if (!row) throw new Error(`unknown mcp server: ${current}`)
  return asRecord(row, row.builtin ? undefined : mcp.configOf(current), mcp.catalog(current))
}

/** 表格单元格 → 配置字段。title 单独处理（它是 id）。 */
function connectionPatch(patch: Record<string, unknown>) {
  const next: Partial<McpServerConfig> = {}
  if ('transport' in patch) {
    const wanted = String(patch.transport ?? '').trim()
    if (wanted !== 'stdio' && wanted !== 'http' && wanted !== 'sse') {
      throw new Error(`unknown transport: ${wanted}（只能是 stdio / http / sse）`)
    }
    next.transport = wanted
  }
  if ('command' in patch) next.command = String(patch.command ?? '').trim()
  if ('args' in patch) next.args = Array.isArray(patch.args) ? patch.args.map((item) => String(item)) : []
  if ('env' in patch) next.env = listToEnv(patch.env)
  if ('url' in patch) next.url = String(patch.url ?? '').trim()
  if ('headers' in patch) next.headers = listToHeaders(patch.headers)
  if ('cwd' in patch) next.cwd = String(patch.cwd ?? '').trim()
  return next
}

export function mcpCollection(mcp: McpService): CollectionSpec {
  const list = () =>
    mcp.listServers().map((row) => asRecord(row, row.builtin ? undefined : mcp.configOf(row.id), mcp.catalog(row.id)))
  const find = (id: string) => list().find((row) => row.id === id) ?? null
  const require = (id: string) => {
    const row = find(id)
    if (!row) throw new Error(`unknown mcp server: ${id}`)
    return row
  }
  return {
    id: 'mcp',
    path: '/mcp',
    label: 'MCP',
    view: {
      moduleId: 'mcp',
      route: '/mcp',
      title: 'MCP',
      blurb:
        '这是 MCP 服务器表（外部工具来源），不是插件（插件在 /plugins）也不是代理（代理在 /sessions）。真源是 .biu/mcp.json，格式与 Cursor / Claude Desktop 的 mcpServers 一致。' +
        'Biu 自己也作为 MCP 服务端对外：设置 → MCP 或本机 GET /api/mcp/info 拿局域网 url + Bearer token。' +
        'MCP 挂在分享口（默认 0.0.0.0），局域网其它电脑可以调；工作台 API 仍只在本机。' +
        '一行 = 一台服务器；它提供的工具不会各自变成独立工具，Agent 统一用 mcp_list 看清单、mcp_call 调用。' +
        '新建一行会得到一台停用的 stdio 草稿（名字 new-server），把 command / args 填好再打开「已启用」即可；' +
        'title 就是 .biu/mcp.json 的 key，改它等于重命名。远端服务器把 transport 改成 http 或 sse 并填 url。' +
        'env 一项一个 KEY=VALUE，headers 一项一个 Name: Value。工具选择改「仅允许 / 禁用」两列，或在详情清单里勾。' +
        '本表动作只留启用 / 停用（改 enabled 并连上或断开）和删除。挂载用新建行或 mcp_add_stdio，清单用 mcp_list。' +
        'status=error 时看 error 列，stdio 服务器那里会带上子进程 stderr。builtin 的 echo 行只用于自检，不能改。',
      order: 40,
      icon: 'link',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      columns: ['title', 'transport', 'status', 'enabled', 'command', 'args', 'url', 'toolCount', 'totalToolCount', 'allow', 'deny', 'error'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: {
          type: 'string',
          label: '服务器',
          writable: true,
          description: '就是 .biu/mcp.json 里的 key，改它等于重命名这台服务器',
        },
        transport: {
          type: 'select',
          label: '传输',
          enum: ['stdio', 'http', 'sse'],
          writable: true,
          description: 'stdio 走子进程（填 command），http / sse 走远端（填 url）',
        },
        status: { type: 'select', label: '状态', enum: ['idle', 'connecting', 'ready', 'error'] },
        enabled: { type: 'boolean', label: '已启用', writable: true, description: '打开即连接，关掉即断开' },
        builtin: { type: 'boolean', label: '内置' },
        command: { type: 'string', label: '命令', writable: true, description: 'stdio：可执行文件，例如 npx。PATH 不确定时写绝对路径。' },
        args: { type: 'string[]', label: '参数', writable: true, description: 'stdio：命令行参数，一项一个' },
        env: {
          type: 'string[]',
          label: '环境变量',
          writable: true,
          description: 'stdio：一项一个 KEY=VALUE。子进程只继承白名单环境变量，token 必须写在这里。',
        },
        url: { type: 'string', label: '地址', writable: true, description: 'http / sse：服务器地址，http(s) 开头' },
        headers: {
          type: 'string[]',
          label: '请求头',
          writable: true,
          description: 'http / sse：一项一个 Name: Value，例如 Authorization: Bearer xxx',
        },
        cwd: { type: 'string', label: '工作目录', writable: true, description: 'stdio：子进程 cwd，留空则继承宿主' },
        serverName: { type: 'string', label: '服务器名' },
        serverVersion: { type: 'string', label: '版本' },
        toolCount: { type: 'number', label: '可用工具' },
        totalToolCount: { type: 'number', label: '工具总数' },
        allow: {
          type: 'string[]',
          label: '仅允许',
          writable: true,
          description: '勾了才给 Agent 用；留空表示不限制（仍扣掉「禁用」）',
        },
        deny: {
          type: 'string[]',
          label: '禁用',
          writable: true,
          description: '这些工具不给 Agent 用，优先于「仅允许」',
        },
        error: { type: 'string', label: '错误' },
      },
    },
    list,
    get: find,
    create: async (rows) => {
      const out: DbRecord[] = []
      for (const fields of rows) {
        const draft = mcp.draft()
        // 新建时一般只拿到空对象；带了字段就顺手填上，省一次编辑。
        if (Object.keys(fields).length) {
          await applyPatch(mcp, draft.id, fields)
          out.push(require(typeof fields.title === 'string' && fields.title.trim() ? fields.title.trim() : draft.id))
        } else {
          out.push(require(draft.id))
        }
      }
      return out
    },
    update: async (id, patch) => applyPatch(mcp, id, patch),
    remove: async (query) => {
      const ids = (query.ids ?? []).filter(Boolean)
      for (const id of ids) await mcp.remove(id)
      return ids
    },
    actions: [
      {
        id: 'enable',
        label: '启用',
        when: { builtin: false, enabled: false },
        description: '把 .biu/mcp.json 里的 enabled 置为 true 并立刻连接。',
        run: (id) => mcp.setEnabled(id, true),
      },
      {
        id: 'disable',
        label: '停用',
        when: { builtin: false, enabled: true },
        description: '把 enabled 置为 false 并断开；配置留着，之后启用就能回来。',
        run: (id) => mcp.setEnabled(id, false),
      },
      {
        id: 'uninstall',
        label: '删除',
        tone: 'danger',
        confirm: '确定删除这台 MCP 服务器？配置会从 .biu/mcp.json 移除。',
        when: { builtin: false },
        description: '断开连接并从 .biu/mcp.json 删掉这台服务器。只想临时停用请用停用。',
        run: (id) => mcp.remove(id),
      },
    ],
  }
}
