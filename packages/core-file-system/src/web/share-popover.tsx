import { useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, CheckIcon, LinkIcon, ShareIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { listCollection, readJson } from './db-client.ts'
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

export function ShareButton({
  target,
  buttonClassName = 'chat-view-header-expand',
}: {
  target: ShareTarget | null
  buttonClassName?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  if (!target) return null
  return (
    <div className="fsdb-share-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`${buttonClassName}${open ? ' is-active' : ''}`}
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

function WorkspaceAccess({ collection, recordId }: { collection: string; recordId: string }) {
  const [email, setEmail] = useState('')
  const [people, setPeople] = useState<Array<{ id: string; name: string; email: string; role: string }>>([])
  const [groups, setGroups] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([])
  const [memberViews, setMemberViews] = useState<Array<{ id: string; name: string; role?: string }>>([])
  const [availableMemberViews, setAvailableMemberViews] = useState<Array<{ id: string; name: string }>>([])
  const [groupId, setGroupId] = useState('')
  const [memberViewId, setMemberViewId] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor' | 'manager'>('editor')
  const [guestUrl, setGuestUrl] = useState('')
  const [guestCopied, setGuestCopied] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await readJson<{
      people?: Array<{ id: string; name: string; email: string; role: string }>
      groups?: Array<{ id: string; name: string; role: string }>
      memberViews?: Array<{ id: string; role: string }>
    }>(
      `/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`,
    )
    setPeople(data.people ?? [])
    setGroups(data.groups ?? [])
    setMemberViews((data.memberViews ?? []).map((item) => ({
      ...item,
      name: availableMemberViews.find((view) => view.id === item.id)?.name ?? item.id,
    })))
  }

  useEffect(() => {
    void load().catch(() => setPeople([]))
    void readJson<{ workspaceId?: string }>('/api/account/active')
      .then((active) => active.workspaceId
        ? readJson<{ groups?: Array<{ id: string; name: string }> }>(`/api/account/workspaces/${active.workspaceId}/groups`)
        : { groups: [] })
      .then((data) => {
        const rows = data.groups ?? []
        setAvailableGroups(rows)
        setGroupId((current) => current || rows[0]?.id || '')
      })
      .catch(() => setAvailableGroups([]))
    void listCollection({
      path: '/views',
      limit: 200,
      filters: { tablePath: '/workspace-members' },
      columns: ['title', 'tablePath', 'viewId'],
    })
      .then((page) => {
        const rows = page.items.flatMap((row) => {
          const id = String(row.viewId ?? '').trim()
          return id ? [{ id, name: String(row.title ?? id) }] : []
        })
        setAvailableMemberViews(rows)
        setMemberViews((current) => current.map((item) => ({
          ...item,
          name: rows.find((view) => view.id === item.id)?.name ?? item.name,
        })))
        setMemberViewId((current) => current || rows[0]?.id || '')
      })
      .catch(() => setAvailableMemberViews([]))
  }, [collection, recordId])

  function grant(input: { email?: string; groupId?: string; memberViewId?: string }) {
    setError('')
    return readJson(`/api/account/access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection, recordId, role, ...input }),
    })
      .then(() => {
        setEmail('')
        return load()
      })
      .catch((err) => setError(err instanceof Error ? err.message : '无法授权'))
  }

  async function createGuestLink() {
    setError('')
    try {
      const data = await readJson<{ path: string }>('/api/account/access/guest-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          role: role === 'editor' ? 'editor' : 'viewer',
          expiresInHours: 24,
        }),
      })
      const url = new URL(data.path, window.location.origin).toString()
      setGuestUrl(url)
      await navigator.clipboard.writeText(url)
      setGuestCopied(true)
      window.setTimeout(() => setGuestCopied(false), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法生成临时访客链接')
    }
  }

  return (
    <form
      className="fsdb-share-link-section"
      data-testid="fsdb-share-members"
      onSubmit={(event) => {
        event.preventDefault()
        if (email.trim()) void grant({ email: email.trim() })
      }}
    >
      <p className="fsdb-share-empty-title">工作区成员</p>
      <ul>
        {people.length ? people.map((row) => (
          <li key={row.id}>{row.name}{row.email ? ` · ${row.email}` : ''} · {roleLabel(row.role)}</li>
        )) : <li>还没有单独授权。新建的文档只有创建者能看，旧文档在授权前工作区成员都能看。</li>}
        {groups.map((row) => <li key={`group:${row.id}`}>{row.name} · 成员组 · {roleLabel(row.role)}</li>)}
        {memberViews.map((row) => <li key={`view:${row.id}`}>{row.name} · 动态成员视图 · {roleLabel(row.role ?? '')}</li>)}
      </ul>
      <div className="fsdb-share-link-row">
        <input
          className="fsdb-share-link-field"
          type="email"
          value={email}
          placeholder="成员的登录邮箱"
          data-testid="fsdb-share-member-email"
          onChange={(event) => setEmail(event.target.value)}
        />
        <select value={role} aria-label="权限" onChange={(event) => setRole(event.target.value as typeof role)}>
          <option value="viewer">可查看</option>
          <option value="editor">可编辑</option>
          <option value="manager">可管理</option>
        </select>
        <button type="submit" className="fsdb-share-publish" data-testid="fsdb-share-member-add">添加</button>
      </div>
      {availableGroups.length ? (
        <div className="fsdb-share-link-row">
          <select value={groupId} aria-label="成员组" onChange={(event) => setGroupId(event.target.value)}>
            {availableGroups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <button
            type="button"
            className="fsdb-share-publish"
            disabled={!groupId}
            onClick={() => void grant({ groupId })}
          >
            添加成员组
          </button>
        </div>
      ) : null}
      {availableMemberViews.length ? (
        <div className="fsdb-share-link-row" data-testid="fsdb-share-member-view">
          <select value={memberViewId} aria-label="成员视图" onChange={(event) => setMemberViewId(event.target.value)}>
            {availableMemberViews.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <button
            type="button"
            className="fsdb-share-publish"
            disabled={!memberViewId}
            onClick={() => void grant({ memberViewId })}
          >
            按视图动态授权
          </button>
        </div>
      ) : null}
      {availableMemberViews.length ? <p>满足该成员视图条件的账号会自动获得权限；视图条件变化会立即生效。</p> : null}
      <div className="fsdb-share-link-row" data-testid="fsdb-share-guest">
        {guestUrl ? (
          <input
            className="fsdb-share-link-field"
            readOnly
            aria-label="临时访客链接"
            value={guestUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : <p>临时访客无需账号，仅可访问这条内容，24 小时后自动失效。</p>}
        <button type="button" className="fsdb-share-publish" onClick={() => void createGuestLink()}>
          {guestCopied ? '已复制' : guestUrl ? '重新生成并复制' : '生成临时访客链接'}
        </button>
      </div>
      {error ? <p>{error}</p> : null}
    </form>
  )
}

function roleLabel(role: string) {
  if (role === 'owner') return '创建者'
  if (role === 'manager') return '可管理'
  if (role === 'viewer') return '可查看'
  return '可编辑'
}

export function SharePanel({ target, embedded = false }: { target: ShareTarget; embedded?: boolean }) {
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
    <div className={`fsdb-share-panel${embedded ? ' is-embedded' : ''}`} role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <header className="fsdb-share-head">
        <strong>分享</strong>
        <p>文档默认只有你自己能看。把工作区里的成员加进来，他们才能打开。</p>
      </header>
      {target.kind === 'record' && target.recordId ? <WorkspaceAccess collection={target.collection} recordId={target.recordId} /> : null}
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
