import { dirname } from 'node:path'
import {
  adoptCasAssets,
  gcCasAssets,
  listGcCandidates,
  previewGcCasAssets,
  workspaceFromSqlite,
} from '@biu/host-plugin-loader/data-dir'
import type { NoticesService } from './notices-service.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type AssetGcHooks = {
  db: DatabaseSync
  assetsDir: string
  sqlitePath: string
  notices?: NoticesService
}

export function assetGcContext(hooks: AssetGcHooks) {
  return {
    db: hooks.db,
    assetsDir: hooks.assetsDir,
    ...workspaceFromSqlite(hooks.sqlitePath),
  }
}

function notify(hooks: AssetGcHooks, title: string, body: string, sourceKey: string) {
  hooks.notices?.push({ kind: 'session', title, body, sourceKey })
}

function adoptIfDurable(hooks: AssetGcHooks) {
  if (!hooks.sqlitePath || hooks.sqlitePath === ':memory:') return
  adoptCasAssets(dirname(hooks.sqlitePath))
}

export async function runWorkspaceAssetGc(hooks: AssetGcHooks, opts?: { now?: number; dryRun?: boolean }) {
  adoptIfDurable(hooks)
  const ctx = assetGcContext(hooks)
  const result = await gcCasAssets({ ...ctx, now: opts?.now, dryRun: opts?.dryRun })
  const candidates = listGcCandidates(hooks.db)
  if (result.fused) {
    notify(hooks, '资产回收已跳过', '拟删除比例异常，本轮没有删文件。', 'asset-gc:fuse')
  }
  if (result.deleted.length) {
    notify(
      hooks,
      `已回收 ${result.deleted.length} 个资产`,
      result.deleted.slice(0, 8).join(', '),
      'asset-gc:deleted',
    )
  }
  if (candidates.length) {
    notify(
      hooks,
      `有 ${candidates.length} 个文件在资产回收观察期`,
      candidates
        .map((row) => row.name)
        .slice(0, 8)
        .join(', '),
      'asset-gc:candidates',
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
