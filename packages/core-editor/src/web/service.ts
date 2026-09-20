import { useSyncExternalStore, type ComponentType } from 'react'
import { Service, type Context } from 'cordis'
import { registerBlockAssets } from '@biu/type-file-system'

export type HeadingLevel = 1 | 2 | 3

export type HeadingReplacement = {
  className?: string
  style?: string
  label?: string
}

export type PageBlockViewProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>, opts?: { replace?: boolean }) => void
  writable: boolean
}

/** 斜杠菜单分类。'basic' 进「基础模块」；其它字符串各自成组。 */
export const BASIC_BLOCK_TYPE = 'basic'

export type PageBlockSpec = {
  kind: string
  /** 写入文档的插件 id（与 export const name / manifest.id 相同）。编辑器不推断。 */
  plugin: string
  label: string
  /**
   * 块类型：插件自己声明。'basic' 与标题/列表等基础块同组；
   * 不写则用 kind（画板、算法题各自一类，不混进基础模块）。
   */
  blockType?: string
  /** 斜杠分组标题。默认：basic →「基础模块」，否则用 label。 */
  blockTypeLabel?: string
  hint?: string
  aliases?: string[]
  /** 插入时的块 data。每块都有 title；不写则用「当前页面名 + 组件类型名」。 */
  defaults?: Record<string, unknown> | (() => Record<string, unknown>)
  /**
   * data 里哪些字段是资产引用。string[] 为顶层字段；函数返回引用值。
   * 不声明则宿主无法登记，资产可能被 GC 回收。
   */
  assets?: import('@biu/type-file-system').BlockAssetsDecl
  View: ComponentType<PageBlockViewProps>
}

export type SlashInsert =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'code'
  | 'divider'
  | 'image'
  | 'table'
  | 'math'
  | 'mathInline'

export type SlashCommandSpec = {
  id: string
  label?: string
  hint?: string
  aliases?: string[]
  insert?: SlashInsert
}

let bound: PageEditorService | undefined

export function getPageEditor() {
  return bound
}

export class PageEditorService extends Service {
  private headings = new Map<HeadingLevel, HeadingReplacement>()
  private extras: SlashCommandSpec[] = []
  private customBlocks = new Map<string, PageBlockSpec>()
  private seq = 0
  private listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'pageEditor')
    bound = this
    ctx.effect(() => () => {
      if (bound === this) bound = undefined
    })
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  version = () => this.seq

  headingView(level: number) {
    return this.headings.get(level as HeadingLevel)
  }

  block(kind: string) {
    return this.customBlocks.get(kind)
  }

  blocks() {
    return [...this.customBlocks.values()]
  }

  slashCommands() {
    return [...this.extras]
  }

  /** 登记一种新块（atom）。斜杠菜单可插入；View 画卡片。plugin 必须是插件自己的 id。 */
  registerBlock(spec: PageBlockSpec) {
    const plugin = String(spec.plugin ?? '').trim()
    if (!plugin) throw new Error('page block needs plugin id')
    if (spec.assets === undefined) {
      console.warn(`[${plugin}] 块 "${spec.kind}" 未声明 assets，其 data 里的资产引用不会被登记，可能被 GC 回收`)
    } else {
      registerBlockAssets(spec.kind, plugin, spec.assets)
    }
    const blockType = String(spec.blockType ?? spec.kind).trim() || spec.kind
    const blockTypeLabel =
      String(spec.blockTypeLabel ?? '').trim() || (blockType === BASIC_BLOCK_TYPE ? '基础模块' : spec.label)
    const next = { ...spec, plugin, blockType, blockTypeLabel }
    return this.ctx.effect(() => {
      this.customBlocks.set(spec.kind, next)
      this.bump()
      return () => {
        if (this.customBlocks.get(spec.kind) === next) this.customBlocks.delete(spec.kind)
        this.bump()
      }
    })
  }

  /** 给原生 H1 / H2 / H3 加皮肤（class/style/::before 标签）。不要包 Node View，否则方向键无法向上。 */
  replaceHeading(level: HeadingLevel, spec: HeadingReplacement) {
    return this.ctx.effect(() => {
      this.headings.set(level, spec)
      this.bump()
      return () => {
        if (this.headings.get(level) === spec) this.headings.delete(level)
        this.bump()
      }
    })
  }

  slash(spec: SlashCommandSpec) {
    return this.ctx.effect(() => {
      this.extras = [...this.extras.filter((item) => item.id !== spec.id), spec]
      this.bump()
      return () => {
        this.extras = this.extras.filter((item) => item !== spec)
        this.bump()
      }
    })
  }

  private bump() {
    this.seq += 1
    for (const fn of this.listeners) fn()
  }
}

export function usePageEditorVersion(editor?: PageEditorService) {
  const svc = editor ?? bound
  return useSyncExternalStore(
    (fn) => (svc ? svc.subscribe(fn) : () => undefined),
    () => svc?.version() ?? 0,
    () => 0,
  )
}

declare module 'cordis' {
  interface Context {
    pageEditor: PageEditorService
  }
}
