import { InputRule, mergeAttributes, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Markdown } from '@tiptap/markdown'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { BlockMath, InlineMath, Mathematics } from '@tiptap/extension-mathematics'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { Paragraph } from '@tiptap/extension-paragraph'
import { common, createLowlight } from 'lowlight'
import { pageTextStyle, pageHighlight, Color } from './color-marks.ts'
import { headingSkin } from './heading-skin.ts'
import { pageBlock } from './page-block.ts'
import { pageFind } from './find-plugin.ts'
import { pageAgentEdit } from './agent-edit-plugin.ts'
import { slashCommand } from './slash.ts'
import { pageMention } from './mention.ts'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { openMathPop } from './math-pop.ts'
import { collabCaretUser } from './collab-user.ts'
import type { Doc } from 'yjs'

function latexFromMarkdown(raw: unknown) {
  return String(raw ?? '').trim().replace(/\\([`*_[\]~])/g, '$1')
}

function isBlankParagraph(node: { content?: unknown } | null | undefined) {
  const content = Array.isArray(node?.content) ? node.content : []
  if (content.length === 0) return true
  if (content.length !== 1) return false
  const item = content[0] as { type?: string; text?: string }
  if (item?.type !== 'text') return false
  const text = String(item.text ?? '')
    .replace(/\u00a0/g, '')
    .replace(/&nbsp;/gi, '')
    .trim()
  return !text
}

/** 官方空段会写成 &nbsp;，源码/正文里会直接看见这串字符。空段改成真正的空行。 */
const pageParagraph = Paragraph.extend({
  renderMarkdown: (node, h) => {
    if (!node || isBlankParagraph(node)) return ''
    return h.renderChildren(Array.isArray(node.content) ? node.content : [])
  },
})

function mathAnchor(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof Element) return dom
  try {
    const mapped = editor.view.domAtPos(Math.max(0, pos))
    const node = mapped.node
    const el = node instanceof Element ? node : node.parentElement
    return el?.closest('[data-type="inline-math"], [data-type="block-math"]') ?? el
  } catch {
    return null
  }
}

function editLatex(editor: Editor | undefined, kind: 'block' | 'inline', node: { attrs: Record<string, unknown> }, pos: number) {
  if (!editor || editor.isDestroyed) return
  const anchor = mathAnchor(editor, pos)
  if (!(anchor instanceof Element)) return
  const name = kind === 'block' ? 'blockMath' : 'inlineMath'
  openMathPop({
    anchor,
    latex: String(node.attrs.latex ?? ''),
    onCommit: (next) => {
      if (editor.isDestroyed) return
      const current = editor.state.doc.nodeAt(pos)
      if (!current || current.type.name !== name) return
      if (next === String(current.attrs.latex ?? '')) return
      const chain = editor.chain().setNodeSelection(pos)
      if (kind === 'block') chain.updateBlockMath({ latex: next }).focus().run()
      else chain.updateInlineMath({ latex: next }).focus().run()
    },
  })
}

/** 上游 insertInlineMath 读的是旧 selection，斜杠删掉 `/` 后会插到段落外，插不进去。 */
const pageInlineMath = InlineMath.extend({
  addOptions() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      katexOptions: { throwOnError: false, displayMode: false },
    }
  },
  addCommands() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      insertInlineMath:
        (options) =>
        ({ commands }) => {
          const latex = options.latex
          if (!latex) return false
          const content = { type: this.name, attrs: { latex } }
          return options.pos != null ? commands.insertContentAt(options.pos, content) : commands.insertContent(content)
        },
    }
  },
  addInputRules() {
    return [
      new InputRule({
        find: /(?<!\$)\$([^$\n]+)\$(?!\$)$/,
        handler: ({ state, range, match }) => {
          const latex = match[1].trim()
          if (!latex) return
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }))
        },
      }),
    ]
  },
  parseMarkdown: (token: { latex?: unknown }) => ({
    type: 'inlineMath',
    attrs: { latex: latexFromMarkdown(token.latex) },
  }),
})

const pageBlockMath = BlockMath.extend({
  addOptions() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      katexOptions: { throwOnError: false, displayMode: true },
    }
  },
  parseMarkdown: (token: { latex?: unknown }) => ({
    type: 'blockMath',
    attrs: { latex: latexFromMarkdown(token.latex) },
  }),
})

const pageLowlight = createLowlight(common)

const pageCodeBlock = CodeBlockLowlight.extend({
  renderHTML({ node, HTMLAttributes }) {
    const language = String(node.attrs.language ?? '').trim()
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, language ? { 'data-language': language } : {}),
      [
        'code',
        {
          class: language ? `${this.options.languageClassPrefix}${language} hljs` : 'hljs',
        },
        0,
      ],
    ]
  },
}).configure({
  lowlight: pageLowlight,
  defaultLanguage: null,
})

const pageMathPopKey = new PluginKey('page-math-pop')

const pageMathematics = Mathematics.extend({
  addExtensions() {
    return [pageBlockMath, pageInlineMath]
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: pageMathPopKey,
        props: {
          handleDOMEvents: {
            click(view, event) {
              const target = event.target
              if (!(target instanceof Element)) return false
              const wrap = target.closest('[data-type="inline-math"], [data-type="block-math"]')
              if (!(wrap instanceof Element) || !view.dom.contains(wrap)) return false
              let pos = -1
              try {
                pos = view.posAtDOM(wrap, 0)
              } catch {
                return false
              }
              let node = view.state.doc.nodeAt(pos)
              if (!node || (node.type.name !== 'inlineMath' && node.type.name !== 'blockMath')) {
                const $pos = view.state.doc.resolve(pos)
                node = $pos.nodeAfter ?? $pos.nodeBefore ?? node
                if ($pos.nodeAfter) pos = $pos.pos
                else if ($pos.nodeBefore) pos = $pos.pos - $pos.nodeBefore.nodeSize
              }
              if (!node || (node.type.name !== 'inlineMath' && node.type.name !== 'blockMath')) return false
              event.preventDefault()
              editLatex(editor, node.type.name === 'blockMath' ? 'block' : 'inline', node, pos)
              return true
            },
          },
        },
      }),
    ]
  },
})

export function pageEditorExtensions(collab?: { ydoc: Doc; provider?: unknown; user?: { name: string; color?: string } }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      paragraph: false,
      undoRedo: collab?.ydoc ? false : undefined,
    }),
    pageParagraph,
    pageCodeBlock,
    Markdown,
    pageTextStyle,
    Color,
    pageHighlight,
    Image.configure({ inline: false, allowBase64: true }),
    TableKit.configure({
      table: { resizable: true, allowTableNodeSelection: true },
    }),
    pageMathematics,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return `标题 ${node.attrs.level}`
        return '输入 / 插入模块，@ 引用'
      },
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: false,
    }),
    headingSkin,
    pageBlock,
    pageFind,
    pageAgentEdit,
    slashCommand,
    pageMention,
    ...(collab?.ydoc
      ? [
          Collaboration.configure({ document: collab.ydoc }),
          ...(collab.provider
            ? [
                CollaborationCaret.configure({
                  provider: collab.provider,
                  user: collabCaretUser(collab.user),
                }),
              ]
            : []),
        ]
      : []),
  ]
}
