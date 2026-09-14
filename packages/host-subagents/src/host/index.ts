import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'

export interface SpawnOptions {
  prompt: string
  /** true：fork 父会话日志；默认空会话隔离。 */
  inherit?: boolean
  parentSessionId?: string
}

export class SubagentsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'subagents')
  }

  async spawn(options: SpawnOptions | string) {
    const opts: SpawnOptions = typeof options === 'string' ? { prompt: options } : options
    const parentSessionId = opts.parentSessionId || currentSessionId()
    const child = opts.inherit && parentSessionId
      ? await this.ctx.sessions.fork(parentSessionId)
      : await this.ctx.sessions.create(undefined, parentSessionId ? { parentSessionId } : {})
    const agent = await this.ctx.agents.create(child.id)
    const turn = await agent.send(opts.prompt)
    return { sessionId: child.id, text: turn.text, steps: turn.steps, inherited: Boolean(opts.inherit) }
  }
}

export const name = 'subagents'
export const inject = ['sessions', 'agents', 'tools']

export function apply(ctx: Context) {
  const subagents = new SubagentsService(ctx)
  ctx.tools.register({
    name: 'subagent_spawn',
    description: '在独立 session 中跑一个子 agent；inherit=true 时 fork 父会话上下文',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        inherit: { type: 'boolean' },
        parentSessionId: { type: 'string' },
      },
      required: ['prompt'],
    },
    execute: (args) =>
      subagents.spawn({
        prompt: String(args.prompt),
        inherit: Boolean(args.inherit),
        parentSessionId: args.parentSessionId ? String(args.parentSessionId) : undefined,
      }),
  })
}
