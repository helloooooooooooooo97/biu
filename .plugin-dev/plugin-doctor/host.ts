import { existsSync, readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from 'cordis'

export const name = 'plugin-doctor'
export const inject = ['http']

/** 体检结论。README 示例写法缺失＝不合规（页面块插件靠它告诉 agent 语法）。 */
export type Conclusion = '合规' | '缺 README 示例' | '缺引擎' | '空插件'

export type PluginReport = {
  id: string
  name: string
  headless: boolean
  hasHost: boolean
  hasWeb: boolean
  bytes: number
  files: number
  enabled: boolean
  lastRunAt: number | null
  readme: boolean
  readmeExample: boolean
  conclusion: Conclusion
  problems: string[]
}

export type ScanResult = {
  scannedAt: number
  root: string
  pluginsDir: string
  total: number
  summary: { ok: number; warn: number; broken: number; bytes: number }
  plugins: PluginReport[]
}

function workspaceCandidates(): string[] {
  const list: string[] = []
  const fromEnv = String(process.env.BIU_WORKSPACE ?? '').trim()
  if (fromEnv) list.push(fromEnv)
  try {
    list.push(process.cwd())
  } catch {
    /* ignore */
  }
  try {
    // .plugin/<id>/host.js → 仓库根
    list.push(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'))
  } catch {
    /* ignore */
  }
  return list
}

/** 找仓库根：以含 .plugin 目录为准。 */
export function findRoot(): string {
  for (const dir of workspaceCandidates()) {
    try {
      if (existsSync(join(dir, '.plugin'))) return dir
    } catch {
      /* ignore */
    }
  }
  return process.cwd()
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function fileSize(file: string): number {
  try {
    const s = statSync(file)
    return s.isFile() ? s.size : 0
  } catch {
    return 0
  }
}

type StoreFile = { enabled?: string[]; lastRunAt?: Record<string, number> }

function readStore(pluginsDir: string): StoreFile {
  const raw = readJson<StoreFile>(join(pluginsDir, 'store.json'))
  return {
    enabled: Array.isArray(raw?.enabled) ? raw!.enabled!.map(String) : [],
    lastRunAt: raw?.lastRunAt && typeof raw.lastRunAt === 'object' ? raw.lastRunAt : {},
  }
}

/** 结论只按可核对的事实给：有没有入口、README 有没有示例写法。 */
export function diagnose(facts: {
  hasHost: boolean
  hasWeb: boolean
  files: number
  readme: boolean
  readmeExample: boolean
}): { conclusion: Conclusion; problems: string[] } {
  const problems: string[] = []
  if (!facts.hasHost && !facts.hasWeb) {
    if (!facts.readme && facts.files <= 1) {
      problems.push('目录里只有 manifest，没有入口脚本')
      return { conclusion: '空插件', problems }
    }
    problems.push('没有可加载的入口（host.js / web.js 都缺）')
    return { conclusion: '缺引擎', problems }
  }
  if (!facts.readme) {
    problems.push('没有 README.md')
    return { conclusion: '缺 README 示例', problems }
  }
  if (!facts.readmeExample) {
    problems.push('README 里没有 :::pageBlock 示例写法')
    return { conclusion: '缺 README 示例', problems }
  }
  return { conclusion: '合规', problems }
}

export async function scan(root = findRoot()): Promise<ScanResult> {
  const pluginsDir = join(root, '.plugin')
  const store = readStore(pluginsDir)
  let dirs: string[] = []
  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true })
    dirs = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    dirs = []
  }

  const plugins: PluginReport[] = []
  for (const id of dirs) {
    const dir = join(pluginsDir, id)
    const manifest = readJson<{ id?: string; name?: string; headless?: boolean }>(join(dir, 'manifest.json'))
    const hasHost = existsSync(join(dir, 'host.js'))
    const hasWeb = existsSync(join(dir, 'web.js'))
    const readme = existsSync(join(dir, 'README.md'))
    const readmeExample = readText(join(dir, 'README.md')).includes(':::pageBlock')
    let bytes = 0
    let files = 0
    try {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        files += 1
        bytes += fileSize(join(dir, entry.name))
      }
    } catch {
      /* ignore */
    }
    const { conclusion, problems } = diagnose({ hasHost, hasWeb, files, readme, readmeExample })
    const runAt = store.lastRunAt?.[id]
    plugins.push({
      id: String(manifest?.id ?? id),
      name: String(manifest?.name ?? id),
      headless: manifest?.headless === true,
      hasHost,
      hasWeb,
      bytes,
      files,
      enabled: store.enabled?.includes(id) === true,
      lastRunAt: typeof runAt === 'number' ? runAt : null,
      readme,
      readmeExample,
      conclusion,
      problems,
    })
  }

  const rank: Record<Conclusion, number> = { 空插件: 0, 缺引擎: 1, '缺 README 示例': 2, 合规: 3 }
  plugins.sort((a, b) => rank[a.conclusion] - rank[b.conclusion] || a.id.localeCompare(b.id))

  return {
    scannedAt: Date.now(),
    root,
    pluginsDir,
    total: plugins.length,
    summary: {
      ok: plugins.filter((item) => item.conclusion === '合规').length,
      warn: plugins.filter((item) => item.conclusion === '缺 README 示例').length,
      broken: plugins.filter((item) => item.conclusion === '缺引擎' || item.conclusion === '空插件').length,
      bytes: plugins.reduce((sum, item) => sum + item.bytes, 0),
    },
    plugins,
  }
}

export function apply(ctx: Context) {
  ctx.http.route('GET', '/api/plugin-doctor/scan', async (route: { send: (status: number, body: unknown) => void }) => {
    try {
      route.send(200, await scan())
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })
}
