import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, posix, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { dataPath } from '@biu/host-plugin-loader/data-dir'

export type SkillRecord = {
  id: string
  name: string
  description: string
  enabled: boolean
  source: string
  notes: string
  createdAt: number
  updatedAt: number
}

export type SkillImportFile = {
  path: string
  content?: string
  from?: string
}

export type SkillImportInput = {
  id?: string
  name?: string
  description?: string
  source?: string
  enabled?: boolean
  draft?: boolean
  files: SkillImportFile[]
}

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const MAX_FILES = 500
const MAX_TOTAL_CHARS = 5_000_000
const SKIP_DIR = new Set(['node_modules', '.git', '__pycache__'])

export function skillRoot(cwd = process.cwd()) {
  return process.env.BIU_SKILL_ROOT || dataPath(cwd, 'skill')
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

export function assertSkillRelPath(path: string) {
  const rel = posix.normalize(String(path ?? '').replaceAll('\\', '/')).replace(/^\/+/, '')
  if (!rel || rel === '.' || rel.startsWith('../') || rel.includes('/../') || rel.endsWith('/..')) {
    throw new Error(`invalid skill file path: ${path}`)
  }
  return rel
}

function isInside(root: string, file: string) {
  const base = root.endsWith(sep) ? root : root + sep
  return file === root || file.startsWith(base)
}

/** 只许从工作区或 /tmp（含 os.tmpdir）拷文件，避免 agent 把任意系统文件读进技能目录。 */
export function assertSkillSourcePath(raw: string, cwd = process.cwd()) {
  const wanted = String(raw ?? '').trim()
  if (!wanted) throw new Error('from path is empty')
  const file = isAbsolute(wanted) ? resolve(wanted) : resolve(cwd, wanted)
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`cannot read from: ${raw}`)
  const real = realpathSync(file)
  const roots = [resolve(cwd), resolve('/tmp'), tmpdir()]
  const allowed = roots.flatMap((root) => {
    try {
      return [realpathSync(root)]
    } catch {
      return [resolve(root)]
    }
  })
  if (!allowed.some((root) => isInside(root, real))) {
    throw new Error('from path must be inside the workspace or /tmp')
  }
  return real
}

function unquote(value: string) {
  const text = value.trim()
  if (text.length > 1 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1)
  }
  return text
}

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

function skillFile(root: string, id: string) {
  return join(root, `${assertSkillId(id)}.md`)
}

function dumpSkill(record: SkillRecord) {
  const enabled = record.enabled ? 'true' : 'false'
  return [
    '---',
    `name: ${JSON.stringify(record.name)}`,
    `description: ${JSON.stringify(record.description)}`,
    `source: ${JSON.stringify(record.source)}`,
    `enabled: ${enabled}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt}`,
    '---',
    '',
    record.notes.trim(),
    '',
  ].join('\n')
}

function loadSkill(id: string, text: string): SkillRecord {
  const parsed = parseFrontmatter(text)
  const createdAt = Number(parsed.meta.createdat) || Date.now()
  const enabledRaw = parsed.meta.enabled
  return {
    id,
    name: parsed.meta.name?.trim() || id,
    description: parsed.meta.description?.trim() || '',
    source: parsed.meta.source?.trim() || '',
    enabled: enabledRaw ? enabledRaw !== 'false' : Boolean(parsed.meta.description?.trim()),
    notes: parsed.body,
    createdAt,
    updatedAt: Number(parsed.meta.updatedat) || createdAt,
  }
}

function normalizeImportPath(path: string) {
  return posix.normalize(String(path ?? '').replaceAll('\\', '/')).replace(/^\.\/+/, '')
}

function stripSharedRoot(paths: string[]) {
  const firsts = new Set(paths.map((path) => path.split('/').filter(Boolean)[0] ?? ''))
  firsts.delete('')
  if (firsts.size !== 1) return paths
  const wrapped = paths.some((path) => /^[^/]+\/skill\.md$/i.test(path))
  if (!wrapped) return paths
  return paths.map((path) => path.split('/').slice(1).join('/') || path)
}

function walkFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const full = join(dir, name)
    const rel = prefix ? posix.join(prefix, name) : name
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full, rel))
      continue
    }
    out.push(rel)
  }
  return out.sort()
}

export function packSkillImport(files: SkillImportFile[]) {
  if (!Array.isArray(files) || !files.length) throw new Error('skill import requires files')
  if (files.length > MAX_FILES) throw new Error(`skill import has too many files (max ${MAX_FILES})`)
  let total = 0
  const raw = files.map((file) => {
    const from = String(file.from ?? '').trim()
    const content = file.content == null ? undefined : String(file.content)
    if (!from && content == null) throw new Error(`skill import file needs content or from: ${file.path}`)
    return { path: normalizeImportPath(file.path), content, from: from || undefined }
  })
  const stripped = stripSharedRoot(raw.map((file) => file.path))
  const normalized = raw.map((file, index) => {
    const path = assertSkillRelPath(stripped[index] || posix.basename(file.path))
    const from = file.from ? assertSkillSourcePath(file.from) : undefined
    const size = from ? statSync(from).size : String(file.content ?? '').length
    total += path.length + size
    const content = from && file.content == null ? readFileSync(from, 'utf8') : String(file.content ?? '')
    return { path, content, from }
  })
  if (total > MAX_TOTAL_CHARS) throw new Error('skill import is too large')
  const entry =
    normalized.find((file) => /(^|\/)skill\.md$/i.test(file.path)) ??
    normalized.find((file) => file.path.toLowerCase().endsWith('.md')) ??
    normalized[0]!
  const parsed = parseFrontmatter(entry.content)
  return {
    parsed,
    notes: parsed.body,
    files: normalized.filter((file) => file.path !== entry.path),
  }
}

export class SkillsStore {
  constructor(private root = skillRoot()) {}

  private ensureRoot() {
    mkdirSync(this.root, { recursive: true })
    return this.root
  }

  filesDir(id: string) {
    return join(this.ensureRoot(), assertSkillId(id))
  }

  listFiles(id: string) {
    this.require(id)
    return walkFiles(this.filesDir(id))
  }

