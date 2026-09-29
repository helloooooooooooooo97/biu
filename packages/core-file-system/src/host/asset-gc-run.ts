import { dirname, extname } from 'node:path'
import {
  adoptCasAssets,
  ASSET_GC_CANDIDATE_MS,
  gcCasAssets,
  listGcCandidates,
  previewGcCasAssets,
  workspaceFromSqlite,
} from '@biu/host-plugin-loader/data-dir'
type DatabaseSync = import('node:sqlite').DatabaseSync

export type NoticeFileCard = {
  name: string
  href: string
  image: boolean
}

export type AssetGcNoticeSink = {
  push: (input: {
    kind: 'session'
    title: string
    body: string
    sourceKey: string
    content?: NoticeFileCard[]
  }) => unknown
}

export type AssetGcHooks = {
  db: DatabaseSync
  assetsDir: string
  sqlitePath: string
  notices?: AssetGcNoticeSink
}

function assetGcContext(hooks: AssetGcHooks) {
  return {
    db: hooks.db,
    assetsDir: hooks.assetsDir,
    ...workspaceFromSqlite(hooks.sqlitePath),
  }
}

function notify(
  hooks: AssetGcHooks,
  title: string,
  body: string,
  sourceKey: string,
  content?: NoticeFileCard[],
) {
  hooks.notices?.push({ kind: 'session', title, body, sourceKey, ...(content?.length ? { content } : {}) })
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

function assetMime(db: DatabaseSync, name: string) {
  try {
    const row = db.prepare('SELECT mime FROM attachments WHERE name = ?').get(name) as { mime?: string } | undefined
    return String(row?.mime ?? '')
  } catch {
    return ''
  }
}

/** 详情区卡片用的附件清单。摘要只放一句话，文件不进 body。 */
export function assetNoticeFiles(db: DatabaseSync, names: string[]): NoticeFileCard[] {
  return names.map((name) => {
    const mime = assetMime(db, name)
    return {
      name,
      href: `/api/db/file/${encodeURIComponent(name)}`,
      image: mime.startsWith('image/') || IMAGE_EXT.has(extname(name).toLowerCase()),
    }
  })
}

const CANDIDATE_DAYS = Math.round(ASSET_GC_CANDIDATE_MS / (24 * 60 * 60 * 1000))

function adoptIfDurable(hooks: AssetGcHooks) {
  if (!hooks.sqlitePath || hooks.sqlitePath === ':memory:') return
  adoptCasAssets(dirname(hooks.sqlitePath))
}

export async function runWorkspaceAssetGc(hooks: AssetGcHooks, opts?: { now?: number }) {
  adoptIfDurable(hooks)
  const ctx = assetGcContext(hooks)
  const result = await gcCasAssets({ ...ctx, now: opts?.now })
  const candidates = listGcCandidates(hooks.db)
  if (result.fused) {
    notify(
      hooks,
      '这次没有删附件',
      '要删的文件比剩下的还多，先停下来，避免误删。',
      'asset-gc:fuse',
    )
  }
  if (result.deleted.length) {
    notify(
      hooks,
      `删了 ${result.deleted.length} 个没人用的附件`,
      `这些文件已经 ${CANDIDATE_DAYS} 天没有被页面用到。`,
      'asset-gc:deleted',
      assetNoticeFiles(hooks.db, result.deleted),
    )
  }
  if (candidates.length) {
    notify(
      hooks,
      `有 ${candidates.length} 个附件没人用了`,
      `页面和记录都不再用到下面这些文件。还会再留 ${CANDIDATE_DAYS} 天，到时才删。`,
      'asset-gc:candidates',
      assetNoticeFiles(hooks.db, candidates.map((row) => row.name)),
    )
  }
  return { ...result, candidates }
}

export function previewWorkspaceAssetGc(hooks: AssetGcHooks, opts?: { now?: number }) {
  adoptIfDurable(hooks)
  return previewGcCasAssets({ ...assetGcContext(hooks), now: opts?.now })
}

export function listWorkspaceGcCandidates(hooks: AssetGcHooks) {
  return listGcCandidates(hooks.db)
}
