import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as fs from '@biu/host-fs'
import * as sandbox from '@biu/host-sandbox'
import * as subprocess from '@biu/host-subprocess'
import * as terminal from './index.ts'

test('persistent terminal open/write/read/close', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'cordis-term-'))
  await ctx.plugin(fs, { root })
  await ctx.plugin(sandbox)
  await ctx.plugin(subprocess)
  await ctx.plugin(terminal)
  const opened = (await ctx.tools.invoke('terminal_open')) as { id: string }
  await ctx.tools.invoke('terminal_write', { id: opened.id, data: 'echo term-ok\n' })
  const deadline = Date.now() + 2000
  let output = ''
  while (Date.now() < deadline) {
    output = ((await ctx.tools.invoke('terminal_read', { id: opened.id })) as { output: string }).output
    if (output.includes('term-ok')) break
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  const closed = (await ctx.tools.invoke('terminal_close', { id: opened.id })) as { closed: boolean }
  assert.equal(closed.closed, true)
  assert.match(output, /term-ok/)
})

test('named terminal is reused and output is emitted as internal event', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'cordis-term-'))
  await ctx.plugin(fs, { root })
  await ctx.plugin(sandbox)
  await ctx.plugin(subprocess)
  await ctx.plugin(terminal)

  const chunks: string[] = []
  ctx.on('internal/terminal/output', (payload: { name: string; seq: number; chunk: string }) => {
    chunks.push(payload.chunk)
  })

  const first = (await ctx.tools.invoke('terminal_open', { name: 'page:abc' })) as { id: string; reused: boolean }
  const again = (await ctx.tools.invoke('terminal_open', { name: 'page:abc' })) as { id: string; reused: boolean }
  assert.equal(again.id, first.id)
  assert.equal(again.reused, true)

  await ctx.tools.invoke('terminal_write', { id: first.id, data: 'echo via-page\n' })
  const deadline = Date.now() + 2000
  let output = ''
  while (Date.now() < deadline) {
    output = ((await ctx.tools.invoke('terminal_read', { id: first.id })) as { output: string }).output
    if (output.includes('via-page')) break
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  assert.match(output, /via-page/)
  assert.match(chunks.join(''), /via-page/)

  const listed = (await ctx.tools.invoke('terminal_list')) as { terms: Array<{ id: string; name: string }> }
  assert.equal(listed.terms.some((item) => item.id === first.id && item.name === 'page:abc'), true)

  await ctx.tools.invoke('terminal_close', { id: first.id })
  const after = (await ctx.tools.invoke('terminal_list')) as { terms: Array<{ id: string }> }
  assert.equal(after.terms.some((item) => item.id === first.id), false)
})
