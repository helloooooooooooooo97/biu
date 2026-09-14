import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as fs from '@biu/host-fs'
import * as sandbox from '@biu/host-sandbox'
import * as subprocess from './index.ts'

async function runtime() {
  const ctx = new Context()
  await ctx.plugin(tools)
  const workspace = await mkdtemp(join(tmpdir(), 'cordis-sub-'))
  await ctx.plugin(fs, { root: workspace })
  await ctx.plugin(sandbox)
  await ctx.plugin(subprocess)
  return ctx
}

test.skipIf(process.platform === 'win32')('timeout kills pipeline so run does not hang on leftover stdout holders', async () => {
  const ctx = await runtime()
  const started = Date.now()
  const result = await ctx.subprocess.run({
    argv: subprocess.posixShellArgv('sleep 30 | cat'),
    timeoutMs: 400,
  })
  const elapsed = Date.now() - started
  assert.ok(elapsed < 2500, `still hung after ${elapsed}ms`)
  assert.notEqual(result.code, 0)
})

test.skipIf(process.platform === 'win32')('onStdout sees incremental output', async () => {
  const ctx = await runtime()
  const seen: string[] = []
  const result = await ctx.subprocess.run({
    argv: subprocess.posixShellArgv('printf a; printf b'),
    onStdout: (_chunk, acc) => seen.push(acc.stdout),
  })
  assert.equal(result.stdout, 'ab')
  assert.ok(seen.length >= 1)
  assert.equal(seen.at(-1), 'ab')
})

test.skipIf(process.platform === 'win32')('abort kills pipeline children', async () => {
  const ctx = await runtime()
  const abort = new AbortController()
  const started = Date.now()
  const pending = ctx.subprocess.run({ argv: subprocess.posixShellArgv('sleep 30 | cat') }, abort.signal)
  setTimeout(() => abort.abort(), 200)
  await pending
  const elapsed = Date.now() - started
  assert.ok(elapsed < 2500, `abort still hung after ${elapsed}ms`)
})
