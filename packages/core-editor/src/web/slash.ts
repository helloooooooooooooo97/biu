import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { SlashList } from './slash-list.tsx'
import { placeSlashInWindow } from './slash-place.ts'
import { slashMayOpen } from './editor-live.ts'
import { createPageBlockId } from './page-block.ts'
import { defaultPageBlockTitle } from '../page-block-fence.ts'
import { BASIC_BLOCK_TYPE, getPageEditor, type SlashInsert } from './service.ts'

export type SlashItem = {
  id: string
  label: string
  hint: string
  aliases: string[]
  blockType: string
  blockTypeLabel: string
  command: (props: { editor: Editor; range: Range }) => void
}

function editorPageTitle(editor: Editor) {
  const root = editor.view.dom.closest('.page-editor')
  return root instanceof HTMLElement ? String(root.dataset.liveTitle ?? '').trim() : ''
}

const BASIC_GROUP = { blockType: BASIC_BLOCK_TYPE, blockTypeLabel: '基础模块' } as const

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'text',
    label: '文本',
    hint: '普通段落',
    aliases: ['text', 'p', 'paragraph', '正文'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'h1',
    label: '标题 1',
    hint: '大标题',
    aliases: ['h1', 'heading', 'title', '标题'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'h2',
    label: '标题 2',
    hint: '中标题',
    aliases: ['h2', 'heading', '标题'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'h3',
    label: '标题 3',
    hint: '小标题',
    aliases: ['h3', 'heading', '标题'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'bullet',
    label: '无序列表',
    hint: '项目符号',
    aliases: ['ul', 'list', 'bullet', '列表'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'ordered',
    label: '有序列表',
    hint: '数字编号',
    aliases: ['ol', 'number', 'ordered', '列表'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'quote',
    label: '引用',
    hint: '引用块',
    aliases: ['quote', 'blockquote', '引用'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').toggleBlockquote().run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'code',
    label: '代码',
    hint: '代码块',
    aliases: ['code', 'pre', '代码'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'divider',
    label: '分割线',
    hint: '分隔内容',
    aliases: ['hr', 'divider', 'line', '分割'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'image',
    label: '图片',
    hint: '插入图片',
    aliases: ['image', 'img', 'pic', '图片', 'photo'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      pickLocalImageSrc().then((src) => {
        if (!src || editor.isDestroyed) return
        editor.chain().focus().setImage({ src, alt: '' }).run()
      })
    },
    ...BASIC_GROUP,
  },
  {
    id: 'table',
    label: '表格',
    hint: '插入表格',
    aliases: ['table', 'grid', '表格'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'math',
    label: '公式',
    hint: '块级 LaTeX',
    aliases: ['math', 'latex', 'katex', 'formula', '公式', '方程'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertBlockMath({ latex: 'E = mc^2' }).run()
    },
    ...BASIC_GROUP,
  },
  {
    id: 'math-inline',
    label: '行内公式',
    hint: '行内 LaTeX',
    aliases: ['inline math', 'inline latex', '行内公式', '行内'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertInlineMath({ latex: 'x^2' }).run()
    },
    ...BASIC_GROUP,
  },
]

function safeAssetFileName(name: string) {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')
  return base || `image-${Date.now()}.png`
}

async function uploadPageImage(file: File) {
  const name = `${Date.now()}-${safeAssetFileName(file.name)}`
  const res = await fetch(`/api/db/file/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; href?: string; name?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  return body.href || `/api/db/file/${encodeURIComponent(body.name || name)}`
}

function pickLocalImageSrc() {
  return new Promise<string>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        resolve('')
        return
      }
      void uploadPageImage(file)
        .then(resolve)
        .catch(() => resolve(''))
    })
    input.addEventListener('cancel', () => resolve(''))
    input.click()
  })
}

function runInsert(editor: Editor, range: Range, insert: SlashInsert) {
  const chain = editor.chain().focus().deleteRange(range)
  if (insert === 'paragraph') return chain.toggleNode('paragraph', 'paragraph').run()
  if (insert === 'heading1') return chain.setNode('heading', { level: 1 }).run()
  if (insert === 'heading2') return chain.setNode('heading', { level: 2 }).run()
  if (insert === 'heading3') return chain.setNode('heading', { level: 3 }).run()
  if (insert === 'bullet') return chain.toggleBulletList().run()
  if (insert === 'ordered') return chain.toggleOrderedList().run()
  if (insert === 'quote') return chain.toggleNode('paragraph', 'paragraph').toggleBlockquote().run()
  if (insert === 'code') return chain.toggleCodeBlock().run()
  if (insert === 'image') return chain.setImage({ src: '', alt: '' }).run()
  if (insert === 'table') return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  if (insert === 'math') return chain.insertBlockMath({ latex: 'E = mc^2' }).run()
  if (insert === 'mathInline') return chain.insertInlineMath({ latex: 'x^2' }).run()
  return chain.setHorizontalRule().run()
}

export function slashCatalog(): SlashItem[] {
  const extras = getPageEditor()?.slashCommands() ?? []
  const blocks = getPageEditor()?.blocks() ?? []
  if (!extras.length && !blocks.length) return SLASH_ITEMS
  const map = new Map(SLASH_ITEMS.map((item) => [item.id, item]))
  for (const extra of extras) {
    const prev = map.get(extra.id)
    map.set(extra.id, {
      id: extra.id,
      label: extra.label ?? prev?.label ?? extra.id,
      hint: extra.hint ?? prev?.hint ?? '',
      aliases: extra.aliases ?? prev?.aliases ?? [],
      blockType: prev?.blockType ?? BASIC_GROUP.blockType,
      blockTypeLabel: prev?.blockTypeLabel ?? BASIC_GROUP.blockTypeLabel,
      command: extra.insert
        ? ({ editor, range }) => runInsert(editor, range, extra.insert!)
        : (prev?.command ?? (({ editor, range }) => editor.chain().focus().deleteRange(range).run())),
    })
  }
  for (const block of blocks) {
    const blockType = block.blockType ?? block.kind
    map.set(block.kind, {
      id: block.kind,
      label: block.label,
      hint: block.hint ?? '自定义块',
      aliases: block.aliases ?? [],
      blockType,
      blockTypeLabel: block.blockTypeLabel ?? (blockType === BASIC_BLOCK_TYPE ? '基础模块' : block.label),
      command: ({ editor, range }) => {
        const id = createPageBlockId()
        const defaults = typeof block.defaults === 'function' ? block.defaults() : { ...(block.defaults ?? {}) }
        const pageName = editorPageTitle(editor)
        const title = String(defaults.title ?? '').trim() || defaultPageBlockTitle(pageName, block.label || block.kind)
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'pageBlock',
            attrs: {
              kind: block.kind,
              plugin: block.plugin,
              id,
              data: { ...defaults, title },
            },
          })
          .run()
      },
    })
  }
  return [...map.values()]
}

export type SlashGroup = { id: string; label: string; items: SlashItem[] }

export function slashGroups(items: SlashItem[]): SlashGroup[] {
  const order: string[] = []
  const map = new Map<string, SlashGroup>()
  for (const item of items) {
    const id = item.blockType || BASIC_BLOCK_TYPE
    let group = map.get(id)
    if (!group) {
      group = { id, label: item.blockTypeLabel || (id === BASIC_BLOCK_TYPE ? '基础模块' : item.label), items: [] }
      map.set(id, group)
      order.push(id)
    }
    group.items.push(item)
  }
  const basic = order.filter((id) => id === BASIC_BLOCK_TYPE)
  const rest = order.filter((id) => id !== BASIC_BLOCK_TYPE)
  return [...basic, ...rest].map((id) => map.get(id)!).filter(Boolean)
}

export function filterSlashItems(query: string) {
  const items = slashCatalog()
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => {
    const hay = [item.id, item.label, item.hint, ...item.aliases].join(' ').toLowerCase()
    return hay.includes(needle)
  })
}

function renderSlash() {
  let component: ReactRenderer<unknown, Record<string, unknown>> | null = null
  let unmount: (() => void) | undefined
  let cancelled = false
  let pending: ({ editor: Editor; mount: (el: HTMLElement) => () => void } & Record<string, unknown>) | null = null

  return {
    onStart(props: { editor: Editor; mount: (el: HTMLElement) => () => void } & Record<string, unknown>) {
      cancelled = false
      pending = props
      if (!slashMayOpen(props.editor)) return
      // TipTap 文档：事务是同步的，ReactRenderer 的 flushSync 不能落在 React effect 里。
      queueMicrotask(() => {
        if (cancelled || !pending) return
        component = new ReactRenderer(SlashList, {
          props: pending,
          editor: pending.editor,
        })
        const el = component.element as HTMLElement
        el.style.zIndex = '10000'
        el.style.maxHeight = `${Math.min(280, Math.max(120, window.innerHeight - 16))}px`
        unmount = pending.mount(el)
      })
    },
    onUpdate(props: Record<string, unknown>) {
      pending = { ...(pending ?? {}), ...props } as typeof pending
      component?.updateProps(props)
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === 'Escape') {
        cancelled = true
        unmount?.()
        return true
      }
      const ref = component?.ref as { onKeyDown?: (props: { event: KeyboardEvent }) => boolean } | null
      return ref?.onKeyDown?.(props) ?? false
    },
    onExit() {
      cancelled = true
      pending = null
      unmount?.()
      unmount = undefined
      component?.destroy()
      component = null
    },
  }
}

export const slashCommand = Extension.create({
  name: 'slash-command',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        allow: ({ editor }) => slashMayOpen(editor),
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        placement: 'bottom-start',
        flip: false,
        floatingUi: {
          strategy: 'fixed',
          middleware: [
            {
              name: 'keepInWindow',
              fn({ rects, elements }) {
                const placed = placeSlashInWindow({
                  caret: {
                    top: rects.reference.y,
                    bottom: rects.reference.y + rects.reference.height,
                    left: rects.reference.x,
                  },
                  menu: {
                    width: Math.max(rects.floating.width, 240),
                    height: Math.max(rects.floating.height, 1),
                  },
                  viewport: { width: window.innerWidth, height: window.innerHeight },
                })
                elements.floating.style.maxHeight = `${placed.maxHeight}px`
                return { x: placed.left, y: placed.top }
              },
            },
          ],
        },
        render: renderSlash,
      } satisfies Partial<SuggestionOptions<SlashItem, SlashItem>>,
    }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
