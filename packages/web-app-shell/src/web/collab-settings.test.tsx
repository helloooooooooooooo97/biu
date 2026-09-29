import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import {
  AuthGate,
  ShellSettingsAccount,
  ShellSettingsMembers,
  ShellSettingsMcp,
  ShellSettingsWorkspace,
  ShellWorkspaceSwitcher,
} from './shell-chrome.tsx'

afterEach(() => cleanup())

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
  assert.doesNotMatch(source, /window\.confirm/)
  assert.match(source, /settings-member-remove-dialog/)
  assert.match(source, /settings-mcp-rotate-dialog/)
})

test('workspace and member settings are separate and workspace switching stays out of settings', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.settings-account-action\s*\{[^}]*font:\s*inherit/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*border:\s*1px solid var\(--dsw-border\)/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*height:\s*32px/)
  assert.match(css, /\.settings-members-section\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(css, /\.settings-member-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s)
  assert.match(css, /\.settings-member-identity strong,[\s\S]*?text-overflow:\s*ellipsis/)
  const calls: string[] = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/login')) return json({ id: 'acc_1', name: 'Ada', token: 'tok' })
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'Ada' })
    if (url.endsWith('/workspaces') && (init?.method ?? 'GET') === 'GET') {
      return json({ workspaces: [{ id: 'ws_1', name: 'Main', role: 'owner' }] })
    }
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_1' })
    if (url.endsWith('/workspaces/ws_1') && init?.method === 'PATCH') {
      return json({ id: 'ws_1', name: 'Notes', role: 'owner' })
    }
    if (url.includes('/members')) {
      return json({
        members: [
          { id: 'acc_1', name: 'Ada', role: 'owner' },
          { id: 'acc_2', name: '名称很长但不应该挤坏布局的成员', email: 'member@example.com', role: 'viewer' },
        ],
      })
    }
    if (url.endsWith('/presence')) return json({ presence: [{ accountId: 'acc_1', name: 'Ada', collection: '', recordId: '' }] })
    return json({})
  }) as typeof fetch

  render(<ShellSettingsWorkspace />)
  assert.equal(screen.getByTestId('settings-collab').querySelector('.settings-account-title')?.textContent, '空间设置')
  await act(async () => {
    await Promise.resolve()
  })
  assert.equal(screen.queryByTestId('settings-collab-id'), null)
  assert.equal(screen.queryByTestId('settings-collab-workspaces'), null)
  fireEvent.change(screen.getByTestId('settings-collab-workspace'), { target: { value: 'Notes' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('settings-collab-save'))
  })
  await waitFor(() => assert.equal(calls.includes('PATCH /api/account/workspaces/ws_1'), true))
  assert.equal((screen.getByTestId('settings-collab-workspace') as HTMLInputElement).value, 'Notes')
  assert.equal(screen.queryByText('新建'), null)
  cleanup()
  render(<ShellSettingsMembers />)
  await waitFor(() => assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /所有者/))
  assert.equal(screen.getByTestId('settings-collab').querySelector('.settings-account-title')?.textContent, '成员设置')
  assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /所有者/)
  assert.equal(screen.getByTestId('settings-collab-members').querySelectorAll('.settings-member-row').length, 2)
  assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /member@example.com/)
  fireEvent.click(screen.getByText('移除'))
  assert.match(screen.getByTestId('settings-member-remove-dialog').textContent ?? '', /移除空间成员/)
  fireEvent.click(screen.getByText('取消'))
  assert.equal(screen.queryByTestId('settings-member-remove-dialog'), null)
  assert.match(screen.getByTestId('settings-collab-presence').textContent ?? '', /Ada/)
  assert.equal(screen.queryByText('成员组'), null)
  assert.equal(screen.queryByText('添加组成员'), null)
  assert.equal(calls.some((line) => line.includes('/login')), false)
})

