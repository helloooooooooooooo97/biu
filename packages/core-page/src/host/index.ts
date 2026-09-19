import { dataHome, dataPath, migrateLegacyPageDir } from '@biu/host-plugin-loader/data-dir'
import type { Context } from 'cordis'
import type { CollectionSpec } from '@biu/type-file-system'
import { DATABASE_CHANNEL, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { PagesStore, PageAssetConflictError, type WorkspaceFs } from './store.ts'
import { pageBlocksCollection } from './page-blocks-collection.ts'
import { PAGE_BLOCK_TICK_MS, PageBlocksIndex } from './page-blocks-index.ts'

export { PAGE_ROOT, PAGE_ASSETS, ASSET_GC_GRACE_MS, collectPageAssetNames, PagesStore } from './store.ts'
export { pageBlocksCollection } from './page-blocks-collection.ts'
export { PageBlocksIndex, PAGE_BLOCK_TICK_MS } from './page-blocks-index.ts'

export function pagesCollection(store: PagesStore, index: PageBlocksIndex): CollectionSpec {
  return {
    id: 'pages',
    path: '/pages',
    label: '页面',
    view: {
      moduleId: 'page',
      route: '/pages',
      title: '页面',
      inspector: true,
      blurb: '每页正文在 .biu/pages.sqlite 的 notes 列。正文用 db_content；改标题/标签等用 db_update。合集用 db_update 写 facet：{tags:["facet-2"],values:{导演:"查泽雷"}}。图片不要写 data URL：先 db_asset write name=xxx.png from=本地文件，再 db_content 插入 ![说明](/api/db/file/xxx.png)。附件统一在 .biu/assets。树用 parentId。新建 db_create，删除 db_delete。本表没有 db_action。',
      order: 25,
      icon: 'document',
    },
    schema: {
      labelField: 'title',
      contentField: 'notes',
      parentField: 'parentId',
        columns: ['title', 'tags', 'createdBy', 'updatedBy'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题', writable: true },
        tags: { type: 'multi-select', label: '标签', writable: true },
        notes: { type: 'file', label: '正文', writable: true },
        parentId: { type: 'ref', label: '父级', writable: true },
        dependsOn: { type: 'multi-ref', label: '依赖', writable: true },
      },
    },
    records: { update: true, create: true, delete: true },
    list: (query) => store.list(query?.ids),
    get: (id) => store.get(id),
    update: async (id, patch) => {
      const row = await store.update(id, patch)
      if ('notes' in patch) await index.reindexPage(row)
      return row
    },
    create: async (rows) => {
      const out = []
      for (const fields of rows) {
        const row = await store.create(fields)
        await index.reindexPage(row)
        out.push(row)
      }
      return out
    },
    remove: async (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        await index.dropPage(id)
        await store.remove(id)
      }
      return ids
    },
  }
}

function servePageFile(ctx: Context, store: PagesStore) {
  ctx.inject(['http'], (inner) => {
    inner.http.route('GET', '/api/page/file/:name', async (route) => {
      try {
        const { bytes, type, etag } = await store.readAsset(route.params.name ?? '')
        route.res.writeHead(200, {
          'content-type': type,
          'cache-control': 'no-store',
          etag: `"${etag}"`,
        })
        route.res.end(bytes)
      } catch {
        route.send(404, { error: 'not found' })
      }
    })
    inner.http.route('PUT', '/api/page/file/:name', async (route) => {
      try {
        const ifMatch = String(route.req.headers['if-match'] ?? '').trim().replace(/^W\//, '').replaceAll('"', '')
        const written = await store.writeAsset(route.params.name ?? '', await route.bytes(), {
          etag: ifMatch && ifMatch !== '*' ? ifMatch : '',
        })
        inner.http.broadcast?.(DATABASE_CHANNEL, { ts: Date.now(), asset: { name: written.name, etag: written.etag } })
        route.send(200, { ok: true, ...written })
      } catch (error) {
        if (error instanceof PageAssetConflictError) {
          route.send(409, { error: 'etag conflict', etag: error.etag })
          return
        }
        route.send(400, { error: String(error) })
      }
    })
  })
}

export const name = 'page'
export const inject = ['database', 'fs']

export function apply(ctx: Context) {
  // 页面落到工作区 `.biu`（与 file-system / sessions 同一数据目录的父目录）。
  // 用 defaultRoot，不随 Session 绑定项目路径漂移。
  const workspaceRoot = ctx.fs.workspace.resolve('.')
  const root = process.env.VITEST ? workspaceRoot : dataHome()
  if (root !== workspaceRoot) migrateLegacyPageDir(workspaceRoot, root)
  const fs: WorkspaceFs = {
    resolve: (rel) => ctx.fs.resolveIn(root, rel),
    read: (rel) => ctx.fs.readIn(root, rel),
    write: (rel, content) => ctx.fs.writeIn(root, rel, content),
    list: (rel) => ctx.fs.listIn(root, rel ?? '.'),
  }
  const store = new PagesStore(fs, dataPath(root, 'assets'))
  const index = new PageBlocksIndex(store)
  ctx.database.register(pagesCollection(store, index))
  ctx.database.register(pageBlocksCollection(store, index))
  servePageFile(ctx, store)
  const tick = setInterval(() => {
    void index.sync()
  }, PAGE_BLOCK_TICK_MS)
  tick.unref()
  ctx.effect(() => () => clearInterval(tick))
}

