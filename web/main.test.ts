import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'

test('web entry boots without top-level await', () => {
  const src = readFileSync(resolve(import.meta.dirname, './main.tsx'), 'utf8')
  assert.match(src, /applyStoredTheme/)
  assert.match(src, /不用 top-level await/)
  assert.match(src, /export const webBoot = \(async \(\) =>/)
  assert.doesNotMatch(src, /^for \(const item of webRuntimeLoaders\) \{\n  const mod = await item.load\(\)/m)
  assert.doesNotMatch(src, /const ctx = new Context\(\)\n\s*const ctx = new Context\(\)/)
})


test('boots into #app', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  globalThis.fetch = (async () => new Response(JSON.stringify({
    plugins: [],
    pages: [],
    routes: [],
    events: [],
    services: [],
  }))) as typeof fetch
  await act(async () => {
    const { webBoot } = await import('./main.tsx')
    await webBoot
  })
  assert.match(document.body.innerHTML, /data-testid="shell-side-places"/)
  assert.match(document.body.innerHTML, /会话/)
  assert.match(document.body.innerHTML, /设置/)
})
