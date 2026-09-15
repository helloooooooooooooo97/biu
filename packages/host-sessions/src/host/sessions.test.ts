import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from './index.ts'
import { SESSION_FORMAT_VERSION, deriveMessages, applyContextBudget, estimateTokens, statInputComposition } from './index.ts'
import type { SessionEvent } from './index.ts'
import type { LlmMessage } from '@biu/host-llm'

test('append-only log projects model history; version is 1', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  assert.equal(record.version, SESSION_FORMAT_VERSION)
  assert.ok(Number(record.config?.createdAt) > 0)
  await ctx.sessions.append(record.id, { type: 'system/prompt', text: 'sys' })
  await ctx.sessions.append(record.id, { type: 'user/message', text: 'hi', kind: 'wake' })
  await ctx.sessions.append(record.id, { type: 'assistant/message', text: 'yo' })
  assert.deepEqual(deriveMessages((await ctx.sessions.require(record.id)).events), [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'yo' },
  ])
})

test('tool_calls assistant uses null content for API history', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  await ctx.sessions.append(record.id, { type: 'user/message', text: 'run', kind: 'wake' })
  await ctx.sessions.append(record.id, {
    type: 'assistant/message',
    text: '',
    tool_calls: [{ id: '1', name: 'clock_now', arguments: '{}' }],
  })
  await ctx.sessions.append(record.id, { type: 'tool/result', id: '1', name: 'clock_now', ok: true, detail: 'now' })
  assert.deepEqual(deriveMessages((await ctx.sessions.require(record.id)).events), [
    { role: 'user', content: 'run' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: '1', type: 'function', function: { name: 'clock_now', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: '1', content: 'now' },
  ])
})

test('sqlite session store round-trips and listSummaries skips full reload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cordis-sqlite-'))
  const path = join(dir, 'sessions.sqlite')
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create('sql1')
  await ctx.sessions.append('sql1', { type: 'user/message', text: 'sqlite hi', kind: 'wake' })
  await ctx.sessions.append('sql1', { type: 'assistant/message', text: 'ok' })
  await ctx.sessions.append('sql1', { type: 'turn/end', turn: 1, reason: 'complete' })
  const summaries = await ctx.sessions.listSummaries()
  assert.equal(summaries[0]?.id, 'sql1')
  assert.match(summaries[0]?.title ?? '', /^[墨栗赤橙金翠青蓝紫玫灰]/)
  assert.notEqual(summaries[0]?.title, 'sql1')
  assert.equal(summaries[0]?.eventCount, 4)
  assert.ok(Number(summaries[0]?.config?.createdAt) > 0)

  const ctx2 = new Context()
  await ctx2.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx2.plugin(sessions)
  const loaded = await ctx2.sessions.get('sql1')
  assert.equal(loaded?.id, record.id)
  assert.equal(loaded?.events.length, 4)
  assert.equal(loaded?.events.some((item) => item.type === 'assistant/message' && item.text === 'ok'), true)
})

test('reload heals open step/turn left by crash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cordis-heal-'))
  const path = join(dir, 'sessions.sqlite')
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx.plugin(sessions)
  await ctx.sessions.create('heal1')
  await ctx.sessions.append('heal1', { type: 'user/message', text: 'go', kind: 'wake' })
  await ctx.sessions.append('heal1', { type: 'turn/start', turn: 1 })
  await ctx.sessions.append('heal1', { type: 'step/start', turn: 1, step: 0 })
  // simulate crash: no step/end, no turn/end

  const ctx2 = new Context()
  await ctx2.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx2.plugin(sessions)
  const loaded = await ctx2.sessions.get('heal1')
  assert.ok(loaded)
  const types = loaded!.events.map((item) => item.type)
  assert.equal(types.includes('step/end'), true)
  assert.equal(types.at(-1), 'turn/end')
  const end = loaded!.events.at(-1)
  assert.equal(end?.type, 'turn/end')
  if (end?.type === 'turn/end') {
    assert.equal(end.reason, 'host-restart')
    assert.equal(end.turn, 1)
  }
  // second get should not append again
  const again = await ctx2.sessions.get('heal1')
  assert.equal(again?.events.length, loaded!.events.length)

  const ctx3 = new Context()
  await ctx3.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx3.plugin(sessions)
  const persisted = await ctx3.sessions.get('heal1')
  assert.equal(persisted?.events.filter((item) => item.type === 'turn/end').length, 1)
  assert.equal(persisted?.events.filter((item) => item.type === 'step/end').length, 1)
})

