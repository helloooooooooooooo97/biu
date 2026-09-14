import { existsSync } from 'node:fs'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

export const name = 'page-terminal'
export const inject = ['http', 'sandbox']

type Socket = {
  readyState: number
  OPEN: number
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: 'message' | 'close' | 'error', listener: (data?: unknown) => void): void
}

/** PTY 可能在 socket 挂上之前就吐数据；`ws?.readyState === ws?.OPEN` 在 ws 为 null 时是 `undefined === undefined`。 */
function isOpen(ws: Socket | null | undefined): ws is Socket {
  return !!ws && ws.readyState === ws.OPEN
}

type Ctx = {
  sandbox: { wrap(request: { argv: string[] }): { cwd: string; env: NodeJS.ProcessEnv } }
  http: {
    ws(path: string, listener: (socket: Socket, request: { url?: string }) => void): void
    route(
      method: 'GET' | 'POST',
      pattern: string,
      handler: (route: {
        params: Record<string, string>
        query: URLSearchParams
        json: <T = unknown>() => Promise<T>
        bytes: () => Promise<Buffer>
        send(status: number, body: unknown): void
      }) => void | Promise<void>,
    ): void
  }
  effect(effect: () => void | (() => void), label?: string): void
}

/** 缓冲池默认配置，可通过设置面板调整（存内存，随插件生命周期）。 */
const DEFAULT_SETTINGS = {
  /** 最多在后台保留多少个终端会话（LRU 淘汰）。 */
  maxSessions: 50,
  /** 每个会话最多缓存多少 KB 输出，用于重连回放。 */
  bufferKB: 512,
  /** 回放时最多保留多少行。 */
  replayLines: 200,
}
type Settings = typeof DEFAULT_SETTINGS

const SETTINGS_LIMITS = {
  maxSessions: { min: 1, max: 200 },
  bufferKB: { min: 64, max: 4096 },
  replayLines: { min: 50, max: 2000 },
}

type PooledSession = {
  key: string
  pty: IPty
  /** 最近的原始输出字节，用于重连回放。 */
  buffer: string
  /** 当前挂着的连接（同一时刻最多一个）。 */
  socket: Socket | null
  /** 最后一次有连接的时间，用于 LRU。 */
  lastSeen: number
}

/** 默认跟 macOS 的 zsh，提示符才是 user@host 目录 %。不要用 -l：登录脚本在 GUI PATH 不全时会把 ls 弄丢。 */
function interactiveShell() {
  const configured = String(process.env.SHELL ?? '').trim()
  const ordered = [configured, '/bin/zsh', '/bin/bash', '/opt/homebrew/bin/bash', '/usr/local/bin/bash', '/bin/sh']
  for (const candidate of ordered) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

const UNIX_PATH = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

function ptyEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const part of [...UNIX_PATH, ...String(base.PATH ?? '').split(':')]) {
    if (!part || seen.has(part)) continue
    seen.add(part)
    parts.push(part)
  }
  return {
    ...base,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: base.LANG || process.env.LANG || 'en_US.UTF-8',
    PATH: parts.join(':'),
    // 没读到用户 rc 时也保证「用户@主机 当前目录名」提示符（zsh % / bash $）。
    PROMPT: '%n@%m %1~ %# ',
    PS1: '\\u@\\h \\W \\$ ',
  }
}

