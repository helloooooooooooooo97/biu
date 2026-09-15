import { useRef, useState, type ChangeEvent } from 'react'
import type { Context } from 'cordis'
import type { DatabaseUi, FsContentProps, FsViewProps } from '@biu/type-file-system/ui'

export const name = 'host-skills-ui'
export const inject = ['databaseUi']

/** 分享 Skill 注册记录时只展示发现信息；正文归对应的 /pages Page 树。 */
export function SkillsContent({ record }: FsContentProps) {
  return (
    <div style={{ paddingTop: 12 }}>
      <p style={{ margin: 0, color: 'var(--dsw-label-2)', lineHeight: 1.6 }}>
        {String(record.description ?? '')}
      </p>
      <p style={{ margin: '8px 0 0', color: 'var(--dsw-label-3)', fontSize: 12 }}>
        Skill 正文存储在关联的 Page 树中。
      </p>
    </div>
  )
}

function SkillsLibraryView({ rows, onOpen }: FsViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const chooseDirectory = () => {
    const input = inputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.click()
  }

  const importDirectory = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!selected.length) return
    setBusy(true)
    setMessage('')
    try {
      const files = await Promise.all(
        selected.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          content: await file.text(),
        })),
      )
      const response = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files, source: selected[0]?.webkitRelativePath.split('/')[0] || 'browser-directory' }),
      })
      const body = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`)
      setMessage('导入完成，正在刷新 Skill 仓库…')
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Skill 仓库</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--dsw-label-3)', fontSize: 13 }}>
            Skill 内容存储为 Page 树；标准目录仅在导入时解析。
          </p>
        </div>
        <button type="button" disabled={busy} onClick={chooseDirectory}>
          {busy ? '导入中…' : '导入 Skill 目录'}
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={importDirectory} />
      </div>
      {message ? <p style={{ margin: 0, color: 'var(--dsw-label-2)', fontSize: 13 }}>{message}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpen(row)}
            style={{
              padding: 14,
              border: '1px solid var(--dsw-border)',
              borderRadius: 10,
              background: 'var(--dsw-bg)',
              color: 'var(--dsw-label)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <strong>{String(row.title ?? row.id)}</strong>
            <span style={{ display: 'block', marginTop: 6, color: 'var(--dsw-label-3)', fontSize: 12 }}>
              {String(row.description ?? '')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => {
    const chrome = ui.decorate('/skills', {
      openRow: (row) => ({
        kind: 'record',
        collection: '/pages',
        recordId: String(row.rootPageId ?? ''),
      }),
    })
    const view = ui.registerView('/skills', {
      id: 'skill-library',
      label: '仓库',
      plugin: 'skills',
      View: SkillsLibraryView,
    })
    return () => {
      chrome.dispose()
      view.dispose()
    }
  })
}
