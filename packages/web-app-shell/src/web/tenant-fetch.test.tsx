import { render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { ShellWorkspaceSwitcher } from './shell-chrome.tsx'
import {
  clearWorkspaceId,
  installTenantFetch,
  readWorkspaceId,
  writeWorkspaceId,
} from './tenant-fetch.ts'

afterEach(() => {
  clearWorkspaceId()
  localStorage.clear()
})

test('the corner workspace is stored for the next load', () => {
  writeWorkspaceId('ws_1')
  sessionStorage.removeItem('biu.workspaceId')
  assert.equal(readWorkspaceId(), 'ws_1')
  clearWorkspaceId()
  assert.equal(readWorkspaceId(), '')
})

test('api calls wait until the corner writes the workspace', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  clearWorkspaceId()
  const seen: Array<string | null> = []
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.includes('/api/sessions')) seen.push(headers.get('x-biu-workspace-id'))
    if (url.endsWith('/api/account/active')) {
      return { ok: true, json: async () => ({ workspaceId: 'ws_1' }) } as Response
    }
    if (url.endsWith('/api/account/workspaces')) {
      return {
        ok: true,
        json: async () => ({ workspaces: [{ id: 'ws_1', name: 'Main', role: 'owner' }] }),
      } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  }) as typeof fetch
  installTenantFetch()
  const pending = window.fetch('/api/sessions')
  await Promise.resolve()
  assert.deepEqual(seen, [])
  render(<ShellWorkspaceSwitcher />)
  await screen.findByTestId('shell-workspace-switcher')
  await pending
  assert.deepEqual(seen, ['ws_1'])
  assert.equal(localStorage.getItem('biu.workspaceId'), 'ws_1')
  assert.match(screen.getByTestId('shell-workspace-switcher').textContent ?? '', /Main/)
})
