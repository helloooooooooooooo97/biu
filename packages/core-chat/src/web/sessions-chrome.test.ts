import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sessionsChrome } from './sessions-chrome.tsx'

const chrome = sessionsChrome()

test('session table uses mascot as the standalone icon property, title is just the label', () => {
  assert.equal(typeof chrome.Title, 'function')
  assert.equal(typeof chrome.Icon, 'function')
  const src = readFileSync(resolve(import.meta.dirname, './sessions-chrome.tsx'), 'utf8')
  assert.match(src, /function SessionIcon/)
  assert.match(src, /size=\{20\}/)
  assert.match(src, /SidebarMascot/)
  assert.match(src, /resolveSessionMascot/)
  assert.match(src, /sessions-title-label/)
  assert.doesNotMatch(src, /className="sessions-title"/)
  assert.equal(typeof chrome.cells?.mascotShape, 'function')
  assert.equal(typeof chrome.Content, 'function')
  assert.match(src, /ChatPane/)
  assert.match(src, /ChatStage/)
  assert.match(src, /embed/)
  assert.doesNotMatch(src, /session-outline-host/)
  assert.doesNotMatch(src, /createPortal/)
  assert.doesNotMatch(src, /OutlineNav/)
  assert.doesNotMatch(src, /50cqh/)
  assert.doesNotMatch(src, /container-type/)
  assert.match(src, /\/api\/sessions\/\$\{sessionId\}/)
  assert.match(src, /background:var\(--dsw-bg\)/)
  assert.doesNotMatch(src, /background:#191919/)
  assert.match(src, /\.fsdb-detail-main:has\(\.chat-pane-embed\) \.chat-stage\{[^}]*overflow:visible/)
  assert.match(src, /\.fsdb-detail-main:has\(\.chat-pane-embed\) \.chat-stage\{[^}]*overscroll-behavior:auto/)
  assert.match(src, /\.fsdb-detail-main:has\(\.chat-pane-embed\) \.chat-stage>\*\{[^}]*max-width:100%/)
  assert.match(src, /\.fsdb-fileview:has\(\.chat-pane-embed\)\{[^}]*flex:none/)
  assert.doesNotMatch(src, /sessionView\.load/)
  assert.doesNotMatch(src, /SlotOutlet/)
  assert.doesNotMatch(src, /ChatDockStack/)
  assert.doesNotMatch(src, /name="composer"/)
  assert.doesNotMatch(src, /ApprovalsRail/)
  assert.doesNotMatch(src, /session-record-log/)
  const index = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(index, /decorate\('\/sessions', sessionsChrome/)
})
