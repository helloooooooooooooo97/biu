import { Service, type Context } from 'cordis'
import type { CollectionChrome, CollectionRowViewType, CollectionViewType, DatabaseUi } from '@biu/type-file-system/ui'
import { DEFAULT_CHROME_PATH } from '@biu/type-file-system/ui'
import { normalizeCollectionPath } from '../paths.ts'

export { normalizeCollectionPath, DEFAULT_CHROME_PATH }

export const ALL_ROW_VIEWS_PATH = '*'

function mergeChrome(layers: CollectionChrome[]): CollectionChrome {
  const cells: CollectionChrome['cells'] = {}
  let Action: CollectionChrome['Action']
  let Actions: CollectionChrome['Actions']
  let DetailTools: CollectionChrome['DetailTools']
  let Icon: CollectionChrome['Icon']
  let Title: CollectionChrome['Title']
  let Board: CollectionChrome['Board']
  let Content: CollectionChrome['Content']
  let openRow: CollectionChrome['openRow']
  let listViews: CollectionChrome['listViews']
  let lockedFiltersFromSearch: CollectionChrome['lockedFiltersFromSearch']
  const panes: NonNullable<CollectionChrome['panes']> = []
  for (const layer of layers) {
    Object.assign(cells, layer.cells)
    if (layer.Action) Action = layer.Action
    if (layer.Actions) Actions = layer.Actions
    if (layer.DetailTools) DetailTools = layer.DetailTools
    if (layer.Icon) Icon = layer.Icon
    if (layer.Title) Title = layer.Title
    if (layer.Board) Board = layer.Board
    if (layer.Content) Content = layer.Content
    if (layer.openRow) openRow = layer.openRow
    if (layer.listViews) listViews = layer.listViews
    if (layer.lockedFiltersFromSearch) lockedFiltersFromSearch = layer.lockedFiltersFromSearch
    if (layer.panes?.length) {
      for (const pane of layer.panes) {
        const i = panes.findIndex((item) => item.id === pane.id)
        if (i >= 0) panes[i] = pane
        else panes.push(pane)
      }
    }
  }
  return { cells, Action, Actions, DetailTools, Icon, Title, Board, Content, panes: panes.length ? panes : undefined, openRow, listViews, lockedFiltersFromSearch }
}

function mergeViews(layers: CollectionViewType[]): CollectionViewType[] {
  const byId = new Map<string, CollectionViewType>()
  for (const view of layers) {
    if (!view.id) continue
    byId.set(view.id, view)
  }
  return [...byId.values()]
}

function mergeRowViews(layers: CollectionRowViewType[]): CollectionRowViewType[] {
  const byId = new Map<string, CollectionRowViewType>()
  for (const view of layers) {
    if (!view.id) continue
    byId.set(view.id, view)
  }
  return [...byId.values()]
}

function rowViewScope(path: string) {
  const raw = String(path ?? '').trim()
  if (!raw || raw === ALL_ROW_VIEWS_PATH) return ALL_ROW_VIEWS_PATH
  return normalizeCollectionPath(raw)
}

let boundDatabaseUi: DatabaseUiService | undefined

export function getDatabaseUi() {
  return boundDatabaseUi
}

export class DatabaseUiService extends Service implements DatabaseUi {
  private layers = new Map<string, CollectionChrome[]>()
  private viewLayers = new Map<string, CollectionViewType[]>()
  private rowLayers = new Map<string, CollectionRowViewType[]>()
  private snapshot = new Map<string, CollectionChrome>()
  private viewSnapshot = new Map<string, CollectionViewType[]>()
  private rowSnapshot = new Map<string, CollectionRowViewType[]>()
  private listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'databaseUi')
    boundDatabaseUi = this
  }

  decorate(path: string, chrome: CollectionChrome) {
    const key = normalizeCollectionPath(path)
    const list = this.layers.get(key) ?? []
    list.push(chrome)
    this.layers.set(key, list)
    this.emit()
    return {
      dispose: () => {
        const next = (this.layers.get(key) ?? []).filter((item) => item !== chrome)
        if (next.length) this.layers.set(key, next)
        else this.layers.delete(key)
        this.emit()
      },
    }
  }

  registerView(path: string, view: CollectionViewType) {
    const key = normalizeCollectionPath(path)
    const list = this.viewLayers.get(key) ?? []
    list.push(view)
    this.viewLayers.set(key, list)
    this.emit()
    return {
      dispose: () => {
        const next = (this.viewLayers.get(key) ?? []).filter((item) => item !== view)
        if (next.length) this.viewLayers.set(key, next)
        else this.viewLayers.delete(key)
        this.emit()
      },
    }
  }

  registerRowView(path: string, view: CollectionRowViewType) {
    const key = rowViewScope(path)
    const list = this.rowLayers.get(key) ?? []
    list.push(view)
    this.rowLayers.set(key, list)
    this.emit()
    return {
      dispose: () => {
        const next = (this.rowLayers.get(key) ?? []).filter((item) => item !== view)
        if (next.length) this.rowLayers.set(key, next)
        else this.rowLayers.delete(key)
        this.emit()
      },
    }
  }

  chrome(path: string): CollectionChrome {
    const key = normalizeCollectionPath(path)
    const cached = this.snapshot.get(key)
    if (cached) return cached
    const defaults = key === DEFAULT_CHROME_PATH ? [] : (this.layers.get(DEFAULT_CHROME_PATH) ?? [])
    const merged = mergeChrome([...defaults, ...(this.layers.get(key) ?? [])])
    this.snapshot.set(key, merged)
    return merged
  }

  views(path: string): CollectionViewType[] {
    const key = normalizeCollectionPath(path)
    const cached = this.viewSnapshot.get(key)
    if (cached) return cached
    const merged = mergeViews(this.viewLayers.get(key) ?? [])
    this.viewSnapshot.set(key, merged)
    return merged
  }

  rowViews(path: string): CollectionRowViewType[] {
    const key = normalizeCollectionPath(path)
    const cached = this.rowSnapshot.get(key)
    if (cached) return cached
    const merged = mergeRowViews([...(this.rowLayers.get(ALL_ROW_VIEWS_PATH) ?? []), ...(this.rowLayers.get(key) ?? [])])
    this.rowSnapshot.set(key, merged)
    return merged
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  refresh() {
    this.emit()
  }

  private emit() {
    this.snapshot.clear()
    this.viewSnapshot.clear()
    this.rowSnapshot.clear()
    for (const fn of this.listeners) fn()
  }
}