test('reload heals orphan tool_calls so next LLM round is valid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cordis-heal-tools-'))
  const path = join(dir, 'sessions.sqlite')
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx.plugin(sessions)
  await ctx.sessions.create('heal-tools')
  await ctx.sessions.append('heal-tools', { type: 'user/message', text: 'wake workers', kind: 'wake' })
  await ctx.sessions.append('heal-tools', { type: 'turn/start', turn: 1 })
  await ctx.sessions.append('heal-tools', { type: 'step/start', turn: 1, step: 0 })
  await ctx.sessions.append('heal-tools', {
    type: 'assistant/message',
    text: '',
    tool_calls: [{ id: 'call_1', name: 'session_wake', arguments: '{"text":"hi"}' }],
  })
  // crash before tool/result

  const ctx2 = new Context()
  await ctx2.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx2.plugin(sessions)
  const loaded = await ctx2.sessions.get('heal-tools')
  assert.ok(loaded)
  const result = loaded!.events.find((item) => item.type === 'tool/result')
  assert.equal(result?.type, 'tool/result')
  if (result?.type === 'tool/result') {
    assert.equal(result.id, 'call_1')
    assert.equal(result.ok, false)
  }
  const history = ctx2.sessions.deriveMessages('heal-tools')
  const assistant = history.find((item) => item.role === 'assistant' && item.tool_calls?.length)
  const tool = history.find((item) => item.role === 'tool' && item.tool_call_id === 'call_1')
  assert.ok(assistant)
  assert.ok(tool)
})

test('fork copies the append-only log into a child session', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const parent = await ctx.sessions.create()
  await ctx.sessions.append(parent.id, { type: 'user/message', text: 'keep', kind: 'wake' })
  await ctx.sessions.patchConfig(parent.id, {
    inspector: { open: true, dbPaths: { 'database:/pages': '/database/pages' } },
  })
  const child = await ctx.sessions.fork(parent.id)
  assert.notEqual(child.id, parent.id)
  assert.equal(ctx.sessions.deriveMessages(child.id).some((item) => item.content === 'keep'), true)
  assert.equal(child.config?.inspector, undefined)
  await ctx.sessions.append(child.id, { type: 'assistant/message', text: 'child-only' })
  assert.equal((await ctx.sessions.require(parent.id)).events.some((item) => item.type === 'assistant/message'), false)
})

test('setProject binds host absolute path and clears it', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  const dir = await mkdtemp(join(tmpdir(), 'cordis-proj-'))
  const project = await ctx.sessions.setProject(record.id, { path: dir })
  assert.equal(project?.name, basename(dir))
  assert.equal(project?.path, await realpath(dir))
  assert.equal((await ctx.sessions.require(record.id)).project?.path, project?.path)
  const child = await ctx.sessions.fork(record.id)
  assert.equal(child.project?.path, project?.path)
  assert.equal(await ctx.sessions.setProject(record.id, null), undefined)
  assert.equal((await ctx.sessions.require(record.id)).project, undefined)
})

test('setProject binds macOS NFD-stored directory given NFC typed path', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()

  // macOS 的 APFS/HFS+ 以 NFD（分解）形式存储含组合字符的文件名；用户输入通常是
  // NFC（预组合）。两者字节不同导致 realpath 对 NFC 去解析返回 ENOENT（目录其实
  // 存在）。此测试用“带组合字符”的名字制造 NFC≠NFD，模拟“NFC 路径绑定 NFD 目录”。
  const nfdName = 'café\u0301'.normalize('NFD') // 带组合重音的分解形式
  const base = await mkdtemp(join(tmpdir(), 'cordis-nfd-'))
  const dir = join(base, nfdName)
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dir)
  // 建立后确认该目录确实能按 NFC 与 NFD 不同解析（保证用例成立）
  const nfcName = nfdName.normalize('NFC')
  if (nfcName === nfdName) {
    // 平台不支持组合差异（非 macOS / 特殊构造），跳过，不影响其余测试
    return
  }
  // 用 NFC 形式的完整路径去绑定（正是 macOS 上“中文等目录无法绑定”的复现路径）
  const nfcPath = join(base, nfcName)
  const project = await ctx.sessions.setProject(record.id, { path: nfcPath })
  assert.ok(project, 'NFC 路径应能绑定到 NFD 存储的目录')
  assert.equal(project.name, nfdName) // 目录真实（磁盘）名字
  const storedPath = (await ctx.sessions.require(record.id)).project?.path
  assert.equal(storedPath, project.path)
  // 存储的 path 必须是真实可解析的目录（realpath 通过）——即后序再绑定/使用不报不存在
  assert.equal(await realpath(storedPath!), await realpath(dir))
})

