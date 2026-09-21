import { CellMulti } from '@biu/database-ui'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome, FsCellProps, FsDetailPaneProps } from '@biu/type-file-system/ui'

export type McpCatalogItem = {
  name: string
  description?: string
  allowed: boolean
}

export function catalogOf(record: DbRecord): McpCatalogItem[] {
  const raw = record.catalog
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const name = String(row.name ?? '').trim()
      if (!name) return null
      return {
        name,
        description: typeof row.description === 'string' ? row.description : '',
        allowed: row.allowed !== false,
      }
    })
    .filter((item): item is McpCatalogItem => Boolean(item))
}

export function namesOf(record: DbRecord): string[] {
  return catalogOf(record).map((item) => item.name)
}

export function asNameList(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean)
}

async function patchMcp(id: string, content: Record<string, unknown>) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/mcp/${id}`, content }),
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  window.dispatchEvent(new Event('fsdb:change'))
}

function FilterCell({ field, value, record }: FsCellProps) {
  const names = namesOf(record)
  const selected = asNameList(value)
  const locked = record.builtin === true || record.builtin === 'true'
  if (!names.length && !selected.length) {
    return <span className="fsdb-muted">{locked ? '—' : '连接后从下方清单勾选'}</span>
  }
  if (locked) {
    return <span>{selected.length ? selected.join(', ') : '不限制'}</span>
  }
  return (
    <CellMulti
      values={selected}
      options={names.map((item) => ({ value: item, label: item }))}
      allowCreate={false}
      multiple
      onChange={(next) => {
        void patchMcp(String(record.id), { [field]: next })
      }}
    />
  )
}

function ToolsPane({ record }: FsDetailPaneProps) {
  const tools = catalogOf(record)
  const allow = asNameList(record.allow)
  const deny = asNameList(record.deny)
  const locked = record.builtin === true || record.builtin === 'true'
  if (!tools.length) {
    return <p className="mcp-tools-empty">还没拉到工具。连上服务器或点「刷新工具」后再看清单。</p>
  }

  function toggle(list: string[], name: string, on: boolean) {
    if (on) return list.includes(name) ? list : [...list, name]
    return list.filter((item) => item !== name)
  }

  return (
    <ul className="mcp-tools" data-testid="mcp-tools">
      {tools.map((tool) => {
        const excluded = deny.includes(tool.name)
        const allowOn = allow.includes(tool.name)
        return (
          <li key={tool.name} className={`mcp-tool${tool.allowed ? '' : ' is-blocked'}`}>
            <div className="mcp-tool-copy">
              <code className="mcp-tool-name">{tool.name}</code>
              {tool.description ? <span className="mcp-tool-desc">{tool.description}</span> : null}
            </div>
            <div className="mcp-tool-flags">
              <span className={`mcp-tool-state${tool.allowed ? ' is-on' : ''}`}>{tool.allowed ? '已放出' : '未放出'}</span>
              {locked ? null : (
                <>
                  <button
                    type="button"
                    className={`mcp-tool-toggle${allowOn ? ' is-on' : ''}`}
                    aria-pressed={allowOn}
                    onClick={() => void patchMcp(String(record.id), { allow: toggle(allow, tool.name, !allowOn) })}
                  >
                    只放出
                  </button>
                  <button
                    type="button"
                    className={`mcp-tool-toggle is-deny${excluded ? ' is-on' : ''}`}
                    aria-pressed={excluded}
                    onClick={() => void patchMcp(String(record.id), { deny: toggle(deny, tool.name, !excluded) })}
                  >
                    排除
                  </button>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export const mcpChrome: CollectionChrome = {
  cells: {
    allow: FilterCell,
    deny: FilterCell,
  },
  panes: [
    {
      id: 'tools',
      label: '工具',
      badge: (record) => catalogOf(record).length || undefined,
      Pane: ToolsPane,
    },
  ],
}
