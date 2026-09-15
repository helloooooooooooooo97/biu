import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react'
import type { Context } from 'cordis'
import { useLocation, useNavigate } from 'react-router-dom'
import { CircleStackIcon } from '@heroicons/react/24/solid'
import type { SlotProps } from '@biu/type-slots'
import { DATABASE_CHANNEL, type CollectionInfo } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { isLegacyDatabasePath, parseAppPath } from '@biu/web-session-view'
import { pathForCenter, pathForCrumbTarget, type CrumbTarget } from './sidebar-nav.ts'
import { CollectionBrowser } from './browser.tsx'
import { ShareRoot } from './share-page.tsx'
import { DatabaseInspectorBrowse, DatabaseInspectorTab, bindInspectorSnapshot, collectionTabIcon } from './inspector-database.tsx'
import { applyDatabaseChannelPayload } from './inspector-db-route.ts'
import { InspectorFollowToggle } from './inspector-follow.tsx'
import { DatabaseUiService, getDatabaseUi } from './database-ui.ts'
import {
  bootLoadCollections,
  collectionNavKey,
} from './nav-boot.ts'
import { defaultViewId, pullSavedViews, pushAllSavedViews } from './view-storage.ts'
import { DATA_MODULE, DATA_MODULE_ID, DATA_MODULE_PATH, FACETS_COLLECTION_PATH, PAGE_BLOCKS_COLLECTION_PATH, VIEWS_COLLECTION_PATH, sortDataCollections } from './database-path.ts'
import { pickMainDataRoute, readMainDataRoute, writeMainDataRoute } from './main-data-route.ts'
import { facetsChrome } from './facet-chrome.tsx'
import { viewsChrome } from './views-chrome.ts'
import { pageBlocksChrome } from './page-blocks-chrome.ts'
import { viewsForRegisteredCollection } from './collection-nav.ts'
import { builtinAllViewId } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'

type SlotsService = {
  place: (slot: string, view: unknown, opts: { key: string; order?: number; props?: () => Record<string, unknown> }) => { dispose?: () => unknown }
}

type AppModule = {
  id: string
  label: string
  path: string
}

type AppModulesService = {
  list: () => AppModule[]
  register: (mod: {
    id: string
    label: string
    path: string
    description?: string
    order?: number
    Icon?: ComponentType<{ className?: string }>
  }) => { dispose?: () => unknown }
  markNavReady?: () => void
}

type SnapshotService = {
  onMessage: (type: string, handler: (payload: unknown) => void) => () => void
  get?: () => { collections?: CollectionInfo[] }
  subscribe?: (fn: () => void) => () => void
}

const EMPTY_CHROME: CollectionChrome = {}
const EMPTY_FILTERS: Record<string, string> = {}

