import type { DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues } from '@biu/type-file-system'
import { listPageBlockFences, pageBlockData, pageBlockRecordId, parsePageBlockRecordId, uniquifyPageBlockMarkdown, defaultPageBlockTitle } from '@biu/core-editor/host'
import type { PagesStore, PageRow } from './store.ts'
import { collectPageAssetNames } from './store.ts'
import { replacePageBlockRefs } from '@biu/host-plugin-loader/data-dir'

export const PAGE_BLOCK_HOT_WINDOW_MS = 5 * 60 * 1000
export const PAGE_BLOCK_HOT_LIMIT = 24
export const PAGE_BLOCK_WARM_LIMIT = 8
export const PAGE_BLOCK_TICK_MS = 15_000

type Cover = { page_id: string; page_updated_at: number }
type IndexRow = {
  page_id: string
  block_id: string
  kind: string
  plugin: string
  title: string
  page_title: string
  data_json: string
  page_created_at: number
  page_updated_at: number
}

function blockTitle(pageName: string, kindName: string, data: Record<string, unknown>) {
  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim()
  return defaultPageBlockTitle(pageName, kindName)
}

function pageNameFromRecord(rec: { data?: unknown } | null): string {
  const data = rec?.data && typeof rec.data === 'object' && !Array.isArray(rec.data) ? (rec.data as Record<string, unknown>) : {}
  return String(data.title ?? data.name ?? data.label ?? '').trim()
}

function slimBlockIndexData(kind: string, plugin: string, data: Record<string, unknown>, blockId: string) {
  const bodyKeys = new Set(['html', 'script', 'code', 'source', 'body'])
  const attrs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (bodyKeys.has(key)) continue
    attrs[key] = value
  }
  return {
    blockId,
    kind,
    plugin,
    attrs,
    assets: [...collectPageAssetNames(data)].sort(),
  }
}

function toRecord(row: IndexRow): DbRecord {
  return {
    id: pageBlockRecordId(row.page_id, row.block_id),
    title: row.title,
    pageId: row.page_id,
    pageTitle: row.page_title || undefined,
    blockId: row.block_id,
    blockKind: row.kind,
    plugin: row.plugin,
    data: row.data_json,
    ...recordBuiltinValues({ createdAt: row.page_created_at, updatedAt: row.page_updated_at }),
  }
}

export type PageBlocksIndexOptions = {
  hotWindowMs?: number
  hotLimit?: number
  warmLimit?: number
}

/** 倒排只扫脏页：先最近窗口，再少量补旧的；每拍有上限。 */
export class PageBlocksIndex {
  constructor(
    private store: PagesStore,
    private opts: PageBlocksIndexOptions = {},
  ) {}

  private hotWindowMs() {
    return this.opts.hotWindowMs ?? PAGE_BLOCK_HOT_WINDOW_MS
  }

  private hotLimit() {
    return this.opts.hotLimit ?? PAGE_BLOCK_HOT_LIMIT
  }

  private warmLimit() {
    return this.opts.warmLimit ?? PAGE_BLOCK_WARM_LIMIT
  }

  private async db() {
    return this.store.sqlite()
  }

  lastRunAt() {
    return this.readMeta('last_run_at').then((raw) => Number(raw) || 0)
  }

  private async readMeta(key: string) {
    const db = await this.db()
    const row = db.prepare('SELECT value FROM page_block_index_meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? ''
  }

  private async writeMeta(key: string, value: string) {
    const db = await this.db()
    db.prepare('INSERT INTO page_block_index_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
  }

  async reindexPage(page: PageRow) {
    const unique = uniquifyPageBlockMarkdown(page.notes)
    const row = unique.changed ? await this.store.update(page.id, { notes: unique.markdown }) : page
    const db = await this.db()
    const fences = listPageBlockFences(row.notes).filter((item) => item.id)
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM page_block_index WHERE page_id = ?').run(row.id)
      const insert = db.prepare(`
        INSERT INTO page_block_index(
          page_id, block_id, kind, plugin, title, page_title, data_json, page_created_at, page_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const seen = new Set<string>()
      const pageTitle = String(row.title ?? '').trim()
      const blockRefs: Array<{ blockId: string; names: Iterable<string> }> = []
      for (const fence of fences) {
        if (seen.has(fence.id)) continue
        seen.add(fence.id)
        const data = pageBlockData(fence)
        insert.run(
          row.id,
          fence.id,
          fence.kind,
          fence.plugin,
          blockTitle(pageTitle, fence.kind, data),
          pageTitle,
          JSON.stringify(slimBlockIndexData(fence.kind, fence.plugin, data, fence.id)),
          row.createdAt,
          row.updatedAt,
        )
        blockRefs.push({ blockId: fence.id, names: collectPageAssetNames(data) })
      }
      db.prepare(
        'INSERT INTO page_block_cover(page_id, page_updated_at) VALUES(?, ?) ON CONFLICT(page_id) DO UPDATE SET page_updated_at=excluded.page_updated_at',
      ).run(row.id, row.updatedAt)
      replacePageBlockRefs(db, row.id, blockRefs)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  async dropPage(pageId: string) {
    const db = await this.db()
    db.prepare('DELETE FROM page_block_index WHERE page_id = ?').run(pageId)
    db.prepare('DELETE FROM page_block_cover WHERE page_id = ?').run(pageId)
    try {
      db.prepare(`DELETE FROM block_refs WHERE collection = '/pages' AND record_id = ?`).run(pageId)
    } catch {
      /* table may not exist yet */
    }
  }

  async sync(now = Date.now()) {
    const db = await this.db()
    const pages = await this.store.list()
    const live = new Set(pages.map((item) => item.id))
    const covers = (db.prepare('SELECT page_id, page_updated_at FROM page_block_cover').all() as Cover[])
    const coverAt = new Map(covers.map((item) => [item.page_id, item.page_updated_at]))
    for (const item of covers) {
      if (!live.has(item.page_id)) await this.dropPage(item.page_id)
    }
    const dirty = pages.filter((page) => (coverAt.get(page.id) ?? -1) < page.updatedAt)
    const hotCut = now - this.hotWindowMs()
    const hot = dirty.filter((page) => page.updatedAt >= hotCut).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    const takeHot = hot.slice(0, this.hotLimit())
    const taken = new Set(takeHot.map((item) => item.id))
    const warm = dirty
      .filter((page) => !taken.has(page.id))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
      .slice(0, this.warmLimit())
    const batch = [...takeHot, ...warm]
    for (const slim of batch) {
      const page = await this.store.get(slim.id)
      if (!page) continue
      try {
        await this.reindexPage(page)
      } catch {
        /* 单页索引失败不拖垮 host */
      }
    }
    await this.writeMeta('last_run_at', String(now))
    await this.writeMeta('last_batch', String(batch.length))
    return { scanned: batch.length, dirty: dirty.length, lastRunAt: now }
  }

  async list() {
    const db = await this.db()
    const rows = db.prepare('SELECT * FROM page_block_index ORDER BY page_id, block_id').all() as IndexRow[]
    return rows.map(toRecord)
  }

  async get(id: string) {
    const parsed = parsePageBlockRecordId(id)
    if (!parsed) return null
    const db = await this.db()
    const row = db.prepare('SELECT * FROM page_block_index WHERE page_id = ? AND block_id = ?').get(parsed.pageId, parsed.blockId) as IndexRow | undefined
    return row ? toRecord(row) : null
  }
}
