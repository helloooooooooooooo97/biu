import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Context } from 'cordis'

export const name = 'data-board'
export const inject = ['http', 'sandbox']

/** 只允许读：SELECT / SHOW / DESCRIBE(/DESC)。其余一律 403。 */
const READONLY_PREFIX = /^\s*(?:select|show|describe|desc)\b/i
/** 多语句：只允许结尾一个可选分号，中间出现分号就是拼 SQL，直接拒。 */
const MULTI_STATEMENT = /;[\s\S]*\S/
/** 读语句里也不该出现的写文件口子。 */
const FORBIDDEN = /\binto\s+(?:outfile|dumpfile)\b|\bload_file\s*\(|\bload\s+data\b|\bsystem\b|\bsource\b/i

export type SqlCheck = { ok: true } | { ok: false; error: string }

/**
 * 白名单校验：必须 SELECT/SHOW/DESCRIBE 开头，且只有一条语句。
 * 副作用：只读语句也可能被 `;` 拼接注入，所以分号一律不放过。
 */
export function checkReadOnlySql(sql: string): SqlCheck {
  const raw = String(sql ?? '').trim()
  if (!raw) return { ok: false, error: 'SQL 为空' }
  // 去掉前导注释，避免用注释绕过前缀检查
  const body = raw.replace(/^(?:\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/))+/g, '').trim()
  const statement = body.replace(/;\s*$/, '').trim()
  if (!READONLY_PREFIX.test(statement)) {
    const head = statement.split(/\s+/)[0] || '(空)'
    return { ok: false, error: `只允许 SELECT / SHOW / DESCRIBE 开头的只读语句，收到「${head}」，已拒绝` }
  }
  if (MULTI_STATEMENT.test(statement)) {
    return { ok: false, error: '只允许一条语句，检测到分号拼接，已拒绝' }
  }
  if (FORBIDDEN.test(statement)) {
    return { ok: false, error: '检测到 INTO OUTFILE / LOAD DATA / SYSTEM 等危险片段，已拒绝' }
  }
  return { ok: true }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g
/** '{{k}}' 整体替换，避免把引号套两层（用户写了引号也照样能跑）。 */
const QUOTED_PLACEHOLDER = /'(\s*)\{\{\s*([A-Za-z_][\w-]*)\s*\}\}(\s*)'/g

/** 从模板里抽出参数名，保持出现顺序，用于界面渲染输入框。 */
export function sqlParams(sql: string): string[] {
  const seen: string[] = []
  for (const match of String(sql ?? '').matchAll(PLACEHOLDER)) {
    if (!seen.includes(match[1])) seen.push(match[1])
  }
  return seen
}

function asLiteral(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  // 纯数字原样插入（LIMIT {{n}} 这种用得上），其它一律当字符串字面量并转义。
  if (/^-?\d+(?:\.\d+)?$/.test(text.trim())) return text.trim()
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 把 {{name}} 换成参数值：字面量转义后替换，参数本身无法改变语句结构。 */
export function bindParams(sql: string, params: Record<string, unknown> | undefined): string {
  const bag = params && typeof params === 'object' ? params : {}
  const value = (key: string) => asLiteral(bag[key])
  return String(sql ?? '')
    .replace(QUOTED_PLACEHOLDER, (_all, left: string, key: string, right: string) => `${left}${value(key)}${right}`)
    .replace(PLACEHOLDER, (_all, key: string) => value(key))
}

export type MysqlConnection = {
  host?: unknown
  port?: unknown
  user?: unknown
  password?: unknown
  database?: unknown
}

const DEFAULT_CONN = { host: '127.0.0.1', port: 3306, user: 'root', database: 'scheduling_system' }

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function port(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n < 65536 ? Math.round(n) : DEFAULT_CONN.port
}

export function normalizeConn(raw: MysqlConnection | undefined) {
  const conn = raw && typeof raw === 'object' ? raw : {}
  return {
    host: text(conn.host, DEFAULT_CONN.host),
    port: port(conn.port),
    user: text(conn.user, DEFAULT_CONN.user),
    database: text(conn.database, DEFAULT_CONN.database),
    // 密码只在内存里过一手，回包不回显。
    password: typeof conn.password === 'string' ? conn.password : '',
  }
}

function mysqlCandidates() {
  return [
    process.env.BIU_MYSQL_BIN,
    '/opt/homebrew/opt/mysql-client/bin/mysql',
    '/opt/homebrew/opt/mysql@8.0/bin/mysql',
    '/opt/homebrew/bin/mysql',
    '/usr/local/bin/mysql',
    '/usr/bin/mysql',
  ].filter((item): item is string => Boolean(item))
}

function mysqlBin() {
  for (const candidate of mysqlCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  return 'mysql'
}

const MAX_SQL_LENGTH = 20_000
const MAX_ROWS = 2000
const DEFAULT_TIMEOUT = 15_000

function runMysql(bin: string, args: string[], env: NodeJS.ProcessEnv, cwd: string, timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (code: number) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(-2)
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      stderr += String(error)
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? 0))
  })
}