function CollectionPage(props: SlotProps) {
  const tables = (props.tables as CollectionInfo[] | undefined) ?? []
  const orderedTables = useMemo(() => {
    const { user, system } = sortDataCollections(tables)
    return [...user, ...system]
  }, [tables])
  const ui = getDatabaseUi()
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedViewKey, setExpandedViewKey] = useState<string | null>(null)
  const parsed = useMemo(() => parseAppPath(location.pathname, [DATA_MODULE]), [location.pathname])
  const dataHome = parsed.kind === 'module' && parsed.moduleId === DATA_MODULE_ID
  const storedHome = useMemo(
    () => (dataHome ? pickMainDataRoute(readMainDataRoute(), orderedTables) : ''),
    [dataHome, orderedTables],
  )
  const storedParsed = useMemo(
    () => (storedHome ? parseAppPath(storedHome, [DATA_MODULE]) : null),
    [storedHome],
  )
  const collectionFromRoute =
    parsed.kind === 'collection-view' || parsed.kind === 'record'
      ? parsed.collection
      : storedParsed && (storedParsed.kind === 'collection-view' || storedParsed.kind === 'record')
        ? storedParsed.collection
        : ''
  const viewFromRoute =
    parsed.kind === 'collection-view' || parsed.kind === 'record'
      ? parsed.viewId
      : storedParsed && (storedParsed.kind === 'collection-view' || storedParsed.kind === 'record')
        ? storedParsed.viewId
        : undefined
  const recordFromRoute =
    parsed.kind === 'record'
      ? parsed.recordId
      : dataHome && storedParsed?.kind === 'record'
        ? storedParsed.recordId
        : null
  const currentPath = collectionFromRoute || orderedTables[0]?.path || ''
  const row = orderedTables.find((item) => item.path === currentPath)
  const chrome = useSyncExternalStore(
    (fn) => (ui ? ui.subscribe(fn) : () => undefined),
    () => ui?.chrome(currentPath) ?? EMPTY_CHROME,
    () => ui?.chrome(currentPath) ?? EMPTY_CHROME,
  )

  const go = (
    next: { collection: string; viewId?: string; recordId?: string | null },
    opts?: { replace?: boolean },
  ) => {
    navigate(
      pathForCenter({
        collection: next.collection,
        viewId: next.viewId,
        recordId: next.recordId ?? undefined,
      }),
      opts,
    )
  }

  useEffect(() => {
    void pullSavedViews().then(() => pushAllSavedViews())
  }, [])

  useEffect(() => {
    if (isLegacyDatabasePath(location.pathname) && (parsed.kind === 'collection-view' || parsed.kind === 'record')) {
      go(
        {
          collection: parsed.collection,
          viewId: parsed.kind === 'record' ? parsed.viewId : parsed.kind === 'collection-view' ? parsed.viewId : undefined,
          recordId: parsed.kind === 'record' ? parsed.recordId : null,
        },
        { replace: true },
      )
    }
  }, [location.pathname, parsed])

  useEffect(() => {
    if (parsed.kind === 'collection-view' || parsed.kind === 'record') writeMainDataRoute(location.pathname)
  }, [location.pathname, parsed])

  useLayoutEffect(() => {
    if (!orderedTables.length) return
    if (!dataHome) return
    const stored = pickMainDataRoute(readMainDataRoute(), orderedTables)
    if (stored) {
      navigate(stored, { replace: true })
      return
    }
    const first = orderedTables[0]!
    go({ collection: first.path, viewId: builtinAllViewId(first.path) }, { replace: true })
  }, [dataHome, orderedTables])

  useEffect(() => {
    if (parsed.kind !== 'collection-view' || parsed.viewId || recordFromRoute) return
    if (!parsed.collection) return
    go({ collection: parsed.collection, viewId: builtinAllViewId(parsed.collection) }, { replace: true })
  }, [parsed, recordFromRoute])

  useEffect(() => {
    if (!orderedTables.length || !collectionFromRoute) return
    if (orderedTables.some((item) => item.path === collectionFromRoute)) return
    const first = orderedTables[0]!
    go({ collection: first.path, viewId: defaultViewId(first.path) }, { replace: true })
  }, [collectionFromRoute, orderedTables])

  const lockedFilters = chrome.lockedFiltersFromSearch?.(location.search) ?? EMPTY_FILTERS
  if (!currentPath) return null
  const title = row?.view?.title ?? row?.label ?? currentPath.replace(/^\//, '')
  return (
    <CollectionBrowser
      moduleId={DATA_MODULE_ID}
      collectionPath={currentPath}
      title={title}
      blurb={row?.view?.blurb ?? ''}
      chrome={chrome}
      tables={orderedTables}
      lockedFilters={lockedFilters}
      routeRecordId={recordFromRoute}
      routeViewId={viewFromRoute}
      expandedViewKey={expandedViewKey}
      onExpandedViewKeyChange={setExpandedViewKey}
      onOpenTable={(path, viewId) => go({ collection: path, viewId: viewId ?? builtinAllViewId(path) })}
      onOpenView={(viewId) => go({ collection: currentPath, viewId })}
      onOpenRecord={(recordId, viewId, collection) =>
        go({ collection: collection ?? currentPath, viewId: viewId ?? viewFromRoute, recordId })
      }
      resolveViews={(path, user) => viewsForRegisteredCollection(path, orderedTables, user)}
      onCloseRecord={() =>
        go({ collection: currentPath, viewId: viewFromRoute ?? defaultViewId(currentPath) }, { replace: true })
      }
      onCrumbTarget={(target: CrumbTarget) => navigate(pathForCrumbTarget(target))}
    />
  )
}

