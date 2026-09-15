import { useEffect, useRef, useState } from 'react'
import { CheckIcon, LinkIcon, ShareIcon } from '@heroicons/react/24/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { readJson } from './db-client.ts'
import { mintSharePin, type ShareResourceStats } from '../share-resources.ts'

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
  sharePlugins: boolean
  allowCopy: boolean
}

type SharePayload = {
  share: ShareInfo | null
  resources?: ShareResourceStats
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
  const [resources, setResources] = useState<ShareResourceStats>({ pages: 0, plugins: 0, collections: 0, pluginIds: [] })
  const [pin, setPin] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [copied, setCopied] = useState<'link' | 'pin' | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const params = new URLSearchParams({
    kind: target.kind,
    collection: target.collection,
    viewId: target.viewId ?? '',
    recordId: target.recordId ?? '',
  })

  useEffect(() => {
    void readJson<SharePayload>(`/api/db/shares?${params}`).then((data) => {
      setShare(data.share)
      if (data.resources) setResources(data.resources)
      setUsePassword(Boolean(data.share?.hasPassword))
      if (!data.share?.hasPassword) setPin('')
    }).catch(() => setShare(null))
  }, [target.kind, target.collection, target.viewId, target.recordId])

  async function publish(patch: {
    password?: string | null
    enabled?: boolean
    sharePlugins?: boolean
    allowCopy?: boolean
  }) {
    setBusy(true)
    setError('')
    try {
      const data = await readJson<SharePayload>('/api/db/shares', {
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
      if (data.resources) setResources(data.resources)
      if (patch.enabled === false) {
        setPin('')
        setUsePassword(false)
      }
      window.dispatchEvent(new Event('fsdb:shares-change'))
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  async function copyText(text: string, kind: 'link' | 'pin') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(''), 1600)
    } catch {
      setError('无法复制')
    }
  }

  function togglePassword(on: boolean) {
    setUsePassword(on)
    if (!on) {
      setPin('')
      if (share) void publish({ password: '' })
      return
    }
    const next = mintSharePin()
    setPin(next)
    void publish({ password: next })
  }

  return (
    <div className="fsdb-share-panel" role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <div className="fsdb-share-head">
        <strong>分享</strong>
        <p>有链接的人可以只读查看这一份内容。</p>
      </div>
      <div className="fsdb-share-stats" data-testid="fsdb-share-resources">
        <span>页面 {resources.pages}</span>
        <span>插件 {resources.plugins}</span>
        <span>合集 {resources.collections}</span>
      </div>
      {!share ? (
        <button
          type="button"
          className="fsdb-share-publish"
          disabled={busy}
          data-testid="fsdb-share-enable"
          onClick={() => void publish({})}
        >
          生成链接
        </button>
      ) : (
        <>
          <div className="fsdb-share-link">
            <LinkIcon aria-hidden className="size-4" />
            <input readOnly value={share.url} data-testid="fsdb-share-url" onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className="fsdb-share-copy" data-testid="fsdb-share-copy" onClick={() => void copyText(share.url, 'link')}>
              {copied === 'link' ? <CheckIcon aria-hidden className="size-4" /> : '复制'}
            </button>
          </div>
          <label className="fsdb-share-switch">
            <span>
              <strong>密码保护</strong>
              <em>打开后自动填入 6 位密码</em>
            </span>
            <input
              type="checkbox"
              checked={usePassword}
              disabled={busy}
              data-testid="fsdb-share-password-toggle"
              onChange={(event) => togglePassword(event.target.checked)}
            />
          </label>
          {usePassword ? (
            <div className="fsdb-share-password">
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                placeholder={share.hasPassword && !pin ? '已设置，可换新密码' : '6 位密码'}
                data-testid="fsdb-share-password"
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                onBlur={() => {
                  if (pin.length === 6) void publish({ password: pin })
                }}
              />
              <button type="button" className="fsdb-share-copy" disabled={busy} onClick={() => togglePassword(true)}>
                换一换
              </button>
              <button type="button" className="fsdb-share-copy" disabled={!pin} onClick={() => void copyText(pin, 'pin')}>
                {copied === 'pin' ? <CheckIcon aria-hidden className="size-4" /> : '复制'}
              </button>
            </div>
          ) : null}
          <label className="fsdb-share-switch">
            <span>
              <strong>分享插件</strong>
              <em>把用到的插件源码交给对方下载</em>
            </span>
            <input
              type="checkbox"
              checked={share.sharePlugins}
              disabled={busy}
              data-testid="fsdb-share-plugins"
              onChange={(event) => void publish({ sharePlugins: event.target.checked })}
            />
          </label>
          <label className="fsdb-share-switch">
            <span>
              <strong>允许拷贝</strong>
              <em>对方可下载页面内容</em>
            </span>
            <input
              type="checkbox"
              checked={share.allowCopy !== false}
              disabled={busy}
              data-testid="fsdb-share-allow-copy"
              onChange={(event) => void publish({ allowCopy: event.target.checked })}
            />
          </label>
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