test('delete removes session from store and cache', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  assert.equal(await ctx.sessions.delete(record.id), true)
  assert.equal(await ctx.sessions.get(record.id), undefined)
  assert.equal((await ctx.sessions.list()).includes(record.id), false)
  assert.equal(await ctx.sessions.delete(record.id), false)
})

test('create/listSummaries/fork round-trip without a session type field', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const chat = await ctx.sessions.create()
  const other = await ctx.sessions.create()
  assert.equal('type' in chat, false)
  assert.equal('type' in other, false)
  const summaries = await ctx.sessions.listSummaries()
  assert.equal(summaries.every((item) => !('type' in item)), true)
  const forked = await ctx.sessions.fork(other.id)
  assert.equal('type' in forked, false)
})

test('sqlite persists session records across reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cordis-type-'))
  const path = join(dir, 'sessions.sqlite')
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx.plugin(sessions)
  await ctx.sessions.create('persist-sql', { title: 'saved' })
  const ctx2 = new Context()
  await ctx2.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx2.plugin(sessions)
  const loaded = await ctx2.sessions.get('persist-sql')
  assert.equal(loaded?.id, 'persist-sql')
  assert.equal('type' in (loaded ?? {}), false)
  assert.equal((await ctx2.sessions.listSummaries())[0]?.id, 'persist-sql')
})

