import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { HeadlessPopover } from '@biu/public-ui'
import { SourceEditor, type SourceEditorHandle } from './source-editor.tsx'
import { usePageSourceMode } from './source-mode.ts'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/16/solid'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import type { FsContentProps } from '@biu/type-file-system/ui'
import { pageEditorExtensions } from './kit.ts'
import { PageBlockHandle } from './page-block-handle.tsx'
import { editorHostIsLive } from './editor-live.ts'
import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE, handleContentTitleNav, shouldLeaveContentForTitle, focusRecordTitleNear, isDocStartSelection } from './title-content-nav.ts'
import { tryContentJump, contentJumpForRecord } from './content-jump.ts'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import { bindEditorTextHost, getPick } from '@biu/core-pick/web'
import { markdownLocusFromElement, markdownLocusFromSelection } from './markdown-locus.ts'
import { FindBar, isFindHotkey } from './find-bar.tsx'
import { applyEditorFind } from './find-plugin.ts'
import { EDITOR_TONES, tagTextColor, tagWashColor } from './color-swatches.ts'
import { isSendChatHotkey, pickFromEditor, pickFromLocus } from './editor-ask.ts'

const LOCAL_EDIT_MS = 600

/** 本地刚打过字时不要用远端正文盖掉光标；只看聚焦会挡住 db_content 的实时套入。 */
export function shouldApplyRemoteMarkdown(args: {
  focused: boolean
  live: boolean
  hasJump: boolean
  recentlyLocal: boolean
}) {
  if (args.hasJump) return true
  if (args.focused && args.live && args.recentlyLocal) return false
  return true
}

export function recentlyLocalEdit(typedAt: number, now = Date.now()) {
  return now - typedAt < LOCAL_EDIT_MS
}

function jumpToPending(editor: Editor, markdown: string, recordId: string, force = false) {
  const run = () => {
    if (editor.isDestroyed) return
    tryContentJump(editor, markdown, recordId, force)
  }
  run()
  requestAnimationFrame(run)
}

function asMarkdown(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value) && typeof (value as { body?: unknown }).body === 'string') {
    return String((value as { body: string }).body)
  }
  return String(value)
}

function recordTitle(record: { title?: unknown; name?: unknown; id?: unknown }) {
  return String(record.title ?? record.name ?? '').trim()
}

function stampLiveEditor(
  root: HTMLElement | null,
  next: { path?: string; title?: string; line?: number; insert?: number },
) {
  if (!root) return
  if (next.path) root.dataset.livePath = next.path
  else delete root.dataset.livePath
  if (next.title) root.dataset.liveTitle = next.title
  else delete root.dataset.liveTitle
  if (next.line != null) root.dataset.liveLine = String(next.line)
  else delete root.dataset.liveLine
  if (next.insert != null) root.dataset.liveInsert = String(next.insert)
  else delete root.dataset.liveInsert
  root.dataset.liveAt = String(Date.now())
}

function holdSelection(event: MouseEvent) {
  event.preventDefault()
}

