import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { ArrowDownIcon, ArrowUpIcon, Square2StackIcon, TrashIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/public-ui'
import {
  beginHandleDrag,
  deleteHandleBlock,
  duplicateHandleBlock,
  handleBlockAtPointer,
  handleRailLeft,
  insertParagraphAfter,
  insertParagraphBefore,
  type HandleBlock,
} from './page-block-handle.ts'

const GRIP_H = 26
const HIDE_DELAY_MS = 200

type HandleTarget = HandleBlock & { top: number; left: number; height: number; gripTop: number }

function lineCoords(editor: Editor, found: HandleBlock) {
  const inside = found.node.isAtom || found.node.isLeaf || found.node.nodeSize < 2 ? found.pos : found.pos + 1
  try {
    return editor.view.coordsAtPos(inside)
  } catch {
    return null
  }
}

function readTarget(editor: Editor, host: HTMLElement, clientX: number, clientY: number): HandleTarget | null {
  const found = handleBlockAtPointer(editor, clientX, clientY)
  if (!found) return null
  const raw = editor.view.nodeDOM(found.pos)
  const el = raw instanceof HTMLElement ? raw : raw?.parentElement
  if (!(el instanceof HTMLElement)) return null
  const hostBox = host.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const contentBox = editor.view.dom.getBoundingClientRect()
  const line = lineCoords(editor, found) ?? { top: box.top, bottom: box.top + GRIP_H }
  const gripTop = (line.top + line.bottom) / 2 - box.top - GRIP_H / 2
  return {
    ...found,
    top: box.top - hostBox.top,
    left: handleRailLeft(hostBox.left, contentBox.left),
    height: Math.max(box.height, GRIP_H),
    gripTop: Math.max(0, gripTop),
  }
}

export function PageBlockHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<HandleTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const dragged = useRef(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current)
    setMenuOpen(false)
    setTarget(null)
  }, [])

  useEffect(() => {
    const root = editor.view.dom
    const wrap = root.closest('.page-editor')
    if (!(wrap instanceof HTMLElement)) return

    const cancelHide = () => {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
    }
    const delayHide = () => {
      cancelHide()
      hideTimer.current = window.setTimeout(() => {
        setTarget(null)
        hideTimer.current = undefined
      }, HIDE_DELAY_MS)
    }

    const onMove = (event: MouseEvent) => {
      if (menuOpen) return
      if (!editor.isEditable) {
        delayHide()
        return
      }
      if (event.target instanceof Element && event.target.closest('.page-block-handle')) {
        cancelHide()
        return
      }
      const next = readTarget(editor, wrap, event.clientX, event.clientY)
      if (!next) {
        delayHide()
        return
      }
      cancelHide()
      setTarget(next)
    }

    const onLeave = (event: MouseEvent) => {
      if (menuOpen) return
      const to = event.relatedTarget
      if (to instanceof Node && wrap.contains(to)) return
      delayHide()
    }

    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)
    return () => {
      cancelHide()
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
    }
  }, [editor, menuOpen])

  if (!target || !editor.isEditable) return null

  const run = (fn: () => void) => (event: ReactMouseEvent) => {
    event.preventDefault()
    fn()
    hide()
  }

  const onDragStart = (event: DragEvent) => {
    dragged.current = true
    setMenuOpen(false)
    beginHandleDrag(editor, target.pos, event.dataTransfer)
  }

  const onDragEnd = () => {
    editor.view.dragging = null
  }

  const onGripClick = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (dragged.current) {
      dragged.current = false
      return
    }
    setMenuOpen((open) => !open)
  }

  return (
    <div
      className="page-block-handle"
      style={{ top: target.top, left: target.left, height: target.height }}
      data-testid="page-block-handle"
    >
      <button
        type="button"
        className="page-block-handle-grip"
        style={{ marginTop: target.gripTop }}
        draggable
        aria-label="拖拽或打开块菜单"
        data-testid="page-block-handle-grip"
        onClick={onGripClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <span className="page-block-handle-dots" aria-hidden />
      </button>
      {menuOpen ? (
        <HeadlessDismiss onDismiss={() => setMenuOpen(false)} insideRef={menuRef}>
          <div
            ref={menuRef}
            className="page-block-handle-menu"
            style={{ top: target.gripTop }}
            role="menu"
            data-testid="page-block-handle-menu"
          >
            <button type="button" role="menuitem" onMouseDown={run(() => insertParagraphBefore(editor, target.pos))}>
              <ArrowUpIcon aria-hidden className="size-[14px]" />
              向上插入
            </button>
            <button type="button" role="menuitem" onMouseDown={run(() => insertParagraphAfter(editor, target.pos, target.node))}>
              <ArrowDownIcon aria-hidden className="size-[14px]" />
              向下插入
            </button>
            <button type="button" role="menuitem" onMouseDown={run(() => duplicateHandleBlock(editor, target.pos, target.node))}>
              <Square2StackIcon aria-hidden className="size-[14px]" />
              复制
            </button>
            <button type="button" role="menuitem" onMouseDown={run(() => deleteHandleBlock(editor, target.pos, target.node))}>
              <TrashIcon aria-hidden className="size-[14px]" />
              删除
            </button>
          </div>
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}
