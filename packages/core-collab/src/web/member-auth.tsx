import { useEffect, useState } from 'react'
import { ShareAccountHost } from './share-shell.tsx'
import { shareTokenFromPath } from './share-path.ts'

type Member = { id: string; name: string; role: string }

function inviteToken() {
  if (typeof location === 'undefined') return ''
  const params = new URLSearchParams(location.search)
  if (location.pathname === '/join' || params.has('invite')) return params.get('token') ?? ''
  return ''
}

function onShareRoute() {
  if (typeof location === 'undefined') return false
  return Boolean(shareTokenFromPath(location.pathname))
}

export function AuthGate() {
  const [ready, setReady] = useState(false)
  const [member, setMember] = useState<Member | null>(null)
  const [empty, setEmpty] = useState(false)
  const [mode, setMode] = useState<'login' | 'register' | 'join'>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const token = inviteToken()
  const share = onShareRoute()

  useEffect(() => {
    if (share) {
      setReady(true)
      return
    }
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: Member | null; empty?: boolean }) => {
        setMember(body.member ?? null)
        setEmpty(Boolean(body.empty))
        if (!body.member) setMode(token ? 'join' : body.empty ? 'register' : 'login')
      })
      .finally(() => setReady(true))
  }, [token, share])

  if (!ready) return <div className="member-auth" data-testid="member-auth-pending" />
  if (share || member) return null

  const submit = () => {
    if (busy) return
    setBusy(true)
    setError('')
    const path = mode === 'join' ? '/api/members/join' : mode === 'register' ? '/api/members/register' : '/api/members/login'
    void fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, password, token }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(body.error || '失败')
        history.replaceState(null, '', '/')
        location.reload()
      })
      .catch((err: Error) => {
        setError(String(err.message || err))
        setBusy(false)
      })
  }

  const title = token ? '加入工作区' : empty ? '创建工作区' : mode === 'register' ? '注册账号' : '登录'
  return (
    <div className="member-auth" data-testid="member-auth">
      <form
        className="member-auth-card"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <h1>{title}</h1>
        <p>用姓名和密码进入。默认管理员是 root / 123456，能看到全部页面。其他人只能看到已分享的页，以及自己（含自己的 Agent）创建的页。</p>
        <label>
          姓名
          <input value={name} placeholder="root" autoComplete="username" onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} placeholder={mode === 'login' ? '123456' : ''} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="member-auth-error">{error}</p> : null}
        <button type="submit" disabled={busy || !name.trim() || !password}>
          {token ? '加入' : empty || mode === 'register' ? '注册并进入' : '登录'}
        </button>
        {token ? null : empty ? null : (
          <button
            type="button"
            className="member-auth-switch"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </button>
        )}
      </form>
    </div>
  )
}

export function AccountChip() {
  const [member, setMember] = useState<Member | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: Member | null }) => setMember(body.member ?? null))
  }, [])
  if (!member) return null
  const chip = (
    <div className="member-account" data-testid="member-account">
      <button
        type="button"
        className="member-account-name"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {member.name}
      </button>
      {open ? (
        <div className="member-account-menu" role="menu">
          <span className="member-account-role">{member.role === 'owner' ? '管理员' : member.role === 'viewer' ? '只读' : '编辑人'}</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void fetch('/api/members/logout', { method: 'POST' }).finally(() => location.reload())
            }}
          >
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  )
  return <ShareAccountHost>{chip}</ShareAccountHost>
}
