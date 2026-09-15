import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { dataPath } from '@biu/host-plugin-loader/data-dir'

export type SkillMeta = {
  id: string
  name: string
  description: string
  enabled: boolean
}

export type SkillRecord = SkillMeta & {
  /** SKILL.md 绝对路径；Agent 用它读全文。 */
  path: string
  dir: string
  body: string
  bytes: number
  createdAt: number
  updatedAt: number
  /** 结构问题（例如缺 description），不影响列出但会提示。 */
  error: string
}

export const SKILL_FILE = 'SKILL.md'

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const FILE_ID_SEP = ':'

export type SkillEntryKind = 'file' | 'folder'

export type SkillEntry = {
  skillId: string
  rel: string
  name: string
  kind: SkillEntryKind
  parentRel: string
  path: string
  bytes: number
  createdAt: number
  updatedAt: number
  /** 仅文件：打开时才读。SKILL.md 是去掉 frontmatter 的正文。 */
  body: string
  error: string
}

/** 记录 id 不能带 `/`（File System 路径是 /skills/<id>），相对路径编码进第二段。 */
export function skillFileId(skillId: string, rel: string) {
  return `${assertSkillId(skillId)}${FILE_ID_SEP}${encodeURIComponent(rel)}`
}

export function parseSkillRowId(id: string): { skillId: string; rel?: string } {
  const raw = String(id ?? '').trim()
  const cut = raw.indexOf(FILE_ID_SEP)
  if (cut < 0) return { skillId: assertSkillId(raw) }
  const rel = decodeURIComponent(raw.slice(cut + 1))
  if (!rel || rel.includes('\0')) throw new Error(`invalid skill file id: ${id}`)
  return { skillId: assertSkillId(raw.slice(0, cut)), rel }
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

/**
 * SKILL.md 的 frontmatter：`key: value` 逐行读，够覆盖 name / description / enabled。
 * 不引 YAML 依赖，因此不支持嵌套结构——这也是刻意的约束，让技能文件保持能手写。
 */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { meta: {}, body: normalized.trim() }
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: normalized.trim() }
  const head = normalized.slice(4, end)
  const rest = normalized.slice(end + 4).replace(/^[^\n]*\n?/, '')
  const meta: Record<string, string> = {}
  for (const line of head.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const cut = trimmed.indexOf(':')
    if (cut < 0) continue
    meta[trimmed.slice(0, cut).trim().toLowerCase()] = unquote(trimmed.slice(cut + 1))
  }
  return { meta, body: rest.trim() }
}

function quoteIfNeeded(value: string) {
  const text = value.replace(/\r?\n/g, ' ').trim()
  return /^[\w\u4e00-\u9fa5][^:#]*$/.test(text) ? text : JSON.stringify(text)
}

export function renderSkillFile(meta: SkillMeta, body: string) {
  const lines = [
    '---',
    `name: ${quoteIfNeeded(meta.name)}`,
    `description: ${quoteIfNeeded(meta.description)}`,
  ]
  // enabled 只在关掉时写出来，默认开着的技能文件保持干净。
  if (!meta.enabled) lines.push('enabled: false')
  lines.push('---', '', body.trim(), '')
  return lines.join('\n')
}

/** 整个技能目录的大小：附属脚本、模板都算进来，只看 SKILL.md 会低报。 */
function dirBytes(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    // 用 Dirent 判断，symlink 既不是 file 也不是 directory，天然不会被跟进去。
    if (entry.isDirectory()) total += dirBytes(full)
    else if (entry.isFile()) total += statSync(full).size
  }
  return total
}

function readOne(dir: string, id: string): SkillRecord {
  const path = join(dir, id, SKILL_FILE)
  const raw = readFileSync(path, 'utf8')
  const stat = statSync(path)
  const { meta, body } = parseFrontmatter(raw)
  const description = meta.description ?? ''
  return {
    id,
    name: meta.name?.trim() || id,
    description,
    enabled: meta.enabled !== 'false',
    path,
    dir: join(dir, id),
    body,
    bytes: dirBytes(join(dir, id)),
    createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
    updatedAt: Math.round(stat.mtimeMs),
    error: description.trim() ? '' : 'SKILL.md 缺少 description，Agent 无法判断何时该用它',
  }
}