test('account settings are global and workspace switcher lives in the sidebar header', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  const source = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  const switcherSource = source.slice(source.indexOf('export function ShellWorkspaceSwitcher'), source.indexOf('export function ShellSettingsCollab'))
  assert.doesNotMatch(switcherSource, /ChevronDownIcon|ChevronUpDownIcon/)
  globalThis.fetch = (async (path: string) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'ada@example.com', email: 'ada@example.com' })
    if (url.endsWith('/sessions')) {
      return json({
        sessions: [
          {
            id: 'ses_1',
            device_name: 'Test Browser',
            expires_at: Date.now() + 60_000,
            last_seen_at: Date.now(),
            revoked_at: null,
          },
        ],
      })
    }
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_1' })
    if (url.endsWith('/workspaces')) {
      return json({
        workspaces: [
          { id: 'ws_1', name: 'Main', role: 'owner' },
          { id: 'ws_2', name: 'Notes', role: 'viewer' },
        ],
      })
    }
    return json({})
  }) as typeof fetch
  render(<ShellSettingsAccount />)
  await waitFor(() => assert.equal(screen.getByTestId('settings-account-global-name').textContent, 'ada@example.com'))
  assert.match(screen.getByTestId('settings-account-sessions').textContent ?? '', /Test Browser/)
  assert.match(screen.getByTestId('settings-account-sessions').textContent ?? '', /到期/)
  assert.equal(screen.queryByLabelText('空间昵称'), null)
  assert.equal(screen.queryByTestId('settings-account-logout'), null)
  cleanup()
  let settingsOpened = false
  render(<ShellWorkspaceSwitcher onWorkspaceSettings={() => { settingsOpened = true }} />)
  const switcher = await screen.findByTestId('shell-workspace-switcher')
  assert.match(switcher.textContent ?? '', /Main/)
  assert.doesNotMatch(switcher.textContent ?? '', /所有者/)
  fireEvent.click(switcher)
  await waitFor(() => assert.equal(screen.getByTestId('shell-workspace-menu').getAttribute('role'), 'menu'))
  assert.match(screen.getByTestId('shell-workspace-menu').textContent ?? '', /所有者/)
  assert.match(screen.getByTestId('shell-workspace-menu').textContent ?? '', /Notes/)
  assert.match(screen.getByTestId('shell-workspace-menu').textContent ?? '', /查看者/)
  assert.match(screen.getByTestId('shell-workspace-menu').textContent ?? '', /创建新空间/)
  assert.match(screen.getByTestId('shell-workspace-menu').textContent ?? '', /退出登录/)
  fireEvent.click(screen.getByText('空间设置'))
  assert.equal(settingsOpened, true)
})

test('online MCP settings choose tools and manage scoped credentials', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  sessionStorage.setItem('biu.workspaceId', 'ws_1')
  let createBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/api/mcp/info')) {
      return json({ online: true, workspaceId: 'ws_1', url: 'http://localhost/api/mcp', token: '', tools: ['db_list', 'db_update'] })
    }
    if (url.includes('/api/account/mcp/credentials?')) return json({ credentials: [] })
    if (url.includes('/api/account/mcp/audit?')) return json({ events: [] })
    if (url.endsWith('/api/account/mcp/credentials') && init?.method === 'POST') {
      createBody = JSON.parse(String(init.body))
      return json({ id: 'mcp_1', token: 'secret' }, 201)
    }
    return json({})
  }) as typeof fetch
  render(<MemoryRouter><ShellSettingsMcp /></MemoryRouter>)
  await screen.findByTestId('settings-mcp-allowed-tools')
  assert.equal((screen.getByLabelText('db_list') as HTMLInputElement).checked, true)
  assert.equal((screen.getByLabelText('db_update') as HTMLInputElement).checked, false)
  fireEvent.click(screen.getByTestId('settings-mcp-rotate'))
  fireEvent.click(await screen.findByText('生成'))
  await waitFor(() => assert.deepEqual(createBody?.allowedTools, ['db_list']))
  assert.equal((screen.getByTestId('settings-mcp-token') as HTMLInputElement).value, 'secret')
})
