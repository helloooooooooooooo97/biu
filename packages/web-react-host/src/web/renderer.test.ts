import { test } from 'vitest'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { Context } from 'cordis'
import * as slots from '@biu/web-slots'
import * as appModules from '@biu/web-app-modules'
import * as snapshot from '@biu/web-snapshot'
import * as sessionView from '@biu/web-session-view'
import * as projectView from '@biu/web-project-view'
import * as shell from '@biu/web-app-shell'
import { renderRoot } from './renderer.tsx'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('shell renderer keeps the auth boundary through SlotOutlet', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin(appModules)
  await ctx.plugin(sessionView)
  await ctx.plugin(projectView)
  await ctx.plugin(snapshot)
  await ctx.plugin(shell)
  const html = renderToStaticMarkup(renderRoot(ctx.slots, ctx.appModules))
  assert.doesNotMatch(html, /Activity bar/)
  assert.match(html, /data-testid="auth-gate"/)
  const src = readFileSync(resolve(import.meta.dirname, './renderer.tsx'), 'utf8')
  assert.match(src, /SlotOutlet/)
  assert.doesNotMatch(src, /function Outlet/)
})
