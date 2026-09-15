import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeTransparentIcon,
  HashtagIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import { ShareOwnerCorner } from './share-owner-corner.tsx'

export { registerShareOwnerExtra } from './share-owner-corner.tsx'
import { parseSharePath, sharePublicPath, type ShareSnapshot } from '../share-snapshot.ts'
import { parsePageBanner } from '../page-banner.ts'
import { RecordDetail } from './record-detail.tsx'
import { contentToMarkdown, markdownFileName, recordToMarkdown, zipMarkdownPack } from './export-markdown.ts'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { CrumbTrail } from './crumb-trail.tsx'
import { buildCrumbs, type CrumbTarget } from './sidebar-nav.ts'
import { crumbRecordLabel, recordPreviewEmoji } from './sidebar-preview.ts'
import { PageBanner } from './page-banner.tsx'
import { TableGlyph } from './table-glyph.tsx'
import { applyShareQuery, loadShareQuery, saveShareQuery, shareQueryFromView, type ShareQueryState } from './share-query.ts'
import { collectQueryFields } from '../query-logic.ts'
import { ShareViewQueryBar } from './share-view-bar.tsx'
import { ShareCell, ShareListTable } from './share-table.tsx'
import { getPageWidth, persistPageWidth, subscribePageWidth } from './page-width.ts'
import { PagerSizeControl } from './pager-size.tsx'
import { normalizePageSize } from './saved-view.ts'

function passwordKey(token: string) {
  return `fsdb.share.pw:${token}`
}

const SHARE_THEME_KEY = 'biu.theme'

function readShareTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(SHARE_THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* ignore */
  }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function persistShareTheme(mode: 'light' | 'dark') {
  try {
    localStorage.setItem(SHARE_THEME_KEY, mode)
  } catch {
    /* ignore */
  }
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute('content', mode)
}

async function loadSnapshot(token: string, password = ''): Promise<ShareSnapshot | { needsPassword: true } | { error: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (password) headers['x-share-password'] = password
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
      method: password ? 'POST' : 'GET',
      headers,
      body: password ? JSON.stringify({ password }) : undefined,
    })
    const text = await res.text()
    let body: ShareSnapshot & { needsPassword?: boolean; error?: string }
    try {
      body = JSON.parse(text) as ShareSnapshot & { needsPassword?: boolean; error?: string }
    } catch {
      return { error: res.ok ? '分享页读不到数据' : `${res.status} ${res.statusText}` }
    }
    if (res.status === 401 || body.needsPassword) return { needsPassword: true }
    if (!res.ok) return { error: body.error || res.statusText }
    return body
  } catch (error) {
    return { error: String(error) }
  }
}

function rewriteAssetUrls(value: unknown, token: string, password: string): unknown {
  if (typeof value === 'string') {
    return value.replace(/\/api\/(?:db|page)\/file\//g, `/api/share/${encodeURIComponent(token)}/file/`)
  }
  if (Array.isArray(value)) return value.map((item) => rewriteAssetUrls(item, token, password))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = rewriteAssetUrls(item, token, password)
    return out
  }
  return value
}

function rewriteBanner(value: unknown, token: string, password: string) {
  return parsePageBanner(rewriteAssetUrls(value, token, password))
}

export function ShareRoot({
  chrome,
  chromeFor,
  loadPlugins,
}: {
  chrome?: CollectionChrome
  chromeFor?: (collection: string) => CollectionChrome | undefined
  loadPlugins?: (token: string, pluginIds: string[], password: string) => Promise<void>
} = {}) {
  const location = useLocation()
  const parsed = parseSharePath(location.pathname)
  if (!parsed) return null
  return (
    <SharePage
      token={parsed.token}
      recordId={parsed.recordId}
      chrome={chrome}
      chromeFor={chromeFor}
      loadPlugins={loadPlugins}
    />
  )
}

