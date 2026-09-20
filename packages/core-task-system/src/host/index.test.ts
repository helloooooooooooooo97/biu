import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { buildDeliverText, coerceAssigneeArg, computeBlocked, computeBlockedBy, computeNextTriggerAt, computeTurnUsage, defaultTrigger, depsSatisfied, deriveExecution, deriveExecutionFromReports, MAX_REPORT_PROMPTS, normalizeTrigger, parseCron, reportBackToCreator, shouldPromptProgress, sumReportUsage, TasksService } from './index.ts'

test('tasks sqlite crud and status move', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({
      title: '写需求',
      creator: { kind: 'user', name: '用户' },
    })
    assert.equal(a.status, 'todo')
    assert.equal(a.creator.name, '用户')
    assert.equal(a.assignee, null)
    assert.equal(a.assignedAt, null)
    assert.equal(a.description, '')

    const b = tasks.update(a.id, {
      status: 'doing',
      priority: 'high',
      description: '把需求写清楚',
      notes: '明天跟进',
      assignee: { kind: 'agent', sessionId: 'sess-1', name: 'Worker-A', mascot: { shape: 'blob', color: 'cyan' } },
    })
    assert.equal(b.status, 'doing')
    assert.equal(b.priority, 'high')
    assert.equal(b.description, '把需求写清楚')
    assert.equal(b.notes, '明天跟进')
    assert.equal(b.assignee?.sessionId, 'sess-1')
    assert.ok(b.assignedAt && b.assignedAt > 0)

    const listed = tasks.list({ status: 'doing' })
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, a.id)
    assert.equal(listed[0]?.creator.name, '用户')
    assert.equal(tasks.delete(a.id), true)
    assert.equal(tasks.list().length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('task search hits editor_content body', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-search-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const tasks = new TasksService(new Context(), path).open()
    tasks.create({
      title: '标题不含关键字',
      creator: { kind: 'user', name: '用户' },
      description: '把需求写清楚 unique-body-token',
    })
    const hit = tasks.list({ q: 'unique-body-token' })
    assert.equal(hit.length, 1)
    assert.match(hit[0]?.description ?? '', /unique-body-token/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('coerceAssigneeArg accepts actor object, sessionId string, and person name', async () => {
  const host = { sessions: undefined } as never
  const actor = await coerceAssigneeArg(host, {
    kind: 'agent',
    sessionId: '856ffdc2-d00f-42e9-b084-d3d67a9c3e07',
    name: 'Cordis·后端开发',
    mascot: { shape: 'pebble', color: 'magenta', eye: 11 },
  })
  assert.equal(actor?.kind, 'agent')
  assert.equal(actor?.sessionId, '856ffdc2-d00f-42e9-b084-d3d67a9c3e07')
  assert.equal(actor?.name, 'Cordis·后端开发')
  assert.equal(actor?.mascot?.color, 'magenta')
  assert.notEqual(actor?.name, '[object Object]')

  const asJson = await coerceAssigneeArg(
    host,
    JSON.stringify({
      kind: 'agent',
      sessionId: '856ffdc2-d00f-42e9-b084-d3d67a9c3e07',
      name: 'Cordis·后端开发',
    }),
  )
  assert.equal(asJson?.sessionId, '856ffdc2-d00f-42e9-b084-d3d67a9c3e07')
  assert.equal(asJson?.name, 'Cordis·后端开发')

  const byId = await coerceAssigneeArg(host, '856ffdc2-d00f-42e9-b084-d3d67a9c3e07')
  assert.equal(byId?.kind, 'agent')
  assert.equal(byId?.sessionId, '856ffdc2-d00f-42e9-b084-d3d67a9c3e07')

  const person = await coerceAssigneeArg(host, 'Alice')
  assert.deepEqual(person, { kind: 'user', name: 'Alice' })

  assert.equal(await coerceAssigneeArg(host, null), null)
})

test('deriveExecution only uses session turn events, not agents.isBusy', () => {
  assert.equal(deriveExecution(undefined).status, 'idle')
  assert.equal(deriveExecution([]).status, 'idle')

  const running = deriveExecution([
    { type: 'turn/start', turn: 1, ts: 1 },
    { type: 'assistant/chunk', text: 'hi', ts: 2 },
  ])
  assert.equal(running.status, 'running')
  assert.equal(running.turn, 1)
  assert.equal(running.assistantText, 'hi')

  const idle = deriveExecution([
    { type: 'turn/start', turn: 2, ts: 1 },
    { type: 'assistant/message', text: 'done', ts: 2 },
    { type: 'turn/end', turn: 2, reason: 'complete', ts: 3 },
  ])
  assert.equal(idle.status, 'idle')
  assert.equal(idle.reason, 'complete')
  assert.equal(idle.assistantText, 'done')
})

test('deriveExecutionFromReports uses latest report status', () => {
  // 无任何上报：绝不推断为完成（无 complete reason）
  const none = deriveExecutionFromReports([])
  assert.equal(none.status, 'idle')
  assert.equal(none.reason, undefined)
  const none2 = deriveExecutionFromReports(undefined)
  assert.equal(none2.status, 'idle')
  assert.equal(none2.reason, undefined)

  // 只有 doing -> running
  const doing = deriveExecutionFromReports([
    { sessionId: 's1', turn: 1, status: 'doing', note: '排查中', ts: 1 },
  ])
  assert.equal(doing.status, 'running')
  assert.equal(doing.turn, 1)
  assert.equal(doing.assistantText, '排查中')

  // 最新是 done -> idle + complete
  const done = deriveExecutionFromReports([
    { sessionId: 's1', turn: 1, status: 'doing', note: '排查中', ts: 1 },
    { sessionId: 's1', turn: 2, status: 'done', note: '搞定', ts: 2 },
  ])
  assert.equal(done.status, 'idle')
  assert.equal(done.reason, 'complete')
  assert.equal(done.turn, 2)
  assert.equal(done.assistantText, '搞定')

  // 后 report 覆盖前一个 done
  const reopened = deriveExecutionFromReports([
    { sessionId: 's1', turn: 2, status: 'done', note: '搞定', ts: 2 },
    { sessionId: 's1', turn: 3, status: 'doing', note: '又发现新问题', ts: 3 },
  ])
  assert.equal(reopened.status, 'running')
})

test('task_report persists reports_json via report()', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const t = tasks.create({
      title: '实现 task_report',
      creator: { kind: 'user', name: '用户' },
    })

    const afterDoing = tasks.report(t.id, {
      sessionId: 'sess-agent-1',
      sessionName: 'Agent-A',
      turn: 1,
      status: 'doing',
      note: '第一轮：写工具声明',
      ts: 100,
    })
    assert.equal(afterDoing.reports?.length, 1)
    assert.equal(afterDoing.reports?.[0]?.status, 'doing')

    const afterDone = tasks.report(t.id, {
      sessionId: 'sess-agent-1',
      sessionName: 'Agent-A',
      turn: 2,
      status: 'done',
      note: '第二轮：完成并验证',
      ts: 200,
    })
    assert.equal(afterDone.reports?.length, 2)
    assert.equal(afterDone.reports?.[1]?.status, 'done')

    // 持久化后可重新读取（独立 Context，模拟宿主重启）
    const reopened = new TasksService(new Context(), path).open().get(t.id)
    assert.equal(reopened?.reports?.length, 2)
    assert.equal(reopened?.reports?.[1]?.status, 'done')
    assert.equal(reopened?.reports?.[1]?.note, '第二轮：完成并验证')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('blocked derives from unfinished dependency', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({ title: '前置A', creator: { kind: 'user', name: '用户' } })
    const b = tasks.create({ title: '后置B', creator: { kind: 'user', name: '用户' }, dependsOn: [a.id] })
    const byId = (id: string) => tasks.get(id)

    // B 依赖 A；A 是 todo（未完成）→ B blocked
    assert.equal(computeBlocked(b, byId), true)
    // 完成 A 后（通过新查询读到 done），B 解除阻塞
    tasks.update(a.id, { status: 'done' })
    const bAfter = tasks.get(b.id)!
    assert.equal(computeBlocked(bAfter, byId), false)
    // A 的依赖清空后 B 也不阻塞（无依赖）
    assert.equal(computeBlocked({ ...b, dependsOn: [] }, byId), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('blocked only applies to todo, never doing/done', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({ title: '前置', creator: { kind: 'user', name: '用户' } })
    const b = tasks.create({ title: '后置', creator: { kind: 'user', name: '用户' }, dependsOn: [a.id] })
    const byId = (id: string) => tasks.get(id)
    // 即使依赖都未完成，doing/done 也不阻塞
    assert.equal(computeBlocked({ ...b, status: 'doing' }, byId), false)
    assert.equal(computeBlocked({ ...b, status: 'done' }, byId), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('dependency cycle is rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({ title: 'A', creator: { kind: 'user', name: '用户' } })
    const b = tasks.create({ title: 'B', creator: { kind: 'user', name: '用户' }, dependsOn: [a.id] })
    // 给 A 加依赖 B 会成环 A->B->A → 应抛错
    assert.throws(() => tasks.update(a.id, { dependsOn: [b.id] }), /cycle/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('tree depth limited to MAX_DEPTH', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const n0 = tasks.create({ title: 'L0', creator: { kind: 'user', name: '用户' } })
    const n1 = tasks.create({ title: 'L1', creator: { kind: 'user', name: '用户' }, parentId: n0.id })
    const n2 = tasks.create({ title: 'L2', creator: { kind: 'user', name: '用户' }, parentId: n1.id })
    const n3 = tasks.create({ title: 'L3', creator: { kind: 'user', name: '用户' }, parentId: n2.id })
    assert.equal(n0.depth, 0)
    assert.equal(n1.depth, 1)
    assert.equal(n2.depth, 2)
    assert.equal(n3.depth, 3)
    // 超出 MAX_DEPTH=3：L4 挂到 L3 下应抛错
    assert.throws(() => tasks.create({ title: 'L4', creator: { kind: 'user', name: '用户' }, parentId: n3.id }), /MAX_DEPTH/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('blockedBy lists the blocking chain (recursive)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({ title: 'A', creator: { kind: 'user', name: '用户' } })
    const b = tasks.create({ title: 'B', creator: { kind: 'user', name: '用户' }, dependsOn: [a.id] })
    const c = tasks.create({ title: 'C', creator: { kind: 'user', name: '用户' }, dependsOn: [b.id] })
    const byId = (id: string) => tasks.get(id)

    // C 依赖 B，B 依赖 A；A 未完成 → C 的阻塞链包含 B 和 A
    const cBlocker = tasks.get(c.id)!
    assert.deepEqual(computeBlockedBy(cBlocker, byId), [b.id, a.id])
    // B 被阻塞：只有 A
    const bBlocker = tasks.get(b.id)!
    assert.deepEqual(computeBlockedBy(bBlocker, byId), [a.id])
    // 完成 A 后，B 不再阻塞，C 只被 B 阻塞
    tasks.update(a.id, { status: 'done' })
    const c2 = tasks.get(c.id)!
    assert.deepEqual(computeBlockedBy(c2, byId), [b.id])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('buildDeliverText renders a派工 message with task key fields', () => {
  const text = buildDeliverText({
    id: 'task_x',
    title: '写需求文档',
    status: 'todo',
    priority: 'high',
    difficulty: 'med',
    dueAt: 1700000000000,
    description: '要把需求写清楚',
    notes: '明天跟进',
    project: 'cordis-web',
    tags: ['后端', '文档'],
    parentId: null,
    dependsOn: [],
    depth: 1,
    sort: 1,
    createdAt: 1,
    updatedAt: 1,
    creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
    assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
    assignedAt: 1,
    reportIntervalSec: 60,
    lastReportPromptAt: null,
  })
  assert.match(text, /写需求文档/)
  assert.match(text, /状态：todo/)
  assert.match(text, /优先级：high/)
  assert.match(text, /难度：med/)
  assert.match(text, /项目：cordis-web/)
  assert.match(text, /要把需求写清楚/)
  assert.match(text, /明天跟进/)
  assert.match(text, /task_x/)
  assert.match(text, /协作规范/)
  assert.match(text, /db_create/)
  assert.match(text, /action=deliver/)
  assert.match(text, /action=report/)
})

test('reportBackToCreator sends a progress message to the assigner session via sendMessage (wake-first)', async () => {
  const sent: Array<{ target: string; text: string; wait: boolean }> = []
  const host = {
    sessions: {
      sendMessage: async (target: string, text: string, opts: { wait?: boolean }) => {
        sent.push({ target, text, wait: opts?.wait ?? true })
        return { text: '', steps: [] }
      },
    },
  }
  const row = {
    id: 'task_y',
    title: '后端改造',
    creator: { kind: 'agent' as const, sessionId: 'assigner-session', name: '分配人' },
  }
  const res = await reportBackToCreator(
    host as never,
    row as never,
    { sessionId: 'worker-session', sessionName: 'worker', turn: 3, status: 'done', note: '改造完成', ts: 1 },
  )
  assert.equal(res.ok, true)
  assert.equal(res.sessionId, 'assigner-session')
  assert.equal(sent.length, 1)
  assert.equal(sent[0]!.target, 'assigner-session')
  // 与前端 sendMessage 同语义，wait=false 入队后立即返回、不阻塞上报方回合
  assert.equal(sent[0]!.wait, false)
  assert.match(sent[0]!.text, /后端改造/)
  assert.match(sent[0]!.text, /worker/)
  assert.match(sent[0]!.text, /已完成/)
  assert.match(sent[0]!.text, /改造完成/)
})

test('reportBackToCreator skips when creator has no session or is the reporter itself', async () => {
  let calls = 0
  const host = {
    sessions: {
      sendMessage: async () => {
        calls++
        return { text: '', steps: [] }
      },
    },
  }
  // 纯用户创建：无 session，跳过
  const userCreated = await reportBackToCreator(
    host as never,
    { creator: { kind: 'user' as const, name: '用户' } } as never,
    { sessionId: 'w', status: 'doing', turn: 1, ts: 1 },
  )
  assert.equal(userCreated.ok, false)
  // 分配人即上报人：跳过
  const self = await reportBackToCreator(
    host as never,
    { creator: { kind: 'agent' as const, sessionId: 'me', name: 'Me' } } as never,
    { sessionId: 'me', status: 'doing', turn: 1, ts: 1 },
  )
  assert.equal(self.ok, false)
  assert.equal(calls, 0)
})

test('computeTurnUsage aggregates assistant/message usage for a turn', () => {
  const events = [
    { type: 'turn/start', turn: 1, ts: 1 },
    { type: 'assistant/message', turn: 1, usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, totalTokens: 16 } },
    { type: 'step/start', turn: 1, ts: 2 },
    { type: 'assistant/message', turn: 1, usage: { inputTokens: 3, outputTokens: 1 } },
    { type: 'turn/end', turn: 1, ts: 3 },
  ]
  const u = computeTurnUsage(events as unknown as Array<Record<string, unknown>>, 1)
  assert.deepEqual(u, { inputTokens: 13, outputTokens: 5, cacheReadTokens: 2, totalTokens: 20 })
  // non-matching turn / missing usage -> undefined
  assert.equal(computeTurnUsage(events as unknown as Array<Record<string, unknown>>, 2), undefined)
  assert.equal(computeTurnUsage([], 1), undefined)
})

test('sumReportUsage sums per-report usage with same (session,turn) dedupe', () => {
  const reports = [
    { sessionId: 's1', turn: 1, usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 1, totalTokens: 13 } },
    // 同名 (s1, turn=1)：取后一次（覆盖，避免重复计费）
    { sessionId: 's1', turn: 1, usage: { inputTokens: 20, outputTokens: 4, cacheReadTokens: 2, totalTokens: 26 } },
    { sessionId: 's2', turn: 2, usage: { inputTokens: 5, outputTokens: 1, cacheReadTokens: 0, totalTokens: 6 } },
    // 无 usage（旧数据）跳过
    { sessionId: 's3', turn: 3 },
  ] as never
  assert.deepEqual(sumReportUsage(reports), {
    inputTokens: 25,
    outputTokens: 5,
    cacheReadTokens: 2,
    totalTokens: 32,
  })
  assert.equal(sumReportUsage(undefined), undefined)
})

// ==================== Trigger：cron 解析 / 下次触发 / 持久化 / 状态机 ====================

test('parseCron matches minute-level patterns', () => {
  // 每天 10:30
  const daily = parseCron('30 10 * * *')!
  assert.ok(daily(new Date(2026, 0, 15, 10, 30)))
  assert.ok(!daily(new Date(2026, 0, 15, 10, 31)))
  assert.ok(!daily(new Date(2026, 0, 15, 11, 30)))

  // 每 5 分钟（*/5）
  const every5 = parseCron('*/5 * * * *')!
  assert.ok(every5(new Date(2026, 0, 15, 9, 20)))
  assert.ok(!every5(new Date(2026, 0, 15, 9, 22)))

  // 每周一 09:00（周字段 1）
  const monday = parseCron('0 9 * * 1')!
  // 2026-01-05 是周一
  assert.ok(monday(new Date(2026, 0, 5, 9, 0)))
  assert.ok(!monday(new Date(2026, 0, 5, 9, 1)))
  assert.ok(!monday(new Date(2026, 0, 6, 9, 0))) // 周二

  // 区间 + 列表
  const list = parseCron('0,15,30 * * * *')!
  assert.ok(list(new Date(2026, 0, 15, 1, 30)))
  assert.ok(!list(new Date(2026, 0, 15, 1, 45)))

  // 非法表达式 → null
  assert.equal(parseCron('bad'), null)
  assert.equal(parseCron('* * * * * * * *'), null) // 字段太多也算 null（<5 或异常）
})

test('reportIntervalSec persists with default 60 and is updatable to 5', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({
      title: 'A',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
    })
    // 默认 60
    assert.equal(a.reportIntervalSec, 60)
    assert.equal(a.lastReportPromptAt, null)
    assert.equal(a.reportPromptCount, 0)
    // 可回读（DB 持久）
    assert.equal(tasks.get(a.id)!.reportIntervalSec, 60)
    // 改 5 秒
    const b = tasks.update(a.id, { reportIntervalSec: 5 })
    assert.equal(b.reportIntervalSec, 5)
    assert.equal(tasks.get(a.id)!.reportIntervalSec, 5)
    // 建任务时显式 5 秒
    const c = tasks.create({
      title: 'C',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
      reportIntervalSec: 5,
    })
    assert.equal(c.reportIntervalSec, 5)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('shouldPromptProgress: default 60s, no report uses assignedAt baseline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({
      title: 'A',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
    })
    const base = a.assignedAt!
    // 未超过 60s（59s）：不追问
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, base + 59_000).shouldPrompt, false)
    // 超过 60s（61s）：追问
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, base + 61_000).shouldPrompt, true)
    // 无 assignee 不追
    const unassigned = tasks.create({ title: 'U', creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' } })
    assert.equal(shouldPromptProgress(tasks.get(unassigned.id)!, base + 200_000).shouldPrompt, false)
    // creator 非 agent（纯用户）不追
    const userCreated = tasks.create({
      title: 'UC',
      creator: { kind: 'user', name: '用户' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
    })
    assert.equal(shouldPromptProgress(tasks.get(userCreated.id)!, base + 200_000).shouldPrompt, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('shouldPromptProgress: cooldown after prompt and reset on new report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({
      title: 'A',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
      reportIntervalSec: 5,
    })
    const base = a.assignedAt!
    // 5s 间隔：第 6s 追问
    const t1 = base + 6_000
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, t1).shouldPrompt, true)
    // 记录一次追问（进入冷却）
    tasks.update(a.id, { lastReportPromptAt: t1 })
    // 冷却窗口（5s）内：+4s 不追
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, t1 + 4_000).shouldPrompt, false)
    // 过冷却窗口：+6s 又追
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, t1 + 6_000).shouldPrompt, true)
    // 新 report 到来（task_report → report()）→ 刷新 lastReportTs 且重置 lastReportPromptAt
    tasks.report(a.id, { sessionId: 'worker', turn: 1, status: 'doing', ts: t1 + 6_500 })
    const refreshed = tasks.get(a.id)!
    assert.equal(refreshed.lastReportPromptAt, null)
    // 距新 report 3s（<5s）：不追问
    assert.equal(shouldPromptProgress(refreshed, t1 + 9_500).shouldPrompt, false)
    // 距新 report 6s：又追问
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, t1 + 12_500).shouldPrompt, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('shouldPromptProgress: done or failed task stops prompting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({
      title: 'A',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
      reportIntervalSec: 5,
    })
    const base = a.assignedAt!
    tasks.update(a.id, { status: 'done' })
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, base + 200_000).shouldPrompt, false)
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, base + 200_000).shouldFail, false)
    const b = tasks.create({
      title: 'B',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
      reportIntervalSec: 5,
    })
    tasks.update(b.id, { status: 'failed' })
    assert.equal(tasks.get(b.id)!.status, 'failed')
    assert.equal(shouldPromptProgress(tasks.get(b.id)!, b.assignedAt! + 200_000).shouldPrompt, false)
    assert.equal(shouldPromptProgress(tasks.get(b.id)!, b.assignedAt! + 200_000).shouldFail, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('shouldPromptProgress: after max nags without a report, mark fail instead of asking again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const a = tasks.create({
      title: 'A',
      creator: { kind: 'agent', sessionId: 'boss', name: 'Boss' },
      assignee: { kind: 'agent', sessionId: 'worker', name: 'Worker' },
      reportIntervalSec: 5,
    })
    const t1 = a.assignedAt! + 6_000
    tasks.update(a.id, { lastReportPromptAt: t1, reportPromptCount: MAX_REPORT_PROMPTS })
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, t1 + 4_000).shouldPrompt, false)
    assert.equal(shouldPromptProgress(tasks.get(a.id)!, t1 + 4_000).shouldFail, false)
    const late = shouldPromptProgress(tasks.get(a.id)!, t1 + 6_000)
    assert.equal(late.shouldPrompt, false)
    assert.equal(late.shouldFail, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('parseCron supports 6-field second-level cron', () => {
  // 每 5 秒：*/5 * * * * *（秒字段步进）
  const every5s = parseCron('*/5 * * * * *')!
  assert.equal(every5s.hasSeconds, true)
  assert.ok(every5s(new Date(2026, 0, 15, 10, 30, 0)))
  assert.ok(every5s(new Date(2026, 0, 15, 10, 30, 5)))
  assert.ok(every5s(new Date(2026, 0, 15, 10, 30, 55)))
  assert.ok(!every5s(new Date(2026, 0, 15, 10, 30, 1)))
  assert.ok(!every5s(new Date(2026, 0, 15, 10, 30, 7)))

  // 精确单秒：每天都命中 10:30:15 这一秒
  const atSec = parseCron('15 30 10 * * *')!
  assert.equal(atSec.hasSeconds, true)
  assert.ok(atSec(new Date(2026, 0, 15, 10, 30, 15)))
  assert.ok(!atSec(new Date(2026, 0, 15, 10, 30, 14)))
  assert.ok(!atSec(new Date(2026, 0, 15, 10, 31, 15)))

  // 含秒步进 + 列表组合：秒 0,10-20 且分步进 2
  const combo = parseCron('0,10-20 */2 * * * *')!
  assert.equal(combo.hasSeconds, true)
  assert.ok(combo(new Date(2026, 0, 15, 8, 30, 0)))   // 秒0 命中
  assert.ok(combo(new Date(2026, 0, 15, 8, 30, 15)))  // 秒10-20 命中
  assert.ok(!combo(new Date(2026, 0, 15, 8, 30, 30))) // 秒30 不命中
  assert.ok(!combo(new Date(2026, 0, 15, 8, 31, 15))) // 分非步进 命中点不成立（*/2 在偶数分）

  // 轮换对齐：秒 1-6 中 3 命中（每 2 秒起点1 → 1,3,5）
  const oddSec = parseCron('1/2 * * * * *')!
  assert.equal(oddSec.hasSeconds, true)
  assert.ok(oddSec(new Date(2026, 0, 15, 9, 10, 3)))
  assert.ok(!oddSec(new Date(2026, 0, 15, 9, 10, 2)))

  // 6 字段与 5 字段在 parse 层互不影响：5 字段 hasSeconds=false
  assert.equal(parseCron('*/5 * * * *')!.hasSeconds, false)
})
test('computeNextTriggerAt derives next time for second-level and minute-level cron', () => {
  const nowTs = new Date(2026, 0, 15, 10, 0, 0).getTime() // 10:00:00

  // 秒级：每 5 秒（从 10:00:03 起，下一命中在 10:00:05）
  const secFrom = nowTs + 3000
  const secTask = { trigger: { ...defaultTrigger(), enabled: true, cron: '*/5 * * * * *' } }
  const secNext = computeNextTriggerAt(secTask as never, secFrom)!
  assert.equal(secNext, secFrom + 2000)
  assert.equal(new Date(secNext).getSeconds(), 5)

  // 秒级：精确 0 秒 → 未来正好一个整分起点也可能命中；这里测第二精度扫描
  const zeroSec = { trigger: { ...defaultTrigger(), enabled: true, cron: '0 * * * * *' } }
  const zNext = computeNextTriggerAt(zeroSec as never, nowTs + 3000)!
  assert.equal(zNext % 60000, 0) // 每次整分

  // 分钟级（5 字段）仍按整分扫描，不受影响
  const minTask = { trigger: { ...defaultTrigger(), enabled: true, cron: '30 10 * * *' } }
  const minNext = computeNextTriggerAt(minTask as never, nowTs)!
  assert.equal(new Date(minNext).getMinutes(), 30)
  assert.equal(new Date(minNext).getSeconds(), 0)
})
test('computeNextTriggerAt derives next time for cron and at', () => {
  const nowTs = new Date(2026, 0, 15, 10, 0, 0).getTime() // 10:00

  // at：未来时间点
  const atTask = { trigger: { ...defaultTrigger(), enabled: true, at: nowTs + 3600_000 } }
  assert.equal(computeNextTriggerAt(atTask as never, nowTs), nowTs + 3600_000)
  // at 已过 → 不返回（一次性已触发）
  const pastAt = { trigger: { ...defaultTrigger(), enabled: true, at: nowTs - 1000 } }
  assert.equal(computeNextTriggerAt(pastAt as never, nowTs), null)

  // cron：每天 10:30（未来 30 分钟）
  const cronTask = { trigger: { ...defaultTrigger(), enabled: true, cron: '30 10 * * *' } }
  const next = computeNextTriggerAt(cronTask as never, nowTs)!
  assert.ok(next >= nowTs)
  assert.equal(new Date(next).getMinutes(), 30)
  assert.equal(new Date(next).getHours(), 10)

  // 未启用 → null
  const disabled = { trigger: { ...defaultTrigger(), enabled: false, cron: '* * * * *' } }
  assert.equal(computeNextTriggerAt(disabled as never, nowTs), null)
  // 无 trigger → null
  assert.equal(computeNextTriggerAt({} as never, nowTs), null)
})

test('trigger persists through create/update/reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-trigger-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const t = tasks.create({
      title: '定时清理',
      creator: { kind: 'user', name: '用户' },
      trigger: { enabled: true, cron: '0 3 * * *', on: [] },
    })
    assert.equal(t.trigger?.enabled, true)
    assert.equal(t.trigger?.cron, '0 3 * * *')
    assert.equal(t.trigger?.state, 'idle')
    assert.equal(t.trigger?.lastRun, null)

    // partial update：合并既有 trigger，改 state
    tasks.update(t.id, { trigger: { state: 'delivered', lastRun: 123 } })
    const u = tasks.get(t.id)!
    assert.equal(u.trigger?.cron, '0 3 * * *') // 未被覆盖
    assert.equal(u.trigger?.enabled, true)
    assert.equal(u.trigger?.state, 'delivered')
    assert.equal(u.trigger?.lastRun, 123)

    // 持久化后重开仍保留
    const reopened = new TasksService(new Context(), path).open().get(t.id)!
    assert.equal(reopened.trigger?.state, 'delivered')
    assert.equal(reopened.trigger?.cron, '0 3 * * *')
    assert.equal(reopened.trigger?.enabled, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('normalizeTrigger sanities inputs and disables auto-trigger when absent', () => {
  const d = defaultTrigger()
  assert.deepEqual(normalizeTrigger(undefined), d)
  assert.deepEqual(normalizeTrigger(null), d)

  const valid = normalizeTrigger({ enabled: true, cron: '*/10 * * * *', on: ['dep:done', 'turn:end', 'bogus'] })
  assert.equal(valid.enabled, true)
  assert.equal(valid.cron, '*/10 * * * *')
  assert.deepEqual(valid.on, ['dep:done', 'turn:end']) // 未知事件被过滤
  assert.deepEqual(normalizeTrigger({ state: 'running' } as never), { ...d, state: 'idle' }) // 非法状态回退
})

test('trigger default state is idle and enabled=false (no auto-trigger for plain tasks)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tasks-trigger-'))
  const path = join(dir, 'tasks.sqlite')
  try {
    const ctx = new Context()
    const tasks = new TasksService(ctx, path).open()
    const plain = tasks.create({ title: '普通任务', creator: { kind: 'user', name: '用户' } })
    // source=null（未给 trigger）→ 自动触发不开启
    assert.equal(plain.trigger?.enabled, false)
    assert.equal(plain.trigger?.state, 'idle')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
