import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Service, type Context } from 'cordis'
import { posixShellBin } from '@biu/host-subprocess'

interface Term {
  id: string
  /** 可选命名会话：同名复用同一个 shell（页面终端和 agent 共用一条会话就靠它） */
  name: string
  child: ChildProcessWithoutNullStreams
  buffer: string
  cwd: string
  startedAt: number
  /** 每次 output 自增；订阅方靠它排序、判断是否需要重新同步 */
  seq: number
  bytes: number
}

export interface TerminalInfo {
  id: string
  name: string
  cwd: string
  pid: number | undefined
  startedAt: number
  seq: number
  bytes: number
  alive: boolean
}

/** 输出事件：订阅方（如页面终端插件）用它做实时回显。 */
export interface TerminalOutputEvent {
  id: string
  name: string
  seq: number
  chunk: string
}

export interface TerminalExitEvent {
  id: string
  name: string
  code: number | null
}

function info(term: Term): TerminalInfo {
  return {
    id: term.id,
    name: term.name,
    cwd: term.cwd,
    pid: term.child.pid,
    startedAt: term.startedAt,
    seq: term.seq,
    bytes: term.bytes,
    alive: term.child.exitCode == null && !term.child.killed,
  }
}

export class TerminalService extends Service {
  private terms = new Map<string, Term>()
  private byName = new Map<string, string>()

  constructor(ctx: Context) {
    super(ctx, 'terminals')
  }

  /** name 传了就复用同名会话；没传就是一条匿名会话。 */
  open(name = '') {
    const wanted = name.trim()
    if (wanted) {
      const existing = this.byName.get(wanted)
      const term = existing ? this.terms.get(existing) : undefined
      if (term) return { id: term.id, name: term.name, reused: true }
    }
    const id = crypto.randomUUID().slice(0, 8)
    const sh = posixShellBin()
    const wrapped = this.ctx.sandbox.wrap({ argv: [sh] })
    const child = spawn(sh, [], {
      cwd: wrapped.cwd,
      env: wrapped.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const term: Term = {
      id,
      name: wanted,
      child,
      buffer: '',
      cwd: wrapped.cwd,
      startedAt: Date.now(),
      seq: 0,
      bytes: 0,
    }
    const append = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      term.seq += 1
      term.bytes += text.length
      term.buffer += text
      if (term.buffer.length > 32_000) term.buffer = term.buffer.slice(-16_000)
      // internal/ 前缀：绕开 hub 的 dispatch 日志与 WS 广播链（终端输出是高频流）
      this.ctx.emit('internal/terminal/output', {
        id: term.id,
        name: term.name,
        seq: term.seq,
        chunk: text,
      } satisfies TerminalOutputEvent)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('close', (code) => {
      const living = this.terms.get(id)
      if (!living) return
      this.ctx.emit('internal/terminal/exit', { id, name: living.name, code } satisfies TerminalExitEvent)
      this.terms.delete(id)
      if (living.name) this.byName.delete(living.name)
    })
    this.terms.set(id, term)
    if (wanted) this.byName.set(wanted, id)
    return { id, name: wanted, reused: false }
  }

  write(id: string, data: string) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    term.child.stdin.write(data)
    return { id, ok: true }
  }

  /** since 给了就只回增量（配合 seq）；没给回整段缓冲。 */
  read(id: string, since?: number) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    const pending = since != null && since >= term.seq
    return {
      id,
      name: term.name,
      seq: term.seq,
      output: pending ? '' : term.buffer,
      cwd: term.cwd,
      alive: term.child.exitCode == null && !term.child.killed,
    }
  }

  list() {
    return { terms: [...this.terms.values()].map(info) }
  }

  /** 查一条会话：页面按块 id 命名，agent 用同一个名字就能接上。 */
  get(idOrName: string) {
    const direct = this.terms.get(idOrName)
    if (direct) return info(direct)
    const named = this.byName.get(idOrName.trim())
    const term = named ? this.terms.get(named) : undefined
    return term ? info(term) : null
  }

  close(id: string) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    term.child.kill('SIGTERM')
    this.terms.delete(id)
    if (term.name) this.byName.delete(term.name)
    return { id, closed: true }
  }
}

export const name = 'terminal'
export const inject = ['sandbox', 'tools']

export function apply(ctx: Context) {
  const terminals = new TerminalService(ctx)
  ctx.tools.register({
    name: 'terminal_open',
    description:
      '打开持久 shell。可选 name：同名会话直接复用（页面终端就是按块 id 命名的），不传则新开一条匿名会话。',
    parameters: { type: 'object', properties: { name: { type: 'string' } } },
    execute: (args) => terminals.open(args.name == null ? '' : String(args.name)),
  })
  ctx.tools.register({
    name: 'terminal_write',
    description: '向持久 shell 写入（记得命令末尾带换行）',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, data: { type: 'string' } },
      required: ['id', 'data'],
    },
    execute: (args) => terminals.write(String(args.id), String(args.data)),
  })
  ctx.tools.register({
    name: 'terminal_read',
    description: '读取持久 shell 缓冲（尾部 16KB 滚动窗口）',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, since: { type: 'number', description: '上次拿到的 seq，只取更新的部分' } },
      required: ['id'],
    },
    execute: (args) =>
      terminals.read(String(args.id), typeof args.since === 'number' ? args.since : undefined),
  })
  ctx.tools.register({
    name: 'terminal_list',
    description: '列出当前活着的 shell 会话（id / 名字 / cwd / pid）',
    parameters: { type: 'object', properties: {} },
    execute: () => terminals.list(),
  })
  ctx.tools.register({
    name: 'terminal_close',
    description: '关闭持久 shell',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => terminals.close(String(args.id)),
  })
}
