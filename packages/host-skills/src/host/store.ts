import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { dataPath } from '@biu/host-plugin-loader/data-dir'
import type { Database } from '@biu/type-file-system'

export type SkillMeta = {
  id: string
  name: string
  description: string
  enabled: boolean
}

export type SkillRecord = SkillMeta & {
  rootPageId: string
  entryPageId: string
  entryPath: string
  source: string
  importedAt: number
  /** 标准 Skill 目录中的相对路径 → Page id。空串是根目录 Page。 */
  pages: Record<string, string>
  /** 与 Page 树双向同步的本地目录及文本文件清单。 */
  directory: string
  filePaths: string[]
  folderHash: string
  pageHash: string
  syncedAt: number
  error: string
}

export type SkillImportFile = {
  path: string
  content: string
}

export type SkillImportInput = {
  id?: string
  name?: string
  description?: string
  enabled?: boolean
  source?: string
  /** Biu 内新建的草稿可以先不填写用于发现的说明。 */
  draft?: boolean
  files: SkillImportFile[]
}

export type SkillPageDatabase = Pick<Database, 'create' | 'update' | 'writeContent' | 'content'>

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const MAX_FILES = 500
const MAX_TOTAL_CHARS = 5_000_000

export function skillsRegistryFile(cwd = process.cwd()) {
  return process.env.BIU_SKILLS_REGISTRY || dataPath(cwd, 'skills.json')
}

export function skillsDir(cwd = process.cwd()) {
  return process.env.BIU_SKILLS_DIR || dataPath(cwd, 'skills')
}

export function slugify(value: string) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug.replace(/^[^a-z]+/, '')
}

export function assertSkillId(id: string) {
  const wanted = String(id ?? '').trim()
  if (!ID_PATTERN.test(wanted)) {
    throw new Error(`invalid skill id: ${id} (expected lowercase letters, digits and dashes, 2-64 chars)`)
  }
  return wanted
}

function unquote(value: string) {
  const text = value.trim()
  if (text.length > 1 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1)
  }
  return text
}

/** 标准 SKILL.md 只读取发现所需的扁平 frontmatter；正文仍作为 Page 内容。 */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { meta: {}, body: normalized.trim() }
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: normalized.trim() }
  const meta: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const cut = trimmed.indexOf(':')
    if (cut < 0) continue
    meta[trimmed.slice(0, cut).trim().toLowerCase()] = unquote(trimmed.slice(cut + 1))
  }
  return { meta, body: normalized.slice(end + 4).replace(/^[^\n]*\n?/, '').trim() }
}

function cleanRecord(raw: unknown): SkillRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const item = raw as Partial<SkillRecord>
  try {
    const id = assertSkillId(String(item.id ?? ''))
    const rootPageId = String(item.rootPageId ?? '').trim()
    const entryPageId = String(item.entryPageId ?? '').trim()
    if (!rootPageId || !entryPageId) return null
    return {
      id,
      name: String(item.name ?? id).trim() || id,
      description: String(item.description ?? '').trim(),
      enabled: item.enabled !== false,
      rootPageId,
      entryPageId,
      entryPath: String(item.entryPath ?? '').trim() ||
        Object.entries(item.pages ?? {}).find(([, pageId]) => String(pageId) === entryPageId)?.[0] ||
        'SKILL.md',
      source: String(item.source ?? '').trim(),
      importedAt: Number(item.importedAt) || Date.now(),
      pages: item.pages && typeof item.pages === 'object' && !Array.isArray(item.pages)
        ? Object.fromEntries(Object.entries(item.pages).map(([key, value]) => [key, String(value)]))
        : { '': rootPageId, 'SKILL.md': entryPageId },
      directory: String(item.directory ?? '').trim() || join(skillsDir(), id),
      filePaths: Array.isArray(item.filePaths)
        ? item.filePaths.map(String)
        : Object.keys(item.pages ?? {}).filter((path) => posix.basename(path).includes('.')),
      folderHash: String(item.folderHash ?? ''),
      pageHash: String(item.pageHash ?? ''),
      syncedAt: Number(item.syncedAt) || 0,
      error: String(item.error ?? ''),
    }
  } catch {
    return null
  }
}

