import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

export const name = 'db-inspector'
export const inject = ['http', 'sandbox']

type Ctx = {
  sandbox: { wrap(request: { argv: string[] }): { cwd: string; env: NodeJS.ProcessEnv } }
  http: {
    route(
      method: 'GET' | 'POST',
      pattern: string,
      handler: (route: {
        params: Record<string, string>
        query: URLSearchParams
        json: <T = unknown>() => Promise<T>
        send(status: number, body: unknown): void
      }) => void | Promise<void>,
    ): void
  }
  effect(effect: () => void | (() => void), label?: string): void
}

export type Conn = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

type Check = { id: string; label: string; hint: string; sql: string }

const DEFAULT_CONN: Conn = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'Abc123456',
  database: 'scheduling_system',
}

const MAX_SQL_LENGTH = 20_000
const DEFAULT_TIMEOUT = 15_000

/** 探测 mysql 客户端，别写死路径。 */
function mysqlBin(): string {
  const candidates = [
    process.env.BIU_MYSQL_BIN,
    '/opt/homebrew/opt/mysql-client/bin/mysql',
    '/opt/homebrew/opt/mysql@8.0/bin/mysql',
    '/opt/homebrew/bin/mysql',
    '/usr/local/bin/mysql',
    '/usr/bin/mysql',
  ].filter((c): c is string => Boolean(c))
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return 'mysql'
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function port(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n < 65_536 ? Math.round(n) : 3306
}

function readConn(raw: unknown): Conn {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    host: text(r.host, DEFAULT_CONN.host),
    port: port(r.port),
    user: text(r.user, DEFAULT_CONN.user),
    password: typeof r.password === 'string' ? r.password : DEFAULT_CONN.password,
    database: text(r.database, DEFAULT_CONN.database),
  }
}

/** 固定巡检项 + 可选自定义项。 */
function buildChecks(schema: string, extra: Check[]): Check[] {
  const s = schema.replace(/'/g, "''")
  return [
    {
      id: 'version',
      label: '版本与运行时长',
      hint: 'SELECT VERSION(), NOW()',
      sql: 'SELECT VERSION() AS version, NOW() AS now_time, @@hostname AS hostname',
    },
    {
      id: 'uptime',
      label: 'Uptime（秒）',
      hint: "SHOW GLOBAL STATUS LIKE 'Uptime'",
      sql: "SHOW GLOBAL STATUS LIKE 'Uptime'",
    },
    {
      id: 'connections',
      label: '连接数与上限',
      hint: 'Threads_connected / Threads_running / Max_used_connections',
      sql: "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections')",
    },
    {
      id: 'slow',
      label: '慢查询计数',
      hint: "SHOW GLOBAL STATUS LIKE 'Slow_queries'",
      sql: "SHOW GLOBAL STATUS WHERE Variable_name IN ('Slow_queries','Questions','Com_select')",
    },
    {
      id: 'bigtables',
      label: '大表 TopN（' + schema + '）',
      hint: 'information_schema.TABLES 按 DATA_LENGTH+INDEX_LENGTH 排序',
      sql:
        'SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024, 1) AS size_kb, ' +
        'ROUND(DATA_LENGTH/1024, 1) AS data_kb, ROUND(INDEX_LENGTH/1024, 1) AS index_kb ' +
        "FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + s + "' AND TABLE_TYPE='BASE TABLE' " +
        'ORDER BY (DATA_LENGTH+INDEX_LENGTH) DESC LIMIT 10',
    },
    {
      id: 'nopk',
      label: '无主键表（' + schema + '）',
      hint: "information_schema 左连 STATISTICS，INDEX_NAME='PRIMARY' 为空",
      sql:
        'SELECT t.TABLE_NAME, t.TABLE_ROWS FROM information_schema.TABLES t ' +
        'LEFT JOIN information_schema.STATISTICS st ON st.TABLE_SCHEMA=t.TABLE_SCHEMA ' +
        "AND st.TABLE_NAME=t.TABLE_NAME AND st.INDEX_NAME='PRIMARY' " +
        "WHERE t.TABLE_SCHEMA='" + s + "' AND t.TABLE_TYPE='BASE TABLE' AND st.INDEX_NAME IS NULL",
    },
    {
      id: 'locks',
      label: '当前锁等待',
      hint: 'performance_schema.data_lock_waits',
      sql: 'SELECT COUNT(*) AS lock_waits FROM performance_schema.data_lock_waits',
    },
    {
      id: 'replication',
      label: '复制状态',
      hint: 'SHOW REPLICA STATUS（失败当无复制，不崩）',
      sql: 'SHOW REPLICA STATUS',
    },
    ...extra,
  ]
}

type Parsed = { columns: string[]; rows: string[][] }

/** mysql --batch --raw 输出：首行表头，制表符分隔。 */
function parseBatch(stdout: string): Parsed {
  const lines = stdout.split('\n').filter((l) => l.length > 0)
  if (!lines.length) return { columns: [], rows: [] }
  const columns = lines[0].split('\t')
  const rows = lines.slice(1).map((l) => l.split('\t'))
  return { columns, rows }
}

type CheckResult = {
  id: string
  label: string
  hint: string
  ok: boolean
  ms: number
  columns: string[]
  rows: string[][]
  rowCount: number
  error?: string
}

function envFor(ctx: Ctx, bin: string): NodeJS.ProcessEnv {
  try {
    return { ...process.env, ...ctx.sandbox.wrap({ argv: [bin] }).env }
  } catch {
    return { ...process.env }
  }
}

function runMysql(
  ctx: Ctx,
  sql: string,
  conn: Conn,
  timeoutMs: number,
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number; ms: number; bin: string }> {
  const bin = mysqlBin()
  const started = Date.now()
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(
        bin,
        [
          '-h', conn.host,
          '-P', String(conn.port),
          '-u', conn.user,
          '--connect-timeout=8',
          '--batch',
          '--raw',
          '--default-character-set=utf8mb4',
          '-e', sql,
        ],
        { env: { ...envFor(ctx, bin), MYSQL_PWD: conn.password }, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      resolve({ ok: false, stdout: '', stderr: String(error), exitCode: -1, ms: Date.now() - started, bin })
      return
    }
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (exitCode: number) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ok: exitCode === 0, stdout, stderr, exitCode, ms: Date.now() - started, bin })
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
      finish(-2)
    }, timeoutMs)
    child.stdout.on('data', (c) => { stdout += c.toString() })
    child.stderr.on('data', (c) => { stderr += c.toString() })
    child.on('error', (e) => { stderr += String(e); finish(-1) })
    child.on('close', (code) => finish(code ?? 0))
  })
}

