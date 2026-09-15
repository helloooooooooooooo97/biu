import { test } from 'vitest'
import assert from 'node:assert/strict'
import { diffStats, formatToolDetail, lineDiff, parseToolCall, prettyJsonString, compactJsonSummary, toolSummary, toolOutputChars } from './tool-format.ts'

test('lineDiff marks removals and additions', () => {
  const lines = lineDiff('a\nb\nc', 'a\nx\nc')
  assert.deepEqual(
    lines.map((line) => [line.type, line.text]),
    [
      ['equal', 'a'],
      ['remove', 'b'],
      ['add', 'x'],
      ['equal', 'c'],
    ],
  )
  assert.deepEqual(diffStats(lines), { added: 1, removed: 1 })
})

test('parseToolCall understands str_replace_editor str_replace', () => {
  const parsed = parseToolCall(
    'str_replace_editor',
    JSON.stringify({
      command: 'str_replace',
      path: 'src/a.ts',
      old_str: 'foo',
      new_str: 'bar',
    }),
  )
  assert.equal(parsed.kind, 'str_replace')
  if (parsed.kind !== 'str_replace') return
  assert.equal(parsed.path, 'src/a.ts')
  assert.equal(parsed.oldStr, 'foo')
  assert.equal(parsed.newStr, 'bar')
  assert.equal(toolSummary(parsed, ''), 'Edited src/a.ts')
})

test('parseToolCall understands bash command', () => {
  const parsed = parseToolCall('bash', JSON.stringify({ command: 'ls -la' }))
  assert.equal(parsed.kind, 'bash')
  if (parsed.kind !== 'bash') return
  assert.equal(parsed.command, 'ls -la')
})

test('parseToolCall create/insert', () => {
  const created = parseToolCall(
    'str_replace_editor',
    JSON.stringify({ command: 'create', path: 'n.ts', file_text: 'hi' }),
  )
  assert.equal(created.kind, 'create')
  const inserted = parseToolCall(
    'str_replace_editor',
    JSON.stringify({ command: 'insert', path: 'n.ts', insert_line: 2, new_str: 'x' }),
  )
  assert.equal(inserted.kind, 'insert')
})

test('formatToolDetail unwraps bash stdout/stderr json', () => {
  const formatted = formatToolDetail(
    JSON.stringify({ code: 0, stdout: 'hello\nworld\n', stderr: '' }),
    'bash',
  )
  assert.equal(formatted?.kind, 'bash')
  if (formatted?.kind !== 'bash') return
  assert.equal(formatted.code, 0)
  assert.equal(formatted.stdout, 'hello\nworld\n')
  assert.equal(formatted.stderr, '')
})

test('toolOutputChars counts bash stdout and stderr', () => {
  assert.equal(toolOutputChars(undefined, 'bash'), 0)
  assert.equal(toolOutputChars(JSON.stringify({ code: 0, stdout: 'hello', stderr: 'err' }), 'bash'), 8)
})

test('formatToolDetail keeps bash artifacts for chat rendering', () => {
  const formatted = formatToolDetail(
    JSON.stringify({
      code: 0,
      stdout: 'shot.png\n',
      stderr: '',
      artifacts: [{ name: 'shot.png', url: '/api/sessions/s1/artifacts/shot.png', mime: 'image/png' }],
    }),
    'bash',
  )
  assert.equal(formatted?.kind, 'bash')
  if (formatted?.kind !== 'bash') return
  assert.equal(formatted.artifacts?.length, 1)
  assert.equal(formatted.artifacts?.[0]?.url, '/api/sessions/s1/artifacts/shot.png')
})

test('formatToolDetail pretty-prints generic json objects', () => {
  const formatted = formatToolDetail('{"a":1,"b":[2,3]}')
  assert.equal(formatted?.kind, 'json')
  if (formatted?.kind !== 'json') return
  assert.match(formatted.text, /\n/)
  assert.match(formatted.text, /"a": 1/)
})

test('prettyJsonString indents objects', () => {
  assert.match(prettyJsonString('{"x":1}'), /"x": 1/)
})

test('compactJsonSummary prefers titles over raw json', () => {
  const tasks = JSON.stringify([
    { id: 'task_1', title: '创建五子棋插件：极光五子棋（store-gomoku-aurora）', status: 'open' },
    { id: 'task_2', title: '第二项', status: 'open' },
  ])
  assert.equal(compactJsonSummary(tasks), '2 条 · 创建五子棋插件：极光五子棋（store-gomoku-aurora）')
  assert.equal(compactJsonSummary('{"views":[{"id":"v1","name":"表格"}]}'), '表格')
  const parsed = parseToolCall('tasks_list', tasks)
  assert.equal(parsed.kind, 'raw')
  assert.equal(toolSummary(parsed, tasks), '2 条 · 创建五子棋插件：极光五子棋（store-gomoku-aurora）')
  assert.doesNotMatch(toolSummary(parsed, tasks), /\[\{/)
})
