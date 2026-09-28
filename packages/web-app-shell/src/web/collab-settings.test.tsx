import { act, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { ShellSettingsCollab } from './shell-chrome.tsx'

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

test('collab settings uses the account row chrome and can create a workspace', async () => {
  localStorage.clear()
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.settings-account-action\s*\{[^}]*font:\s*inherit/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*border:\s*1px solid var\(--dsw-border\)/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*height:\s*32px/)
  const calls: string[] = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/register')) return json({ id: 'acc_1', name: 'Ada', token: 'tok' }, 201)
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'Ada' })
    if (url.endsWith('/workspaces') && (init?.method ?? 'GET') === 'GET') return json({ workspaces: [] })
    if (url.endsWith('/workspaces') && init?.method === 'POST') {
      return json({ id: 'ws_1', name: 'Notes', role: 'owner' }, 201)
    }
    if (url.includes('/members')) return json({ members: [{ id: 'acc_1', name: 'Ada', role: 'owner' }] })
    if (url.endsWith('/presence')) return json({ presence: [{ accountId: 'acc_1', name: 'Ada', collection: '', recordId: '' }] })
    return json({})
  }) as typeof fetch

  render(<ShellSettingsCollab />)
  assert.equal(document.querySelector('.settings-account-title')?.textContent, '协同')
  fireEvent.change(screen.getByTestId('settings-collab-name'), { target: { value: 'Ada' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('settings-collab-register'))
  })
  assert.equal(screen.getByTestId('settings-collab-id').textContent, 'acc_1')
  fireEvent.change(screen.getByTestId('settings-collab-workspace'), { target: { value: 'Notes' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('settings-collab-create'))
  })
  assert.equal((screen.getByTestId('settings-collab-workspaces') as HTMLSelectElement).value, 'ws_1')
  assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /所有者/)
  assert.match(screen.getByTestId('settings-collab-presence').textContent ?? '', /Ada/)
  assert.ok(calls.some((line) => line.startsWith('POST /api/account/register')))
})
