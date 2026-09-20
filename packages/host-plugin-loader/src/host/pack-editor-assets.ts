import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { hashedAssetRel, isHashedAssetName } from './asset-cas.ts'
import { assetNamesFromMarkdown } from '../../../type-file-system/src/asset-ref.ts'

function rewritePackedName(body: string, name: string, dest: string) {
  const patterns = [
    `/api/db/file/${name}`,
    `/api/page/file/${name}`,
    `/api/doc/file/${name}`,
    `assets/${name}`,
    `.page/assets/${name}`,
  ]
  let next = body
  for (const from of patterns) next = next.split(from).join(dest)
  return next
}

function resolveAssetPath(assetsDir: string, name: string) {
  const candidates = [
    ...(isHashedAssetName(name) ? [join(assetsDir, 'hash', hashedAssetRel(name))] : []),
    join(assetsDir, 'name', name),
    join(assetsDir, name),
  ]
  return candidates.find((path) => existsSync(path))
}

/** Copy referenced CAS files into a plugin pack and rewrite URLs to pack-relative assets/. */
export function copyReferencedEditorAssets(opts: { body: string; assetsDir: string; destDir: string }) {
  const names = [...assetNamesFromMarkdown(opts.body)]
  const assetsDest = join(opts.destDir, 'assets')
  mkdirSync(assetsDest, { recursive: true })
  let next = opts.body
  for (const name of names) {
    const from = resolveAssetPath(opts.assetsDir, name)
    if (!from) throw new Error(`pack missing asset: ${name}`)
    copyFileSync(from, join(assetsDest, name))
    next = rewritePackedName(next, name, `assets/${name}`)
  }
  return next
}
