import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import { runWithToolProgress } from '@biu/host-tools'

test('invoke missing tool fails; unregister drops the name', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await assert.rejects(() => ctx.tools.invoke('gone'), /unknown tool: gone/)

  const fiber = ctx.plugin({
    inject: ['tools'],
    apply: (c) =>
      c.tools.register({
        name: 'ping',
        description: 'ping',
        parameters: { type: 'object', properties: {} },
        execute: () => 'pong',
      }),
  })
  await fiber
  assert.equal(await ctx.tools.invoke('ping'), 'pong')
  await fiber.dispose()
  await assert.rejects(() => ctx.tools.invoke('ping'), /unknown tool: ping/)
})

test('execution mode defaults to exclusive and can depend on arguments', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'safe',
    description: 'safe',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: () => 'ok',
  })
  ctx.tools.register({
    name: 'dynamic',
    description: 'dynamic',
    parameters: { type: 'object', properties: {} },
    execution: (args) => (args.readOnly === true ? 'parallel' : 'exclusive'),
    execute: () => 'ok',
  })

  assert.equal(ctx.tools.executionMode('safe'), 'parallel')
  assert.equal(ctx.tools.executionMode('dynamic', { readOnly: true }), 'parallel')
  assert.equal(ctx.tools.executionMode('dynamic', { readOnly: false }), 'exclusive')
  assert.equal(ctx.tools.executionMode('gone'), 'exclusive')
})

test('pre-execute waterfall can deny a call', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'boom',
    description: 'boom',
    parameters: { type: 'object', properties: {} },
    execute: () => 'nope',
  })
  ctx.on('tools/pre-execute', (req, next) => ({ ...next(), deny: 'denied: boom' }))
  await assert.rejects(() => ctx.tools.invoke('boom'), /denied: boom/)
})

test('guard can deny before execute', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'boom',
    description: 'boom',
    parameters: { type: 'object', properties: {} },
    execute: () => 'nope',
  })
  ctx.tools.guard((req) => ({ ...req, deny: 'denied: boom' }))
  await assert.rejects(() => ctx.tools.invoke('boom'), /denied: boom/)
})

test('minimal mode only exposes bash and str_replace_editor', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  for (const name of ['bash', 'str_replace_editor', 'fs_read', 'fs_write']) {
    ctx.tools.register({
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      execute: () => name,
    })
  }
  assert.deepEqual(ctx.tools.names().sort(), ['bash', 'fs_read', 'fs_write', 'str_replace_editor'])
  ctx.tools.setMode('minimal')
  assert.equal(ctx.tools.getMode(), 'minimal')
  assert.deepEqual(ctx.tools.names().sort(), ['bash', 'str_replace_editor'])
  assert.deepEqual(
    ctx.tools.schemas().map((item) => item.function.name).sort(),
    ['bash', 'str_replace_editor'],
  )
  assert.equal(await ctx.tools.invoke('bash'), 'bash')
  await assert.rejects(() => ctx.tools.invoke('fs_read'), /not available in minimal mode/)
})

test('catalog lists all tools; extraTools temporarily unlocks minimal', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  for (const name of ['bash', 'str_replace_editor', 'fs_read']) {
    ctx.tools.register({
      name,
      description: `${name} desc`,
      parameters: { type: 'object', properties: {} },
      execute: () => name,
    })
  }
  ctx.tools.setMode('minimal')
  assert.deepEqual(
    ctx.tools.catalog().map((item) => item.name),
    ['bash', 'fs_read', 'str_replace_editor'],
  )
  await assert.rejects(() => ctx.tools.invoke('fs_read'), /not available in minimal mode/)
  await tools.runWithExtraTools(['fs_read'], async () => {
    assert.deepEqual(ctx.tools.names().sort(), ['bash', 'fs_read', 'str_replace_editor'])
    assert.equal(await ctx.tools.invoke('fs_read'), 'fs_read')
  })
  await assert.rejects(() => ctx.tools.invoke('fs_read'), /not available in minimal mode/)
})

test('store tools appear in standard mode', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'bash',
    description: 'bash',
    parameters: { type: 'object', properties: {} },
    execute: () => 'bash',
  })
  tools.runWithToolOrigin('store', () => {
    ctx.tools.register({
      name: 'store_ping',
      description: 'store ping',
      parameters: { type: 'object', properties: {} },
      execute: () => 'pong',
    })
  })
  assert.equal(ctx.tools.originOf('store_ping'), 'store')
  ctx.tools.setMode('minimal')
  assert.equal(ctx.tools.names().includes('store_ping'), false)
  ctx.tools.setMode('standard')
  assert.equal(ctx.tools.names().includes('store_ping'), true)
  assert.equal(await ctx.tools.invoke('store_ping'), 'pong')
  ctx.tools.setMode('minimal')
  await assert.rejects(() => ctx.tools.invoke('store_ping'), /not available in minimal mode/)
})

test('file mode only exposes filesystem db tools', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  for (const name of ['bash', 'str_replace_editor', 'db_list', 'db_read', 'fs_read']) {
    ctx.tools.register({
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      execute: () => name,
    })
  }
  ctx.tools.setMode('file')
  assert.equal(ctx.tools.getMode(), 'file')
  assert.deepEqual(ctx.tools.names().sort(), ['db_list', 'db_read'])
  assert.equal(await ctx.tools.invoke('db_list'), 'db_list')
  await assert.rejects(() => ctx.tools.invoke('bash'), /not available in file mode/)
  await assert.rejects(() => ctx.tools.invoke('fs_read'), /not available in file mode/)
  await tools.runWithExtraTools(['fs_read'], async () => {
    await assert.rejects(() => ctx.tools.invoke('fs_read'), /not available in file mode/)
  })
})

test('invoke rejects promptly when aborted during a hung execute', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'hang',
    description: 'hang',
    parameters: { type: 'object', properties: {} },
    execute: () => new Promise(() => undefined),
  })
  const ac = new AbortController()
  const pending = ctx.tools.invoke('hang', {}, ac.signal)
  await new Promise((resolve) => setTimeout(resolve, 20))
  ac.abort()
  await assert.rejects(() => pending, /cancelled/)
})

test('report is ignored unless invoke is wrapped with progress', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'tick',
    description: 'tick',
    parameters: { type: 'object', properties: {} },
    execute: () => {
      ctx.tools.report({ n: 1 })
      ctx.tools.report({ n: 2 })
      return { n: 3 }
    },
  })
  const seen: string[] = []
  ctx.tools.report('outside')
  const result = await runWithToolProgress((detail) => seen.push(detail), () => ctx.tools.invoke('tick'))
  assert.deepEqual(result, { n: 3 })
  assert.deepEqual(seen, ['{"n":1}', '{"n":2}'])
})

test('Chinese tool names are sanitized for OpenAI-style APIs', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({
    name: '查天气',
    description: '查天气',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  const [name] = ctx.tools.names()
  assert.match(String(name), /^tool_[a-f0-9]{8}$/)
  assert.equal(ctx.tools.schemas()[0]?.function.name, name)
  assert.equal(await ctx.tools.invoke('查天气'), 'ok')
  assert.equal(await ctx.tools.invoke(name!), 'ok')
})
