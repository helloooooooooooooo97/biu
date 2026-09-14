import { spawn, type ChildProcess } from 'node:child_process'
import { Service, type Context } from 'cordis'
export { posixShellArgv, posixShellBin, hostShellKind, describeHostRuntime } from './posix-shell.ts'

export interface SpawnProgress {
  stdout: string
  stderr: string
}

export interface SpawnRequest {
  argv: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: string
  timeoutMs?: number
  onStdout?: (chunk: string, acc: SpawnProgress) => void
  onStderr?: (chunk: string, acc: SpawnProgress) => void
}

export interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

const KILL_GRACE_MS = 800

export class SubprocessService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'subprocess')
  }

  run(req: SpawnRequest, signal?: AbortSignal): Promise<SpawnResult> {
    const wrapped = this.ctx.sandbox.wrap(req)
    return new Promise((resolve, reject) => {
      // Unix：独立进程组，超时才能杀管道子进程。否则只 SIGTERM shell，
      // grep|cat 仍占着 stdout，child.close 永远不来，agent 整回合卡死。
      const child = spawn(wrapped.argv[0]!, wrapped.argv.slice(1), {
        cwd: wrapped.cwd,
        env: wrapped.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      let killTimer: ReturnType<typeof setTimeout> | undefined
      let forceTimer: ReturnType<typeof setTimeout> | undefined
      child.stdout?.on('data', (chunk) => {
        const text = String(chunk)
        stdout += text
        wrapped.onStdout?.(text, { stdout, stderr })
      })
      child.stderr?.on('data', (chunk) => {
        const text = String(chunk)
        stderr += text
        wrapped.onStderr?.(text, { stdout, stderr })
      })

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (killTimer) clearTimeout(killTimer)
        if (forceTimer) clearTimeout(forceTimer)
        signal?.removeEventListener('abort', onAbort)
      }
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        fn()
      }
      const stop = () => {
        killTree(child, 'SIGTERM')
        killTimer = setTimeout(() => {
          killTree(child, 'SIGKILL')
          child.stdout?.destroy()
          child.stderr?.destroy()
        }, KILL_GRACE_MS)
        forceTimer = setTimeout(() => {
          settle(() => resolve({ code: null, stdout, stderr }))
        }, KILL_GRACE_MS + 500)
      }

      const timer = wrapped.timeoutMs ? setTimeout(stop, wrapped.timeoutMs) : undefined
      const onAbort = () => stop()
      if (signal?.aborted) stop()
      else signal?.addEventListener('abort', onAbort)
      if (wrapped.stdin) child.stdin?.end(wrapped.stdin)
      else child.stdin?.end()
      child.on('error', (error) => {
        settle(() => reject(error))
      })
      child.on('close', (code) => {
        settle(() => resolve({ code, stdout, stderr }))
      })
    })
  }
}

function killTree(child: ChildProcess, sig: NodeJS.Signals) {
  const pid = child.pid
  if (pid == null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {
      try {
        child.kill()
      } catch {
        /* already dead */
      }
    })
    return
  }
  try {
    process.kill(-pid, sig)
  } catch {
    try {
      child.kill(sig)
    } catch {
      /* already dead */
    }
  }
}

export const name = 'subprocess'
export const inject = ['sandbox']

export function apply(ctx: Context) {
  new SubprocessService(ctx)
}
