import { createPortal } from 'react-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { PageEditor } from '@biu/core-editor/web'
import { shareTokenFromPath } from './share-path.ts'
import { setShareAuth } from './share-auth.ts'

type ShareMeta = { pageId: string; role: string; locked: boolean; title: string }
type ShareEnter = ShareMeta & {
  token: string
  content: unknown
  guest: { id: string; name: string }
}

function sharePath() {
  if (typeof location === 'undefined') return ''
  return shareTokenFromPath(location.pathname)
}

export function ShareShell() {
  const token = sharePath()
  const [meta, setMeta] = useState<ShareMeta | null>(null)
  const [session, setSession] = useState<ShareEnter | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!token) return
    void fetch(`/api/shares/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json()) as ShareMeta & { error?: string }
        if (!res.ok) throw new Error(body.error || 'unknown share')
        setMeta(body)
      })
      .catch(() => setMissing(true))
  }, [token])

  if (!token) return null
  if (missing) {
    return (
      <div className="share-shell" data-testid="share-shell">
        <div className="share-shell-card">
          <h1>链接无效</h1>
          <p>这一页没有分享，或者链接已经被关掉。</p>
        </div>
      </div>
    )
  }
  if (!meta) return <div className="share-shell" data-testid="share-shell-pending" />

  if (!session) {
    return (
      <div className="share-shell" data-testid="share-enter">
        <form
          className="share-shell-card"
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            void fetch(`/api/shares/${encodeURIComponent(token)}/enter`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name }),
            })
              .then(async (res) => {
                const body = (await res.json()) as ShareEnter & { error?: string }
                if (!res.ok) throw new Error(body.error || '失败')
                setShareAuth({ token: body.token, pageId: body.pageId, role: body.role })
                setSession(body)
              })
              .catch((err: Error) => setError(String(err.message || err)))
          }}
        >
          <h1>{meta.title}</h1>
          <p>{meta.locked ? '只读分享，只能看这一页。' : '只能打开这一页，看不到工作区里的其他页面。'}</p>
          <label>
            显示名称
            <input value={name} autoComplete="nickname" onChange={(event) => setName(event.target.value)} />
          </label>
          {error ? <p className="member-auth-error">{error}</p> : null}
          <button type="submit" disabled={!name.trim()}>
            进入这一页
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="share-shell is-page" data-testid="share-shell">
      <header className="share-shell-bar">
        <span className="share-shell-title">{session.title}</span>
        {session.locked ? <span className="share-shell-lock">只读</span> : <span className="share-shell-lock is-edit">可编辑</span>}
        <span className="share-shell-who">{session.guest.name}</span>
      </header>
      <div className="share-shell-page">
        <PageEditor
          record={{ id: session.pageId, title: session.title }}
          field="notes"
          spec={{ type: 'file', label: '正文', writable: !session.locked }}
          value={typeof session.content === 'string' ? session.content : ''}
          writable={!session.locked}
          path={`/pages/${session.pageId}`}
        />
      </div>
    </div>
  )
}

export function mountShareStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById('page-share-style')) return
  const el = document.createElement('style')
  el.id = 'page-share-style'
  el.textContent = `
.share-shell{position:fixed;inset:0;z-index:360;display:flex;flex-direction:column;background:var(--dsw-bg,#111);color:var(--dsw-label,#eee)}
.share-shell-card{margin:auto;width:min(400px,calc(100vw - 32px));display:flex;flex-direction:column;gap:12px;padding:24px;border:1px solid var(--dsw-border,#333);border-radius:12px;background:var(--dsw-sidebar,#1b1b1b)}
.share-shell-card h1{margin:0;font-size:18px}
.share-shell-card p{margin:0;color:var(--dsw-label-3,#888);font-size:13px}
.share-shell-card label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600}
.share-shell-card input{border:1px solid var(--dsw-border,#333);border-radius:8px;padding:8px 10px;background:transparent;color:inherit;font:inherit}
.share-shell-card button{border:0;border-radius:8px;padding:8px 12px;background:var(--dsw-business,#2563eb);color:#fff;font:inherit;font-weight:650;cursor:pointer}
.share-shell.is-page{background:var(--dsw-bg)}
.share-shell-bar{display:flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-bottom:1px solid var(--dsw-border)}
.share-shell-title{font-weight:650;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.share-shell-lock{font-size:12px;color:var(--dsw-label-3)}
.share-shell-lock.is-edit{color:var(--dsw-label-2,#bbb)}
.share-shell-who{font-size:12px;color:var(--dsw-label-2)}
.share-shell-page{flex:1;min-height:0;overflow:auto;padding:24px 28px}
`
  document.head.appendChild(el)
}

export function ShareAccountHost({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => {
    const pick = () => document.querySelector('[data-testid="sidebar-brand-account"]')
    setHost(pick())
    const obs = new MutationObserver(() => setHost(pick()))
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])
  if (!host) return null
  return createPortal(children, host)
}