  readFile(id: string, rel: string) {
    this.require(id)
    const safe = assertSkillRelPath(rel)
    const full = join(this.filesDir(id), ...safe.split('/'))
    if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`unknown skill file: ${id}/${safe}`)
    return { path: safe, text: readFileSync(full, 'utf8') }
  }

  writeFile(id: string, rel: string, input: string | { content?: string; from?: string }) {
    this.require(id)
    const safe = assertSkillRelPath(rel)
    const dest = join(this.filesDir(id), ...safe.split('/'))
    mkdirSync(join(dest, '..'), { recursive: true })
    const from = typeof input === 'object' ? String(input.from ?? '').trim() : ''
    if (from) {
      copyFileSync(assertSkillSourcePath(from), dest)
      return { path: safe, from }
    }
    const content = typeof input === 'string' ? input : String(input.content ?? '')
    writeFileSync(dest, content)
    return { path: safe }
  }

  replaceFiles(id: string, files: SkillImportFile[]) {
    const dir = this.filesDir(id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    for (const file of files) this.writeFile(id, file.path, file)
    return this.listFiles(id)
  }

  private require(id: string) {
    if (!this.get(id)) throw new Error(`unknown skill: ${id}`)
  }

  list(): SkillRecord[] {
    if (!existsSync(this.root) || !statSync(this.root).isDirectory()) return []
    return readdirSync(this.root)
      .filter((name) => name.endsWith('.md'))
      .map((name) => this.get(name.slice(0, -3)))
      .filter((item): item is SkillRecord => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh') || a.id.localeCompare(b.id))
  }

  get(id: string) {
    try {
      const file = skillFile(this.root, id)
      if (!existsSync(file) || !statSync(file).isFile()) return null
      return loadSkill(id, readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  put(record: SkillRecord) {
    const next = {
      ...record,
      id: assertSkillId(record.id),
      name: record.name.trim() || record.id,
      description: record.description.trim(),
      source: String(record.source ?? '').trim(),
      notes: String(record.notes ?? ''),
      updatedAt: Date.now(),
      createdAt: record.createdAt || Date.now(),
    }
    writeFileSync(skillFile(this.ensureRoot(), next.id), dumpSkill(next))
    return next
  }

  create(input: {
    id?: string
    name?: string
    description?: string
    source?: string
    enabled?: boolean
    notes?: string
    draft?: boolean
    files?: SkillImportFile[]
  }) {
    const name = String(input.name ?? '').trim() || '新技能'
    const description = String(input.description ?? '').trim()
    const requested = String(input.id ?? '').trim()
    const id = assertSkillId(requested || slugify(name) || `skill-${Date.now().toString(36)}`)
    if (this.get(id)) throw new Error(`skill already exists: ${id}`)
    const now = Date.now()
    const created = this.put({
      id,
      name,
      description,
      source: String(input.source ?? '').trim(),
      enabled: input.draft || !description ? false : input.enabled !== false,
      notes: String(input.notes ?? ''),
      createdAt: now,
      updatedAt: now,
    })
    if (input.files?.length) this.replaceFiles(id, input.files)
    return created
  }

  import(input: SkillImportInput) {
    const packed = packSkillImport(input.files ?? [])
    return this.create({
      id: input.id || slugify(packed.parsed.meta.name || '') || undefined,
      name: input.name || packed.parsed.meta.name,
      description: input.description || packed.parsed.meta.description,
      source: input.source || packed.parsed.meta.source,
      enabled: input.enabled,
      notes: packed.notes,
      files: packed.files,
      draft: input.draft,
    })
  }

  patch(id: string, patch: { name?: unknown; description?: unknown; source?: unknown; enabled?: unknown; notes?: unknown }) {
    const current = this.get(id)
    if (!current) throw new Error(`unknown skill: ${id}`)
    return this.put({
      ...current,
      ...(patch.name !== undefined ? { name: String(patch.name) } : {}),
      ...(patch.description !== undefined ? { description: String(patch.description) } : {}),
      ...(patch.source !== undefined ? { source: String(patch.source ?? '').trim() } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled !== false } : {}),
      ...(patch.notes !== undefined ? { notes: String(patch.notes ?? '') } : {}),
    })
  }

  remove(id: string) {
    const file = skillFile(this.root, id)
    const dir = join(this.root, assertSkillId(id))
    let removed = false
    if (existsSync(file)) {
      rmSync(file)
      removed = true
    }
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      removed = true
    }
    return removed
  }
}

function walkImportFiles(dir: string, prefix = ''): SkillImportFile[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  const out: SkillImportFile[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const full = join(dir, name)
    const rel = posix.join(prefix, name)
    if (statSync(full).isDirectory()) {
      out.push(...walkImportFiles(full, rel))
      continue
    }
    out.push({ path: rel, content: readFileSync(full, 'utf8') })
  }
  return out
}

export function legacySkillImports(cwd = process.cwd()): SkillImportInput[] {
  const root = skillsDir(cwd)
  if (!existsSync(root) || !statSync(root).isDirectory()) return []
  const out: SkillImportInput[] = []
  for (const name of readdirSync(root)) {
    const folder = join(root, name)
    if (!statSync(folder).isDirectory()) continue
    const files = walkImportFiles(folder)
    if (!files.some((file) => /(^|\/)skill\.md$/i.test(file.path))) continue
    out.push({ id: slugify(name) || name, files, draft: false })
  }
  return out
}