function ColorMenus({
  editor,
  open,
  onOpen,
}: {
  editor: Editor
  open: 'text' | 'mark' | null
  onOpen: (next: 'text' | 'mark' | null) => void
}) {
  const color = String(editor.getAttributes('textStyle').color ?? '')
  const highlight = String(editor.getAttributes('highlight').color ?? '')

  const flyout = (kind: 'text' | 'mark') => {
    const current = kind === 'text' ? color : highlight
    return (
      <div
        className="page-color-menu"
        role="menu"
        aria-label={kind === 'text' ? '文字颜色' : '背景色'}
        onMouseDown={holdSelection}
      >
        <div className="page-color-menu-h">{kind === 'text' ? '文字颜色' : '背景色'}</div>
        <div className="page-color-grid">
          {EDITOR_TONES.map((tone) => {
            const value = kind === 'text' ? tagTextColor(tone) : tagWashColor(tone)
            const on = current.toLowerCase() === value.toLowerCase()
            return (
              <button
                key={tone}
                type="button"
                role="menuitemradio"
                className={on ? 'is-on' : undefined}
                aria-checked={on}
                aria-label={tone}
                data-testid={kind === 'text' ? `page-color-${tone}` : `page-highlight-${tone}`}
                style={
                  kind === 'text'
                    ? { color: tagTextColor(tone), background: 'transparent' }
                    : { background: tagWashColor(tone), color: tagTextColor(tone) }
                }
                onMouseDown={holdSelection}
                onClick={() => {
                  if (kind === 'text') editor.chain().focus().setColor(value).run()
                  else editor.chain().focus().toggleHighlight({ color: value }).run()
                  onOpen(null)
                }}
              >
                {kind === 'text' ? 'A' : ''}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="page-color-clear"
          data-testid={kind === 'text' ? 'page-color-none' : 'page-highlight-none'}
          onMouseDown={holdSelection}
          onClick={() => {
            if (kind === 'text') editor.chain().focus().unsetColor().run()
            else editor.chain().focus().unsetHighlight().run()
            onOpen(null)
          }}
        >
          清除
        </button>
      </div>
    )
  }

  return (
    <>
      <HeadlessPopover
        open={open === 'text'}
        onOpenChange={(next) => onOpen(next ? 'text' : null)}
        side="bottom"
        align="start"
        trigger={
          <button
            type="button"
            className={color || open === 'text' ? 'is-on' : undefined}
            title="文字颜色"
            aria-label="文字颜色"
            aria-haspopup="menu"
            aria-expanded={open === 'text'}
            onMouseDown={holdSelection}
          >
            <span className="page-bubble-letter" style={{ color: color || '#F0EFED' }}>
              A
            </span>
          </button>
        }
      >
        {flyout('text')}
      </HeadlessPopover>
      <HeadlessPopover
        open={open === 'mark'}
        onOpenChange={(next) => onOpen(next ? 'mark' : null)}
        side="bottom"
        align="start"
        trigger={
          <button
            type="button"
            className={highlight || open === 'mark' ? 'is-on' : undefined}
            title="背景色"
            aria-label="背景色"
            aria-haspopup="menu"
            aria-expanded={open === 'mark'}
            onMouseDown={holdSelection}
          >
            <span
              className="page-bubble-mark"
              style={{ background: highlight || 'color-mix(in srgb, var(--dsw-label) 18%, transparent)' }}
            />
          </button>
        }
      >
        {flyout('mark')}
      </HeadlessPopover>
    </>
  )
}

function Bubble({
  editor,
  onSendChat,
}: {
  editor: Editor
  onSendChat: () => void
}) {
  const [colorOpen, setColorOpen] = useState<'text' | 'mark' | null>(null)
  const btn = (label: string, on: boolean, run: () => void) => (
    <button
      type="button"
      className={on ? 'is-on' : undefined}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault()
        run()
      }}
    >
      {label}
    </button>
  )

  return (
    <BubbleMenu
      editor={editor}
      className="page-bubble"
      aria-label="文字样式"
      shouldShow={({ editor: current, from, to }) => {
        if (current.isActive('table')) return false
        if (colorOpen) return true
        return from !== to
      }}
    >
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {btn('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run())}
      {btn('</>', editor.isActive('code'), () => editor.chain().focus().toggleCode().run())}
      {btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      <ColorMenus editor={editor} open={colorOpen} onOpen={setColorOpen} />
      <button
        type="button"
        className="page-bubble-chat"
        title="送到对话"
        aria-label="送到对话"
        onMouseDown={(event: MouseEvent) => {
          event.preventDefault()
          onSendChat()
        }}
      >
        <ChatBubbleLeftRightIcon className="page-bubble-chat-icon" aria-hidden />
        ⌘L
      </button>
    </BubbleMenu>
  )
}

function TableBar({ editor }: { editor: Editor }) {
  const btn = (label: string, run: () => void) => (
    <button
      type="button"
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault()
        run()
      }}
    >
      {label}
    </button>
  )
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="page-table-bar"
      className="page-bubble"
      aria-label="表格"
      shouldShow={({ editor: current }) => current.isActive('table')}
    >
      {btn('+列', () => editor.chain().focus().addColumnAfter().run())}
      {btn('+行', () => editor.chain().focus().addRowAfter().run())}
      {btn('删列', () => editor.chain().focus().deleteColumn().run())}
      {btn('删行', () => editor.chain().focus().deleteRow().run())}
      {btn('删表', () => editor.chain().focus().deleteTable().run())}
    </BubbleMenu>
  )
}

export function PageEditor({ record, value, writable, onChange, path }: FsContentProps) {
  const source = usePageSourceMode(record.id)
  const saved = useRef(asMarkdown(value))
  const sourceMode = useRef(source)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typedAt = useRef(0)
  const valueRef = useRef(value)
  valueRef.current = value
  const hydratedId = useRef<string | null>(null)
  const sourceFind = useRef<SourceEditorHandle>(null)
  const editorRef = useRef<Editor | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path
  const titleRef = useRef(recordTitle(record))
  titleRef.current = recordTitle(record)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const [findTotal, setFindTotal] = useState(0)

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: writable !== false,
      extensions: pageEditorExtensions(),
      content: asMarkdown(value),
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'tiptap',
          role: 'textbox',
          'aria-label': '正文',
          'data-testid': 'page-editor',
        },
        handleKeyDown: (view, event) => {
          if (isFindHotkey(event)) {
            event.preventDefault()
            setFindOpen(true)
            const { from, to } = view.state.selection
            if (from !== to) setFindQuery(view.state.doc.textBetween(from, to))
            return true
          }
          return handleContentTitleNav(view, event)
        },
        handleDOMEvents: {
          dragover(view, event) {
            if (!view.dragging?.move || !event.dataTransfer) return false
            event.dataTransfer.dropEffect = 'move'
            return false
          },
        },
      },
      onSelectionUpdate: ({ editor: current }) => {
        const host = current.view.dom.closest('.page-editor')
        if (host instanceof HTMLElement) {
          const locus = markdownLocusFromSelection(current)
          stampLiveEditor(host, {
            path: pathRef.current,
            title: titleRef.current,
            line: locus?.start_line,
            insert: locus?.insert,
          })
        }
      },
      onUpdate: ({ editor: current }) => {
        if (hydratedId.current !== record.id) return
        typedAt.current = Date.now()
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          queueMicrotask(() => {
            if (current.isDestroyed) return
            const next = current.getMarkdown()
            if (next === saved.current) return
            saved.current = next
            onChange?.(next)
          })
        }, 400)
      },
      onBlur: ({ editor: current }) => {
        if (hydratedId.current !== record.id) return
        if (timer.current) clearTimeout(timer.current)
        queueMicrotask(() => {
          if (current.isDestroyed) return
          const next = current.getMarkdown()
          if (next === saved.current) return
          saved.current = next
          onChange?.(next)
        })
      },
    },
    [record.id],
  )
  editorRef.current = editor ?? null

  useEffect(() => {
    hydratedId.current = null
  }, [record.id])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const md = asMarkdown(value)
    if (hydratedId.current !== record.id) {
      if (value == null) return
      saved.current = md
      hydratedId.current = record.id
      editor.commands.setContent(md, { contentType: 'markdown', emitUpdate: false })
      jumpToPending(editor, md, record.id, true)
      return
    }
    if (md === saved.current) {
      jumpToPending(editor, md, record.id)
      return
    }
    const paint = (next: string) => {
      saved.current = next
      editor.commands.setContent(next, { contentType: 'markdown', emitUpdate: false })
      jumpToPending(editor, next, record.id, true)
    }
    const canPaint = () =>
      shouldApplyRemoteMarkdown({
        focused: editor.isFocused,
        live: editorHostIsLive(editor),
        hasJump: Boolean(contentJumpForRecord(record.id)),
        recentlyLocal: recentlyLocalEdit(typedAt.current),
      })
    if (!canPaint()) {
      if (remoteTimer.current) clearTimeout(remoteTimer.current)
      const wait = () => {
        if (editor.isDestroyed) return
        const next = asMarkdown(valueRef.current)
        if (next === saved.current) return
        if (!canPaint()) {
          remoteTimer.current = setTimeout(wait, LOCAL_EDIT_MS)
          return
        }
        paint(next)
      }
      remoteTimer.current = setTimeout(wait, LOCAL_EDIT_MS)
      return
    }
    paint(md)
  }, [editor, record.id, value])

  useEffect(() => () => {
    if (remoteTimer.current) clearTimeout(remoteTimer.current)
  }, [])

  useEffect(() => {
    if (!editor || editor.isDestroyed || source) return
    const el = editor.view.dom
    bindEditorTextHost(el, {
      path: path || undefined,
      title: recordTitle(record) || undefined,
      locusFromSelection: () => markdownLocusFromSelection(editor),
      locusFromElement: (node) => markdownLocusFromElement(editor, node),
    })
    return () => bindEditorTextHost(el, null)
  }, [editor, source, path, record])

  useEffect(() => {
    if (!editor || editor.isDestroyed || !source) return
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    const next = editor.getMarkdown()
    if (next === saved.current) return
    saved.current = next
    onChange?.(next)
  }, [source, editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const leavingSource = sourceMode.current && !source
    sourceMode.current = source
    if (source || !leavingSource) return
    const md = asMarkdown(value)
    saved.current = md
    if (md === editor.getMarkdown()) return
    editor.commands.setContent(md, { contentType: 'markdown', emitUpdate: false })
  }, [source, editor, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(writable !== false)
  }, [editor, writable])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const onFocus = () => {
      if (editor.isDestroyed || !editorHostIsLive(editor)) return
      editor.commands.focus('start')
    }
    window.addEventListener(FOCUS_RECORD_CONTENT, onFocus)
    return () => window.removeEventListener(FOCUS_RECORD_CONTENT, onFocus)
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const onJump = () => {
      if (editor.isDestroyed) return
      jumpToPending(editor, asMarkdown(value), record.id, true)
    }
    window.addEventListener(CONTENT_JUMP_EVENT, onJump)
    return () => window.removeEventListener(CONTENT_JUMP_EVENT, onJump)
  }, [editor, record.id, value])

  const runFind = (query: string, index: number) => {
    if (source) {
      const next = sourceFind.current?.applyFind(query, index) ?? { total: 0, index: 0 }
      setFindIndex(next.index)
      setFindTotal(next.total)
      return
    }
    if (!editor || editor.isDestroyed) return
    const next = applyEditorFind(editor, query, index)
    setFindIndex(next.index)
    setFindTotal(next.total)
  }

  useEffect(() => {
    if (!findOpen) {
      if (source) sourceFind.current?.applyFind('', 0)
      else if (editor && !editor.isDestroyed) applyEditorFind(editor, '', 0)
      setFindTotal(0)
      return
    }
    if (!source) {
      runFind(findQuery, 0)
      return
    }
    const id = requestAnimationFrame(() => runFind(findQuery, 0))
    return () => cancelAnimationFrame(id)
  }, [findOpen, findQuery, source, editor])

  const currentPick = () => {
    if (source) return pickFromLocus(path, sourceFind.current?.getLocus() ?? null, undefined, recordTitle(record))
    if (!editor || editor.isDestroyed) return null
    return pickFromEditor(editor, path, recordTitle(record))
  }

  const sendToChat = () => {
    const ref = currentPick()
    if (ref) getPick()?.attach([ref])
  }

  const onEditorHotkey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isFindHotkey(event)) {
      event.preventDefault()
      event.stopPropagation()
      setFindOpen(true)
      if (!source && editor && !editor.isDestroyed) {
        const { from, to } = editor.state.selection
        if (from !== to) setFindQuery(editor.state.doc.textBetween(from, to))
      }
      return
    }
    if (isSendChatHotkey(event)) {
      event.preventDefault()
      event.stopPropagation()
      sendToChat()
      return
    }
    const atDocStart = source
      ? Boolean(sourceFind.current?.isAtStart())
      : Boolean(
          editor &&
            !editor.isDestroyed &&
            isDocStartSelection(
              editor.state.selection.from,
              editor.state.selection.empty,
              Selection.atStart(editor.state.doc).from,
            ),
        )
    const nested = Boolean(
      !source && editor && !editor.isDestroyed && editor.state.selection.$from.depth > 1,
    )
    if (atDocStart && shouldLeaveContentForTitle(event.key, event, 0, true, 0, nested)) {
      event.preventDefault()
      event.stopPropagation()
      if (!focusRecordTitleNear(event.currentTarget)) {
        window.dispatchEvent(new Event(FOCUS_RECORD_TITLE))
      }
    }
  }

  const findBar = findOpen ? (
    <FindBar
      query={findQuery}
      index={findIndex}
      total={findTotal}
      onQuery={setFindQuery}
      onNext={() => runFind(findQuery, findIndex + 1)}
      onPrev={() => runFind(findQuery, findIndex - 1)}
      onClose={() => {
        setFindOpen(false)
        if (!source && editor && !editor.isDestroyed) editor.commands.focus()
      }}
    />
  ) : null

  if (!editor) return <div className="page-editor" data-testid="page-editor-pending" />

  if (source) {
    return (
      <div className="page-editor is-source" onKeyDownCapture={onEditorHotkey}>
        {findBar}
        <SourceEditor
          ref={sourceFind}
          value={asMarkdown(value)}
          writable={writable !== false}
          onChange={(next) => {
            if (next === saved.current) return
            saved.current = next
            onChange?.(next)
          }}
        />
      </div>
    )
  }

  return (
    <div className="page-editor" onKeyDownCapture={onEditorHotkey}>
      {findBar}
      <EditorContent editor={editor} />
      {writable !== false ? <PageBlockHandle editor={editor} /> : null}
      {writable !== false ? <Bubble editor={editor} onSendChat={sendToChat} /> : null}
      {writable !== false ? <TableBar editor={editor} /> : null}
    </div>
  )
}
