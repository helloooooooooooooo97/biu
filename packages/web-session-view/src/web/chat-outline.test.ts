import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveChatOutline, type ChatNode } from './index.ts'

function user(id: string, text: string, sender?: Extract<ChatNode, { kind: 'user' }>['sender']): ChatNode {
  return { id, kind: 'user', text, ...(sender ? { sender } : {}) }
}

test('deriveChatOutline can hide robot-initiated user nodes', () => {
  const nodes: ChatNode[] = [
    user('u-1', 'hello from me'),
    { id: 'r-1', kind: 'reply', parts: [], copyText: 'ok' },
    user('u-2', 'wake from live', { type: 'session', sessionId: 's-live' }),
    user('u-3', 'another human'),
  ]
  assert.deepEqual(
    deriveChatOutline(nodes, 'user').map((item) => item.id),
    ['u-1', 'u-3'],
  )
  assert.deepEqual(
    deriveChatOutline(nodes, 'all').map((item) => [item.id, item.robot, item.level]),
    [
      ['u-1', false, 2],
      ['u-2', true, 2],
      ['u-3', false, 2],
    ],
  )
})

test('message outline is a left rail of ticks with a hover menu', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  const outline = readFileSync(resolve(import.meta.dirname, '../../../public-ui/src/outline-nav.tsx'), 'utf8')
  const bound = readFileSync(resolve(import.meta.dirname, '../../../core-chat/src/web/message-outline.tsx'), 'utf8')
  const shell = readFileSync(resolve(import.meta.dirname, '../../../web-app-shell/src/web/index.tsx'), 'utf8')
  assert.match(css, /\.chat-outline\s*\{[^}]*left:\s*8px/s)
  assert.match(css, /\.chat-outline\s*\{[^}]*opacity:\s*0/s)
  assert.match(css, /\.chat-outline:hover,\s*\n\.chat-outline:focus-within\s*\{[^}]*opacity:\s*1/s)
  assert.match(css, /\.chat-outline::before\s*\{[^}]*width:\s*96px/s)
  assert.match(css, /\.chat-outline-rail\s*\{[^}]*align-items:\s*flex-start/s)
  assert.match(css, /\.chat-outline-rail\s*\{[^}]*gap:\s*8px/s)
  assert.match(css, /\.chat-outline-tick::after/)
  assert.match(css, /\.chat-outline-panel\s*\{[^}]*left:\s*36px/s)
  assert.match(css, /\.chat-outline-panel\s*\{[^}]*top:\s*50%/s)
  assert.match(css, /\.chat-outline-panel\s*\{[^}]*border-radius:\s*8px/s)
  assert.match(css, /\.chat-outline-panel\s*\{[^}]*backdrop-filter:\s*blur\(16px\)\s*saturate\(1\.2\)/s)
  assert.match(css, /\.chat-outline-panel\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\)/s)
  assert.match(css, /\.chat-outline-tick::after\s*\{[^}]*width:\s*10px/s)
  assert.match(css, /\.chat-outline-tick::after\s*\{[^}]*height:\s*2px/s)
  assert.match(css, /\.chat-outline-tick::after\s*\{[^}]*opacity:\s*0\.3/s)
  assert.match(css, /\.chat-outline-tick\.is-h1::after\s*\{[^}]*width:\s*10px/s)
  assert.match(css, /\.chat-outline-tick\.is-h2::after\s*\{[^}]*width:\s*7px/s)
  assert.match(css, /\.chat-outline-tick\.is-h3::after\s*\{[^}]*width:\s*4px/s)
  assert.doesNotMatch(css, /\.chat-outline-tick\.is-h[23]\s*\{[^}]*padding-left/)
  assert.match(css, /\.chat-outline-item\.is-h2\s*\{[^}]*padding-left:\s*22px/s)
  assert.match(css, /\.chat-outline-item\.is-h3\s*\{[^}]*padding-left:\s*36px/s)
  // 悬浮/选中要有一层底和更亮的前景 token，具体色值随主题走，不锁死。
  assert.match(css, /\.chat-outline-item:hover,\s*\.chat-outline-item\.is-active\s*\{[^}]*background:\s*[^;}]+;/s)
  assert.match(
    css,
    /\.chat-outline-item:hover,\s*\.chat-outline-item\.is-active\s*\{[^}]*color:\s*var\(--dsw-sidebar-fg-active\)/s,
  )
  assert.match(outline, /chat-outline-tick/)
  assert.match(outline, /hoverTick/)
  assert.match(bound, /OutlineNav/)
  assert.match(bound, /requestChatOutlineGo/)
  assert.doesNotMatch(outline, /chat-outline-toggle/)
  assert.doesNotMatch(outline, /chat-outline-title/)
  assert.doesNotMatch(shell, /header-outline-toggle/)
})
