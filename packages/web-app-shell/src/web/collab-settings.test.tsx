import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { AuthGate, ShellSettingsCollab } from './shell-chrome.tsx'

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

test('the app stays on the login gate until a token exists', async () => {
  localStorage.clear()
  const calls: string[] = []
  globalThis.fetch = (async (path: string) => {
    calls.push(String(path))
    return json(String(path).endsWith('/me') ? { id: 'acc_1' } : { token: 'tok' })
  }) as typeof fetch
  render(
    <AuthGate>
      <div data-testid="inside">in</div>
    </AuthGate>,
  )
  assert.equal(screen.queryByTestId('inside'), null)
  assert.equal(screen.getByTestId('auth-gate').textContent?.includes('登录'), true)
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret1' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('auth-submit'))
  })
  await waitFor(() => assert.equal(screen.getByTestId('inside').textContent, 'in'))
  assert.equal(calls.includes('/api/account/me'), true)
  cleanup()
})

test('primary navigation does not call the removed chat overlay setter', () => {
  const source = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  assert.doesNotMatch(source, /setChatOverlay/)
})

test('collab settings uses the account row chrome and can create a workspace', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.settings-account-action\s*\{[^}]*font:\s*inherit/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*border:\s*1px solid var\(--dsw-border\)/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*height:\s*32px/)
  const calls: string[] = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/login')) return json({ id: 'acc_1', name: 'Ada', token: 'tok' })
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'Ada' })
    if (url.endsWith('/workspaces') && (init?.method ?? 'GET') === 'GET') return json({ workspaces: [] })
    if (url.endsWith('/active')) return json({ workspaceId: init?.method === 'POST' ? 'ws_1' : '' })
    if (url.endsWith('/workspaces') && init?.method === 'POST') {
      return json({ id: 'ws_1', name: 'Notes', role: 'owner' }, 201)
    }
    if (url.includes('/members')) return json({ members: [{ id: 'acc_1', name: 'Ada', role: 'owner' }] })
    if (url.endsWith('/presence')) return json({ presence: [{ accountId: 'acc_1', name: 'Ada', collection: '', recordId: '' }] })
    return json({})
  }) as typeof fetch

  render(<ShellSettingsCollab />)
  assert.equal(screen.getByTestId('settings-collab').querySelector('.settings-account-title')?.textContent, '协同')
  await act(async () => {
    await Promise.resolve()
  })
  assert.equal(screen.getByTestId('settings-collab-id').textContent, 'acc_1')
  fireEvent.change(screen.getByTestId('settings-collab-workspace'), { target: { value: 'Notes' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('settings-collab-create'))
  })
  assert.equal((screen.getByTestId('settings-collab-workspaces') as HTMLSelectElement).value, 'ws_1')
  assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /所有者/)
  assert.match(screen.getByTestId('settings-collab-presence').textContent ?? '', /Ada/)
  assert.equal(calls.some((line) => line.includes('/login')), false)
})
