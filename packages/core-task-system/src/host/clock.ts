import type { Context } from 'cordis'

declare module 'cordis' {
  interface Events {
    'clock/tick'(iso: string): void
  }
}

/** 任务包内的秒级心跳：驱动 cron/at，并向前端广播 clockIso。 */
export function startTaskClock(ctx: Context) {
  let lastIso = new Date().toISOString()
  ctx.tools.register({
    name: 'clock_now',
    description: '读取最近一次心跳时间',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: () => lastIso,
  })
  ctx.hub.register({
    id: 'clock',
    title: '心跳',
    subtitle: '定时器在任务包 ctx.effect 里',
    plugin: 'core-task-system',
    kind: 'clock',
  })
  ctx.effect(() => {
    const tick = () => {
      const iso = new Date().toISOString()
      lastIso = iso
      ctx.emit('clock/tick', iso)
      ctx.http.broadcast('clock', { iso })
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, 'core-task-system.clock.interval')
}