export function apply(ctx: Ctx) {
  ctx.http.route('GET', '/api/db-inspector/bin', (route) => {
    const bin = mysqlBin()
    route.send(200, { bin, available: existsSync(bin) || bin === 'mysql', defaults: { ...DEFAULT_CONN, password: '' } })
  })

  ctx.http.route('POST', '/api/db-inspector/run', async (route) => {
    let body: Record<string, unknown> = {}
    try {
      body = ((await route.json<Record<string, unknown>>()) ?? {}) as Record<string, unknown>
    } catch {
      body = {}
    }
    const conn = readConn(body.conn)
    const extraRaw = Array.isArray(body.extraChecks) ? body.extraChecks : []
    const extra: Check[] = extraRaw
      .map((raw) => {
        const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
        const sql = text(r.sql)
        if (!sql || sql.length > MAX_SQL_LENGTH) return null
        return {
          id: text(r.id, 'custom-' + Math.random().toString(36).slice(2, 7)),
          label: text(r.label, '自定义巡检项'),
          hint: '自定义 SQL',
          sql,
        }
      })
      .filter((c): c is Check => Boolean(c))

    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    const checks = buildChecks(conn.database, extra)

    // 每条独立跑，单条失败不影响其它条。
    const results: CheckResult[] = []
    for (const check of checks) {
      const r = await runMysql(ctx, check.sql, conn, DEFAULT_TIMEOUT)
      const parsed = r.ok ? parseBatch(r.stdout) : { columns: [], rows: [] }
      let error: string | undefined
      if (!r.ok) {
        const msg = (r.stderr || '').trim()
        error = msg ? msg.split('\n').slice(0, 3).join(' ').slice(0, 300) : 'exit ' + r.exitCode
      }
      results.push({
        id: check.id,
        label: check.label,
        hint: check.hint,
        ok: r.ok,
        ms: r.ms,
        columns: parsed.columns,
        rows: parsed.rows,
        rowCount: parsed.rows.length,
        ...(error ? { error } : {}),
      })
    }

    route.send(200, {
      ok: true,
      finishedAt: new Date().toISOString(),
      startedAt,
      ms: Date.now() - t0,
      bin: mysqlBin(),
      conn: { ...conn, password: '' },
      results,
    })
  })
}
