import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as systemPrompt from '@biu/host-system-prompt'
import * as tools from '@biu/host-tools'
import * as pick from './index.ts'

test('registers pick instructions on the system prompt', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(pick)
  const text = ctx.systemPrompt.assemble()
  assert.match(text, /<pick>/)
  assert.match(text, /kind\/id/)
  assert.match(text, /path/)
  assert.match(text, /db_content/)
  assert.match(text, /selection/)
  assert.match(text, /insert/)
  assert.match(text, /title/)
  assert.match(text, /plugin 字段/)
  assert.match(text, /sandbox \+ pack/)
  assert.match(text, /action=view/)
  assert.match(text, /registerRowView/)
  assert.match(text, /db_update/)
  assert.match(text, /示例写法/)
  assert.match(text, /:::pageBlock/)
  assert.match(text, /db_content \/plugins/)
  assert.match(text, /\/api\/db\/file\//)
  assert.match(text, /db_asset/)
})
