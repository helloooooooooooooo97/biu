import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowPathIcon, CheckIcon, LinkIcon, ShareIcon, UserIcon, UsersIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { listCollection, readJson } from './db-client.ts'
import { mintSharePin, shareClipboardText, type ShareResourceStats } from '../share-resources.ts'
import { builtinMemberViews, isBuiltinAllViewId, parseBuiltinScopeViewId, scopedCollectionName } from '../catalog-views.ts'
import { effectiveDataScope, grantAudienceKind, recordMatchesGrantedView } from '../view-access.ts'
import type { DbRecord } from '@biu/type-file-system'

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

function WorkspaceAccess({
  collection,
  recordId = '',
  viewId = '',
}: {
  collection: string
  recordId?: string
  viewId?: string
}) {
  const [email, setEmail] = useState('')
  const [scope, setScope] = useState<'personal' | 'workspace' | 'shared'>('personal')
  const [ownerId, setOwnerId] = useState('')
  const [people, setPeople] = useState<Array<{
    id: string
    name: string
    email: string
    role: string
    memberKind: 'member' | 'external' | 'guest'
  }>>([])
  const [groups, setGroups] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [memberViews, setMemberViews] = useState<Array<{ id: string; name: string; role?: string }>>([])
  const [availableMemberViews, setAvailableMemberViews] = useState<Array<{ id: string; name: string; filters?: Record<string, unknown> }>>([])
  const [memberViewId, setMemberViewId] = useState('')
  const [workspaceMembers, setWorkspaceMembers] = useState<Array<{
    id: string
    name: string
    email: string
    role: string
  }>>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [role, setRole] = useState<'viewer' | 'editor' | 'manager'>('editor')
  const [viewGrants, setViewGrants] = useState<Array<{
    viewId: string
    subjectType: 'account' | 'member_view'
    subjectId: string
    role: string
    name: string
    email: string
    memberKind: 'member' | 'external' | 'guest'
  }>>([])
  const [record, setRecord] = useState<DbRecord | null>(null)
  const [dataViews, setDataViews] = useState<Array<{ id: string; name: string; filters?: Record<string, unknown> }>>([])
  const [tableLabel, setTableLabel] = useState('')
  const [guestUrl, setGuestUrl] = useState('')
  const [guestCopied, setGuestCopied] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await readJson<{
      scope?: 'personal' | 'workspace' | 'shared'
      ownerId?: string
      people?: Array<{
        id: string
        name: string
        email: string
        role: string
        memberKind: 'member' | 'external' | 'guest'
      }>
      groups?: Array<{ id: string; name: string; role: string }>
      memberViews?: Array<{ id: string; role: string }>
      viewGrants?: Array<{
        viewId: string
        subjectType: 'account' | 'member_view'
        subjectId: string
        role: string
        name: string
        email: string
        memberKind: 'member' | 'external' | 'guest'
      }>
    }>(
      viewId
        ? `/api/account/access?collection=${encodeURIComponent(collection)}&viewId=${encodeURIComponent(viewId)}`
        : `/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`,
    )
    setScope(data.scope ?? 'personal')
    setOwnerId(data.ownerId ?? '')
    setPeople(data.people ?? [])
    setGroups(data.groups ?? [])
    setMemberViews((data.memberViews ?? []).map((item) => ({
      ...item,
      name: availableMemberViews.find((view) => view.id === item.id)?.name ?? item.id,
    })))
    setViewGrants(data.viewGrants ?? [])
  }

  useEffect(() => {
    void load().catch(() => setPeople([]))
    void listCollection({
      path: '/views',
      limit: 200,
      filters: { tablePath: '/workspace-members' },
      columns: ['title', 'tablePath', 'viewId', 'filters'],
    })
      .then((page) => {
        const rows = page.items.flatMap((row) => {
          const id = String(row.viewId ?? '').trim()
          if (!id) return []
          let filters: Record<string, unknown> | undefined
          try {
            const parsed = JSON.parse(String(row.filters ?? '{}'))
            filters = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
          } catch {
            filters = undefined
          }
          return [{ id, name: String(row.title ?? id), filters }]
        })
        setAvailableMemberViews(rows)
        setMemberViews((current) => current.map((item) => ({
          ...item,
          name: rows.find((view) => view.id === item.id)?.name ?? item.name,
        })))
        setMemberViewId((current) => current || rows[0]?.id || '')
      })
      .catch(() => setAvailableMemberViews([]))
    void listCollection({
      path: '/workspace-members',
      limit: 200,
      columns: ['title', 'name', 'email', 'role', 'membershipKind'],
    })
      .then((page) => {
        setWorkspaceMembers(page.items.flatMap((row) => {
          const id = String(row.id ?? '').trim()
          const email = String(row.email ?? '').trim()
          if (!id || !email || row.membershipKind !== 'member') return []
          return [{
            id,
            email,
            name: String(row.name ?? row.title ?? email).trim() || email,
            role: String(row.role ?? ''),
          }]
        }))
      })
      .catch(() => setWorkspaceMembers([]))
    if (viewId || !recordId) {
      setRecord(null)
      setDataViews([])
      return
    }
    void listCollection({ path: collection, limit: 1, filters: { id: recordId } })
      .then((page) => setRecord(page.items[0] ?? null))
      .catch(() => setRecord(null))
    void listCollection({
      path: '/views',
      limit: 200,
      filters: { tablePath: collection },
      columns: ['title', 'table', 'viewId', 'filters'],
    })
      .then((page) => {
        const label = String(page.items[0]?.table ?? '').trim()
        if (label) setTableLabel(label)
        setDataViews(page.items.flatMap((row) => {
          const id = String(row.viewId ?? '').trim()
          if (!id) return []
          let filters: Record<string, unknown> | undefined
          try {
            const parsed = JSON.parse(String(row.filters ?? '{}'))
            filters = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
          } catch {
            filters = undefined
          }
          return [{ id, name: String(row.title ?? id), filters }]
        }))
      })
      .catch(() => setDataViews([]))
  }, [collection, recordId, viewId])

  function grant(input: { email?: string; memberViewId?: string }, collaboratorKind: 'internal' | 'external' = 'internal') {
    setError('')
    return readJson(`/api/account/access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        ...(viewId ? { viewId } : { recordId }),
        role,
        ...(input.email ? { collaboratorKind } : {}),
        ...input,
      }),
    })
      .then(() => {
        setEmail('')
        setMemberQuery('')
        setSelectedMemberId('')
        setMemberPickerOpen(false)
        window.dispatchEvent(new Event('fsdb:shares-change'))
        return load()
      })
      .catch((err) => setError(err instanceof Error ? err.message : '无法授权'))
  }

  async function revoke(subjectType: 'account' | 'group' | 'member_view', subjectId: string) {
    setError('')
    try {
      await readJson('/api/account/access', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ collection, ...(viewId ? { viewId } : { recordId }), subjectType, subjectId }),
      })
      window.dispatchEvent(new Event('fsdb:shares-change'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法移除协作者')
    }
  }

  async function createGuestLink() {
    setError('')
    try {
      const data = await readJson<{ path: string }>('/api/account/access/guest-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          ...(viewId ? { viewId } : { recordId }),
          role: role === 'editor' ? 'editor' : 'viewer',
          expiresInHours: 24,
        }),
      })
      const url = new URL(data.path, window.location.origin).toString()
      setGuestUrl(url)
      await navigator.clipboard.writeText(url)
      setGuestCopied(true)
      window.dispatchEvent(new Event('fsdb:shares-change'))
      window.setTimeout(() => setGuestCopied(false), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法生成临时访客链接')
    }
  }

  const memberViewFilters = [
    ...builtinMemberViews().map((view) => ({ id: view.id, filters: view.filters })),
    ...availableMemberViews,
  ]
  const inherited = !viewId && record
    ? viewGrants.flatMap((grant) => {
        if (!recordMatchesGrantedView(record, grant.viewId, dataViews, scope)) return []
        const audience = grant.subjectType === 'member_view'
          ? grantAudienceKind({ subjectType: 'member_view', subjectId: grant.subjectId }, memberViewFilters)
          : grant.memberKind === 'external' || grant.memberKind === 'guest' ? 'external' : 'internal'
        const parsed = parseBuiltinScopeViewId(grant.viewId)
        const source = dataViews.find((view) => view.id === grant.viewId)?.name
          || (parsed ? scopedCollectionName({ path: collection, label: tableLabel || collection.replace(/^\//, '') }, parsed.scope) : '')
          || (isBuiltinAllViewId(grant.viewId) ? `全部${tableLabel}` : grant.viewId)
        const name = grant.subjectType === 'member_view'
          ? availableMemberViews.find((view) => view.id === grant.subjectId)?.name ?? grant.name
          : grant.name
        return [{ ...grant, name, audience, source }]
      })
    : []
  const internalPeople = people.filter((row) => row.memberKind === 'member')
  const externalPeople = people.filter((row) => row.memberKind === 'external' || row.memberKind === 'guest')
  const inheritedInternal = inherited.filter((row) => row.audience === 'internal')
  const inheritedExternal = inherited.filter((row) => row.audience === 'external')
  const shownScope = !viewId && record
    ? effectiveDataScope(scope, record, viewGrants.map((grant) => ({
        viewId: grant.viewId,
        subjectType: grant.subjectType,
        subjectId: grant.subjectId,
        memberKind: grant.memberKind,
      })), dataViews, memberViewFilters)
    : scope
  const grantedAccountIds = new Set(people.map((row) => row.id))
  const normalizedMemberQuery = memberQuery.trim().toLowerCase()
  const matchingMembers = workspaceMembers
    .filter((row) => row.id !== ownerId && !grantedAccountIds.has(row.id))
    .filter((row) => !normalizedMemberQuery || `${row.name} ${row.email}`.toLowerCase().includes(normalizedMemberQuery))
    .slice(0, 8)
  const selectedMember = workspaceMembers.find((row) => row.id === selectedMemberId)

  const roleSelect = (
    <select value={role} aria-label="权限" onChange={(event) => setRole(event.target.value as typeof role)}>
      <option value="viewer">可查看</option>
      <option value="editor">可编辑</option>
      <option value="manager">可管理</option>
    </select>
  )

  return (
    <div className="fsdb-share-link-section" data-testid="fsdb-share-members">
      {viewId ? null : (
        <div className="fsdb-share-collab-summary">
          <span>数据归属</span>
          <strong className={`fsdb-share-scope is-${shownScope}`} data-testid="fsdb-share-scope"><ScopeMark scope={shownScope} /></strong>
        </div>
      )}

      <section className="fsdb-share-collab-section">
        <h3>内部协作者</h3>
        <ul className="fsdb-share-collaborators">
          {internalPeople.map((row) => (
            <li key={row.id}>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong>{row.email ? <em>{row.email}</em> : null}</span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
              <button type="button" className="fsdb-share-remove" title="移除协作者" aria-label={`移除 ${row.name}`} onClick={() => void revoke('account', row.id)}>
                <XMarkIcon aria-hidden className="size-4" />
              </button>
            </li>
          ))}
          {groups.map((row) => (
            <li key={`group:${row.id}`}>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>成员组</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
              <button type="button" className="fsdb-share-remove" title="移除成员组" aria-label={`移除 ${row.name}`} onClick={() => void revoke('group', row.id)}>
                <XMarkIcon aria-hidden className="size-4" />
              </button>
            </li>
          ))}
          {memberViews.map((row) => (
            <li key={`view:${row.id}`}>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>动态成员视图</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role ?? '')}</span>
              <button type="button" className="fsdb-share-remove" title="移除成员视图" aria-label={`移除 ${row.name}`} onClick={() => void revoke('member_view', row.id)}>
                <XMarkIcon aria-hidden className="size-4" />
              </button>
            </li>
          ))}
          {inheritedInternal.map((row) => (
            <li key={`inherited:${row.viewId}:${row.subjectType}:${row.subjectId}`}>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>继承自{row.source}</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
            </li>
          ))}
          {!internalPeople.length && !groups.length && !memberViews.length && !inheritedInternal.length ? <li className="is-empty">尚未添加内部协作者</li> : null}
        </ul>
        <div className="fsdb-share-invite-row">
          <div className="fsdb-share-member-picker">
            <input
              className="fsdb-share-link-field"
              type="search"
              role="combobox"
              aria-label="搜索空间成员"
              aria-expanded={memberPickerOpen}
              aria-controls="fsdb-share-member-options"
              autoComplete="off"
              value={memberQuery}
              placeholder="搜索空间成员"
              data-testid="fsdb-share-member-search"
              onFocus={() => setMemberPickerOpen(true)}
              onBlur={() => window.setTimeout(() => setMemberPickerOpen(false), 120)}
              onChange={(event) => {
                setMemberQuery(event.target.value)
                setSelectedMemberId('')
                setMemberPickerOpen(true)
              }}
            />
            {memberPickerOpen ? (
              <div className="fsdb-share-member-options" id="fsdb-share-member-options" role="listbox">
                {matchingMembers.map((row) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={row.id === selectedMemberId}
                    key={row.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedMemberId(row.id)
                      setMemberQuery(row.name)
                      setMemberPickerOpen(false)
                    }}
                  >
                    <span>{row.name}</span>
                    <em>{row.email}</em>
                  </button>
                ))}
                {!matchingMembers.length ? <p>没有可添加的空间成员</p> : null}
              </div>
            ) : null}
          </div>
          {roleSelect}
          <button type="button" className="fsdb-share-publish" disabled={!selectedMember} data-testid="fsdb-share-member-add" onClick={() => {
            if (selectedMember) void grant({ email: selectedMember.email }, 'internal')
          }}>添加</button>
        </div>
        {availableMemberViews.length ? (
          <details className="fsdb-share-advanced" data-testid="fsdb-share-member-view">
            <summary>按成员视图批量授权</summary>
            <div className="fsdb-share-link-row">
              <select value={memberViewId} aria-label="成员视图" onChange={(event) => setMemberViewId(event.target.value)}>
                {availableMemberViews.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <button type="button" className="fsdb-share-publish" disabled={!memberViewId} onClick={() => void grant({ memberViewId })}>授权</button>
            </div>
          </details>
        ) : null}
      </section>

      <section className="fsdb-share-collab-section is-external">
        <h3>外部协作者</h3>
        <ul className="fsdb-share-collaborators">
          {externalPeople.map((row) => (
            <li key={row.id}>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong>{row.email ? <em>{row.email}</em> : null}</span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
              <button type="button" className="fsdb-share-remove" title="移除协作者" aria-label={`移除 ${row.name}`} onClick={() => void revoke('account', row.id)}>
                <XMarkIcon aria-hidden className="size-4" />
              </button>
            </li>
          ))}
          {inheritedExternal.map((row) => (
            <li key={`inherited:${row.viewId}:${row.subjectType}:${row.subjectId}`}>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>继承自{row.source}</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
            </li>
          ))}
          {!externalPeople.length && !inheritedExternal.length ? <li className="is-empty">尚未添加外部协作者</li> : null}
        </ul>
        <div className="fsdb-share-invite-row">
          <input
            className="fsdb-share-link-field"
            type="email"
            value={email}
            placeholder="输入外部账号邮箱"
            data-testid="fsdb-share-member-email"
            onChange={(event) => setEmail(event.target.value)}
          />
          {roleSelect}
          <button type="button" className="fsdb-share-publish" disabled={!email.trim()} onClick={() => void grant({ email: email.trim() }, 'external')}>添加</button>
        </div>
        <div className="fsdb-share-guest-row" data-testid="fsdb-share-guest">
          <span><strong>临时访客</strong><em>{guestUrl ? '链接有效期 24 小时' : viewId ? '无需注册，仅可访问此视图' : '无需注册，仅可访问此内容'}</em></span>
          <button type="button" onClick={() => void createGuestLink()}>{guestCopied ? '已复制' : guestUrl ? '重新生成' : '生成链接'}</button>
        </div>
      </section>
      {error ? <p className="fsdb-share-error is-inline">{error}</p> : null}
    </div>
  )
}

function roleLabel(role: string) {
  if (role === 'owner') return '创建者'
  if (role === 'manager') return '可管理'
  if (role === 'viewer') return '可查看'
  return '可编辑'
}

function viewRows(items: DbRecord[]) {
  return items.flatMap((row) => {
    const id = String(row.viewId ?? '').trim()
    if (!id) return []
    let filters: Record<string, unknown> | undefined
    try {
      const parsed = JSON.parse(String(row.filters ?? '{}'))
      filters = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
    } catch {
      filters = undefined
    }
    return [{ id, name: String(row.title ?? id), filters }]
  })
}

function scopeText(scope: string) {
  if (scope === 'shared') return '共享'
  if (scope === 'workspace') return '空间'
  return '私人'
}

function ScopeMark({ scope }: { scope: string }) {
  const text = scope === '私人' || scope === '空间' || scope === '共享' ? scope : scopeText(scope)
  const icon = text === '空间'
    ? <UsersIcon aria-hidden className="size-[14px]" />
    : text === '共享'
      ? <ShareIcon aria-hidden className="size-[14px]" />
      : <UserIcon aria-hidden className="size-[14px]" />
  return <>{icon}{text}</>
}

/** 分享属性标签。归属看条目自己的协作者；点开后看直接授权和从视图继承来的权限。 */
export function ShareScopeDetail({
  collection,
  recordId,
  label,
  tableLabel = '',
}: {
  collection: string
  recordId: string
  label: string
  tableLabel?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const [scope, setScope] = useState(label === '共享' ? 'shared' : label === '空间' ? 'workspace' : 'personal')
  const [direct, setDirect] = useState<Array<{ id: string; name: string; role: string; note: string }>>([])
  const [chain, setChain] = useState<Array<{ id: string; title: string; detail: string; result: string }>>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const [access, recordPage, viewPage, memberViewPage] = await Promise.all([
        readJson<{
          scope?: 'personal' | 'workspace' | 'shared'
          people?: Array<{ id: string; name: string; role: string; memberKind: string }>
          groups?: Array<{ id: string; name: string; role: string }>
          memberViews?: Array<{ id: string; role: string }>
          viewGrants?: Array<{
            viewId: string
            subjectType: 'account' | 'member_view'
            subjectId: string
            role: string
            name: string
            memberKind: string
          }>
        }>(`/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`),
        listCollection({ path: collection, limit: 1, filters: { id: recordId } }),
        listCollection({ path: '/views', limit: 200, filters: { tablePath: collection }, columns: ['title', 'tablePath', 'viewId', 'filters'] }),
        listCollection({ path: '/views', limit: 200, filters: { tablePath: '/workspace-members' }, columns: ['title', 'tablePath', 'viewId', 'filters'] }),
      ])
      if (cancelled) return
      const record = recordPage.items[0] ?? null
      const dataViews = viewRows(viewPage.items)
      const memberViews = [
        ...builtinMemberViews().map((view) => ({ id: view.id, name: view.name, filters: view.filters })),
        ...viewRows(memberViewPage.items),
      ]
      const stored = access.scope ?? 'personal'
      setScope(effectiveDataScope(
        stored,
        record ?? { id: recordId },
        (access.viewGrants ?? []).map((grant) => ({
          viewId: grant.viewId,
          subjectType: grant.subjectType,
          subjectId: grant.subjectId,
          memberKind: grant.memberKind,
        })),
        dataViews,
        memberViews,
      ))
      setDirect([
        ...(access.people ?? []).map((row) => ({ id: `account:${row.id}`, name: row.name, role: row.role, note: row.memberKind === 'member' ? '空间成员' : '外部' })),
        ...(access.groups ?? []).map((row) => ({ id: `group:${row.id}`, name: row.name, role: row.role, note: '成员组' })),
        ...(access.memberViews ?? []).map((row) => ({
          id: `view:${row.id}`,
          name: memberViews.find((view) => view.id === row.id)?.name ?? row.id,
          role: row.role,
          note: '成员视图',
        })),
      ])
      const matched = record ? (access.viewGrants ?? []).flatMap((grant) => {
        if (!recordMatchesGrantedView(record, grant.viewId, dataViews, stored)) return []
        const parsed = parseBuiltinScopeViewId(grant.viewId)
        const source = dataViews.find((view) => view.id === grant.viewId)?.name
          || (parsed ? scopedCollectionName({ path: collection, label: tableLabel || collection.replace(/^\//, '') }, parsed.scope) : '')
          || (isBuiltinAllViewId(grant.viewId) ? `全部${tableLabel}` : grant.viewId)
        const name = grant.subjectType === 'member_view'
          ? memberViews.find((view) => view.id === grant.subjectId)?.name ?? grant.name
          : grant.name
        const external = grant.subjectType === 'account'
          ? grant.memberKind === 'external' || grant.memberKind === 'guest'
          : memberViews.find((view) => view.id === grant.subjectId)?.filters?.membershipKind === 'external'
            || memberViews.find((view) => view.id === grant.subjectId)?.filters?.membershipKind === 'guest'
        return [{ id: `${grant.viewId}:${grant.subjectType}:${grant.subjectId}`, name, role: grant.role, source, external }]
      }) : []
      setChain([
        {
          id: 'stored',
          title: '这条内容自己的协作者',
          detail: stored === 'shared' ? '已经邀请了外部协作者' : stored === 'workspace' ? '已经有空间成员' : '只有创建者',
          result: scopeText(stored),
        },
        ...matched.map((row) => ({
          id: row.id,
          title: `视图「${row.source}」`,
          detail: `${row.name} ${roleLabel(row.role)}`,
          result: row.external ? '共享' : '空间',
        })),
      ])
      setError('')
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : '无法读取权限')
    })
    return () => {
      cancelled = true
    }
  }, [open, collection, recordId, tableLabel])

  return (
    <div className="fsdb-scope-detail" ref={wrapRef}>
      <button
        type="button"
        className={`fsdb-scope-tag is-${scope}`}
        aria-label={`${label || scopeText(scope)}的权限详情`}
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          setBox({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 336) })
          setOpen((prev) => !prev)
        }}
      >
        <ScopeMark scope={label || scope} />
      </button>
      {open && box ? createPortal(
        <HeadlessDismiss
          onDismiss={() => setOpen(false)}
          inside={(node) => Boolean(wrapRef.current?.contains(node) || panelRef.current?.contains(node))}
        >
          <div ref={panelRef} className="fsdb-scope-panel" role="dialog" aria-label="数据归属链路" style={{ top: box.top, left: box.left }}>
            <div className="fsdb-share-collab-summary">
              <span>数据归属</span>
              <strong className={`fsdb-share-scope is-${scope}`}><ScopeMark scope={scope} /></strong>
            </div>
            <ol className="fsdb-scope-chain">
              {chain.map((step, index) => (
                <li key={step.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <em>{step.detail}</em>
                  </div>
                  <b><ScopeMark scope={step.result} /></b>
                </li>
              ))}
              <li className="is-result">
                <span>{chain.length + 1}</span>
                <div><strong>结果</strong><em>取上面最宽的一档</em></div>
                <b><ScopeMark scope={scope} /></b>
              </li>
            </ol>
            {direct.length ? (
              <section>
                <h3>直接授权</h3>
                <ul>
                  {direct.map((row) => (
                    <li key={row.id}><strong>{row.name}</strong><em>{row.note}</em><span>{roleLabel(row.role)}</span></li>
                  ))}
                </ul>
              </section>
            ) : null}
            {error ? <p className="fsdb-share-error is-inline">{error}</p> : null}
          </div>
        </HeadlessDismiss>,
        document.body,
      ) : null}
    </div>
  )
}

export function SharePanel({ target, embedded = false }: { target: ShareTarget; embedded?: boolean }) {
  const [tab, setTab] = useState<'public' | 'collaboration'>('public')
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
      <div className="fsdb-share-tabs" role="tablist" aria-label="分享方式">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'public'}
          className={tab === 'public' ? 'is-on' : ''}
          data-testid="fsdb-share-public-tab"
          onClick={() => setTab('public')}
        >
          公开分享
        </button>
        {(target.kind === 'record' && target.recordId) || (target.kind === 'view' && target.viewId) ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'collaboration'}
            className={tab === 'collaboration' ? 'is-on' : ''}
            data-testid="fsdb-share-collaboration-tab"
            onClick={() => setTab('collaboration')}
          >
            邀请协作
          </button>
        ) : null}
      </div>
      {tab === 'collaboration' && ((target.kind === 'record' && target.recordId) || (target.kind === 'view' && target.viewId)) ? (
        <WorkspaceAccess collection={target.collection} recordId={target.recordId} viewId={target.kind === 'view' ? target.viewId : ''} />
      ) : null}
      {tab === 'public' ? <><section className="fsdb-share-link-section">
        {!share ? (
          <div className="fsdb-share-empty">
            <span>
              <p className="fsdb-share-empty-title">公开链接</p>
              <p className="fsdb-share-empty-copy">获得链接的人可以查看</p>
            </span>
            <button
              type="button"
              className="fsdb-share-publish"
              disabled={busy}
              data-testid="fsdb-share-enable"
              onClick={() => void copyShare()}
            >
              {busy ? '正在开启…' : copied ? '已复制' : '开启并复制'}
            </button>
          </div>
        ) : (
          <>
            <div className="fsdb-share-public-state">
              <span><i aria-hidden />公开链接已开启</span>
              <button
                type="button"
                disabled={busy}
                data-testid="fsdb-share-stop"
                onClick={() => void publish({ enabled: false })}
              >
                关闭
              </button>
            </div>
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
          <section className="fsdb-share-settings" aria-label="公开链接设置">
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>密码保护</strong>
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
        </>
      ) : null}
      </> : null}
      {error ? <p className="fsdb-share-error">{error}</p> : null}
    </div>
  )
}
