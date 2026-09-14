import { useEffect, useState } from 'react'

type Member = { id: string; name: string; role: string }

function inviteToken() {
  if (typeof location === 'undefined') return ''
  const params = new URLSearchParams(location.search)
  if (location.pathname === '/join' || params.has('invite')) return params.get('token') ?? ''
  return ''
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

  useEffect(() => {
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: Member | null; empty?: boolean }) => {
        setMember(body.member ?? null)
        setEmpty(Boolean(body.empty))
        if (!body.member) setMode(token ? 'join' : body.empty ? 'register' : 'login')
      })
      .finally(() => setReady(true))
  }, [token])

  if (!ready) return <div className="member-auth" data-testid="member-auth-pending" />
  if (member) return null

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
        <p>用姓名和密码进入。没有邮箱验证，名字自己起即可。</p>
        <label>
          姓名
          <input value={name} autoComplete="username" onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={(event) => setPassword(event.target.value)} />
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
  useEffect(() => {
    void fetch('/api/members/me')
      .then((res) => res.json())
      .then((body: { member?: Member | null }) => setMember(body.member ?? null))
  }, [])
  if (!member) return null
  return (
    <div className="member-account" data-testid="member-account">
      <span title={member.role}>{member.name}</span>
      <button
        type="button"
        onClick={() => {
          void fetch('/api/members/logout', { method: 'POST' }).finally(() => location.reload())
        }}
      >
        退出
      </button>
    </div>
  )
}
