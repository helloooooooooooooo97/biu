import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  CameraIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid'
import { AnchorMenu } from '@biu/public-ui'
import { chromeIcon } from './chrome-icon.ts'
import { applyNoticeClick, noticeIdOf } from './notice-open.ts'
import { readMainDataRoute } from '@biu/core-file-system/main-data-route'
import { persistTheme, readTheme, type ThemeMode } from './theme.ts'
import { persistWorkspaceProfile, useWorkspaceProfile } from '@biu/public-ui'
import { LayoutPrefsMenu } from '@biu/core-file-system/layout-prefs-menu'
import { getPagePrefs, hydratePagePrefs, subscribePageWidth } from '@biu/core-file-system/page-width'

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = localStorage.getItem('biu.account.token') ?? ''
    if (!token) return originalFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (!headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
    return originalFetch(input, { ...init, headers })
  }
}

async function readAvatarFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('无法读取图片'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    const size = 160
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法裁切头像')
    const edge = Math.min(image.width, image.height)
    ctx.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.84)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ShellSettingsAccount() {
  const profile = useWorkspaceProfile()
  const [name, setName] = useState(profile.name)
  const [email, setEmail] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(profile.name)
  }, [profile.name])
  useEffect(() => {
    const token = localStorage.getItem(ACCOUNT_KEY) ?? ''
    if (!token) return
    void accountFetch(token, '/api/account/me')
      .then((body) => setEmail(String(body.email ?? '')))
      .catch(() => setEmail(''))
  }, [])

  const initial = (profile.name.trim() || '用户').slice(0, 1)

  return (
    <section className="settings-account" data-testid="settings-account">
      <header className="settings-account-head">
        <h3 className="settings-account-title">我的账户</h3>
        <p className="settings-muted settings-account-lead">
          头像和账号名跟当前工作区绑在一起，不同工作区可以重名。登录邮箱和密码在所有工作区都一样。
        </p>
      </header>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">照片</p>
          <p className="settings-muted settings-account-hint">点击更换。会出现在侧栏和分享页。</p>
        </div>
        <div className="settings-account-photo">
          <button
            type="button"
            className="settings-account-avatar"
            data-testid="settings-account-avatar"
            title="更换照片"
            aria-label="更换照片"
            onClick={() => fileRef.current?.click()}
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <span className="settings-account-initial">{initial}</span>
            )}
            <span className="settings-account-avatar-veil" aria-hidden>
              <CameraIcon className="size-4" />
            </span>
          </button>
          {profile.avatar ? (
            <button
              type="button"
              className="settings-account-clear"
              data-testid="settings-account-clear-avatar"
              onClick={() => void persistWorkspaceProfile({ name: name.trim(), avatar: '' })}
            >
              移除
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="settings-account-avatar-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void readAvatarFile(file).then((avatar) => {
              void persistWorkspaceProfile({ name: name.trim(), avatar })
            })
          }}
        />
      </div>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-account-name">
            这个工作区的账号名
          </label>
          <p className="settings-muted settings-account-hint">只在当前工作区里使用，可以和别人重名。</p>
        </div>
        <input
          id="settings-account-name"
          className="settings-account-input"
          value={name}
          maxLength={40}
          placeholder="你的名字"
          data-testid="settings-account-name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            void persistWorkspaceProfile({ name: name.trim(), avatar: profile.avatar })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">登录账号</p>
          <p className="settings-muted settings-account-hint">
            {email || '登录邮箱'} · 邮箱和密码跨工作区保持一致。
          </p>
        </div>
        <button
          type="button"
          className="settings-account-action"
          data-testid="settings-account-logout"
          onClick={() => writeAccountToken('')}
        >
          退出
        </button>
      </div>
    </section>
  )
}

const ACCOUNT_KEY = 'biu.account.token'
const ACCOUNT_EVENT = 'biu:account-token'

function bridgeLegacyAccountCookie() {
  if (typeof localStorage === 'undefined' || typeof document === 'undefined') return
  const token = localStorage.getItem(ACCOUNT_KEY) ?? ''
  if (token) document.cookie = `biu_legacy_account=${encodeURIComponent(token)}; Path=/; SameSite=Strict`
}

bridgeLegacyAccountCookie()

export function readAccountToken() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(ACCOUNT_KEY) ?? ''
}

