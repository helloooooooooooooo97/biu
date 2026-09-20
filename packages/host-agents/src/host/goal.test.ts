import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  continuationPrompt,
  decideGoalContinuation,
  GOAL_CONTINUE_PREFIX,
  MAX_GOAL_TURNS,
  parseGoalSlash,
} from './goal.ts'

const goal = {
  id: 'goal-1',
  objective: '让测试全绿',
  status: 'pursuing' as const,
  turns: 1,
}

test('parseGoalSlash wakes a goal from /goal, not from agentMode', () => {
  assert.deepEqual(parseGoalSlash('/goal 修好 CI'), { kind: 'start', objective: '修好 CI' })
  assert.deepEqual(parseGoalSlash('/goal pause'), { kind: 'pause' })
  assert.deepEqual(parseGoalSlash('/goal resume'), { kind: 'resume' })
  assert.deepEqual(parseGoalSlash('/goal clear'), { kind: 'clear' })
  assert.deepEqual(parseGoalSlash('/goal'), { kind: 'status' })
  assert.equal(parseGoalSlash('修好 CI'), null)
  assert.equal(parseGoalSlash('/bash ls'), null)
})

test('decideGoalContinuation follows pursuing goal regardless of 极简/标准/数据', () => {
  assert.equal(decideGoalContinuation({ goal, aborted: false, inboxLength: 0 }), 'continue')
  assert.equal(decideGoalContinuation({ goal: { ...goal, status: 'paused' }, aborted: false, inboxLength: 0 }), 'stop')
  assert.equal(decideGoalContinuation({ goal: { ...goal, status: 'achieved' }, aborted: false, inboxLength: 0 }), 'stop')
  assert.equal(decideGoalContinuation({ goal, aborted: true, inboxLength: 0 }), 'stop')
  assert.equal(decideGoalContinuation({ goal, aborted: false, inboxLength: 1 }), 'stop')
  assert.equal(
    decideGoalContinuation({ goal: { ...goal, turns: MAX_GOAL_TURNS }, aborted: false, inboxLength: 0 }),
    'budget',
  )
})

test('continuationPrompt names the goal id and asks for goal_complete', () => {
  assert.match(continuationPrompt(goal), new RegExp(GOAL_CONTINUE_PREFIX))
  assert.match(continuationPrompt(goal), /goal_id=goal-1/)
  assert.match(continuationPrompt(goal), /goal_complete/)
})