async function loadCollections(): Promise<CollectionInfo[]> {
  const res = await fetch('/api/db/stat?path=/')
  const body = (await res.json()) as { collections?: CollectionInfo[]; error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  return body.collections ?? []
}

let navErrors: string[] = []
const errorListeners = new Set<() => void>()

function setNavErrors(next: string[]) {
  navErrors = next
  for (const fn of errorListeners) fn()
}

function RegisterErrorBanner() {
  const errors = useSyncExternalStore(
    (fn) => {
      errorListeners.add(fn)
      return () => errorListeners.delete(fn)
    },
    () => navErrors,
    () => navErrors,
  )
  if (!errors.length) return null
  return (
    <div className="fsdb-nav-errors" role="alert">
      <strong>Core-File System</strong>
      <ul>
        {errors.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export const name = 'core-file-system-ui'
export const inject = ['slots', 'appModules']

export function apply(ctx: Context) {
  new DatabaseUiService(ctx)
  ctx.effect(() => {
    const ui = getDatabaseUi()
    if (!ui) return () => undefined
    const views = ui.decorate(VIEWS_COLLECTION_PATH, viewsChrome)
    const facetsUi = ui.decorate(FACETS_COLLECTION_PATH, facetsChrome)
    const blocksUi = ui.decorate(
      PAGE_BLOCKS_COLLECTION_PATH,
      pageBlocksChrome(() => {
        const editor = ctx.get('pageEditor') as { blocks?: () => Array<{ kind: string; label: string }> } | undefined
        return editor?.blocks?.() ?? []
      }),
    )
    return () => {
      views.dispose()
      facetsUi.dispose()
      blocksUi.dispose()
    }
  })
  ctx.inject(['pageEditor'], (inner) => {
    const editor = inner.get('pageEditor') as {
      subscribe: (fn: () => void) => () => void
      blocks: () => Array<{ kind: string }>
    }
    let sig = ''
    const stop = editor.subscribe(() => {
      const next = editor
        .blocks()
        .map((item) => item.kind)
        .sort()
        .join('\0')
      if (next === sig) return
      sig = next
      getDatabaseUi()?.refresh()
    })
    return () => stop()
  })
  const slots = ctx.get('slots') as SlotsService
  const appModules = ctx.get('appModules') as AppModulesService
  const mounted = new Map<string, () => void>()
  const inspectorOffers = new Map<string, () => void>()
  let liveTables: CollectionInfo[] = []

  function syncInspectorOffers(tables: CollectionInfo[]) {
    const wanted = tables.filter((row) => row.view?.inspector)
    const live = new Set(wanted.map((row) => row.path))
    for (const [path, dispose] of inspectorOffers) {
      if (live.has(path)) continue
      dispose()
      inspectorOffers.delete(path)
    }
    for (const table of wanted) {
      if (inspectorOffers.has(table.path)) continue
      const path = table.path
      const slot = slots.place('inspector-panels', DatabaseInspectorBrowse, {
        key: `fsdb-inspector:${path}`,
        order: -40 + (table.view?.order ?? 50),
        props: () => {
          const current = liveTables.find((item) => item.path === path)
          return {
            tabId: `database:${path}`,
            tabLabel: current?.view?.title ?? current?.label ?? path.replace(/^\//, ''),
            tabIcon: collectionTabIcon(current?.view?.icon),
            Tab: DatabaseInspectorTab,
            seedCollection: path,
            requiresSession: true,
            centerKinds: ['session'],
            repeatable: true,
          }
        },
      })
      inspectorOffers.set(path, () => {
        void slot.dispose?.()
      })
    }
  }

  slots.place('root-overlays', RegisterErrorBanner, { key: 'fsdb-nav-errors', order: 80 })
  slots.place('root-overlays', ShareRoot, { key: 'fsdb-share-root', order: 90 })
  slots.place('header-tools', InspectorFollowToggle, {
    key: 'inspector-follow',
    order: 11,
  })
  let stopped = false
  let readyTimer = 0
  const runSync = async (rows: CollectionInfo[]) => {
    const views = rows
      .filter((row) => row.view?.moduleId && row.view.route)
      .slice()
      .sort((a, b) => (a.view?.order ?? 50) - (b.view?.order ?? 50) || a.path.localeCompare(b.path))
    liveTables = views
    syncInspectorOffers(views)
    const live = views.length ? new Set([DATA_MODULE_ID]) : new Set<string>()
    for (const [id, dispose] of mounted) {
      if (live.has(id)) continue
      dispose()
      mounted.delete(id)
    }
    const errors: string[] = []
    if (!views.length) {
      setNavErrors(errors)
      return
    }
    const occupied = appModules.list()
    const pathHit = occupied.find((item) => item.id !== DATA_MODULE_ID && normalizeCollectionPath(item.path) === DATA_MODULE_PATH)
    if (pathHit) {
      errors.push(`路由重复：${DATA_MODULE_PATH} 已被「${pathHit.label}」占用`)
      setNavErrors(errors)
      return
    }
    const nameHit = occupied.find((item) => item.id !== DATA_MODULE_ID && item.label === DATA_MODULE.label)
    if (nameHit) {
      errors.push(`名称重复：导航已有「${DATA_MODULE.label}」`)
      setNavErrors(errors)
      return
    }
    if (!mounted.has(DATA_MODULE_ID)) {
      try {
        const order = Math.min(...views.map((row) => row.view?.order ?? 50))
        const mod = appModules.register({
          id: DATA_MODULE.id,
          label: DATA_MODULE.label,
          path: DATA_MODULE.path,
          description: '任务、页面和插件',
          order,
          Icon: CircleStackIcon,
        })
        const slot = slots.place('app-modules', CollectionPage, {
          key: 'fsdb-database',
          order,
          props: () => ({
            moduleId: DATA_MODULE_ID,
            tables: liveTables,
          }),
        })
        mounted.set(DATA_MODULE_ID, () => {
          void mod.dispose?.()
          void slot.dispose?.()
        })
      } catch (err) {
        errors.push(`无法挂到导航：${String(err)}`)
      }
    }
    setNavErrors(errors)
  }

  const sync = async (rows?: CollectionInfo[]) => {
    let next = rows
    if (!next) {
      try {
        next = await loadCollections()
      } catch {
        return
      }
    }
    await runSync(next)
    if (!collectionNavKey(next)) return
    window.clearTimeout(readyTimer)
    readyTimer = window.setTimeout(() => appModules.markNavReady?.(), 80)
  }

  ctx.effect(() => () => {
    stopped = true
    window.clearTimeout(readyTimer)
    for (const dispose of mounted.values()) dispose()
    mounted.clear()
    for (const dispose of inspectorOffers.values()) dispose()
    inspectorOffers.clear()
    setNavErrors([])
  })
  ctx.inject(['snapshot'], (inner) => {
    const snapshot = inner.get('snapshot') as SnapshotService
    bindInspectorSnapshot({
      subscribe: snapshot.subscribe ?? (() => () => undefined),
      get: () => snapshot.get?.() ?? {},
    })
    let lastKey = ''
    const fromSnap = () => {
      const rows = snapshot.get?.().collections ?? []
      const key = collectionNavKey(rows)
      if (!key || key === lastKey) return
      lastKey = key
      void sync(rows)
    }
    fromSnap()
    const offSnap = snapshot.subscribe?.(fromSnap)
    let debounce = 0
    const off = snapshot.onMessage(DATABASE_CHANNEL, (payload) => {
      const rec = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as { asset?: { name?: string; etag?: string }; savedView?: unknown; reveal?: { collection?: unknown; viewId?: unknown } }) : null
      const viewsTouched =
        Boolean(rec?.savedView) ||
        Boolean(rec?.reveal?.viewId) ||
        String(rec?.reveal?.collection ?? '') === '/views'
      const sessionId = (
        ctx.get('sessionView') as { get?: () => { sessionId?: string | null } } | undefined
      )?.get?.()?.sessionId
      applyDatabaseChannelPayload(payload, sessionId)
      window.dispatchEvent(new CustomEvent('fsdb:change', { detail: viewsTouched ? { views: true } : undefined }))
      if (rec?.asset?.name) {
        window.dispatchEvent(new CustomEvent('biu:asset-changed', { detail: rec.asset }))
      }
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => void sync(), 40)
    })
    return () => {
      window.clearTimeout(debounce)
      offSnap?.()
      off()
    }
  })
  void bootLoadCollections(loadCollections, {
    stopped: () => stopped,
    onUpdate: (rows) => {
      if (stopped || !collectionNavKey(rows)) return
      void sync(rows)
    },
  }).then((rows) => {
    if (stopped) return
    return sync(rows)
  })
}

if (typeof document !== 'undefined') {
  const id = 'biu-core-file-system-nav-error-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.fsdb-nav-errors{position:fixed;right:16px;bottom:16px;z-index:80;max-width:360px;border:1px solid var(--dsw-danger);border-radius:12px;padding:12px 14px;background:var(--dsw-surface);color:var(--dsw-label);box-shadow:var(--dsw-shadow)}
.fsdb-nav-errors strong{display:block;margin-bottom:6px;color:var(--dsw-danger);font-size:12px}
.fsdb-nav-errors ul{margin:0;padding-left:18px;font-size:12px;line-height:1.5}
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
