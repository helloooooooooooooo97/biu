import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const web = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
const auth = readFileSync(resolve(import.meta.dirname, './member-auth.tsx'), 'utf8')
const chrome = readFileSync(resolve(import.meta.dirname, './member-chrome.tsx'), 'utf8')

test('unsigned visitors see a login or register gate', () => {
  assert.match(web, /AuthGate/)
  assert.match(auth, /\/api\/members\/login/)
  assert.match(auth, /\/api\/members\/register/)
  assert.match(auth, /\/api\/members\/join/)
})

test('members table has invite buttons on the filesystem toolbar', () => {
  assert.match(chrome, /MemberToolbar/)
  assert.match(chrome, /邀请编辑/)
  assert.match(chrome, /邀请只读/)
  assert.match(web, /decorate\('\/members'/)
})

test('share route skips the workspace login wall', () => {
  assert.match(auth, /shareTokenFromPath/)
  assert.match(web, /ShareShell/)
  const share = readFileSync(resolve(import.meta.dirname, './share-shell.tsx'), 'utf8')
  assert.match(share, /只能打开这一页/)
  assert.match(share, /\/api\/shares\//)
})