export function writeAccountToken(next: string) {
  if (!next && typeof window !== 'undefined') {
    void fetch('/api/account/logout', { method: 'POST' }).catch(() => undefined)
  }
  if (next) localStorage.setItem(ACCOUNT_KEY, next)
  else localStorage.removeItem(ACCOUNT_KEY)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_EVENT))
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(readAccountToken)
  const [verified, setVerified] = useState(false)
  const [joining, setJoining] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [guestName, setGuestName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const workspaceInvite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('workspaceInvite') ?? ''
  const guestInvite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('guestInvite') ?? ''

  useEffect(() => {
    const sync = () => setToken(readAccountToken())
    window.addEventListener(ACCOUNT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(ACCOUNT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setVerified(false)
      return
    }
    let live = true
    setVerified(false)
    void accountFetch(token, '/api/account/me')
      .then(() => {
        if (live) setVerified(true)
      })
      .catch((err) => {
        if (!live) return
        writeAccountToken('')
        setError(err instanceof Error ? err.message : '登录已失效')
      })
    return () => {
      live = false
    }
  }, [token])

  useEffect(() => {
    if (!token || !verified || !workspaceInvite) return
    let live = true
    setJoining(true)
    void accountFetch(token, `/api/account/invites/${encodeURIComponent(workspaceInvite)}/accept`, { method: 'POST' })
      .then(() => {
        if (!live) return
        const url = new URL(window.location.href)
        url.searchParams.delete('workspaceInvite')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        setError('')
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : '无法加入空间')
      })
      .finally(() => {
        if (live) setJoining(false)
      })
    return () => {
      live = false
    }
  }, [token, verified, workspaceInvite])

  if (token && verified && !joining) return children
  if (token) return <div className="auth-gate" data-testid="auth-verifying">正在验证登录状态…</div>

  return (
    <div className="auth-gate" data-testid="auth-gate">
      {guestInvite ? (
        <form
          className="settings-account auth-gate-card"
          data-testid="auth-guest-invite"
          onSubmit={(event) => {
            event.preventDefault()
            setJoining(true)
            void accountFetch('', `/api/account/guest-invites/${encodeURIComponent(guestInvite)}/accept`, {
              method: 'POST',
              body: JSON.stringify({ name: guestName.trim() }),
            })
              .then((body) => {
                const url = new URL(window.location.href)
                url.searchParams.delete('guestInvite')
                window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
                writeAccountToken(String(body.token ?? ''))
                setError('')
              })
              .catch((err) => setError(err instanceof Error ? err.message : '临时访客链接无效'))
              .finally(() => setJoining(false))
          }}
        >
          <header className="settings-account-head">
            <h3 className="settings-account-title">以临时访客身份进入</h3>
            <p className="settings-muted settings-account-lead">无需注册，只能访问链接指定的内容；权限会在链接设定的时间后自动失效。</p>
          </header>
          {error ? <p className="settings-account-error">{error}</p> : null}
          <div className="settings-account-actions auth-gate-fields">
            <input
              className="settings-account-input"
              value={guestName}
              maxLength={40}
              placeholder="你的称呼（可选）"
              data-testid="auth-guest-name"
              onChange={(event) => setGuestName(event.target.value)}
            />
            <button type="submit" className="settings-account-action" disabled={joining}>
              {joining ? '正在进入…' : '进入分享内容'}
            </button>
          </div>
        </form>
      ) : (
      <form
        className="settings-account auth-gate-card"
        onSubmit={(event) => {
          event.preventDefault()
          const path = mode === 'register' ? '/api/account/register' : '/api/account/login'
          void accountFetch('', path, {
            method: 'POST',
            body: JSON.stringify({ email: name.trim(), password }),
          })
            .then((body) => {
              writeAccountToken(String(body.token ?? ''))
              setPassword('')
              setError('')
            })
            .catch((err) => setError(err instanceof Error ? err.message : '登录失败'))
        }}
      >
        <header className="settings-account-head">
          <h3 className="settings-account-title">{mode === 'register' ? '注册' : '登录'}</h3>
          <p className="settings-muted settings-account-lead">
            {workspaceInvite ? '登录或注册后即可通过邀请链接加入空间。' : '登录之后才能进入。登录邮箱和密码在所有工作区都一样。'}
          </p>
        </header>
        {error ? <p className="settings-account-error">{error}</p> : null}
        <div className="settings-account-actions auth-gate-fields">
          <input
            className="settings-account-input"
            value={name}
            maxLength={40}
            placeholder="登录邮箱"
            type="email"
            autoComplete="email"
            data-testid="auth-name"
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="settings-account-input"
            type="password"
            value={password}
            placeholder="密码"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            data-testid="auth-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" className="settings-account-action" data-testid="auth-submit">
            {mode === 'register' ? '注册并进入' : '登录'}
          </button>
          <button
            type="button"
            className="settings-account-action"
            data-testid="auth-switch"
            onClick={() => setMode((current) => (current === 'login' ? 'register' : 'login'))}
          >
            {mode === 'register' ? '已有账号，去登录' : '没有账号，去注册'}
          </button>
        </div>
      </form>
      )}
    </div>
  )
}

type CollabWorkspace = { id: string; name: string; role: string }
type CollabMember = { id: string; name: string; email?: string; role: string }
type CollabPresence = { accountId: string; name: string; collection: string; recordId: string }
type CollabGroup = { id: string; name: string; memberCount: number }

async function accountFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || '请求失败')
  return body as Record<string, unknown>
}

