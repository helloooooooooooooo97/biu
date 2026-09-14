import { useEffect, useRef, useState } from 'react'
import { CheckIcon, LinkIcon, ShareIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { readJson } from './db-client.ts'

export type ShareKind = 'view' | 'record'

export type ShareTarget = {
  kind: ShareKind
  collection: string
  viewId?: string
  recordId?: string
  title: string
}

type ShareInfo = {
  token: string
  url: string
  hasPassword: boolean
}

export function ShareButton({ target }: { target: ShareTarget | null }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  if (!target) return null
  return (
    <div className="fsdb-share-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`chat-view-header-expand${open ? ' is-active' : ''}`}
        title="分享"
        aria-label="分享"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="fsdb-share-toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ShareIcon aria-hidden className="size-4" />
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={wrapRef}>
          <SharePanel target={target} />
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}

function SharePanel({ target }: { target: ShareTarget }) {
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [password, setPassword] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams({
      kind: target.kind,
      collection: target.collection,
      viewId: target.viewId ?? '',
      recordId: target.recordId ?? '',
    })
    void readJson<{ share: ShareInfo | null }>(`/api/db/shares?${params}`).then((data) => {
      setShare(data.share)
      setUsePassword(Boolean(data.share?.hasPassword))
    }).catch(() => setShare(null))
  }, [target.kind, target.collection, target.viewId, target.recordId])

  async function publish(patch: { password?: string | null; enabled?: boolean }) {
    setBusy(true)
    setError('')
    try {
      const data = await readJson<{ share: ShareInfo | null }>('/api/db/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: target.kind,
          collection: target.collection,
          viewId: target.viewId ?? '',
          recordId: target.recordId ?? '',
          ...patch,
        }),
      })
      setShare(data.share)
      if (patch.enabled === false) setPassword('')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!share?.url) return
    try {
      await navigator.clipboard.writeText(share.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('无法复制链接')
    }
  }

  return (
    <div className="fsdb-share-panel" role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <div className="fsdb-share-head">
        <strong>分享到网上</strong>
        <p>任何有链接的人都可以查看这份内容。只读，看不到你没分享的东西。</p>
      </div>
      {!share ? (
        <button
          type="button"
          className="fsdb-share-publish"
          disabled={busy}
          data-testid="fsdb-share-enable"
          onClick={() => void publish({})}
        >
          开启分享
        </button>
      ) : (
        <>
          <div className="fsdb-share-link">
            <LinkIcon aria-hidden className="size-4" />
            <input readOnly value={share.url} data-testid="fsdb-share-url" />
            <button type="button" className="fsdb-share-copy" data-testid="fsdb-share-copy" onClick={() => void copyLink()}>
              {copied ? <CheckIcon aria-hidden className="size-4" /> : '复制'}
            </button>
          </div>
          <label className="fsdb-share-check">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(event) => {
                const on = event.target.checked
                setUsePassword(on)
                if (!on) void publish({ password: '' })
              }}
            />
            密码保护
          </label>
          {usePassword ? (
            <div className="fsdb-share-password">
              <input
                type="password"
                placeholder={share.hasPassword ? '已设置密码，输入新密码可更换' : '设置密码'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="fsdb-share-password"
              />
              <button
                type="button"
                disabled={busy || !password}
                onClick={() => void publish({ password })}
              >
                保存
              </button>
            </div>
          ) : null}
          <p className="fsdb-share-perm">权限：可以查看（只读）· 可以拷贝</p>
          <button
            type="button"
            className="fsdb-share-stop"
            disabled={busy}
            data-testid="fsdb-share-stop"
            onClick={() => void publish({ enabled: false })}
          >
            停止分享
          </button>
        </>
      )}
      {error ? <p className="fsdb-share-error">{error}</p> : null}
    </div>
  )
}
