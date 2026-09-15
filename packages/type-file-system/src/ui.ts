import type { ComponentType } from 'react'
import type { CollectionActionInfo, CollectionInfo, CollectionSchema, DbRecord, FieldSpec } from './index.ts'

/** 单元格：不传则 File System 按 FieldSpec.type 默认画。 */
export type FsCellProps = {
  field: string
  spec: FieldSpec
  value: unknown
  record: DbRecord
  fallback: string
}

/** 单条动作：不传则 File System 画带 label 的文字按钮。 */
export type FsActionProps = {
  action: CollectionActionInfo
  record: DbRecord
  busy: boolean
  run: () => void
}

/** 整组动作。有则宿主只挂这一次，长什么样由登记方自己决定。 */
export type FsActionsProps = {
  actions: CollectionActionInfo[]
  record: DbRecord
  busy: boolean
  place: 'row' | 'detail'
  run: (action: CollectionActionInfo) => void
}

export type FsDetailPaneProps = {
  record: DbRecord
  openRecord?: (recordId: string, collection?: string) => void
}

export type FsDetailPane = {
  id: string
  label: string
  badge?: (record: DbRecord) => number | string | undefined
  Pane: ComponentType<FsDetailPaneProps>
}

export type CollectionChrome = {
  cells?: Partial<Record<string, ComponentType<FsCellProps>>>
  Action?: ComponentType<FsActionProps>
  /** 整组动作。有则宿主不再按条 map，前端完全由登记方 decorate。 */
  Actions?: ComponentType<FsActionsProps>
  /** 详情侧栏「⋯」菜单里的操作（例如源码模式）。 */
  DetailTools?: ComponentType<{ record: DbRecord; onDone?: () => void }>
  /** 记录独立图标属性。有 emoji 用 emoji；不传则详情/侧栏/面包屑用集合 glyph。 */
  Icon?: ComponentType<{ record: DbRecord }>
  Title?: ComponentType<{ record: DbRecord; label: string }>
  /** 详情标题下的主舞台（例如标签收集表）。不传则走字段概况 + 正文。 */
  Board?: ComponentType<{ record: DbRecord; openRecord?: (recordId: string, collection?: string) => void }>
  /** 正文。不传则把 content 当文件默认渲染。结构由登记方自己解析。 */
  Content?: ComponentType<FsContentProps>
  /** 详情弹窗额外分区（概况之外）。旧任务详情的脚本/进度汇报走这里。 */
  panes?: FsDetailPane[]
  /** 点行：集合自己决定跳到哪。不传则打开本表记录详情。 */
  openRow?: (row: DbRecord) => FsOpenRow | null | undefined | false
  /** 覆盖该集合侧栏/下拉里的视图列表（例如视图目录）。 */
  listViews?: (tables: CollectionInfo[], user: unknown[]) => unknown[]
  /** 从当前 URL search 解析锁定筛选（例如视图目录 ?source=）。 */
  lockedFiltersFromSearch?: (search: string) => Record<string, string>
}

export type FsOpenRow =
  | { kind: 'table'; path: string; viewId?: string }
  | { kind: 'record'; recordId: string; collection?: string }

export type FsContentProps = {
  record: DbRecord
  field: string
  spec: FieldSpec
  value: unknown
  writable?: boolean
  onChange?: (next: unknown) => void
  /** 记录路径，如 /pages/p002，给选区 pick 注入 db_content 句柄。 */
  path?: string
}

/** 集合自定义呈现：谁 registerView(path)，谁才能在该 path 用这个 mode。整页自己画。 */
export type FsViewProps = {
  path: string
  rows: DbRecord[]
  schema?: CollectionSchema
  onOpen: (row: DbRecord) => void
}

/** 行渲染：外壳只负责列表；插件只画这一行。fields 是当前视图勾上的可见列。 */
export type FsRowViewProps = {
  record: DbRecord
  fields: Array<{ key: string; spec?: FieldSpec; value: unknown; label: string }>
  onOpen: () => void
}

export type CollectionViewType = {
  id: string
  label: string
  Icon?: ComponentType<{ className?: string }>
  /** 登记该呈现的插件 id，pick 时注入 data-biu-plugin。 */
  plugin?: string
  View: ComponentType<FsViewProps>
}

/** 所有表共用的默认 chrome。具体表再 decorate 时后写覆盖。 */
export const DEFAULT_CHROME_PATH = '/*'

export type CollectionRowViewType = {
  id: string
  label: string
  Icon?: ComponentType<{ className?: string }>
  plugin?: string
  Row: ComponentType<FsRowViewProps>
}

export interface DatabaseUi {
  decorate(path: string, chrome: CollectionChrome): { dispose: () => void }
  /** 给指定集合登记一种查看模式。其它集合看不到、也不能选。整页自己画。 */
  registerView(path: string, view: CollectionViewType): { dispose: () => void }
  /** 登记一行的样子。path 为 * 时所有表都能用。外壳仍由 File System 画。 */
  registerRowView(path: string, view: CollectionRowViewType): { dispose: () => void }
  chrome(path: string): CollectionChrome
  views(path: string): CollectionViewType[]
  rowViews(path: string): CollectionRowViewType[]
  subscribe(listener: () => void): () => void
}

declare module 'cordis' {
  interface Context {
    databaseUi: DatabaseUi
  }
}