function text(raw: unknown) {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (Array.isArray(raw)) return Buffer.concat(raw.filter(Buffer.isBuffer)).toString('utf8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
  return String(raw ?? '')
}

function dim(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback
}

/** 从缓冲尾部按行截取，最多 maxLines 行；同时避免把 ANSI 序列从中间截断。 */
function tailLines(buffer: string, maxLines: number) {
  const lines = buffer.split('\n')
  if (lines.length <= maxLines) return buffer
  const sliced = lines.slice(lines.length - maxLines).join('\n')
  // 如果起点附近有未闭合的 ESC 序列，往后找下一个 ESC 重新开始，避免残缺控制码。
  const escAt = sliced.indexOf('\x1b')
  if (escAt > 0 && sliced.lastIndexOf('\x1b', escAt) === escAt) {
    const next = sliced.indexOf('\x1b', escAt + 1)
    if (next > 0) return sliced.slice(next)
  }
  return sliced
}

export function apply(ctx: Ctx) {
  const pool = new Map<string, PooledSession>()
  let seq = 0
  let settings: Settings = { ...DEFAULT_SETTINGS }

  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, Math.floor(n)))
  }

  const sanitize = (raw: Partial<Settings> | undefined): Settings => ({
    maxSessions: clamp(raw?.maxSessions, DEFAULT_SETTINGS.maxSessions, SETTINGS_LIMITS.maxSessions.min, SETTINGS_LIMITS.maxSessions.max),
    bufferKB: clamp(raw?.bufferKB, DEFAULT_SETTINGS.bufferKB, SETTINGS_LIMITS.bufferKB.min, SETTINGS_LIMITS.bufferKB.max),
    replayLines: clamp(raw?.replayLines, DEFAULT_SETTINGS.replayLines, SETTINGS_LIMITS.replayLines.min, SETTINGS_LIMITS.replayLines.max),
  })

  // 设置接口：前端设置面板读写缓冲池参数。
  ctx.http.route('GET', '/api/page-terminal/settings', (route) => {
    route.send(200, { settings, defaults: DEFAULT_SETTINGS, limits: SETTINGS_LIMITS, sessions: pool.size })
  })
  ctx.http.route('POST', '/api/page-terminal/settings', async (route) => {
    const body = (await route.json<Partial<Settings>>().catch(() => ({}))) ?? {}
    settings = sanitize({ ...settings, ...body })
    // 改小容量后立刻按新上限淘汰。
    evictIfNeeded()
    route.send(200, { settings, sessions: pool.size })
  })

  const kill = (session: PooledSession) => {
    pool.delete(session.key)
    try {
      session.pty.kill()
    } catch {
      // 已退出。
    }
  }

  const killAll = () => {
    pool.forEach((session) => kill(session))
    pool.clear()
  }

  ctx.effect(() => () => killAll(), 'page-terminal.cleanup')

  /** 超出容量时淘汰最久没被连接的会话。 */
  const evictIfNeeded = () => {
    while (pool.size > settings.maxSessions) {
      let oldest: PooledSession | null = null
      pool.forEach((session) => {
        if (!oldest || session.lastSeen < oldest.lastSeen) oldest = session
      })
      if (!oldest) break
      kill(oldest)
    }
  }

  ctx.http.ws('/ws/page-terminal', (socket, request) => {
    const q = new URL(request.url ?? '/', 'http://localhost').searchParams
    const cols = dim(q.get('cols'), 80, 20, 500)
    const rows = dim(q.get('rows'), 20, 5, 400)
    // 块的 id 作为会话键：同一块刷新/切页/重开都能连回同一个 shell。
    const key = String(q.get('session') ?? '').trim() || `anon-${++seq}`

    let session = pool.get(key)
    // 已有会话：尺寸可能因重新布局而不同，按新尺寸对齐(并触发 shell 重绘)。
    if (session) {
      try {
        session.pty.resize(cols, rows)
      } catch {
        // 会话可能刚好退出。
      }
    } else {
      const shell = interactiveShell()
      const sandbox = ctx.sandbox.wrap({ argv: [shell] })
      try {
        const child = pty.spawn(shell, ['-i'], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: process.cwd(),
          env: ptyEnv({ ...process.env, ...sandbox.env }),
        })
        session = { key, pty: child, buffer: '', socket: null, lastSeen: Date.now() }
        pool.set(key, session)
        child.onData((chunk) => {
          const current = pool.get(key)
          if (!current || current.pty !== child) return
          current.buffer += chunk
          const maxBytes = settings.bufferKB * 1024
          if (current.buffer.length > maxBytes) {
            // 超上限只留尾部，避免无限增长。
            current.buffer = tailLines(current.buffer.slice(-maxBytes), settings.replayLines)
          }
          const ws = current.socket
          if (!isOpen(ws)) return
          try {
            ws.send(typeof chunk === 'string' ? chunk : String(chunk))
          } catch {
            // 连接可能已断；数据已写入 buffer，下次重连会回放。
          }
        })
        child.onExit(() => {
          const current = pool.get(key)
          const ws = current?.socket
          if (isOpen(ws)) {
            try {
              ws.close(1000, 'shell exited')
            } catch {
              // 忽略。
            }
          }
          pool.delete(key)
        })
      } catch (error) {
        socket.close(1011, error instanceof Error ? error.message : String(error))
        return
      }
    }

    // 旧连接让位（同一会话同时只服务一个前端）。
    if (session.socket && session.socket !== socket) {
      try {
        session.socket.close(1000, 'superseded')
      } catch {
        // 忽略。
      }
    }
    session.socket = socket
    session.lastSeen = Date.now()

    // 回放历史：先清屏，再把这之前的输出重放一遍，接上就是完整画面。
    if (session.buffer) {
      const replay = tailLines(session.buffer, settings.replayLines)
      try {
        socket.send('\x1b[2J\x1b[3J\x1b[H')
        socket.send(replay)
      } catch {
        // 连接可能已断。
      }
    }

    socket.on('message', (raw) => {
      const current = pool.get(key)
      if (!current) return
      let msg: { type?: string; data?: unknown; cols?: unknown; rows?: unknown; kill?: unknown }
      try {
        msg = JSON.parse(text(raw))
      } catch {
        return
      }
      if (msg.type === 'input') current.pty.write(String(msg.data ?? ''))
      if (msg.type === 'resize') {
        current.pty.resize(dim(msg.cols, 80, 20, 500), dim(msg.rows, 20, 5, 400))
      }
      // 前端明确要求结束该会话（例如插件停用）。
      if (msg.type === 'kill') kill(current)
    })

    const detach = () => {
      const current = pool.get(key)
      if (!current) return
      // 只断开连接，**不杀进程** —— 前端关了不代表后端要死。
      if (current.socket === socket) current.socket = null
      current.lastSeen = Date.now()
      evictIfNeeded()
    }

    socket.on('close', detach)
    socket.on('error', detach)

    evictIfNeeded()
  })
}
