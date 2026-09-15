import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { CHAT_DOCK_STACK, CHAT_STAGE_CENTER, CHAT_STAGE_PANE } from './chat-pane.tsx'

test('ChatPane is the overlay interior: thread, optional composer dock', () => {
  const src = readFileSync(resolve(import.meta.dirname, './chat-pane.tsx'), 'utf8')
  assert.match(src, /export function ChatPane/)
  assert.match(src, /chat-overlay-thread/)
  assert.match(src, /dock \? <div className="chat-composer-dock">/)
  assert.match(src, /chat-pane-embed/)
  assert.match(src, /aside/)
  assert.match(src, /export function ChatStage/)
  assert.match(src, /export function ChatDockStack/)
  assert.match(CHAT_STAGE_CENTER, /px-\[64px\]/)
  assert.match(CHAT_STAGE_CENTER, /pb-72/)
  assert.doesNotMatch(CHAT_STAGE_CENTER, /px-6|md:px-8|lg:px-10/)
  assert.match(CHAT_STAGE_PANE, /px-1 py-1/)
  assert.match(CHAT_DOCK_STACK, /space-y-2/)
})