export class SkillRegistry {
  constructor(private file = skillsRegistryFile()) {}

  list() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.map(cleanRecord).filter((item): item is SkillRecord => Boolean(item)).sort((a, b) => a.id.localeCompare(b.id))
    } catch {
      return []
    }
  }

  get(id: string) {
    const wanted = assertSkillId(id)
    return this.list().find((item) => item.id === wanted) ?? null
  }

  put(record: SkillRecord) {
    const records = this.list().filter((item) => item.id !== record.id)
    records.push(record)
    records.sort((a, b) => a.id.localeCompare(b.id))
    mkdirSync(dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
    renameSync(temp, this.file)
    return record
  }

  patch(id: string, patch: Partial<Pick<SkillRecord, 'name' | 'description' | 'enabled'>>) {
    const current = this.get(id)
    if (!current) throw new Error(`unknown skill: ${id}`)
    return this.put({
      ...current,
      ...(patch.name !== undefined ? { name: String(patch.name).trim() || current.id } : {}),
      ...(patch.description !== undefined ? { description: String(patch.description).trim() } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled !== false } : {}),
    })
  }

  remove(id: string) {
    const wanted = assertSkillId(id)
    const records = this.list()
    if (!records.some((item) => item.id === wanted)) throw new Error(`unknown skill: ${id}`)
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(records.filter((item) => item.id !== wanted), null, 2)}\n`, 'utf8')
    return { id: wanted, removed: true }
  }
}

function normalizeImportFiles(input: SkillImportInput) {
  if (!Array.isArray(input.files) || !input.files.length) throw new Error('skill import requires files')
  if (input.files.length > MAX_FILES) throw new Error(`skill import has too many files (max ${MAX_FILES})`)
  const raw = input.files.map((file) => ({
    path: String(file.path ?? '').trim().replaceAll('\\', '/').replace(/^\/+/, ''),
    content: String(file.content ?? ''),
  }))
  if (raw.reduce((sum, file) => sum + file.content.length, 0) > MAX_TOTAL_CHARS) {
    throw new Error('skill import is too large')
  }
  for (const file of raw) {
    if (!file.path || file.path.includes('\0')) throw new Error('skill import contains an invalid path')
    const normalized = posix.normalize(file.path)
    if (normalized === '..' || normalized.startsWith('../')) throw new Error(`skill file escapes its root: ${file.path}`)
    file.path = normalized
  }
  if (new Set(raw.map((file) => file.path)).size !== raw.length) {
    throw new Error('skill import contains duplicate paths')
  }
  const first = raw[0]!.path.split('/')[0]!
  const hasSharedRoot = raw.every((file) => file.path.includes('/') && file.path.split('/')[0] === first)
  return {
    rootName: String(input.name ?? '').trim() || (hasSharedRoot ? first : ''),
    files: raw.map((file) => ({
      ...file,
      path: hasSharedRoot ? file.path.slice(first.length + 1) : file.path,
    })),
  }
}

function readLegacyFiles(root: string, relative = ''): SkillImportFile[] {
  const directory = relative ? join(root, relative) : root
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const files: SkillImportFile[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...readLegacyFiles(root, path))
      continue
    }
    if (!entry.isFile()) continue
    const content = readFileSync(join(root, path))
    if (content.includes(0)) continue
    files.push({ path, content: content.toString('utf8') })
  }
  return files
}

export function readSkillDirectory(root: string) {
  return readLegacyFiles(root).sort((a, b) => a.path.localeCompare(b.path))
}

function digest(parts: string[]) {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(`${part.length}:`).update(part)
  return hash.digest('hex')
}

export function skillFilesHash(files: SkillImportFile[]) {
  return digest(
    [...files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .flatMap((file) => [file.path, file.content]),
  )
}

function skillPageHashFromBodies(
  meta: Pick<SkillMeta, 'name' | 'description' | 'enabled'>,
  filePaths: string[],
  bodies: Record<string, string>,
) {
  return digest([
    meta.name,
    meta.description,
    String(meta.enabled),
    ...[...filePaths].sort().flatMap((path) => [path, bodies[path] ?? '']),
  ])
}

export async function skillPageHash(database: SkillPageDatabase, record: SkillRecord) {
  const bodies: Record<string, string> = {}
  for (const path of record.filePaths) {
    const result = await database.content(`/pages/${record.pages[path]}`) as { value?: unknown }
    bodies[path] = String(result.value ?? '')
  }
  return skillPageHashFromBodies(record, record.filePaths, bodies)
}

export function writeSkillDirectory(root: string, files: SkillImportFile[]) {
  for (const file of files) {
    const target = join(root, ...file.path.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.content, 'utf8')
  }
}

/** 发现旧版 `.biu/skills/<id>/SKILL.md`，供启动时一次性迁移到 Page 树。 */
export function legacySkillImports(root = skillsDir()): SkillImportInput[] {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const imports: SkillImportInput[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue
    const files = readLegacyFiles(join(root, entry.name))
    const skillFile = files.find((file) => posix.dirname(file.path) === '.' && file.path.toLowerCase() === 'skill.md')
    if (!skillFile) continue
    const parsed = parseFrontmatter(skillFile.content)
    imports.push({
      id: entry.name,
      files,
      source: 'legacy-directory-migration',
      draft: !String(parsed.meta.description ?? '').trim(),
    })
  }
  return imports
}

function createdPageId(raw: unknown) {
  const result = raw as { items?: Array<{ path?: unknown; value?: { id?: unknown } }> }
  const first = result?.items?.[0]
  const direct = String(first?.value?.id ?? '').trim()
  if (direct) return direct
  const path = String(first?.path ?? '')
  const id = path.split('/').filter(Boolean).pop() ?? ''
  if (!id) throw new Error('page create did not return an id')
  return id
}

async function createPage(database: SkillPageDatabase, title: string, parentId = '') {
  const created = await database.create('/pages', [{ title, parentId: parentId || null, tags: [] }])
  return createdPageId(created)
}

function mentionAttr(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\r\n]+/g, ' ')
}

export function pageMention(pageId: string, label: string) {
  return `[@ id="page/${mentionAttr(pageId)}" label="${mentionAttr(label)}"]`
}

export function resolveSkillRelativePath(from: string, target: string) {
  const cleanTarget = String(target ?? '').trim().split(/[?#]/, 1)[0]!.replaceAll('\\', '/')
  if (!cleanTarget || /^(?:[a-z]+:|\/|#)/i.test(cleanTarget)) return ''
  const resolved = posix.normalize(posix.join(posix.dirname(from || 'SKILL.md'), cleanTarget))
  if (resolved === '..' || resolved.startsWith('../')) return ''
  return resolved.replace(/^\.\//, '')
}

function rewriteRelativeLinks(body: string, from: string, pages: Record<string, string>) {
  const labels = new Map(Object.keys(pages).map((path) => [path, posix.basename(path) || path]))
  let next = body.replace(/(!?\[[^\]]*])\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (whole, label: string, target: string) => {
    const resolved = resolveSkillRelativePath(from, target)
    const pageId = pages[resolved]
    const mentionLabel = label.replace(/^!?\[/, '').replace(/]$/, '')
    return pageId ? pageMention(pageId, mentionLabel || labels.get(resolved) || resolved) : whole
  })
  next = next.replace(/(^|[\s(])@((?:\.\.?\/)+[^\s),]+)/gm, (whole, prefix: string, target: string) => {
    const resolved = resolveSkillRelativePath(from, target)
    const pageId = pages[resolved]
    return pageId ? `${prefix}${pageMention(pageId, labels.get(resolved) || resolved)}` : whole
  })
  return next
}

function immediateChildren(parent: string, pages: Record<string, string>) {
  return Object.keys(pages)
    .filter((path) => path && posix.dirname(path) === (parent || '.'))
    .sort((a, b) => a.localeCompare(b))
}

export async function importSkillPages(database: SkillPageDatabase, input: SkillImportInput): Promise<SkillRecord> {
  const normalized = normalizeImportFiles(input)
  const entry = normalized.files.find((file) => posix.dirname(file.path) === '.' && file.path.toLowerCase() === 'skill.md')
  if (!entry) throw new Error('skill import requires a root SKILL.md')
  const parsed = parseFrontmatter(entry.content)
  const name =
    String(input.name ?? '').trim() ||
    String(parsed.meta.name ?? '').trim() ||
    normalized.rootName ||
    'Imported Skill'
  const id = assertSkillId(String(input.id ?? '').trim() || slugify(name))
  const description =
    String(input.description ?? '').trim() ||
    String(parsed.meta.description ?? '').trim()
  if (!description && !input.draft) throw new Error('skill description is required')

  const pages: Record<string, string> = {}
  const rootPageId = await createPage(database, name)
  pages[''] = rootPageId

  const directories = new Set<string>()
  for (const file of normalized.files) {
    let current = posix.dirname(file.path)
    while (current && current !== '.') {
      directories.add(current)
      current = posix.dirname(current)
    }
  }
  for (const directory of [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const parent = posix.dirname(directory)
    pages[directory] = await createPage(database, posix.basename(directory), parent === '.' ? rootPageId : pages[parent])
  }
  for (const file of [...normalized.files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parent = posix.dirname(file.path)
    pages[file.path] = await createPage(database, posix.basename(file.path), parent === '.' ? rootPageId : pages[parent])
  }

  const pageBodies: Record<string, string> = {}
  const directoryPaths = ['', ...[...directories].sort()]
  for (const directory of directoryPaths) {
    const children = immediateChildren(directory, pages)
    const body = children.map((path) => `- ${pageMention(pages[path]!, posix.basename(path))}`).join('\n')
    pageBodies[directory] = body
    await database.writeContent(`/pages/${pages[directory]}`, body)
  }
  for (const file of normalized.files) {
    const body = file.path === entry.path ? parsed.body : file.content
    const rewritten = rewriteRelativeLinks(body, file.path, pages)
    pageBodies[file.path] = rewritten
    await database.writeContent(`/pages/${pages[file.path]}`, rewritten)
  }

  const enabled = input.draft
    ? false
    : input.enabled === undefined
      ? parsed.meta.enabled !== 'false'
      : input.enabled
  const filePaths = normalized.files.map((file) => file.path).sort()
  const syncedAt = Date.now()
  return {
    id,
    name,
    description,
    enabled,
    rootPageId,
    entryPageId: pages[entry.path]!,
    entryPath: entry.path,
    source: String(input.source ?? normalized.rootName).trim(),
    importedAt: syncedAt,
    pages,
    directory: join(skillsDir(), id),
    filePaths,
    folderHash: skillFilesHash(normalized.files),
    pageHash: skillPageHashFromBodies({ name, description, enabled }, filePaths, pageBodies),
    syncedAt,
    error: '',
  }
}

function importDirectories(files: SkillImportFile[]) {
  const directories = new Set<string>()
  for (const file of files) {
    let current = posix.dirname(file.path)
    while (current && current !== '.') {
      directories.add(current)
      current = posix.dirname(current)
    }
  }
  return [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
}

export async function syncSkillPagesFromFiles(
  database: SkillPageDatabase,
  record: SkillRecord,
  files: SkillImportFile[],
) {
  const normalized = normalizeImportFiles({ id: record.id, files })
  const entry = normalized.files.find((file) => posix.dirname(file.path) === '.' && file.path.toLowerCase() === 'skill.md')
  if (!entry) throw new Error('skill sync requires a root SKILL.md')
  const parsed = parseFrontmatter(entry.content)
  const name = String(parsed.meta.name ?? '').trim() || record.name
  const description = String(parsed.meta.description ?? '').trim()
  const enabled = description ? parsed.meta.enabled !== 'false' : false
  const directories = importDirectories(normalized.files)
  const pages = { ...record.pages }
  let created = 0
  await database.update(`/pages/${record.rootPageId}`, { title: name })

  for (const directory of directories) {
    if (pages[directory]) continue
    const parent = posix.dirname(directory)
    pages[directory] = await createPage(database, posix.basename(directory), parent === '.' ? record.rootPageId : pages[parent])
    created += 1
  }
  for (const file of normalized.files) {
    if (pages[file.path]) continue
    const parent = posix.dirname(file.path)
    pages[file.path] = await createPage(database, posix.basename(file.path), parent === '.' ? record.rootPageId : pages[parent])
    created += 1
  }

  const active = new Set(['', ...directories, ...normalized.files.map((file) => file.path)])
  const detached = Object.keys(pages).filter((path) => !active.has(path)).length
  for (const path of Object.keys(pages)) {
    if (!active.has(path)) delete pages[path]
  }

  const pageBodies: Record<string, string> = {}
  for (const directory of ['', ...directories]) {
    const body = immediateChildren(directory, pages)
      .map((path) => `- ${pageMention(pages[path]!, posix.basename(path))}`)
      .join('\n')
    pageBodies[directory] = body
    await database.writeContent(`/pages/${pages[directory]}`, body)
  }
  for (const file of normalized.files) {
    const body = file.path === entry.path ? parsed.body : file.content
    const rewritten = rewriteRelativeLinks(body, file.path, pages)
    pageBodies[file.path] = rewritten
    await database.writeContent(`/pages/${pages[file.path]}`, rewritten)
  }

  const filePaths = normalized.files.map((file) => file.path).sort()
  const syncedAt = Date.now()
  return {
    record: {
      ...record,
      name,
      description,
      enabled,
      entryPageId: pages[entry.path]!,
      entryPath: entry.path,
      pages,
      filePaths,
      folderHash: skillFilesHash(normalized.files),
      pageHash: skillPageHashFromBodies({ name, description, enabled }, filePaths, pageBodies),
      syncedAt,
    } satisfies SkillRecord,
    created,
    detached,
  }
}

function quoteFrontmatter(value: string) {
  const text = value.replace(/[\r\n]+/g, ' ').trim()
  return /^[\w\u4e00-\u9fa5][^:#]*$/.test(text) ? text : JSON.stringify(text)
}

function renderSkillMarkdown(record: SkillRecord, body: string) {
  const lines = [
    '---',
    `name: ${quoteFrontmatter(record.name)}`,
    `description: ${quoteFrontmatter(record.description)}`,
  ]
  if (!record.enabled) lines.push('enabled: false')
  lines.push('---', '', body.trim(), '')
  return lines.join('\n')
}

function decodeMentionAttr(value: string) {
  return value.replaceAll('\\"', '"').replaceAll('\\\\', '\\')
}

function restoreRelativeLinks(body: string, from: string, pages: Record<string, string>) {
  const paths = new Map(Object.entries(pages).map(([path, pageId]) => [pageId, path]))
  return body.replace(
    /\[@\s+id="page\/([^"]+)"\s+label="([^"]*)"\s*]/g,
    (whole, pageIdRaw: string, labelRaw: string) => {
      const target = paths.get(decodeMentionAttr(pageIdRaw))
      if (target === undefined) return whole
      const relative = posix.relative(posix.dirname(from), target) || posix.basename(target)
      return `[${decodeMentionAttr(labelRaw).replaceAll(']', '\\]')}](${relative})`
    },
  )
}

export async function skillFilesFromPages(database: SkillPageDatabase, record: SkillRecord) {
  const files: SkillImportFile[] = []
  for (const path of record.filePaths) {
    const result = await database.content(`/pages/${record.pages[path]}`) as { value?: unknown }
    const body = restoreRelativeLinks(String(result.value ?? ''), path, record.pages)
    files.push({
      path,
      content: path === record.entryPath ? renderSkillMarkdown(record, body) : body,
    })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export function resolveSkillPage(record: SkillRecord, target = '', from = '') {
  if (!target) return { path: record.entryPath, pageId: record.entryPageId }
  const path = resolveSkillRelativePath(from || record.entryPath, target)
  const pageId = record.pages[path]
  if (!path || !pageId) throw new Error(`unknown skill page: ${target}`)
  return { path, pageId }
}
