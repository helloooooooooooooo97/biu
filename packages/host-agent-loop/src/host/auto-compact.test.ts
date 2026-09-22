import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PostStepReq } from '@biu/type-agent-loop'
import { autoCompactPostStep } from './auto-compact.ts'

function step(patch: Partial<PostStepReq> = {}): PostStepReq {
  return {
    sessionId: 's1',
    turn: 1,
    step: 0,
    text: '先改文件',
    inputTokens: 2400,
    toolCalls: [{ id: '1', name: 'bash', arguments: '{}' }],
    config: { autoCompactInputTokens: 1000 },
    ...patch,
  }
}

test('post-step compact hook appends onto the assistant text only after the threshold', () => {
  assert.equal(autoCompactPostStep(step({ inputTokens: 1000 })).text, '先改文件')
  assert.equal(autoCompactPostStep(step({ config: {} })).text, '先改文件')
  const noted = autoCompactPostStep(step())
  assert.match(noted.text, /^先改文件\n\n\[自动压缩\]/)
  assert.match(noted.text, /path=\/sessions\/s1 action=compact/)
  assert.deepEqual(noted.toolCalls, step().toolCalls)
  assert.equal(autoCompactPostStep(noted).text, noted.text)
  assert.equal(
    autoCompactPostStep(
      step({
        toolCalls: [
          {
            id: 'c',
            name: 'db_action',
            arguments: JSON.stringify({ path: '/sessions/s1', action: 'compact', args: { text: '摘要' } }),
          },
        ],
      }),
    ).text,
    '先改文件',
  )
})