export function ShellSettingsCollab() {
  const [token, setToken] = useState(() => localStorage.getItem(ACCOUNT_KEY) ?? '')
  const [workspaces, setWorkspaces] = useState<CollabWorkspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [members, setMembers] = useState<CollabMember[]>([])
  const [inviteId, setInviteId] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('viewer')
  const [workspaceInviteUrl, setWorkspaceInviteUrl] = useState('')
  const [presence, setPresence] = useState<CollabPresence[]>([])
  const [groups, setGroups] = useState<CollabGroup[]>([])
  const [groupName, setGroupName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [groupEmail, setGroupEmail] = useState('')
  const [error, setError] = useState('')

  const remember = (next: string) => {
    setToken(next)
    writeAccountToken(next)
  }

  const loadWorkspace = useCallback(async (current: string, id: string) => {
    if (!current || !id) {
      setMembers([])
      setPresence([])
      setGroups([])
      return
    }
    const [listed, grouped] = await Promise.all([
      accountFetch(current, `/api/account/workspaces/${id}/members`) as Promise<{ members?: CollabMember[] }>,
      accountFetch(current, `/api/account/workspaces/${id}/groups`) as Promise<{ groups?: CollabGroup[] }>,
    ])
    setMembers(listed.members ?? [])
    const nextGroups = grouped.groups ?? []
    setGroups(nextGroups)
    setGroupId((value) => value && nextGroups.some((row) => row.id === value) ? value : (nextGroups[0]?.id ?? ''))
    const here = (await accountFetch(current, '/api/account/presence', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: id }),
    })) as { presence?: CollabPresence[] }
    setPresence(here.presence ?? [])
  }, [])

  useEffect(() => {
    if (!token) {
      setWorkspaces([])
      return
    }
    let gone = false
    void (async () => {
      try {
        const listed = (await accountFetch(token, '/api/account/workspaces')) as { workspaces?: CollabWorkspace[] }
        const active = (await accountFetch(token, '/api/account/active')) as { workspaceId?: string }
        if (gone) return
        const rows = listed.workspaces ?? []
        setWorkspaces(rows)
        setWorkspaceId(String(active.workspaceId || rows[0]?.id || ''))
        setError('')
      } catch (err) {
        if (gone) return
        remember('')
        setError(err instanceof Error ? err.message : '无法读取账号')
      }
    })()
    return () => {
      gone = true
    }
  }, [token])

  useEffect(() => {
    if (!token || !workspaceId) return
    void loadWorkspace(token, workspaceId).catch((err) => {
      setError(err instanceof Error ? err.message : '无法读取工作区')
    })
  }, [token, workspaceId, loadWorkspace])

  const workspaceRole = workspaces.find((row) => row.id === workspaceId)?.role
  const canManage = workspaceRole === 'owner' || workspaceRole === 'admin'
  const canChangeRoles = workspaceRole === 'owner'

  return (
    <section className="settings-account" data-testid="settings-collab">
      <header className="settings-account-head">
        <h3 className="settings-account-title">工作区与成员</h3>
        <p className="settings-muted settings-account-lead">
          在这里切换空间、邀请成员和维护成员组。个人头像、昵称与登录信息统一放在“账户”。
        </p>
      </header>
      {error ? <p className="settings-account-error" data-testid="settings-collab-error">{error}</p> : null}
      <form
        className="settings-account-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token) return
          void accountFetch(token, '/api/account/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: workspaceName }),
          })
            .then(async (body) => {
              const created = body as CollabWorkspace
              setWorkspaces((rows) => [...rows, created])
              setWorkspaceId(created.id)
              await accountFetch(token, '/api/account/active', {
                method: 'POST',
                body: JSON.stringify({ workspaceId: created.id }),
              })
              setWorkspaceName('')
              setError('')
            })
            .catch((err) => setError(err instanceof Error ? err.message : '创建失败'))
        }}
      >
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-collab-workspace">工作区</label>
          <p className="settings-muted settings-account-hint">成员改不同记录。同一条记录同时只锁给一个人。</p>
        </div>
        <div className="settings-account-actions">
          <select
            className="settings-account-input"
            aria-label="选择工作区"
            data-testid="settings-collab-workspaces"
            value={workspaceId}
            disabled={!workspaces.length}
            onChange={(event) => {
              const next = event.target.value
              setWorkspaceId(next)
              if (!token || !next) return
              void accountFetch(token, '/api/account/active', {
                method: 'POST',
                body: JSON.stringify({ workspaceId: next }),
              }).catch((err) => setError(err instanceof Error ? err.message : '无法切换工作区'))
            }}
          >
            {workspaces.length ? null : <option value="">还没有工作区</option>}
            {workspaces.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
          <input
            id="settings-collab-workspace"
            className="settings-account-input"
            value={workspaceName}
            maxLength={40}
            placeholder="新工作区"
            data-testid="settings-collab-workspace"
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          <button type="submit" className="settings-account-action" disabled={!token} data-testid="settings-collab-create">
            新建
          </button>
        </div>
      </form>
      <form
        className="settings-account-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token || !workspaceId || !inviteId.trim()) return
          void accountFetch(token, `/api/account/workspaces/${workspaceId}/members`, {
            method: 'POST',
            body: JSON.stringify({ email: inviteId.trim() }),
          })
            .then((body) => {
              setMembers(((body as { members?: CollabMember[] }).members) ?? [])
              setInviteId('')
              setError('')
            })
            .catch((err) => setError(err instanceof Error ? err.message : '邀请失败'))
        }}
      >
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-collab-invite">空间成员</label>
          <p className="settings-muted settings-account-hint">
            所有者管理管理员；管理员可以邀请、移除普通成员并维护成员组。
          </p>
          <ul className="settings-account-people" data-testid="settings-collab-members">
            {members.length ? members.map((row) => (
              <li key={row.id}>
                {row.name}{row.email ? ` · ${row.email}` : ''} · {
                  row.role === 'owner' ? '所有者' : row.role === 'admin' ? '管理者' : row.role === 'viewer' ? '查看者' : '编辑者'
                }
                {canChangeRoles && row.role !== 'owner' ? (
                  <select
                    className="settings-account-input"
                    aria-label={`修改 ${row.name || row.email} 的角色`}
                    value={row.role === 'admin' || row.role === 'viewer' ? row.role : 'member'}
                    onChange={(event) => {
                      const nextRole = event.target.value
                      void accountFetch(token, `/api/account/workspaces/${workspaceId}/members/${row.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role: nextRole }),
                      })
                        .then((body) => {
                          setMembers(((body as { members?: CollabMember[] }).members) ?? [])
                          if (nextRole === 'owner') {
                            setWorkspaces((rows) => rows.map((workspace) =>
                              workspace.id === workspaceId ? { ...workspace, role: 'admin' } : workspace,
                            ))
                          }
                          setError('')
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : '修改角色失败'))
                    }}
                  >
                    <option value="owner">所有者</option>
                    <option value="admin">管理者</option>
                    <option value="member">编辑者</option>
                    <option value="viewer">查看者（只读）</option>
                  </select>
                ) : null}
                {canManage && row.role !== 'owner' && (workspaceRole === 'owner' || row.role === 'member' || row.role === 'viewer') ? (
                  <button
                    type="button"
                    className="settings-account-clear"
                    onClick={() => {
                      if (!window.confirm(`确定将 ${row.name || row.email || '该成员'} 移出工作区？`)) return
                      void accountFetch(token, `/api/account/workspaces/${workspaceId}/members/${row.id}`, {
                        method: 'DELETE',
                      })
                        .then((body) => {
                          setMembers(((body as { members?: CollabMember[] }).members) ?? [])
                          setError('')
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : '移除成员失败'))
                    }}
                  >
                    移除
                  </button>
                ) : null}
              </li>
            )) : <li className="settings-muted">当前空间还没有其他成员。</li>}
          </ul>
        </div>
        {canManage ? <div className="settings-account-actions">
          <input
            id="settings-collab-invite"
            className="settings-account-input"
            value={inviteId}
            placeholder="成员的登录邮箱"
            type="email"
            data-testid="settings-collab-invite"
            onChange={(event) => setInviteId(event.target.value)}
          />
          <button type="submit" className="settings-account-action" disabled={!token || !workspaceId || !inviteId.trim()}>
            邀请
          </button>
          <select
            className="settings-account-input"
            aria-label="邀请链接角色"
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value === 'member' ? 'member' : 'viewer')}
          >
            <option value="viewer">查看者</option>
            <option value="member">编辑者</option>
          </select>
          <button
            type="button"
            className="settings-account-action"
            data-testid="settings-collab-invite-link"
            onClick={() => {
              void accountFetch(token, `/api/account/workspaces/${workspaceId}/invites`, {
                method: 'POST',
                body: JSON.stringify({ role: inviteRole, expiresInHours: 168 }),
              })
                .then(async (body) => {
                  const url = new URL(String(body.path ?? '/'), window.location.origin).toString()
                  setWorkspaceInviteUrl(url)
                  await navigator.clipboard.writeText(url).catch(() => undefined)
                  setError('')
                })
                .catch((err) => setError(err instanceof Error ? err.message : '生成邀请链接失败'))
            }}
          >
            生成邀请链接
          </button>
          {workspaceInviteUrl ? (
            <input
              className="settings-account-input"
              aria-label="空间邀请链接"
              readOnly
              value={workspaceInviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          ) : null}
        </div> : null}
      </form>
      <form
        className="settings-account-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token || !workspaceId || !groupName.trim()) return
          void accountFetch(token, `/api/account/workspaces/${workspaceId}/groups`, {
            method: 'POST',
            body: JSON.stringify({ name: groupName.trim() }),
          })
            .then((body) => {
              const created = body as CollabGroup
              setGroups((rows) => [...rows, created])
              setGroupId(created.id)
              setGroupName('')
              setError('')
            })
            .catch((err) => setError(err instanceof Error ? err.message : '创建成员组失败'))
        }}
      >
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-collab-group">成员组</label>
          <p className="settings-muted settings-account-hint">把权限授予组，成员变化后文档权限会立即跟着变化。</p>
          <ul className="settings-account-people" data-testid="settings-collab-groups">
            {groups.length
              ? groups.map((row) => <li key={row.id}>{row.name} · {row.memberCount} 人</li>)
              : <li className="settings-muted">还没有成员组。</li>}
          </ul>
        </div>
        {canManage ? <div className="settings-account-actions">
          <input
            id="settings-collab-group"
            className="settings-account-input"
            value={groupName}
            maxLength={40}
            placeholder="例如：产品组"
            data-testid="settings-collab-group"
            onChange={(event) => setGroupName(event.target.value)}
          />
          <button type="submit" className="settings-account-action" disabled={!token || !workspaceId}>
            新建组
          </button>
        </div> : null}
      </form>
      {canManage && groups.length ? <form
        className="settings-account-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token || !workspaceId || !groupId || !groupEmail.trim()) return
          void accountFetch(token, `/api/account/workspaces/${workspaceId}/groups/${groupId}/members`, {
            method: 'POST',
            body: JSON.stringify({ email: groupEmail.trim() }),
          })
            .then(() => {
              setGroups((rows) => rows.map((row) => row.id === groupId ? { ...row, memberCount: row.memberCount + 1 } : row))
              setGroupEmail('')
              setError('')
            })
            .catch((err) => setError(err instanceof Error ? err.message : '添加组成员失败'))
        }}
      >
        <div className="settings-account-copy">
          <p className="settings-account-label">添加组成员</p>
          <p className="settings-muted settings-account-hint">只能加入已经属于当前工作区的账号。</p>
        </div>
        <div className="settings-account-actions">
          <select
            className="settings-account-input"
            value={groupId}
            aria-label="选择成员组"
            onChange={(event) => setGroupId(event.target.value)}
          >
            {groups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <input
            className="settings-account-input"
            type="email"
            value={groupEmail}
            placeholder="成员的登录邮箱"
            onChange={(event) => setGroupEmail(event.target.value)}
          />
          <button type="submit" className="settings-account-action" disabled={!groupId}>添加</button>
        </div>
      </form> : null}
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">正在看</p>
          <ul className="settings-account-people" data-testid="settings-collab-presence">
            {presence.length ? presence.map((row) => (
              <li key={row.accountId}>
                {row.name}
                {row.collection && row.recordId ? ` · ${row.collection}/${row.recordId}` : ''}
              </li>
            )) : <li className="settings-muted">打开工作区后，30 秒内有心跳的人会出现在这里。</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function ShellSettingsAppearance() {
  const [theme, setTheme] = useState(readTheme)
  const [pagePrefs, setPagePrefs] = useState(getPagePrefs)

  useEffect(() => subscribePageWidth(() => setPagePrefs(getPagePrefs())), [])
  useEffect(() => {
    void hydratePagePrefs().then(() => setPagePrefs(getPagePrefs()))
  }, [])

  const pick = (next: ThemeMode) => {
    persistTheme(next)
    setTheme(next)
  }

  return (
    <section data-testid="settings-appearance">
      <h3 className="settings-pane-title">外观</h3>
      <p className="settings-muted settings-pane-lead">色彩和布局。日间是浅色，夜间是深色；宽屏、目录和正文字号记在下面。</p>
      <div className="settings-theme-grid">
        <button
          type="button"
          className={`settings-theme-card${theme === 'light' ? ' is-on' : ''}`}
          data-theme-card="light"
          aria-pressed={theme === 'light'}
          data-testid="settings-theme-light"
          onClick={() => pick('light')}
        >
          <span className="settings-theme-preview is-light" aria-hidden />
          日间模式
        </button>
        <button
          type="button"
          className={`settings-theme-card${theme === 'dark' ? ' is-on' : ''}`}
          data-theme-card="dark"
          aria-pressed={theme === 'dark'}
          data-testid="settings-theme-dark"
          onClick={() => pick('dark')}
        >
          <span className="settings-theme-preview is-dark" aria-hidden />
          夜间模式
        </button>
      </div>
      <h4 className="settings-pane-subtitle">布局设计</h4>
      <p className="settings-muted settings-pane-lead">宽屏、悬浮目录和正文字号。重启后仍按上次选择。</p>
      <LayoutPrefsMenu prefs={pagePrefs} testPrefix="settings-layout" className="settings-page-prefs" />
    </section>
  )
}

export function ShellSettingsAbout() {
  return (
    <section data-testid="settings-about">
      <h3 className="settings-pane-title">关于</h3>
      <p className="settings-pane-title" style={{ fontSize: 14, fontWeight: 600, margin: '18px 0 8px' }}>Biu Agent OS</p>
      <p className="settings-muted m-0">Apache License 2.0。</p>
      <p className="settings-muted m-0" style={{ marginTop: 12 }}>
        public/grok-bot/ 角色素材归 xAI，不随 Apache-2.0 授权。详见 NOTICE.md。
      </p>
    </section>
  )
}

export function ShellSettingsShortcuts() {
  return (
    <section data-testid="settings-shortcuts">
      <h3 className="settings-pane-title">快捷键</h3>
      <p className="settings-muted settings-pane-lead">Windows 与 Linux 上 ⌘ 用 Ctrl。选取也可用 ⌘Q。编辑器内 ⌘F 为正文查找，⌘⇧F 仍打开全局搜索。</p>
      <ul className="settings-shortcut-list">
        <li>
          <span>搜索</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>F</kbd> / <kbd>⌘</kbd><kbd>⇧</kbd><kbd>F</kbd></span>
        </li>
        <li>
          <span>快速选取</span>
          <span className="settings-kbd"><kbd>Ctrl</kbd><kbd>Q</kbd></span>
        </li>
        <li>
          <span>选区送到对话</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>L</kbd></span>
        </li>
      </ul>
    </section>
  )
}

export function ShellSettingsUpdate() {
  const [behind, setBehind] = useState(0)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | undefined>()

  useEffect(() => {
    void fetch('/api/update')
      .then((res) => res.json() as Promise<{ behind?: number }>)
      .then((data) => setBehind(Math.max(0, Number(data.behind) || 0)))
      .catch(() => { })
  }, [])

  const download = useCallback(async () => {
    if (busy) return
    if (behind <= 0) {
      setHint('相对于主分支暂时无最新提交版本')
      return
    }
    setBusy(true)
    setHint(undefined)
    try {
      const res = await fetch('/api/update', { method: 'POST' })
      const data = (await res.json()) as { error?: string; restarting?: boolean }
      if (!res.ok) throw new Error(data.error || '更新失败')
      setBehind(0)
      setHint('正在重启…')
    } catch (error) {
      setBusy(false)
      setHint(String(error))
    }
  }, [busy, behind])

  const badge = behind > 99 ? '99+' : String(behind)

  return (
    <section className="shell-settings-update" data-testid="settings-update">
      <h3 className="settings-pane-title">更新</h3>
      <p className="settings-muted settings-pane-lead">
        {behind > 0 ? `当前落后主分支 ${badge} 个提交。` : '已与主分支对齐。'}
      </p>
      <button
        type="button"
        className="shell-settings-update-btn"
        data-testid="settings-update-download"
        disabled={busy}
        onClick={() => void download()}
      >
        <ArrowDownTrayIcon className="size-4" />
        {busy ? '更新中…' : '下载更新'}
      </button>
      {hint ? (
        <p className="settings-muted mt-3 mb-0" role="status">
          {hint}
        </p>
      ) : null}
    </section>
  )
}

type McpHostInfo = {
  url: string
  localUrl?: string
  bind?: string
  token: string
  tools?: string[]
  clients?: Record<string, unknown>
  note?: string
}

const MCP_CLIENTS: Array<{ id: string; name: string; blurb: string }> = [
  { id: 'cursor', name: 'Cursor', blurb: '把工作区交给 Cursor Agent 当 MCP 工具。' },
  { id: 'claude', name: 'Claude', blurb: 'Claude Desktop / Claude.ai 连进这个工作区。' },
  { id: 'chatgpt', name: 'ChatGPT', blurb: 'Custom GPT 或 Connector 填同一套 URL + token。' },
  { id: 'codex', name: 'Codex', blurb: 'CLI 用 Streamable HTTP，请求头带 Bearer。' },
]

function mcpSnippet(info: McpHostInfo, id: string) {
  const headers = { Authorization: `Bearer ${info.token}` }
  if (id === 'chatgpt') return JSON.stringify({ url: info.url, headers }, null, 2)
  return JSON.stringify({ mcpServers: { biu: { url: info.url, headers } } }, null, 2)
}

export function ShellSettingsMcp({ onLeave }: { onLeave?: () => void }) {
  const navigate = useNavigate()
  const [info, setInfo] = useState<McpHostInfo | null>(null)
  const [error, setError] = useState('')
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState('')
  const [rotating, setRotating] = useState(false)

  const load = useCallback(() => {
    void fetch('/api/mcp/info')
      .then(async (res) => {
        const data = (await res.json()) as McpHostInfo & { error?: string }
        if (!res.ok) throw new Error(data.error || '无法读取 MCP 连接信息')
        setInfo({
          url: data.url,
          localUrl: data.localUrl,
          bind: data.bind,
          token: data.token,
          tools: data.tools,
          clients: data.clients,
          note: data.note,
        })
        setError('')
      })
      .catch((err) => setError(String(err instanceof Error ? err.message : err)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((prev) => (prev === key ? '' : prev)), 1600)
    } catch {
      setError('无法复制，请重试')
    }
  }

  async function rotate() {
    if (!info || rotating) return
    if (!window.confirm('重新生成后，已经配好的客户端会立刻失效，需要重新复制配置。')) return
    setRotating(true)
    try {
      const res = await fetch('/api/mcp/rotate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${info.token}` },
      })
      const data = (await res.json()) as McpHostInfo & { error?: string }
      if (!res.ok) throw new Error(data.error || '无法轮换 token')
      setInfo({
        url: data.url,
        localUrl: data.localUrl ?? info.localUrl,
        bind: data.bind,
        token: data.token,
        tools: info.tools,
        clients: data.clients,
        note: info.note,
      })
      setError('')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setRotating(false)
    }
  }

  const tokenShown = info ? (reveal ? info.token : '•'.repeat(Math.min(28, info.token.length))) : ''

  return (
    <section className="settings-mcp" data-testid="settings-mcp">
      <h3 className="settings-pane-title">Biu MCP</h3>
      <p className="settings-muted settings-pane-lead">
        MCP 听在分享口（默认 0.0.0.0），局域网其它电脑用下面的地址 + token 即可调用。工作台本身仍只在本机。
      </p>
      {error ? (
        <p className="settings-muted settings-mcp-error" role="alert">
          {error}
        </p>
      ) : null}
      <h4 className="settings-pane-subtitle">连接</h4>
      <div className="settings-mcp-fields">
        <label className="settings-mcp-field">
          <span>局域网地址</span>
          <div className="settings-mcp-field-row">
            <input readOnly value={info?.url ?? ''} data-testid="settings-mcp-url" className="settings-mcp-input" />
            <button
              type="button"
              className="settings-mcp-icon-btn"
              disabled={!info}
              data-testid="settings-mcp-copy-url"
              title={copied === 'url' ? '已复制' : '复制地址'}
              aria-label={copied === 'url' ? '已复制' : '复制地址'}
              onClick={() => info && void copy('url', info.url)}
            >
              {copied === 'url' ? <CheckIcon className="size-4" /> : <ClipboardDocumentIcon className="size-4" />}
            </button>
          </div>
        </label>
        {info?.localUrl && info.localUrl !== info.url ? (
          <label className="settings-mcp-field">
            <span>本机地址</span>
            <div className="settings-mcp-field-row">
              <input readOnly value={info.localUrl} data-testid="settings-mcp-local-url" className="settings-mcp-input" />
            </div>
          </label>
        ) : null}
        <label className="settings-mcp-field">
          <span>Token</span>
          <div className="settings-mcp-field-row">
            <input
              readOnly
              value={tokenShown}
              data-testid="settings-mcp-token"
              className="settings-mcp-input"
              spellCheck={false}
            />
            <button
              type="button"
              className="settings-mcp-icon-btn"
              disabled={!info}
              data-testid="settings-mcp-reveal"
              title={reveal ? '隐藏 token' : '显示 token'}
              aria-label={reveal ? '隐藏 token' : '显示 token'}
              onClick={() => setReveal((on) => !on)}
            >
              {reveal ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
            <button
              type="button"
              className="settings-mcp-icon-btn"
              disabled={!info}
              data-testid="settings-mcp-copy-token"
              title={copied === 'token' ? '已复制' : '复制 token'}
              aria-label={copied === 'token' ? '已复制' : '复制 token'}
              onClick={() => info && void copy('token', info.token)}
            >
              {copied === 'token' ? <CheckIcon className="size-4" /> : <ClipboardDocumentIcon className="size-4" />}
            </button>
          </div>
        </label>
        <div className="settings-mcp-actions">
          <button
            type="button"
            className="settings-mcp-rotate"
            disabled={!info || rotating}
            data-testid="settings-mcp-rotate"
            onClick={() => void rotate()}
          >
            {rotating ? '正在生成…' : '重新生成 token'}
          </button>
          <button
            type="button"
            className="settings-mcp-link"
            data-testid="settings-mcp-open-table"
            onClick={() => {
              onLeave?.()
              navigate('/mcp')
            }}
          >
            挂外部 MCP 服务器
          </button>
        </div>
      </div>
      <h4 className="settings-pane-subtitle">客户端</h4>
      <p className="settings-muted settings-pane-lead">复制配置后贴进对应产品。没有各家 OAuth 向导，接入就是带 Bearer 的同一条地址。</p>
      <div className="settings-mcp-grid">
        {MCP_CLIENTS.map((client) => (
          <article key={client.id} className="settings-mcp-card" data-testid={`settings-mcp-client-${client.id}`}>
            <span className="settings-mcp-mark" aria-hidden>
              {client.name.slice(0, 1)}
            </span>
            <div className="settings-mcp-card-copy">
              <strong>{client.name}</strong>
              <p>{client.blurb}</p>
            </div>
            <button
              type="button"
              className="settings-mcp-enable"
              disabled={!info}
              data-testid={`settings-mcp-copy-${client.id}`}
              onClick={() => info && void copy(client.id, mcpSnippet(info, client.id))}
            >
              {copied === client.id ? '已复制' : '复制配置'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function SideAction({
  title,
  active,
  testId,
  onClick,
  icon,
  children,
  buttonRef,
}: {
  title: string
  active?: boolean
  testId: string
  onClick: () => void
  icon: ReactNode
  children?: ReactNode
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`app-side-actions-item${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
    >
      <span className="app-side-actions-icon" aria-hidden>
        {icon}
      </span>
      <span className="app-side-actions-label">{title}</span>
      {children}
    </button>
  )
}

type NoticeRow = {
  id: string
  title?: string
  body?: string
  kind?: string
  read?: boolean
  href?: string
}

function sessionIdFromPath(path: string) {
  const match = path.match(/^\/s\/([^/]+)/)
  return match ? decodeURIComponent(match[1]!) : ''
}

function noticeHref(row: NoticeRow) {
  return String(row.href ?? '').trim()
}

function noticeIsForSession(row: NoticeRow, sessionId: string) {
  if (!sessionId) return false
  const href = noticeHref(row)
  return href === `/s/${sessionId}` || href === `/s/${encodeURIComponent(sessionId)}`
}

function NoticeBody({ body }: { body: string }) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
  return (
    <span className="shell-notify-body">
      {lines.map((line, index) => {
        const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
        if (image) {
          return <img key={index} className="shell-notify-asset" src={image[2]} alt={image[1] || '附件'} />
        }
        const link = line.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
        if (link) {
          return (
            <span key={index} className="shell-notify-file">
              {link[1]}
            </span>
          )
        }
        return <span key={index}>{line}</span>
      })}
    </span>
  )
}

function noticeKindLabel(kind?: string) {
  if (kind === 'approval') return '审批'
  if (kind === 'task') return '任务'
  if (kind === 'session') return '会话'
  return ''
}

function NoticeBell({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<NoticeRow[]>([])
  const looking = sessionIdFromPath(location.pathname)

  const load = useCallback(() => {
    void fetch('/api/db/list?path=/notices&sort=createdAt&dir=desc&limit=40&columns=title,body,kind,read,href,createdAt')
      .then((res) => res.json() as Promise<{ items?: Array<Record<string, unknown>> }>)
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : []
        setRows(
          items.flatMap((item) => {
            const id = noticeIdOf(item)
            if (!id) return []
            return [{
              id,
              title: String(item.title ?? ''),
              body: String(item.body ?? ''),
              kind: String(item.kind ?? ''),
              read: item.read === true,
              href: String(item.href ?? ''),
            }]
          }),
        )
      })
      .catch(() => setRows([]))
  }, [])

  useEffect(() => {
    load()
    const onChange = () => load()
    window.addEventListener('fsdb:change', onChange)
    return () => window.removeEventListener('fsdb:change', onChange)
  }, [load])

  const unread = rows.filter((row) => row.read !== true && !noticeIsForSession(row, looking))
  const inbox = rows.filter((row) => row.read !== true)
  const badge = unread.length > 99 ? '99+' : unread.length ? String(unread.length) : ''
  const triggerRef = useRef<HTMLButtonElement>(null)

  const clearAll = () => {
    setRows([])
    void fetch('/api/db/notices/clear', { method: 'POST' })
      .then(() => load())
      .catch(() => load())
  }

  const openRow = (row: NoticeRow) => {
    if (!row.id) return
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, read: true } : item)))
    const href = applyNoticeClick(row)
    void fetch('/api/db/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: `/notices/${row.id}`, content: { read: true } }),
    })
      .then(() => load())
      .catch(() => load())
    onOpenChange(false)
    if (!href) return
    navigate(href)
  }

  return (
    <div className="shell-side-pop-wrap">
      <SideAction
        title="通知"
        active={open}
        testId="chrome-notify"
        icon={<BellIcon {...chromeIcon} />}
        buttonRef={triggerRef}
        onClick={() => onOpenChange(!open)}
      >
        {badge ? (
          <span className="shell-notify-badge" data-testid="chrome-notify-badge">
            {badge}
          </span>
        ) : null}
      </SideAction>
      {open ? (
        <AnchorMenu
          anchor={triggerRef.current}
          onClose={() => onOpenChange(false)}
          placement="right"
          minWidth={320}
          zIndex={80}
          className="shell-side-pop shell-notify-pop"
          role="dialog"
          aria-label="通知"
          data-testid="chrome-notify-pop"
        >
          <div className="shell-notify-head">
            <span className="shell-notify-head-title">通知</span>
            {inbox.length ? (
              <button
                type="button"
                className="shell-notify-clear"
                data-testid="chrome-notify-clear"
                title="全部已读并清空"
                aria-label="全部已读并清空"
                onClick={() => clearAll()}
              >
                <CheckIcon className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          {inbox.length ? (
            <ul className="shell-notify-list">
              {inbox.map((row) => {
                const kind = noticeKindLabel(row.kind)
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`shell-notify-item${row.read === true ? '' : ' is-unread'}`}
                      data-testid="chrome-notify-item"
                      onClick={() => openRow(row)}
                    >
                      {kind ? <span className="shell-notify-kind">{kind}</span> : null}
                      <span className="shell-notify-title">{row.title || '通知'}</span>
                      {row.body ? <NoticeBody body={row.body} /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="shell-chrome-pop-empty">暂无通知</p>
          )}
        </AnchorMenu>
      ) : null}
    </div>
  )
}

/** 公共入口：聊天与数据侧栏共用。 */
export function ShellSidePlaces({
  activeId,
  agentHref,
  onSettings,
  onSearch,
  searchOpen = false,
}: {
  activeId: string
  agentHref: string
  onSettings: () => void
  onSearch?: () => void
  searchOpen?: boolean
}) {
  const navigate = useNavigate()
  const [notifyOpen, setNotifyOpen] = useState(false)

  return (
    <div className="app-side-actions shell-side-places" role="navigation" aria-label="面板" data-testid="shell-side-places">
      <SideAction
        title="搜索"
        active={searchOpen}
        testId="chrome-search"
        icon={<MagnifyingGlassIcon {...chromeIcon} />}
        onClick={() => {
          setNotifyOpen(false)
          onSearch?.()
        }}
      />
      <NoticeBell
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
      />
      <SideAction
        title="设置"
        testId="chrome-settings"
        icon={<Cog6ToothIcon {...chromeIcon} />}
        onClick={onSettings}
      />
      <SideAction
        title="会话"
        active={activeId === 'agent'}
        testId="chrome-chat-panel"
        icon={<ChatBubbleLeftRightIcon {...chromeIcon} />}
        onClick={() => {
          navigate(agentHref)
        }}
      />
      <SideAction
        title="数据"
        active={activeId === 'database'}
        testId="chrome-data-panel"
        icon={<CircleStackIcon {...chromeIcon} />}
        onClick={() => {
          navigate(readMainDataRoute() || '/database')
        }}
      />
    </div>
  )
}
