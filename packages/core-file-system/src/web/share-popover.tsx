import { useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, CheckIcon, LinkIcon, ShareIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { readJson } from './db-client.ts'
import { mintSharePin, shareClipboardText, type ShareResourceStats } from '@biu/host-share/resources'

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

function shareStatsLine(resources: ShareResourceStats) {
  const parts = [
    resources.pages ? `${resources.pages} 个页面` : '',
    resources.plugins ? `${resources.plugins} 个插件` : '',
    resources.collections ? `${resources.collections} 个合集` : '',
  ].filter(Boolean)
  return parts.length ? `包含：${parts.join(' · ')}` : ''
}

function ShareToggle({
  on,
  disabled,
  label,
  testId,
  onChange,
}: {
  on: boolean
  disabled?: boolean
  label: string
  testId: string
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`fsdb-share-toggle${on ? ' is-on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  )
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

  function applyPayload(data: SharePayload, nextPin?: string, flagsOnly = false) {
    if (data.share === undefined) return
    if (!data.share) {
      setShare(null)
      setUsePassword(false)
      setPin('')
      return
    }
    setShare(data.share)
    if (data.resources) setResources(data.resources)
    if (flagsOnly) return
    const locked = Boolean(data.share.hasPassword)
    setUsePassword(locked)
    if (locked) {
      const remembered = nextPin ?? rememberedPin(data.share.token)
      setPin(remembered)
      if (nextPin) rememberPin(data.share.token, nextPin)
    } else {
      setPin('')
      rememberPin(data.share.token, '')
    }
  }

  async function publish(
    patch: {
      password?: string | null
      enabled?: boolean
      sharePlugins?: boolean
      allowCopy?: boolean
    },
    opts: { quiet?: boolean; pin?: string; flagsOnly?: boolean } = {},
  ) {
    if (!opts.quiet) {
      setBusy(true)
      setError('')
    }
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
      applyPayload(data, opts.pin, opts.flagsOnly)
      if (patch.enabled === false && data.share == null && share) rememberPin(share.token, '')
      window.dispatchEvent(new Event('fsdb:shares-change'))
      return data.share
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      return null
    } finally {
      if (!opts.quiet) setBusy(false)
    }
  }

  async function copyShare() {
    setError('')
    let live = share
    let livePin = pin
    if (!live) {
      live = await publish({})
    } else if ((usePassword || live.hasPassword) && pin.length === 6 && pin !== rememberedPin(live.token)) {
      live = (await publish({ password: pin }, { quiet: true, pin })) ?? live
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
      setError('无法复制，请重试')
    }
  }

  function togglePassword(on: boolean) {
    setUsePassword(on)
    if (!on) {
      setPin('')
      if (share) {
        rememberPin(share.token, '')
        void publish({ password: '' }, { quiet: true })
      }
      return
    }
    const next = mintSharePin()
    setPin(next)
    void publish({ password: next }, { quiet: true, pin: next }).then((live) => {
      if (live) rememberPin(live.token, next)
    })
  }

  const copyReady = !usePassword || Boolean(pin)
  const stats = shareStatsLine(resources)

  return (
    <div className="fsdb-share-panel" role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <header className="fsdb-share-head">
        <strong>分享</strong>
        <p>通过链接邀请他人查看此内容。</p>
      </header>
      <section className="fsdb-share-link-section">
        {!share ? (
          <div className="fsdb-share-empty">
            <p className="fsdb-share-empty-title">链接分享尚未开启</p>
            <p className="fsdb-share-empty-copy">开启后，任何获得链接的人都可以查看。</p>
            <button
              type="button"
              className="fsdb-share-publish"
              disabled={busy}
              data-testid="fsdb-share-enable"
              onClick={() => void copyShare()}
            >
              {busy ? '正在生成…' : copied ? '已生成并复制' : '生成并复制链接'}
            </button>
          </div>
        ) : (
          <>
            <div className="fsdb-share-link-row">
              <div className="fsdb-share-link-field">
                <LinkIcon aria-hidden className="size-4" />
                <input
                  readOnly
                  value={share.url}
                  aria-label="分享链接"
                  data-testid="fsdb-share-url"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
              <button
                type="button"
                className="fsdb-share-copy"
                disabled={busy || !copyReady}
                title={copyReady ? '复制链接' : '换一组密码后即可复制'}
                data-testid="fsdb-share-copy"
                onClick={() => void copyShare()}
              >
                {copied ? <CheckIcon aria-hidden className="size-4" /> : null}
                {copied ? '已复制' : '复制链接'}
              </button>
            </div>
            {usePassword ? <p className="fsdb-share-copy-note">复制时会同时包含链接和密码。</p> : null}
          </>
        )}
        {stats ? (
          <p className="fsdb-share-stats" data-testid="fsdb-share-resources">
            {stats}
          </p>
        ) : (
          <p className="fsdb-share-stats" data-testid="fsdb-share-resources" hidden />
        )}
      </section>
      {share ? (
        <>
          <section className="fsdb-share-settings">
            <h3>链接设置</h3>
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>密码保护</strong>
                <em>开启后自动生成 6 位密码</em>
              </span>
              <ShareToggle
                on={usePassword}
                label="密码保护"
                testId="fsdb-share-password-toggle"
                onChange={togglePassword}
              />
            </div>
            {usePassword ? (
              <div className="fsdb-share-pin">
                <span>
                  密码
                  <strong data-testid="fsdb-share-password">{pin || '······'}</strong>
                </span>
                <button type="button" data-testid="fsdb-share-rotate-pin" onClick={() => togglePassword(true)}>
                  <ArrowPathIcon aria-hidden className="size-4" />
                  换一组
                </button>
              </div>
            ) : (
              <div className="fsdb-share-pin is-collapsed" hidden />
            )}
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>分享插件</strong>
                <em>允许对方下载此内容使用的插件</em>
              </span>
              <ShareToggle
                on={share.sharePlugins}
                label="分享插件"
                testId="fsdb-share-plugins"
                onChange={(on) => {
                  setShare({ ...share, sharePlugins: on })
                  void publish({ sharePlugins: on }, { quiet: true, flagsOnly: true })
                }}
              />
            </div>
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>允许复制</strong>
                <em>允许对方复制或下载页面内容</em>
              </span>
              <ShareToggle
                on={share.allowCopy !== false}
                label="允许复制"
                testId="fsdb-share-allow-copy"
                onChange={(on) => {
                  setShare({ ...share, allowCopy: on })
                  void publish({ allowCopy: on }, { quiet: true, flagsOnly: true })
                }}
              />
            </div>
          </section>
          <footer className="fsdb-share-footer">
            <button
              type="button"
              className="fsdb-share-stop"
              disabled={busy}
              data-testid="fsdb-share-stop"
              onClick={() => void publish({ enabled: false })}
            >
              停止分享
            </button>
          </footer>
        </>
      ) : null}
      {error ? <p className="fsdb-share-error">{error}</p> : null}
    </div>
  )
}
