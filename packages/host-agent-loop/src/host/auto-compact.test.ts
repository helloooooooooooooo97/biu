import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PostStepReq } from '@biu/type-agent-loop'
import { autoCompactPostStep, contextWindowTokens, mechanicalCompactText, resolveAutoCompactThreshold, shouldAutoCompact } from './auto-compact.ts'

function step(patch: Partial<PostStepReq> = {}): PostStepReq {
  return {
    sessionId: 's1',
    turn: 1,
    step: 0,
    text: '先改文件',
    inputTokens: 2400,
    contextWindowTokens: 200_000,
    toolCalls: [{ id: '1', name: 'bash', arguments: '{}' }],
    config: { autoCompactInputTokens: 1000 },
    ...patch,
  }
}

test('auto compact threshold is always on and cannot exceed the model window', () => {
  assert.equal(contextWindowTokens('200k'), 200_000)
  assert.equal(contextWindowTokens('1m'), 1_000_000)
  assert.equal(resolveAutoCompactThreshold(undefined, 200_000), 200_000)
  assert.equal(resolveAutoCompactThreshold(0, 200_000), 200_000)
  assert.equal(resolveAutoCompactThreshold(80_000, 200_000), 80_000)
  assert.equal(resolveAutoCompactThreshold(400_000, 200_000), 200_000)
})

test('post-step does not insert a compact note into the assistant text', () => {
  const noted = autoCompactPostStep(step())
  assert.equal(noted.text, '先改文件')
  assert.equal(autoCompactPostStep(noted), noted)
  assert.equal(shouldAutoCompact(step()), true)
  assert.equal(shouldAutoCompact(step({ inputTokens: 1000 })), false)
  assert.equal(shouldAutoCompact(step({ toolCalls: [{ id: 'c', name: 'db_action', arguments: JSON.stringify({ path: '/sessions/s1', action: 'compact', args: { text: '摘要' } }) }] })), false)
  assert.match(mechanicalCompactText([
    { type: 'user/message', text: '旧问题' },
    { type: 'assistant/message', text: '[自动压缩] 不要留下' },
    { type: 'tool/result', name: 'bash', detail: 'ok' },
  ]), /用户: 旧问题/)
  assert.doesNotMatch(mechanicalCompactText([{ type: 'assistant/message', text: '[自动压缩] 不要留下' }]), /自动压缩/)
})
