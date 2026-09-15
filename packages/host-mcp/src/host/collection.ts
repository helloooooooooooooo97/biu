import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import { envToList, headersToList, listToEnv, listToHeaders, type McpServerConfig } from './config.ts'
import type { McpServerRow, McpService } from './index.ts'

const ADD_DESCRIPTION =
  '挂载一台 MCP 服务器并写入 .biu/mcp.json（记录可以还不存在，id 就是这行的 id）。' +
  'stdio 填 command + args（可选 env、cwd）；远端填 url，并把 transport 设为 http 或 sse。' +
  'tools 可选，形如 {"allow":["read_*"],"deny":["write_file"]}，用来只放出这台服务器的一部分工具。' +
  'enabled 缺省为 true，挂上即连接。'

const SELECT_DESCRIPTION =
  '设置这台服务器的工具选择：args 传 {"allow":[...],"deny":[...]}，两者都认 * 通配。' +
  'deny 优先于 allow；allow 非空时只放出命中的工具。被排除的工具不出现在 mcp_list 里，mcp_call 也会拒绝。' +
  '先用 list_tools 动作看全量工具名，再决定填什么。清空过滤就传 {"allow":[],"deny":[]}。'

function asRecord(row: McpServerRow, config?: McpServerConfig): DbRecord {
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
    ...recordBuiltinValues({ createdAt: row.connectedAt, updatedAt: row.connectedAt }),
  }
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
  if ('allow' in patch || 'deny' in patch) {
    const config = mcp.configOf(current)
    mcp.setToolFilter(current, {
      allow: 'allow' in patch ? patch.allow : config.tools.allow,
      deny: 'deny' in patch ? patch.deny : config.tools.deny,
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
  return asRecord(row, row.builtin ? undefined : mcp.configOf(current))
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
    mcp.listServers().map((row) => asRecord(row, row.builtin ? undefined : mcp.configOf(row.id)))
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
        '一行 = 一台服务器；它提供的工具不会各自变成独立工具，Agent 统一用 mcp_list 看清单、mcp_call 调用。' +
        '新建一行会得到一台停用的 stdio 草稿（名字 new-server），把 command / args 填好再打开 enabled 即可；' +
        'title 就是 .biu/mcp.json 的 key，改它等于重命名。远端服务器把 transport 改成 http 或 sse 并填 url。' +
        'env 一项一个 KEY=VALUE，headers 一项一个 Name: Value。' +
        '本表动作（db_action path=/mcp/<服务器id> action=…）：add=一次填好挂载新服务器（记录可以还不存在，比新建再逐字段改更省）；' +
        'connect / disconnect=连接、断开但保留配置；enable / disable=改 .biu/mcp.json 里的开关；' +
        'refresh=重新拉取工具清单；list_tools=看这台服务器的全量工具及是否已被放出；' +
        'select=设置工具选择（allow / deny）；uninstall=从配置里删掉。' +
        'status=error 时看 error 列，stdio 服务器那里会带上子进程 stderr。builtin 的 echo 行只用于自检，不能改。',
      order: 40,
      icon: 'bolt',
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
        toolCount: { type: 'number', label: '已放出工具' },
        totalToolCount: { type: 'number', label: '工具总数' },
        allow: { type: 'string[]', label: '只放出', writable: true, description: '工具选择白名单，认 * 通配；留空表示不限制' },
        deny: { type: 'string[]', label: '排除', writable: true, description: '工具选择黑名单，优先于「只放出」' },
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
        id: 'add',
        label: '挂载服务器',
        for: 'agent',
        placement: [],
        allowMissing: true,
        description: ADD_DESCRIPTION,
        parameters: {
          type: 'object',
          description: ADD_DESCRIPTION,
          properties: {
            transport: { type: 'string', enum: ['stdio', 'http', 'sse'], description: '缺省按 url / command 推断' },
            command: { type: 'string', description: 'stdio：可执行文件，例如 npx' },
            args: { type: 'array', items: { type: 'string' } },
            env: { type: 'object', description: 'stdio：追加的环境变量' },
            cwd: { type: 'string', description: 'stdio：子进程工作目录' },
            url: { type: 'string', description: 'http / sse：服务器地址' },
            headers: { type: 'object', description: 'http / sse：请求头，例如 Authorization' },
            enabled: { type: 'boolean' },
            tools: { type: 'object', description: '工具选择 {"allow":[],"deny":[]}' },
          },
        },
        run: (id, _record, args = {}) => mcp.upsert({ ...args, id }),
      },
      {
        id: 'connect',
        label: '连接',
        when: { builtin: false },
        description: '按配置连上这台服务器并拉取工具清单。已连着会先断开再连（等于重连）。',
        run: (id) => mcp.connect(id),
      },
      {
        id: 'disconnect',
        label: '断开',
        when: { builtin: false, status: 'ready' },
        description: '断开连接但保留 .biu/mcp.json 里的配置与 enabled 开关。',
        run: (id) => mcp.disconnect(id),
      },
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
        description: '把 enabled 置为 false 并断开；配置留着，之后 enable 就能回来。',
        run: (id) => mcp.setEnabled(id, false),
      },
      {
        id: 'refresh',
        label: '刷新工具',
        when: { builtin: false },
        description: '重新向服务器拉取工具清单；没连上时等同 connect。',
        run: (id) => mcp.refresh(id),
      },
      {
        id: 'list_tools',
        label: '查看工具',
        for: 'agent',
        placement: [],
        description:
          '列出这台服务器的全量工具（含被工具选择排除的），每项带 allowed 标记。改过滤前先用它确认工具名。',
        parameters: { type: 'object', properties: {} },
        run: (id) => mcp.catalog(id),
      },
      {
        id: 'select',
        label: '选择工具',
        when: { builtin: false },
        description: SELECT_DESCRIPTION,
        parameters: {
          type: 'object',
          description: SELECT_DESCRIPTION,
          properties: {
            allow: { type: 'array', items: { type: 'string' }, description: '只放出这些（空数组=不限制）' },
            deny: { type: 'array', items: { type: 'string' }, description: '排除这些，优先于 allow' },
          },
        },
        run: (id, _record, args = {}) => mcp.setToolFilter(id, args),
      },
      {
        id: 'uninstall',
        label: '删除',
        tone: 'danger',
        confirm: '确定删除这台 MCP 服务器？配置会从 .biu/mcp.json 移除。',
        when: { builtin: false },
        description: '断开连接并从 .biu/mcp.json 删掉这台服务器。只想临时停用请用 disable。',
        run: (id) => mcp.remove(id),
      },
    ],
  }
}