test('sqlite drops leftover sessions.type column', async () => {
  const { createRequire } = await import('node:module')
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const dir = await mkdtemp(join(tmpdir(), 'cordis-drop-type-'))
  const path = join(dir, 'sessions.sqlite')
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      project_json TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'live'
    );
    CREATE TABLE events (
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      event_json TEXT NOT NULL,
      PRIMARY KEY (session_id, seq)
    );
  `)
  db.prepare(
    'INSERT INTO sessions (id, version, title, type, event_count, updated_at) VALUES (?, 1, ?, ?, 0, 1)',
  ).run('legacy', 'old', 'live')
  db.close()

  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'sqlite', path })
  await ctx.plugin(sessions)
  const opened = new DatabaseSync(path)
  const cols = (opened.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map((row) => row.name)
  opened.close()
  assert.equal(cols.includes('type'), false)
  assert.equal('type' in ((await ctx.sessions.get('legacy')) ?? {}), false)
})


test('estimateTokens approximates ascii and cjk', () => {
  // 英文 ~1/4 字符；800 英文 → ~200 token
  const ascii = estimateTokens('a'.repeat(800))
  assert.ok(ascii >= 150 && ascii <= 250, `ascii tokens=${ascii}`)
  // 中文 ~1/1.5 字符；150 中文 → ~100 token
  const cjk = estimateTokens('测'.repeat(150))
  assert.ok(cjk >= 70 && cjk <= 130, `cjk tokens=${cjk}`)
})

test('applyContextBudget: within budget returns unchanged (cache-friendly)', () => {
  const msgs: LlmMessage[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hello'.repeat(100) },
    { role: 'assistant', content: 'hi' },
  ]
  const out = applyContextBudget(msgs, 1_000_000)
  assert.equal(out, msgs) // 引用相同 → 原样返回
})

test('applyContextBudget: over budget keeps head + recent tail', () => {
  const mk = (i: number): LlmMessage => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: ('block-' + i).padEnd(400, 'x') })
  const msgs: LlmMessage[] = [{ role: 'system', content: 'SYS' }, ...Array.from({ length: 20 }, (_, i) => mk(i))]
  const out = applyContextBudget(msgs, 100, 4)
  // 保留 system + 最近 4 条，其余丢弃
  assert.equal(out[0]?.role, 'system')
  assert.ok(out.length <= 5)
  assert.equal(out[out.length - 1], msgs[msgs.length - 1]) // 最新保留
  // 中间的旧消息被丢弃
  assert.ok(out.length < msgs.length)
})

test('deriveMessages projects pasted images as multimodal content', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 0 },
    {
      type: 'user/message',
      text: '看看这张图',
      kind: 'wake',
      seq: 1,
      ts: 1,
      images: [{ name: 'shot.png', mime: 'image/png', url: 'data:image/png;base64,abc' }],
    },
  ]
  const out = deriveMessages(events)
  const user = out.find((item) => item.role === 'user')
  assert.ok(Array.isArray(user?.content))
  const parts = user?.content as Array<{ type: string; text?: string; image_url?: { url: string } }>
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[0]?.text, '看看这张图')
  assert.equal(parts[1]?.type, 'image_url')
  assert.equal(parts[1]?.image_url?.url, 'data:image/png;base64,abc')
})

test('deriveMessages honors db_action compact as new prefix', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 0 },
    { type: 'system/prompt', text: 'SYS', seq: 1, ts: 1 },
    { type: 'user/message', text: '旧的早期消息A', kind: 'wake', seq: 2, ts: 2 },
    { type: 'assistant/message', text: '早期回答B', seq: 3, ts: 3 },
    {
      type: 'tool/call',
      id: 't1',
      name: 'db_action',
      arguments: JSON.stringify({
        path: '/sessions/s1',
        action: 'compact',
        args: { text: '摘要：聊了早期内容' },
      }),
      seq: 4,
      ts: 4,
    },
    { type: 'user/message', text: '压缩后的新问题', kind: 'wake', seq: 5, ts: 5 },
  ]
  const out = deriveMessages(events as any)
  const joined = out.map((m) => (typeof m.content === 'string' ? m.content : '')).join('|')
  assert.ok(joined.includes('压缩后的新问题'))
  assert.ok(joined.includes('摘要：聊了早期内容'))
  assert.ok(!joined.includes('旧的早期消息A'))
  assert.ok(!joined.includes('早期回答B'))
})

test('deriveMessages honors context_compact_submit tool/call as new prefix', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 0 },
    { type: 'system/prompt', text: 'SYS', seq: 1, ts: 1 },
    { type: 'user/message', text: '旧的早期消息A', kind: 'wake', seq: 2, ts: 2 },
    { type: 'assistant/message', text: '早期回答B', seq: 3, ts: 3 },
    { type: 'tool/call', id: 't1', name: 'context_compact_submit', arguments: JSON.stringify({ text: '摘要：聊了早期内容' }), seq: 4, ts: 4 },
    { type: 'user/message', text: '压缩后的新问题', kind: 'wake', seq: 5, ts: 5 },
  ]
  const out = deriveMessages(events as any)
  const joined = out.map((m) => typeof m.content === 'string' ? m.content : '').join('|')
  // 压缩点后的新对话保留；摘要作为前缀；旧历史不重复出现
  assert.ok(joined.includes('压缩后的新问题'))
  assert.ok(joined.includes('摘要：聊了早期内容'))
  assert.ok(!joined.includes('旧早期消息A'))
  assert.ok(!joined.includes('早期回答B'))
})

test('deriveMessages context_clear wipes history with no summary prefix', () => {
  const events: SessionEvent[] = [
    { type: 'session/open', version: 1, seq: 0, ts: 0 },
    { type: 'system/prompt', text: 'SYS', seq: 1, ts: 1 },
    { type: 'user/message', text: '旧的早期消息A', kind: 'wake', seq: 2, ts: 2 },
    { type: 'assistant/message', text: '早期回答B', seq: 3, ts: 3 },
    { type: 'tool/call', id: 't1', name: 'context_clear', arguments: '{}', seq: 4, ts: 4 },
    { type: 'user/message', text: '清空后的新问题', kind: 'wake', seq: 5, ts: 5 },
  ]
  const out = deriveMessages(events as any)
  const joined = out.map((m) => typeof m.content === 'string' ? m.content : '').join('|')
  // 清空后：旧历史与任何摘要前缀都不该出现，只保留清空点之后的新消息
  assert.ok(joined.includes('清空后的新问题'))
  assert.ok(!joined.includes('旧的早期消息A'))
  assert.ok(!joined.includes('早期回答B'))
  assert.ok(!joined.includes('摘要'))
})

function ev(partial: Partial<SessionEvent> & { type: string; seq: number }): SessionEvent {
  return { ...(partial as SessionEvent), ts: partial.seq ?? partial.ts ?? 0 }
}

test('statInputComposition: empty events returns zeros', () => {
  assert.deepEqual(statInputComposition([]), { totalChars: 0, histChars: 0, curChars: 0, histPct: 0 })
})

test('statInputComposition: pure current turn (hist=0, cur=1)', () => {
  const events = [
    ev({ type: 'system/prompt', text: 'sys-prompt', seq: 0 }),
    ev({ type: 'turn/start', turn: 2, seq: 1 }),
    ev({ type: 'user/message', text: 'hello', kind: 'wake', seq: 2 }),
    ev({ type: 'assistant/message', text: 'hi!', seq: 3 }),
    // 无更早 turn，turn2 进行中（未 end）：全部计入本次(cur)
  ]
  const out = statInputComposition(events)
  assert.equal(out.histChars, 0)
  assert.equal(out.curChars, 'sys-prompt'.length + 'hello'.length + 'hi!'.length)
  assert.equal(out.histPct, 0)
  assert.equal(1 - out.histPct, 1) // curPct 由 1-histPct 推出
  assert.equal(out.curChars, out.totalChars)
})

test('statInputComposition: idle single completed turn -> that turn is "this" (not all hist)', () => {
  const events = [
    ev({ type: 'turn/start', turn: 1, seq: 0 }),
    ev({ type: 'user/message', text: 'what-is-this', kind: 'wake', seq: 1 }),
    ev({ type: 'assistant/message', text: 'answer', seq: 2 }),
    ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 3 }),
  ]
  const out = statInputComposition(events)
  // idle 时最近一次已完成 turn 即「本次」，而非全部算历史（否则 histPct 失真≈99%）
  assert.equal(out.curChars, 'what-is-this'.length + 'answer'.length)
  assert.equal(out.histChars, 0)
  assert.equal(out.histPct, 0)
  assert.equal(1 - out.histPct, 1)
})

test('statInputComposition: mixed history + current turn (sum to 1)', () => {
  const events = [
    ev({ type: 'turn/start', turn: 1, seq: 0 }),
    ev({ type: 'user/message', text: 'old-question', kind: 'wake', seq: 1 }),
    ev({ type: 'tool/call', id: 'c1', name: 'clock_now', arguments: '{"a":1}', seq: 2 }),
    ev({ type: 'tool/result', id: 'c1', name: 'clock_now', ok: true, detail: '2024', seq: 3 }),
    ev({ type: 'assistant/message', text: 'old-answer', tool_calls: [{ id: 'c1', name: 'clock_now', arguments: '{"a":1}' }], seq: 4 }),
    ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 5 }),
    // 当前进行中的 turn 2（未 end）
    ev({ type: 'turn/start', turn: 2, seq: 6 }),
    ev({ type: 'system/prompt', text: 'SYS', seq: 7 }),
    ev({ type: 'user/message', text: 'new-question', kind: 'wake', seq: 8 }),
  ]
  const out = statInputComposition(events)
  assert.equal(out.histChars, 'old-question'.length + '{"a":1}'.length + '2024'.length + 'old-answer'.length + '{"a":1}'.length)
  assert.equal(out.curChars, 'SYS'.length + 'new-question'.length)
  assert.equal(out.totalChars, out.histChars + out.curChars)
  assert.ok(out.histPct > 0 && out.histPct < 1) // curPct=1-histPct 亦 >0
})

test('statInputComposition: system prompt counts toward current turn', () => {
  const events = [
    ev({ type: 'turn/start', turn: 1, seq: 0 }),
    ev({ type: 'user/message', text: 'u', kind: 'wake', seq: 1 }),
    ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 2 }),
    ev({ type: 'system/compact', text: 'COMPACTED-META', seq: 3 }),
  ]
  // idle：本次 = 最近已完成 turn(1)，system/compact 计入本次(cur)，不归历史
  const out = statInputComposition(events)
  assert.equal(out.curChars, 'COMPACTED-META'.length + 'u'.length)
  assert.equal(out.histChars, 0)
})

test('statInputComposition: idle with multiple turns -> latest turn is "this", earlier are hist', () => {
  const events = [
    // 更早的历史 turn 1（已完成）
    ev({ type: 'turn/start', turn: 1, seq: 0 }),
    ev({ type: 'user/message', text: 'early-qq', kind: 'wake', seq: 1 }),
    ev({ type: 'assistant/message', text: 'early-aa', seq: 2 }),
    ev({ type: 'turn/end', turn: 1, reason: 'complete', seq: 3 }),
    // 最近一次 turn 2（已完成，idle）
    ev({ type: 'turn/start', turn: 2, seq: 4 }),
    ev({ type: 'user/message', text: 'latest-qq', kind: 'wake', seq: 5 }),
    ev({ type: 'assistant/message', text: 'latest-aa', seq: 6 }),
    ev({ type: 'turn/end', turn: 2, reason: 'complete', seq: 7 }),
    ev({ type: 'system/prompt', text: 'SYS', seq: 8 }),
  ]
  const out = statInputComposition(events)
  // 本次(cur) = turn2 + system；历史 = turn1
  assert.equal(out.histChars, 'early-qq'.length + 'early-aa'.length)
  assert.equal(out.curChars, 'SYS'.length + 'latest-qq'.length + 'latest-aa'.length)
  assert.ok(out.totalChars > out.histChars) // 本次占比 >50%（最近一次交互为主），非 99% 历史
  assert.ok(out.histPct < 0.5) // curPct=1-histPct > 0.5
})

test('append coalesces live partial tool/result for the same id', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  await ctx.sessions.append(record.id, {
    type: 'assistant/message',
    text: '',
    tool_calls: [{ id: 'c1', name: 'web_search', arguments: '{}' }],
  })
  const first = await ctx.sessions.append(record.id, {
    type: 'tool/result',
    id: 'c1',
    name: 'web_search',
    ok: true,
    detail: '{"sources":[]}',
    partial: true,
  })
  const second = await ctx.sessions.append(record.id, {
    type: 'tool/result',
    id: 'c1',
    name: 'web_search',
    ok: true,
    detail: '{"sources":[{"url":"https://example.com"}]}',
    partial: true,
  })
  const final = await ctx.sessions.append(record.id, {
    type: 'tool/result',
    id: 'c1',
    name: 'web_search',
    ok: true,
    detail: '{"sources":[{"url":"https://example.com"}]}',
  })
  const events = (await ctx.sessions.require(record.id)).events
  const results = events.filter((event) => event.type === 'tool/result')
  assert.equal(results.length, 1)
  assert.equal(second.seq, first.seq)
  assert.equal(final.seq, first.seq)
  assert.equal(results[0]?.partial, undefined)
  assert.deepEqual(
    deriveMessages(events).filter((item) => item.role === 'tool'),
    [{ role: 'tool', tool_call_id: 'c1', content: '{"sources":[{"url":"https://example.com"}]}' }],
  )
})

test('append coalesces live tool/call arguments for the same id', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  const record = await ctx.sessions.create()
  const first = await ctx.sessions.append(record.id, {
    type: 'tool/call',
    id: 'c1',
    name: 'db_update',
    arguments: '{',
  })
  const second = await ctx.sessions.append(record.id, {
    type: 'tool/call',
    id: 'c1',
    name: 'db_update',
    arguments: '{"title":"hi"}',
  })
  const events = (await ctx.sessions.require(record.id)).events
  const calls = events.filter((event) => event.type === 'tool/call')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.arguments, '{"title":"hi"}')
  assert.equal(second.seq, first.seq)
})

test('statInputComposition: honors compact point (starts counting after it)', () => {
  const events = [
    ev({ type: 'turn/start', turn: 1, seq: 0 }),
    ev({ type: 'user/message', text: 'early-msg-aaaa', kind: 'wake', seq: 1 }),
    ev({ type: 'tool/call', id: 't1', name: 'context_compact_submit', arguments: JSON.stringify({ text: '摘要' }), seq: 2 }),
    ev({ type: 'turn/start', turn: 2, seq: 3 }),
    ev({ type: 'user/message', text: 'after-compact', kind: 'wake', seq: 4 }),
  ]
  const out = statInputComposition(events)
  // 压缩点前的 early-msg-aaaa 不计入；只从压缩点后开算
  assert.equal(out.histChars + out.curChars, 'after-compact'.length)
  assert.equal(out.curChars, 'after-compact'.length)
})