/** --batch 输出：首行表头，后续每行一条记录，字段用 \t 分隔。 */
function parseBatch(stdout: string) {
  const lines = stdout.split('\n')
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  if (!lines.length) return { columns: [] as string[], rows: [] as string[][], truncated: false }
  const columns = lines[0].split('\t')
  const rows: string[][] = []
  let truncated = false
  for (const line of lines.slice(1)) {
    if (rows.length >= MAX_ROWS) {
      truncated = true
      break
    }
    // --raw 不转义制表符，这里按列数补齐截断即可
    const cells = line.split('\t')
    while (cells.length < columns.length) cells.push('')
    rows.push(cells.slice(0, columns.length))
  }
  return { columns, rows, truncated }
}

export function apply(ctx: Context) {
  const bin = mysqlBin()

  ctx.http.route('POST', '/api/data-board/query', async (route) => {
    const body = (await route.json<Record<string, unknown>>().catch(() => ({}))) ?? {}
    const template = String(body.sql ?? '')
    const params = (body.params && typeof body.params === 'object' ? body.params : {}) as Record<string, unknown>
    const conn = normalizeConn(body.conn as MysqlConnection | undefined)

    if (!template.trim()) {
      route.send(400, { ok: false, error: 'SQL 为空' })
      return
    }
    if (template.length > MAX_SQL_LENGTH) {
      route.send(413, { ok: false, error: `SQL 超长（> ${MAX_SQL_LENGTH} 字符）` })
      return
    }

    const bound = bindParams(template, params)
    // 先校验模板本身，再校验绑定结果：两边都不能夹带非只读语句。
    for (const sql of [template, bound]) {
      const checked = checkReadOnlySql(sql)
      if (!checked.ok) {
        route.send(403, { ok: false, error: checked.error, rejected: sql.slice(0, 200) })
        return
      }
    }

    const args = [
      '-h', conn.host,
      '-P', String(conn.port),
      '-u', conn.user,
      '--connect-timeout=8',
      '--batch',
      '--raw',
      '--default-character-set=utf8mb4',
      '-D', conn.database,
      '-e', bound,
    ]

    let cwd = process.cwd()
    let env: NodeJS.ProcessEnv = { ...process.env }
    try {
      const wrapped = ctx.sandbox.wrap({ argv: [bin] })
      cwd = wrapped.cwd || cwd
      env = { ...env, ...wrapped.env }
    } catch {
      // 沙箱拿不到就退回宿主环境，不阻塞取数。
    }
    // 密码走环境变量，不进命令行（ps 里看不到）。
    if (conn.password) env.MYSQL_PWD = conn.password
    else delete env.MYSQL_PWD

    const started = Date.now()
    const timeoutMs = Number(body.timeoutMs)
    const result = await runMysql(
      bin,
      args,
      env,
      cwd,
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 60_000) : DEFAULT_TIMEOUT,
    )
    const ms = Date.now() - started
    const ranAt = Date.now()

    if (result.code !== 0) {
      route.send(200, {
        ok: false,
        error: (result.stderr || result.stdout || `mysql 退出码 ${result.code}`).trim(),
        ms,
        ranAt,
        resolvedSql: bound,
        params,
        conn: { host: conn.host, port: conn.port, user: conn.user, database: conn.database },
      })
      return
    }

    const parsed = parseBatch(result.stdout)
    route.send(200, {
      ok: true,
      columns: parsed.columns,
      rows: parsed.rows,
      rowCount: parsed.rows.length,
      truncated: parsed.truncated,
      ms,
      ranAt,
      // 回显绑定后的 SQL：证明 {{参数}} 真的生效了
      resolvedSql: bound,
      params,
      conn: { host: conn.host, port: conn.port, user: conn.user, database: conn.database },
      bin,
    })
  })

  ctx.http.route('GET', '/api/data-board/health', (route) => {
    route.send(200, { ok: true, plugin: name, bin, defaults: DEFAULT_CONN })
  })
}
