import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { PlayIcon } from '@heroicons/react/16/solid'
import { RenderBoundary } from '@biu/public-ui'
import { getPageEditor, usePageEditorVersion } from './service.ts'
import { formatPageBlockFence, requestEnablePageBlockPlugin } from './page-block-meta.ts'
import { bindPageBlockPlugin } from './page-block-plugin-host.ts'

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

async function copyPageAsset(from: string, to: string) {
  const src = assetName(from)
  const dest = assetName(to)
  const res = await fetch(`/api/page/file/${encodeURIComponent(src)}`)
  let payload: unknown = { elements: [], appState: { theme: 'dark' }, files: {} }
  if (res.ok) {
    try {
      payload = JSON.parse(await res.text())
    } catch {
      /* keep empty */
    }
  }
  await fetch(`/api/page/file/${encodeURIComponent(dest)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function PageBlockMissing({ kind, plugin, data }: { kind: string; plugin: string; data: Record<string, unknown> }) {
  const source = formatPageBlockFence(kind, plugin, data)
  return (
    <div className="page-block-missing" data-testid="page-block-missing">
      <div className="page-block-missing-head">
        {plugin ? (
          <code className="page-block-missing-id">{plugin}</code>
        ) : (
          <span className="page-block-missing-state">没有插件 id</span>
        )}
        {plugin ? (
          <button
            type="button"
            className="page-block-missing-enable"
            data-testid="page-block-enable"
            title="启用"
            aria-label="启用"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              requestEnablePageBlockPlugin(plugin, kind)
            }}
          >
            <PlayIcon aria-hidden className="page-block-missing-enable-icon" />
          </button>
        ) : null}
      </div>
      <pre className="page-block-missing-source">{source}</pre>
    </div>
  )
}

export function PageBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  usePageEditorVersion()
  const kind = String(node.attrs.kind ?? 'card')
  const plugin = String(node.attrs.plugin ?? '').trim()
  const data = (node.attrs.data && typeof node.attrs.data === 'object' ? node.attrs.data : {}) as Record<string, unknown>
  const spec = getPageEditor()?.block(kind)
  const cloneFrom = typeof data.cloneFrom === 'string' ? data.cloneFrom : ''
  const file = typeof data.file === 'string' ? data.file : ''
  const blockId = String(node.attrs.id ?? '').trim()
  const pickId = blockId || `${plugin || 'page-block'}:${kind}`
  const pickLabel = spec?.label || kind
  const update = (patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const next = opts?.replace ? { ...patch } : { ...data, ...patch }
    if (!Object.prototype.hasOwnProperty.call(patch, 'title') && typeof data.title === 'string') {
      next.title = data.title
    }
    updateAttributes({ data: next })
  }
  const View = spec?.View
  const hostRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => bindPageBlockPlugin(hostRef.current, plugin), [plugin, kind, View, data])

  useEffect(() => {
    if (!cloneFrom || !file) return
    let gone = false
    void copyPageAsset(cloneFrom, file).then(() => {
      if (gone) return
      update({ cloneFrom: undefined })
    })
    return () => {
      gone = true
    }
  }, [cloneFrom, file])

  const onMouseDown = (event: MouseEvent) => {
    if (!editor.isEditable || editor.isDestroyed) return
    if (event.target instanceof Element && event.target.closest('textarea, input, select, button, a')) return
    // Pick overlay resolves the inner html node. A node selection here becomes
    // a markdown fence pick on pointerup and hides that node.
    if (document.documentElement.classList.contains('pick-mode')) return
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.chain().setNodeSelection(pos).run()
  }

  return (
    <NodeViewWrapper
      ref={hostRef}
      className="page-block"
      data-page-block={kind}
      data-page-block-plugin={plugin}
      data-page-block-id={blockId || undefined}
      data-page-block-capture=""
      data-biu-plugin={plugin || undefined}
      data-biu-kind="plugin"
      data-biu-id={pickId}
      data-biu-label={pickLabel}
      contentEditable={false}
      data-testid={`page-block-${kind}`}
      onMouseDown={onMouseDown}
    >
      {cloneFrom ? (
        <div className="page-block-missing">正在复制附件…</div>
      ) : View ? (
        // 文档里的插件块崩了只烂这一块，不该让整个应用白屏。
        <RenderBoundary label={plugin || kind}>
          <View data={data} update={update} writable={editor.isEditable} />
        </RenderBoundary>
      ) : (
        <PageBlockMissing kind={kind} plugin={plugin} data={data} />
      )}
    </NodeViewWrapper>
  )
}
