import { Service, type Context } from 'cordis'
import type { SpawnResult } from '@biu/host-subprocess'
import { posixShellArgv, describeHostRuntime, hostShellKind } from '@biu/host-subprocess'
import { currentSessionId } from '@biu/host-sessions/scope'
import {
  extractImagePathCandidates,
  findRecentImageFiles,
  ingestSessionImages,
} from '@biu/host-sessions/artifacts'

/** Capability seam 定义：换沙箱/远程 shell 只换 runner，不改 tool 名与 loop。 */
export type ShellRunner = (command: string, signal?: AbortSignal) => Promise<SpawnResult>

export class ShellService extends Service {
  private runner: ShellRunner

  constructor(ctx: Context) {
    super(ctx, 'shell')
    this.runner = (command, signal) =>
      ctx.subprocess.run(
        {
          argv: posixShellArgv(command),
          timeoutMs: 15_000,
          onStdout: (_chunk, acc) => ctx.tools.report({ code: null, stdout: acc.stdout, stderr: acc.stderr }),
          onStderr: (_chunk, acc) => ctx.tools.report({ code: null, stdout: acc.stdout, stderr: acc.stderr }),
        },
        signal,
      )
  }

  setRunner(runner: ShellRunner) {
    this.runner = runner
  }

  run(command: string, signal?: AbortSignal) {
    return this.runner(command, signal)
  }
}

export const name = 'shell'
export const inject = ['subprocess', 'tools', 'fs']

export function apply(ctx: Context) {
  const shell = new ShellService(ctx)
  ctx.tools.register({
    name: 'bash',
    description:
      hostShellKind() === 'cmd'
        ? '在沙箱工作区执行命令（当前为 Windows cmd.exe /c）。用 dir/type/del，不要用 ls/cat。图片路径会尽量收录到会话 artifacts。'
        : '在沙箱工作区执行命令（当前为 POSIX shell）。截图/图片文件会尽量收录到会话 artifacts，并在对话里展示（命令或输出中带图片路径，或工作区内新写入的图片）。',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
    execute: async (args, signal) => {
      const command = String(args.command)
      const startedAt = Date.now() - 1500
      const result = await shell.run(command, signal)
      const base = {
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      }
      const sessionId = currentSessionId()
      if (!sessionId) return base

      const workspaceRoot = ctx.fs.effectiveRoot()
      const candidates = [
        ...extractImagePathCandidates(`${result.stdout}\n${result.stderr}`),
        ...extractImagePathCandidates(command),
      ]
      try {
        const recent = await findRecentImageFiles(workspaceRoot, startedAt)
        candidates.push(...recent)
      } catch {
        /* ignore scan failures */
      }
      if (candidates.length === 0) return base

      try {
        const artifacts = await ingestSessionImages({
          sessionId,
          candidates,
          workspaceRoot,
        })
        if (artifacts.length === 0) return base
        return { ...base, artifacts }
      } catch {
        return base
      }
    },
  })
  ctx.inject(['systemPrompt'], (inner) => {
    inner.systemPrompt.register('host.runtime', () => describeHostRuntime())
  })
}
