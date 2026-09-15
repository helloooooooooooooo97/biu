import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { PageEditor } from './page-editor.tsx'
import { PageEditorService } from './service.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { SourceToggle, PagesDetailTools } from './source-toggle.tsx'
import { PageShareHeader } from './page-share.tsx'
import { pageBlocksCollectionView, PageBlockContent } from './page-blocks-view.tsx'

export { PageEditor, PageEditor as RecordEditor } from './page-editor.tsx'
export { SourceToggle } from './source-toggle.tsx'
export { PageEditorService, BASIC_BLOCK_TYPE, getPageEditor, usePageEditorVersion } from './service.ts'
export type { HeadingReplacement, PageBlockSpec, PageBlockViewProps, SlashCommandSpec, SlashInsert } from './service.ts'
export { pageEditorExtensions } from './kit.ts'
export { markdownLocusFromRange, markdownLocusFromSelection, markdownLocusFromElement } from './markdown-locus.ts'
export { PageBlocksView, PageBlockContent, PageBlockStage, pageBlocksCollectionView, PAGE_BLOCKS_VIEW_ID } from './page-blocks-view.tsx'

export const name = 'core-editor-ui'
export const inject = ['databaseUi']

const EDITOR_COLLECTIONS = ['/pages', '/tasks', '/plugins', '/facets'] as const

export function apply(ctx: Context) {
  new PageEditorService(ctx)
  const ui = ctx.get('databaseUi') as DatabaseUi
  for (const path of EDITOR_COLLECTIONS) {
    ctx.effect(() =>
      ui.decorate(path, {
        Content: PageEditor,
        DetailTools: path === '/pages' ? PagesDetailTools : SourceToggle,
        ...(path === '/pages' ? { DetailHeader: PageShareHeader } : {}),
      }).dispose,
    )
  }
  ctx.effect(() => ui.decorate('/page-blocks', { Content: PageBlockContent }).dispose)
  ctx.effect(() => ui.registerView('/page-blocks', pageBlocksCollectionView).dispose)
}

if (typeof document !== 'undefined') {
  const id = 'biu-core-editor-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = PAGE_EDITOR_STYLE
  document.head.appendChild(style)
}
