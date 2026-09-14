import { existsSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

export const name = 'global-terminal'
export const inject = ['http', 'sandbox']

type Socket = {
  readyState: number
  OPEN: number
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: 'message' | 'close' | 'error', listener: (data?: unknown) => void): void
}

type Ctx = {
  sandbox: { wrap(request: { argv: string[] }): { cwd: string; env: NodeJS.ProcessEnv } }
  http: { ws(path: string, listener: (socket: Socket, request: IncomingMessage) => void): void }
  effect(effect: () => void | (() => void), label?: string): void
}

type Session = {
  key: string
  pty: IPty
  buffer: string
  socket: Socket | null
}

const BUFFER_MAX = 512 * 1024

/** 用户登录 shell：优先 $SHELL，其次 macOS 默认 zsh。 */
function loginShell() {
  const configured = String(process.env.SHELL ?? '').trim()
  if (configured && existsSync(configured)) return configured
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
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

function isOpen(ws: Socket | null | undefined): ws is Socket {
  return !!ws && ws.readyState === ws.OPEN
}

export function apply(ctx: Ctx) {
  const pool = new Map<string, Session>()

  const kill = (session: Session) => {
    pool.delete(session.key)
    try {
      session.pty.kill()
    } catch {
      // 已退出。
    }
  }

  ctx.effect(() => () => {
    for (const session of [...pool.values()]) kill(session)
  }, 'global-terminal.cleanup')

  ctx.http.ws('/ws/global-terminal', (socket, request) => {
    const q = new URL(request.url ?? '/', 'http://localhost').searchParams
    const cols = dim(q.get('cols'), 100, 20, 500)
    const rows = dim(q.get('rows'), 30, 8, 400)
    const key = String(q.get('session') ?? '').trim() || 'main'
    let session = pool.get(key)

    if (session) {
      try {
        session.pty.resize(cols, rows)
      } catch {
        // 进程可能刚退。
      }
    } else {
      const shell = loginShell()
      const sandbox = ctx.sandbox.wrap({ argv: [shell] })
      try {
        const child = pty.spawn(shell, ['-il'], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: sandbox.cwd,
          env: {
            ...process.env,
            ...sandbox.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: process.env.LANG ?? 'en_US.UTF-8',
          },
        })
        session = { key, pty: child, buffer: '', socket: null }
        pool.set(key, session)
        child.onData((chunk) => {
          const current = pool.get(key)
          if (!current || current.pty !== child) return
          current.buffer += chunk
          if (current.buffer.length > BUFFER_MAX) current.buffer = current.buffer.slice(-BUFFER_MAX)
          const ws = current.socket
          if (!isOpen(ws)) return
          try {
            ws.send(typeof chunk === 'string' ? chunk : String(chunk))
          } catch {
            // 连接可能已断；数据仍在 buffer。
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

    if (session.socket && session.socket !== socket) {
      try {
        session.socket.close(1000, 'superseded')
      } catch {
        // 忽略。
      }
    }
    session.socket = socket
    if (session.buffer) {
      try {
        socket.send('\x1b[2J\x1b[3J\x1b[H')
        socket.send(session.buffer)
      } catch {
        // 连接可能已断。
      }
    }

    socket.on('message', (raw) => {
      const current = pool.get(key)
      if (!current) return
      let msg: { type?: string; data?: unknown; cols?: unknown; rows?: unknown }
      try {
        msg = JSON.parse(text(raw))
      } catch {
        return
      }
      if (msg.type === 'input') current.pty.write(String(msg.data ?? ''))
      if (msg.type === 'resize') {
        current.pty.resize(dim(msg.cols, 100, 20, 500), dim(msg.rows, 30, 8, 400))
      }
    })

    const detach = () => {
      const current = pool.get(key)
      if (current?.socket === socket) current.socket = null
    }
    socket.on('close', detach)
    socket.on('error', detach)
  })
}