export function listSkills(dir = skillsDir()): SkillRecord[] {
  let entries: string[] = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
  const out: SkillRecord[] = []
  for (const id of entries) {
    if (!ID_PATTERN.test(id)) continue
    try {
      out.push(readOne(dir, id))
    } catch {
      // 没有 SKILL.md 的目录不是技能，跳过。
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function readSkill(id: string, dir = skillsDir()): SkillRecord | null {
  try {
    return readOne(dir, assertSkillId(id))
  } catch {
    return null
  }
}

function requireSkill(id: string, dir: string) {
  const record = readSkill(id, dir)
  if (!record) throw new Error(`unknown skill: ${id}`)
  return record
}

export function writeSkill(meta: SkillMeta, body: string, dir = skillsDir()) {
  const id = assertSkillId(meta.id)
  mkdirSync(join(dir, id), { recursive: true })
  writeFileSync(join(dir, id, SKILL_FILE), renderSkillFile({ ...meta, id }, body), 'utf8')
  return requireSkill(id, dir)
}

export function createSkill(
  input: { id?: string; name?: string; description?: string; body?: string },
  dir = skillsDir(),
) {
  const name = String(input.name ?? '').trim()
  const id = assertSkillId(String(input.id ?? '').trim() || slugify(name))
  if (readSkill(id, dir)) throw new Error(`skill already exists: ${id}`)
  const description = String(input.description ?? '').trim()
  if (!description) throw new Error('skill description is required: Agent 靠它判断何时该读这个技能')
  return writeSkill({ id, name: name || id, description, enabled: true }, String(input.body ?? ''), dir)
}

export function patchSkill(
  id: string,
  patch: { name?: unknown; description?: unknown; enabled?: unknown },
  dir = skillsDir(),
) {
  const current = requireSkill(id, dir)
  const next: SkillMeta = {
    id: current.id,
    name: patch.name === undefined ? current.name : String(patch.name).trim() || current.id,
    description: patch.description === undefined ? current.description : String(patch.description).trim(),
    enabled: patch.enabled === undefined ? current.enabled : patch.enabled !== false,
  }
  return writeSkill(next, current.body, dir)
}

export function writeSkillBody(id: string, body: string, dir = skillsDir()) {
  const current = requireSkill(id, dir)
  return writeSkill(current, body, dir)
}

export function removeSkill(id: string, dir = skillsDir()) {
  const current = requireSkill(id, dir)
  rmSync(current.dir, { recursive: true, force: true })
  return { id: current.id, removed: true }
}

function compareEntries(a: SkillEntry, b: SkillEntry) {
  if (a.name === SKILL_FILE && b.name !== SKILL_FILE) return -1
  if (b.name === SKILL_FILE && a.name !== SKILL_FILE) return 1
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function readFileEntry(skillId: string, skillDir: string, rel: string, parentRel: string, withBody = false): SkillEntry {
  const full = join(skillDir, rel)
  const stat = statSync(full)
  const name = rel.split('/').pop() || rel
  let body = ''
  let error = ''
  if (withBody) {
    try {
      const raw = readFileSync(full)
      if (raw.includes(0)) {
        error = '二进制文件，不能当正文打开'
      } else {
        const text = raw.toString('utf8')
        body = name === SKILL_FILE && !parentRel ? parseFrontmatter(text).body : text
      }
    } catch (caught) {
      error = String(caught instanceof Error ? caught.message : caught)
    }
  }
  return {
    skillId,
    rel,
    name,
    kind: 'file',
    parentRel,
    path: full,
    bytes: stat.size,
    createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
    updatedAt: Math.round(stat.mtimeMs),
    body,
    error,
  }
}

function walkSkillDir(skillId: string, skillDir: string, parentRel = ''): SkillEntry[] {
  const folder = parentRel ? join(skillDir, parentRel) : skillDir
  let listed: import('node:fs').Dirent[] = []
  try {
    listed = readdirSync(folder, { withFileTypes: true })
  } catch {
    return []
  }
  const visible = listed.filter((entry) => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isFile()))
  visible.sort((a, b) =>
    compareEntries(
      { name: a.name, kind: a.isDirectory() ? 'folder' : 'file' } as SkillEntry,
      { name: b.name, kind: b.isDirectory() ? 'folder' : 'file' } as SkillEntry,
    ),
  )
  const kids: SkillEntry[] = []
  for (const entry of visible) {
    const rel = parentRel ? `${parentRel}/${entry.name}` : entry.name
    const full = join(skillDir, rel)
    if (entry.isDirectory()) {
      const stat = statSync(full)
      kids.push({
        skillId,
        rel,
        name: entry.name,
        kind: 'folder',
        parentRel,
        path: full,
        bytes: dirBytes(full),
        createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
        updatedAt: Math.round(stat.mtimeMs),
        body: '',
        error: '',
      })
      kids.push(...walkSkillDir(skillId, skillDir, rel))
      continue
    }
    kids.push(readFileEntry(skillId, skillDir, rel, parentRel))
  }
  return kids
}

export function listSkillEntries(id: string, dir = skillsDir()): SkillEntry[] {
  const skill = requireSkill(id, dir)
  return walkSkillDir(skill.id, skill.dir)
}

export function readSkillEntry(id: string, rel: string, dir = skillsDir()): SkillEntry {
  const skill = requireSkill(id, dir)
  const wanted = String(rel ?? '').trim().replace(/^\.\//, '')
  if (!wanted) throw new Error('file is required')
  const parentRel = dirname(wanted) === '.' ? '' : dirname(wanted).replaceAll('\\', '/')
  const full = resolve(skill.dir, wanted)
  if (relative(skill.dir, full).startsWith('..') || isAbsolute(wanted)) {
    throw new Error(`file escapes the skill directory: ${rel}`)
  }
  const stat = statSync(full)
  if (stat.isDirectory()) {
    return {
      skillId: skill.id,
      rel: wanted,
      name: wanted.split('/').pop() || wanted,
      kind: 'folder',
      parentRel,
      path: full,
      bytes: dirBytes(full),
      createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
      updatedAt: Math.round(stat.mtimeMs),
      body: '',
      error: '',
    }
  }
  return readFileEntry(skill.id, skill.dir, wanted, parentRel, true)
}

export function writeSkillEntry(id: string, rel: string, content: string, dir = skillsDir()) {
  const wanted = String(rel ?? '').trim().replace(/^\.\//, '')
  if (wanted === SKILL_FILE) return writeSkillBody(id, content, dir)
  writeSkillFile(id, wanted, content, dir)
  return requireSkill(id, dir)
}

export function removeSkillEntry(id: string, rel: string, dir = skillsDir()) {
  const entry = readSkillEntry(id, rel, dir)
  if (entry.kind === 'folder') rmSync(entry.path, { recursive: true, force: true })
  else unlinkSync(entry.path)
  return { id: skillFileId(id, rel), removed: true }
}

/**
 * 把「技能内的相对路径」解析成绝对路径，越界一律拒绝。
 * 技能目录在会话工作区之外，没有 host-fs 那层沙箱兜着，这里就是唯一的边界。
 */
export function resolveSkillFile(id: string, file: string, dir = skillsDir()) {
  const skill = requireSkill(id, dir)
  const rel = String(file ?? '').trim().replace(/^\.\//, '')
  if (!rel) throw new Error('file is required')
  if (isAbsolute(rel)) throw new Error(`file must be relative to the skill directory: ${file}`)
  const full = resolve(skill.dir, rel)
  if (relative(skill.dir, full).startsWith('..')) {
    throw new Error(`file escapes the skill directory: ${file}`)
  }
  if (full === join(skill.dir, SKILL_FILE)) {
    throw new Error(`${SKILL_FILE} 不走这里：正文用 db_content /skills/${skill.id}，元数据用 db_update`)
  }
  return { skill, full, rel }
}

export function writeSkillFile(id: string, file: string, content: string, dir = skillsDir()) {
  const { skill, full, rel } = resolveSkillFile(id, file, dir)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, String(content ?? ''), 'utf8')
  return { id: skill.id, file: rel, path: full, bytes: statSync(full).size }
}
