import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { MapIcon } from '@heroicons/react/16/solid'
import '@biu/type-host-context'
import * as slots from '@biu/web-slots'
import * as appModules from '@biu/web-app-modules'
import * as snapshot from '@biu/web-snapshot'
import * as sessionView from '@biu/web-session-view'
import * as projectView from '@biu/web-project-view'
import * as chat from './index.ts'
import * as shell from '@biu/web-app-shell'

test('one plugin fills thread, trajectory, composer and approvals dock', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin(appModules)
  await ctx.plugin(sessionView)
  await ctx.plugin(projectView)
  await ctx.plugin(snapshot)
  await ctx.plugin(chat)
  assert.equal(ctx.slots.list('composer').length, 0)
  await ctx.plugin(shell)
  assert.equal(ctx.slots.list('composer')[0]?.id, 'chat')
  assert.equal(ctx.slots.list('stage').some((item) => item.id === 'chat-thread'), true)
  assert.equal(ctx.slots.list('stage-aside').some((item) => item.id === 'chat-outline'), true)
  assert.equal(ctx.slots.list('trajectory').some((item) => item.id === 'trajectory'), true)
  assert.equal(ctx.slots.list('project').length, 0)
  assert.equal(ctx.slots.list('dock').some((item) => item.id === 'approvals'), true)
  assert.equal(ctx.slots.list('dock').some((item) => item.id === 'chat-live-hud'), true)
  assert.equal(ctx.slots.list('models').length, 0)
  const traj = ctx.slots.list('inspector-panels').find((item) => item.id === 'chat-traj')
  const usage = ctx.slots.list('inspector-panels').find((item) => item.id === 'chat-usage')
  assert.equal(traj.props?.().tabIcon, MapIcon)
  assert.ok(usage)
  assert.equal(traj.props?.().requiresSession, true)
  assert.equal(usage.props?.().requiresSession, true)
  assert.deepEqual(traj.props?.().centerKinds, ['session'])
  assert.deepEqual(usage.props?.().centerKinds, ['session'])
})

