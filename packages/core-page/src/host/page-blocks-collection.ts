import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { parsePageBlockRecordId, patchPageBlockMarkdown } from '@biu/core-editor/host'
import type { PagesStore } from './store.ts'
import { PageBlocksIndex } from './page-blocks-index.ts'

function asDataObject(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('data must be a JSON object')
    return parsed as Record<string, unknown>
  }
  throw new Error('data must be a JSON object')
}

async function recordOf(store: PagesStore, index: PageBlocksIndex, id: string) {
  const hit = await index.get(id)
  if (hit) return hit
  const parsed = parsePageBlockRecordId(id)
  if (!parsed) return null
  const page = await store.get(parsed.pageId)
  if (!page) return null
  await index.reindexPage(page)
  return index.get(id)
}

export function pageBlocksCollection(store: PagesStore, index: PageBlocksIndex): CollectionSpec {
  return {
    id: 'page-blocks',
    path: '/page-blocks',
    label: '组件',
    view: {
      moduleId: 'page-blocks',
      route: '/page-blocks',
      title: '组件',
      inspector: true,
      blurb:
        '页面里嵌的 html、画板、算法题等。记录 id 为 <pageId>::<blockId>。每块都有 title：有就用自己的，没有则默认「页面名 + 类型名」。可在本表直接改标题。改标题也可用 db_update 的 title 或 data.title。索引记 last_run_at，每拍只扫最近改过的页（热窗口优先，再少量补旧），不会一次重建全部。改属性用 db_update：data 为 JSON 对象（默认合并）。不能从本表新建或删除。',
      order: 26,
      icon: 'rectangle-group',
    },
    schema: {
      labelField: 'title',
      contentField: 'data',
      columns: ['title', 'blockKind', 'plugin', 'pageId'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题', writable: true },
        pageId: { type: 'ref', label: '页面', collection: '/pages' },
        blockId: { type: 'string', label: '块 id' },
        blockKind: { type: 'string', label: '类型' },
        plugin: { type: 'string', label: '插件', writable: true },
        data: {
          type: 'string',
          label: '属性',
          writable: true,
          description: '块 data 的 JSON。默认与现有字段合并；replace=true 时整份替换。',
        },
      },
    },
    records: { update: true },
    list: async (query) => {
      await index.sync()
      if (query?.ids?.length) {
        const rows: DbRecord[] = []
        for (const id of query.ids) {
          const row = await recordOf(store, index, id)
          if (row) rows.push(row)
        }
        return rows
      }
      return index.list()
    },
    get: async (id) => {
      await index.sync()
      return recordOf(store, index, id)
    },
    update: async (id, patch) => {
      const parsed = parsePageBlockRecordId(id)
      if (!parsed) throw new Error(`unknown pageBlock: ${id}`)
      const page = await store.get(parsed.pageId)
      if (!page) throw new Error(`unknown page: ${parsed.pageId}`)
      const data = asDataObject(patch.data)
      const extras: Record<string, unknown> = { ...(data ?? {}) }
      if (typeof patch.title === 'string') extras.title = patch.title
      if ('deck' in patch) extras.deck = patch.deck
      if ('width' in patch) extras.width = patch.width
      if ('height' in patch) extras.height = patch.height
      const notes = patchPageBlockMarkdown(page.notes, parsed.blockId, {
        plugin: typeof patch.plugin === 'string' ? patch.plugin : undefined,
        data: Object.keys(extras).length ? extras : undefined,
        replace: patch.replace === true,
      })
      const next = await store.update(page.id, { notes })
      await index.reindexPage(next)
      const row = await index.get(id)
      if (!row) throw new Error(`unknown pageBlock: ${id}`)
      return row
    },
  }
}