function downloadShareFile(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

function SharePage({
  token,
  recordId,
  chrome,
  chromeFor,
  loadPlugins,
}: {
  token: string
  recordId: string
  chrome?: CollectionChrome
  chromeFor?: (collection: string) => CollectionChrome | undefined
  loadPlugins?: (token: string, pluginIds: string[], password: string) => Promise<void>
}) {
  ensureFsdbStyle()
  const navigate = useNavigate()
  const [password, setPassword] = useState(() => {
    try {
      return sessionStorage.getItem(passwordKey(token)) ?? ''
    } catch {
      return ''
    }
  })
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [pluginsReady, setPluginsReady] = useState(false)
  const [pageWidth, setPageWidth] = useState(getPageWidth)
  const [theme, setTheme] = useState(readShareTheme)
  const [reload, setReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => subscribePageWidth(() => setPageWidth(getPageWidth())), [])
  const layoutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    if (reload) setRefreshing(true)
    void loadSnapshot(token, password).then((next) => {
      if (!alive) return
      setRefreshing(false)
      if ('needsPassword' in next) {
        setLocked(true)
        setSnapshot(null)
        return
      }
      if ('error' in next) {
        setError(next.error)
        setSnapshot(null)
        return
      }
      setLocked(false)
      setSnapshot(next)
      if (password) {
        try {
          sessionStorage.setItem(passwordKey(token), password)
        } catch {
          /* ignore */
        }
      }
    })
    return () => {
      alive = false
    }
  }, [token, password, reload])

  useEffect(() => {
    if (!snapshot) {
      setPluginsReady(false)
      return
    }
    if (!loadPlugins) {
      setPluginsReady(true)
      return
    }
    let alive = true
    setPluginsReady(false)
    void loadPlugins(token, snapshot.pluginIds ?? [], password).finally(() => {
      if (alive) setPluginsReady(true)
    })
    return () => {
      alive = false
    }
  }, [loadPlugins, password, snapshot, token])

  const [queryState, setQueryState] = useState<ShareQueryState | null>(null)
  useEffect(() => {
    if (!snapshot || snapshot.kind !== 'view') {
      setQueryState(null)
      return
    }
    setQueryState(loadShareQuery(token, shareQueryFromView(snapshot.view)))
  }, [snapshot, token])
  useEffect(() => {
    if (!queryState || snapshot?.kind !== 'view') return
    saveShareQuery(token, queryState)
  }, [queryState, snapshot, token])
  const [page, setPage] = useState(0)
  const pageSize = normalizePageSize(queryState?.pageSize)
  useEffect(() => {
    setPage(0)
  }, [token, pageSize, queryState?.q, queryState?.sorts, queryState?.filterTree])
  const queryFields = useMemo(
    () => collectQueryFields(queryState?.sorts, queryState?.filterTree, snapshot?.schema?.labelField ?? 'title'),
    [queryState?.filterTree, queryState?.sorts, snapshot?.schema?.labelField],
  )

  const selected = useMemo(() => {
    if (!snapshot) return null
    if (snapshot.kind === 'record') return snapshot.records[0] ?? null
    if (!recordId) return null
    return snapshot.records.find((row) => row.id === recordId) ?? null
  }, [snapshot, recordId])

  if (error) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <div className="fsdb-share-gate">
          <h1>无法打开</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (locked) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <form
          className="fsdb-dlg"
          data-testid="fsdb-share-gate"
          onSubmit={(event) => {
            event.preventDefault()
            setPassword(draft)
          }}
        >
          <div className="fsdb-dlg-title">这份内容已加锁</div>
          <p className="fsdb-dlg-body">输入密码后即可查看。只有这份被分享的内容可见。</p>
          <input
            className="fsdb-dlg-input"
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="密码"
            data-testid="fsdb-share-gate-password"
          />
          <div className="fsdb-dlg-actions">
            <button type="submit" className="fsdb-dlg-ok">查看</button>
          </div>
        </form>
      </div>
    )
  }

  if (!snapshot || !pluginsReady) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <p className="fsdb-empty">正在打开…</p>
      </div>
    )
  }

  const schema = snapshot.schema
  const live = snapshot
  const listed = snapshot.kind === 'view' && queryState
    ? applyShareQuery(snapshot.records, schema, queryState, snapshot.contents)
    : snapshot.records
  const total = listed.length
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  const safePage = Math.min(page, lastPage)
  const paged = snapshot.kind === 'view' ? listed.slice(safePage * pageSize, safePage * pageSize + pageSize) : listed
  const shown = selected ?? (snapshot.kind === 'record' ? snapshot.records[0] : null)
  const detailChrome = chromeFor?.(snapshot.collection) ?? chrome
  if (recordId && !shown) {
    return (
      <div className="fsdb-share-page" data-testid="fsdb-share-page">
        <div className="fsdb-share-gate">
          <h1>无法打开</h1>
          <p>这份分享里没有这条记录。</p>
        </div>
      </div>
    )
  }

  function downloadShare() {
    const files = live.records.map((row) => ({
      name: markdownFileName(row),
      text: recordToMarkdown(row, contentToMarkdown(live.contents[row.id])),
    }))
    if (files.length === 1) {
      downloadShareFile(new Blob([files[0]!.text], { type: 'text/markdown;charset=utf-8' }), files[0]!.name)
      return
    }
    downloadShareFile(zipMarkdownPack(files), 'share.zip')
  }

  function openShareTarget(target: CrumbTarget) {
    if (target.kind === 'record') {
      navigate(sharePublicPath(token, target.recordId))
      return
    }
    navigate(sharePublicPath(token))
  }

  const viewIndex = shown && snapshot.kind === 'view' ? listed.findIndex((row) => row.id === shown.id) : -1
  const viewNav = snapshot.kind === 'view' && listed.length > 1
  const tableLabel = snapshot.collectionLabel || snapshot.title
  const crumbs = snapshot.kind === 'view'
    ? buildCrumbs({
        collection: snapshot.collection,
        collectionLabel: tableLabel,
        tables: [{ path: snapshot.collection, label: tableLabel }],
        viewId: snapshot.viewId,
        viewName: snapshot.title,
        views: [{ id: snapshot.viewId, name: snapshot.title }],
        recordId: shown?.id,
        recordLabel: shown ? crumbRecordLabel(shown, schema.labelField) : undefined,
        records: snapshot.records.map((row) => ({
          id: row.id,
          label: crumbRecordLabel(row, schema.labelField),
          emoji: recordPreviewEmoji(row),
        })),
      })
    : []

  return (
    <div
      className={`fsdb-share-page fsdb-page${pageWidth === 'full' ? ' is-full-width' : ''}`}
      data-testid="fsdb-share-page"
    >
      <header className="chat-view-header">
        <div className="chat-view-header-left">
          {crumbs.length ? (
            <CrumbTrail
              crumbs={crumbs}
              canCreateView={false}
              canCreateRecord={false}
              collapseToLeaf
              onPick={openShareTarget}
            />
          ) : (
            <span className="chat-view-project-name">{snapshot.title}</span>
          )}
        </div>
        <div className="chat-view-header-right">
          <div className="fsdb-layout-wrap" ref={layoutRef}>
            <button
              type="button"
              className={`chat-view-header-expand${layoutOpen ? ' is-active' : ''}`}
              title="配置"
              aria-label="配置"
              aria-haspopup="menu"
              aria-expanded={layoutOpen}
              data-testid="fsdb-share-layout"
              onClick={() => setLayoutOpen((open) => !open)}
            >
              <AdjustmentsHorizontalIcon aria-hidden className="size-4" />
            </button>
            {layoutOpen ? (
              <HeadlessDismiss onDismiss={() => setLayoutOpen(false)} insideRef={layoutRef}>
                <div className="fsdb-layout-menu" role="menu" data-testid="fsdb-share-layout-menu">
                  <button
                    type="button"
                    role="menuitemradio"
                    className={`fsdb-layout-opt${pageWidth === 'max' ? ' is-active' : ''}`}
                    title="最大宽度"
                    aria-label="最大宽度"
                    aria-checked={pageWidth === 'max'}
                    data-testid="fsdb-share-layout-max"
                    onClick={() => persistPageWidth('max')}
                  >
                    <ArrowsPointingInIcon aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    className={`fsdb-layout-opt${pageWidth === 'full' ? ' is-active' : ''}`}
                    title="全宽"
                    aria-label="全宽"
                    aria-checked={pageWidth === 'full'}
                    data-testid="fsdb-share-layout-full"
                    onClick={() => persistPageWidth('full')}
                  >
                    <ArrowsPointingOutIcon aria-hidden className="size-4" />
                  </button>
                </div>
              </HeadlessDismiss>
            ) : null}
          </div>
          {snapshot.resources ? (
            <div className="fsdb-share-res-wrap">
              <button
                type="button"
                className="chat-view-header-expand"
                title="关联资源"
                aria-label="关联资源"
                data-testid="fsdb-share-resources"
                onClick={() => setResourcesOpen((open) => !open)}
              >
                <CubeTransparentIcon aria-hidden className="size-4" />
              </button>
              {resourcesOpen ? (
                <div className="fsdb-share-res-pop" data-testid="fsdb-share-resources-pop">
                  <p>页面 {snapshot.resources.pages}</p>
                  <p>插件 {snapshot.resources.plugins}</p>
                  <p>合集 {snapshot.resources.collections}</p>
                  {snapshot.sharePlugins && snapshot.pluginIds?.length ? (
                    <ul className="fsdb-share-plugin-list">
                      {snapshot.pluginIds.map((id) => (
                        <li key={id}>
                          <button
                            type="button"
                            className="fsdb-share-copy"
                            onClick={() => {
                              const href = `/api/share/${encodeURIComponent(token)}/plugin/${encodeURIComponent(id)}`
                              const link = document.createElement('a')
                              link.href = password
                                ? `${href}?password=${encodeURIComponent(password)}`
                                : href
                              link.download = `${id}.zip`
                              document.body.appendChild(link)
                              link.click()
                              link.remove()
                            }}
                          >
                            下载 {id}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {snapshot.allowCopy !== false ? (
          <button
            type="button"
            className="chat-view-header-expand"
            title="下载"
            aria-label="下载"
            data-testid="fsdb-share-download"
            onClick={downloadShare}
          >
            <ArrowDownTrayIcon aria-hidden className="size-4" />
          </button>
          ) : null}
          <button
            type="button"
            className="chat-view-header-expand"
            title={theme === 'dark' ? '日间模式' : '夜间模式'}
            aria-label={theme === 'dark' ? '日间模式' : '夜间模式'}
            data-testid="fsdb-share-theme"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              persistShareTheme(next)
              setTheme(next)
            }}
          >
            {theme === 'dark' ? <SunIcon aria-hidden className="size-4" /> : <MoonIcon aria-hidden className="size-4" />}
          </button>
        </div>
      </header>
      <div className="fsdb-right">
      <div className="fsdb-share-body fsdb-right-body">
      <div className="app-pane-in">
      {shown ? (
        <RecordDetail
          selected={{ ...shown, banner: rewriteBanner(shown.banner, token, password) ?? shown.banner }}
          schema={schema}
          chrome={detailChrome}
          draft={{}}
          detailBody={rewriteAssetUrls(snapshot.contents[shown.id], token, password)}
          labelOf={(row) => crumbRecordLabel(row, schema.labelField)}
          renderCell={(row, key, field) => (
            <ShareCell
              row={row}
              fieldKey={key}
              field={field}
              records={listed}
              collection={snapshot.collection}
              schema={schema}
              chrome={detailChrome}
            />
          )}
          setDraft={() => undefined}
          writeOne={() => undefined}
          writePatch={() => undefined}
          onOpenRecord={undefined}
          readOnly
          headingOutline
          onPrev={
            viewNav
              ? () => {
                  const prev = listed[Math.max(0, viewIndex - 1)]
                  if (prev) navigate(sharePublicPath(token, prev.id))
                }
              : undefined
          }
          onNext={
            viewNav
              ? () => {
                  const next = listed[Math.min(listed.length - 1, viewIndex + 1)]
                  if (next) navigate(sharePublicPath(token, next.id))
                }
              : undefined
          }
          canPrev={viewIndex > 0}
          canNext={viewIndex >= 0 && viewIndex < listed.length - 1}
        />
      ) : (
        <div className="tasks-main fsdb-main fsdb-share-list" data-testid="fsdb-share-list">
          {(() => {
            const banner = rewriteBanner(snapshot.banner, token, password)
            return banner ? <PageBanner value={banner} writable={false} title={snapshot.title} /> : null
          })()}
          <div className="fsdb-detail-title-row">
            <span className="fsdb-detail-title-icon" aria-hidden>
              <TableGlyph className="size-8" />
            </span>
            <div className="fsdb-detail-title-block">
              <h1 className="fsdb-detail-title">{snapshot.title}</h1>
            </div>
          </div>
          {snapshot.kind === 'view' && queryState ? (
            <ShareViewQueryBar
              schema={schema}
              records={snapshot.records}
              state={queryState}
              onChange={setQueryState}
              refreshing={refreshing}
              onRefresh={() => setReload((n) => n + 1)}
            />
          ) : null}
          <div className="fsdb-workspace">
            <div className="fsdb-stage">
              <ShareListTable
                schema={schema}
                view={snapshot.view}
                records={paged}
                collection={snapshot.collection}
                chrome={detailChrome}
                columns={queryState?.columns}
                wrap={queryState?.wrap}
                truncate={queryState?.truncate}
                queryFields={queryFields}
                onOpen={(id) => navigate(sharePublicPath(token, id))}
              />
              {paged.length === 0 ? <p className="fsdb-empty">暂无记录</p> : null}
            </div>
            <div className="fsdb-pager" data-testid="fsdb-share-pager">
              <span className="fsdb-pager-meta" title={total ? `共 ${total} 条` : '暂无记录'}>
                <HashtagIcon aria-hidden className="size-[14px]" />
                <span>{total}</span>
              </span>
              <div className="fsdb-pager-nav">
                {queryState ? (
                  <PagerSizeControl
                    pageSize={pageSize}
                    onChange={(size) => setQueryState({ ...queryState, pageSize: size })}
                  />
                ) : null}
                <button
                  type="button"
                  className="tasks-icon-btn"
                  aria-label="上一页"
                  disabled={safePage <= 0}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                >
                  <ChevronLeftIcon aria-hidden className="size-[14px]" />
                </button>
                <button
                  type="button"
                  className="tasks-icon-btn"
                  aria-label="下一页"
                  disabled={total <= 0 || (safePage + 1) * pageSize >= total || (paged.length > 0 && paged.length < pageSize)}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  <ChevronRightIcon aria-hidden className="size-[14px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
      </div>
      <ShareOwnerCorner owner={snapshot.owner} open={ownerOpen} onOpenChange={setOwnerOpen} />
    </div>
  )
}
