import { useEffect, useRef, useState } from 'react'
import { CheckIcon, LinkIcon, ShareIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { readJson } from './db-client.ts'
import { mintSharePin, shareClipboardText, type ShareResourceStats } from '../share-resources.ts'

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

function pinStorageKey(token: string) {
  return `fsdb.share.pin:${token}`
}

function rememberedPin(token: string) {
  if (!token) return ''
  try {
    return localStorage.getItem(pinStorageKey(token)) ?? ''
  } catch {
    return ''
  }
}

function rememberPin(token: string, pin: string) {
  try {
    if (pin) localStorage.setItem(pinStorageKey(token), pin)
    else localStorage.removeItem(pinStorageKey(token))
  } catch {
    /* ignore */
  }
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
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const params = new URLSearchParams({
    kind: target.kind,
    collection: target.collection,
    viewId: target.viewId ?? '',
    recordId: target.recordId ?? '',
  })

  useEffect(() => {
    let gone = false
    void readJson<SharePayload>(`/api/db/shares?${params}`).then((data) => {
      if (gone) return
      applyPayload(data)
    }).catch(() => {
      if (!gone) setShare(null)
    })
    return () => {
      gone = true
    }
  }, [target.kind, target.collection, target.viewId, target.recordId])

  function applyPayload(data: SharePayload, nextPin?: string) {
    setShare(data.share)
    if (data.resources) setResources(data.resources)
    const locked = Boolean(data.share?.hasPassword)
    setUsePassword(locked)
    if (!data.share) {
      setPin('')
      return
    }
    const remembered = nextPin ?? rememberedPin(data.share.token)
    if (locked) {
      setPin(remembered)
      if (nextPin) rememberPin(data.share.token, nextPin)
    } else {
      setPin('')
      rememberPin(data.share.token, '')
    }
  }

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
      applyPayload(data, typeof patch.password === 'string' && patch.password ? patch.password : undefined)
      if (patch.enabled === false && data.share == null && share) rememberPin(share.token, '')
      window.dispatchEvent(new Event('fsdb:shares-change'))
      return data.share
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function copyShare() {
    setError('')
    let live = share
    let livePin = pin
    if (!live) {
      live = await publish({})
    } else if ((usePassword || live.hasPassword) && pin.length === 6 && pin !== rememberedPin(live.token)) {
      live = (await publish({ password: pin })) ?? live
      livePin = pin
    }
    if (!live) return
    const locked = usePassword || live.hasPassword
    if (locked && !livePin) {
      setError('密码已设置。换一组后即可连同链接一起复制。')
      return
    }
    try {
      await navigator.clipboard.writeText(shareClipboardText(live.url, locked ? livePin : ''))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('无法复制')
    }
  }

  function togglePassword(on: boolean) {
    setUsePassword(on)
    if (!on) {
      setPin('')
      if (share) {
        rememberPin(share.token, '')
        void publish({ password: '' })
      }
      return
    }
    const next = mintSharePin()
    setPin(next)
    void publish({ password: next }).then((live) => {
      if (live) rememberPin(live.token, next)
    })
  }

  const copyLabel = usePassword && pin ? '复制链接和密码' : '复制链接'
  const copyReady = !usePassword || Boolean(pin)

  return (
    <div className="fsdb-share-panel" role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <div className="fsdb-share-head">
        <strong>分享</strong>
        <p>{usePassword ? '复制时会带上链接和密码，对方打开再输入即可。' : '有链接的人可以只读查看这一份内容。'}</p>
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
          onClick={() => void copyShare()}
        >
          {copied ? '已复制' : '生成并复制链接'}
        </button>
      ) : (
        <>
          <div className="fsdb-share-link">
            <LinkIcon aria-hidden className="size-4" />
            <input readOnly value={share.url} data-testid="fsdb-share-url" onFocus={(event) => event.currentTarget.select()} />
            <button
              type="button"
              className="fsdb-share-copy"
              disabled={busy || !copyReady}
              title={copyReady ? copyLabel : '换一组密码后即可复制'}
              data-testid="fsdb-share-copy"
              onClick={() => void copyShare()}
            >
              {copied ? <CheckIcon aria-hidden className="size-4" /> : copyLabel}
            </button>
          </div>
          <label className="fsdb-share-switch">
            <span>
              <strong>密码保护</strong>
              <em>打开后自动生成 6 位密码，复制链接时一并带上</em>
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
                placeholder={share.hasPassword && !pin ? '已设置，换一组即可复制' : '6 位密码'}
                data-testid="fsdb-share-password"
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '').slice(0, 6)
                  setPin(next)
                  if (share && next.length === 6) rememberPin(share.token, next)
                }}
                onBlur={() => {
                  if (pin.length === 6) void publish({ password: pin })
                }}
              />
              <button
                type="button"
                className="fsdb-share-copy"
                disabled={busy}
                data-testid="fsdb-share-rotate-pin"
                onClick={() => togglePassword(true)}
              >
                换一组
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
