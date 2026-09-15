import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import type { CollectionSpec, Database } from '@biu/type-file-system'
import * as skills from './index.ts'
import {
  importSkillPages,
  parseFrontmatter,
  resolveSkillPage,
  resolveSkillRelativePath,
  SkillRegistry,
  type SkillRecord,
} from './store.ts'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biu-page-skills-'))
  process.env.BIU_SKILLS_REGISTRY = join(dir, 'skills.json')
  process.env.BIU_SKILLS_DIR = join(dir, 'legacy-skills')
})

afterEach(() => {
  delete process.env.BIU_SKILLS_REGISTRY
  delete process.env.BIU_SKILLS_DIR
  rmSync(dir, { recursive: true, force: true })
})

class FakeDatabase extends Service implements Database {
  specs: CollectionSpec[] = []
  pages = new Map<string, Record<string, unknown>>()
  private seq = 0

  constructor(ctx: Context) {
    super(ctx, 'database')
  }

  register(spec: CollectionSpec) {
    this.specs.push(spec)
    return { dispose() {} }
  }

  async create(path: string, raw: unknown) {
    assert.equal(path, '/pages')
    const rows = Array.isArray(raw) ? raw : []
    const items = rows.map((row) => {
      const id = `p${++this.seq}`
      this.pages.set(id, { id, ...(row as object), notes: '' })
      return { path: `/pages/${id}`, value: { id } }
    })
    return { kind: 'created', path, items }
  }

  async writeContent(path: string, value: unknown) {
    const id = path.split('/').pop()!
    const page = this.pages.get(id)
    if (!page) throw new Error(`unknown page: ${id}`)
    page.notes = String(value ?? '')
    return { kind: 'content', path, field: 'notes', value: page.notes }
  }

  async content(path: string) {
    const page = this.pages.get(path.split('/').pop()!)
    if (!page) throw new Error(`unknown page: ${path}`)
    return { kind: 'content', path, field: 'notes', value: page.notes }
  }

  async list() { return { items: [] } }
  async read() { return null }
  async update() { return null }
  async remove() { return null }
  async action() { return null }
  async stat() { return null }
}

class FakeHttp extends Service {
  routes = new Map<string, (route: unknown) => unknown>()

  constructor(ctx: Context) {
    super(ctx, 'http')
  }

  route(method: string, path: string, handler: (route: unknown) => unknown) {
    this.routes.set(`${method} ${path}`, handler)
  }
}

async function boot() {
  const ctx = new Context()
  const database = new FakeDatabase(ctx)
  const http = new FakeHttp(ctx)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(skills)
  return { ctx, database, http }
}

const fixture = {
  files: [
    {
      path: 'abc/skill.md',
      content: '---\nname: ABC\ndescription: 需要执行 ABC 流程时使用\n---\n\n先阅读 [能力一](cap/cap1.md)。',
    },
    { path: 'abc/cap/cap1.md', content: '能力一；返回 [入口](../skill.md)。' },
    { path: 'abc/cap/cap2.md', content: '能力二' },
  ],
}

test('frontmatter keeps discovery metadata separate from Page body', () => {
  const parsed = parseFrontmatter(fixture.files[0]!.content)
  assert.equal(parsed.meta.name, 'ABC')
  assert.equal(parsed.meta.description, '需要执行 ABC 流程时使用')
  assert.equal(parsed.body, '先阅读 [能力一](cap/cap1.md)。')
})

test('directory import creates one Page for every directory and document', async () => {
  const ctx = new Context()
  const database = new FakeDatabase(ctx)
  const record = await importSkillPages(database, fixture)

  assert.equal(record.id, 'abc')
  assert.deepEqual(Object.keys(record.pages).sort(), ['', 'cap', 'cap/cap1.md', 'cap/cap2.md', 'skill.md'])
  assert.equal(database.pages.get(record.pages.cap!)?.parentId, record.rootPageId)
  assert.equal(database.pages.get(record.pages['cap/cap1.md']!)?.parentId, record.pages.cap)
  assert.match(String(database.pages.get(record.rootPageId)?.notes), new RegExp(`page/${record.entryPageId}`))
  assert.match(String(database.pages.get(record.pages.cap!)?.notes), new RegExp(`page/${record.pages['cap/cap1.md']}`))
})

test('relative Markdown links become stable Page mentions', async () => {
  const ctx = new Context()
  const database = new FakeDatabase(ctx)
  const record = await importSkillPages(database, fixture)
  const entry = String(database.pages.get(record.entryPageId)?.notes)
  const cap = String(database.pages.get(record.pages['cap/cap1.md']!)?.notes)

  assert.match(entry, new RegExp(`\\[@ id="page/${record.pages['cap/cap1.md']}"`))
  assert.match(cap, new RegExp(`\\[@ id="page/${record.entryPageId}"`))
  assert.doesNotMatch(entry, /cap\/cap1\.md/)
  assert.doesNotMatch(cap, /\.\.\/SKILL\.md/)
})

test('relative path resolver stays inside one imported Skill tree', () => {
  assert.equal(resolveSkillRelativePath('cap/cap1.md', '../SKILL.md'), 'SKILL.md')
  assert.equal(resolveSkillRelativePath('cap/cap1.md', './cap2.md'), 'cap/cap2.md')
  assert.equal(resolveSkillRelativePath('SKILL.md', '../../outside.md'), '')
})

test('registry stores only Skill metadata and Page ids', () => {
  const registry = new SkillRegistry()
  const record: SkillRecord = {
    id: 'abc',
    name: 'ABC',
    description: '需要时用',
    enabled: true,
    rootPageId: 'p1',
    entryPageId: 'p2',
    entryPath: 'SKILL.md',
    source: 'test',
    importedAt: 1,
    pages: { '': 'p1', 'SKILL.md': 'p2' },
    directory: join(dir, 'legacy-skills/abc'),
    filePaths: ['SKILL.md'],
    folderHash: 'folder',
    pageHash: 'page',
    syncedAt: 1,
    error: '',
  }
  registry.put(record)
  assert.deepEqual(registry.get('abc'), record)
  assert.doesNotMatch(readFileSync(process.env.BIU_SKILLS_REGISTRY!, 'utf8'), /具体技能正文/)
})

test('resolveSkillPage maps relative paths without reading physical Skill files', () => {
  const record = {
    id: 'abc',
    name: 'ABC',
    description: '测试',
    enabled: true,
    rootPageId: 'p1',
    entryPageId: 'p2',
    entryPath: 'SKILL.md',
    source: 'test',
    importedAt: 1,
    pages: { '': 'p1', 'SKILL.md': 'p2', 'cap/cap1.md': 'p3' },
    directory: join(dir, 'legacy-skills/abc'),
    filePaths: ['SKILL.md', 'cap/cap1.md'],
    folderHash: 'folder',
    pageHash: 'page',
    syncedAt: 1,
    error: '',
  } as SkillRecord
  assert.deepEqual(resolveSkillPage(record), { path: 'SKILL.md', pageId: 'p2' })
  assert.deepEqual(resolveSkillPage(record, '../SKILL.md', 'cap/cap1.md'), { path: 'SKILL.md', pageId: 'p2' })
})

test('each conversation sees summaries while skill_read loads the entry Page on demand', async () => {
  const { ctx } = await boot()
  await ctx.tools.invoke('skill_import', fixture)
  const prompt = ctx.systemPrompt.assemble()

  assert.match(prompt, /abc（ABC）：需要执行 ABC 流程时使用/)
  assert.doesNotMatch(prompt, /先阅读/)
  const read = await ctx.tools.invoke('skill_read', { id: 'abc' }) as { body: string; pageId: string }
  assert.match(read.body, /\[@ id="page\//)
  assert.ok(read.pageId)
})

test('/skills is a registry whose rows point to root and entry Pages', async () => {
  const { ctx } = await boot()
  await ctx.tools.invoke('skill_import', fixture)
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  const rows = await spec.list()

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.title, 'ABC')
  assert.ok(rows[0]?.rootPageId)
  assert.ok(rows[0]?.entryPageId)
  assert.equal('body' in rows[0]!, false)
})

test('/skills new button creates a disabled draft before description is filled', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  const rows = await spec.create!([{ title: '新技能' }])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.title, '新技能')
  assert.equal(rows[0]?.description, '')
  assert.equal(rows[0]?.enabled, false)
  assert.ok(rows[0]?.rootPageId)
  assert.ok(rows[0]?.entryPageId)
  assert.equal(ctx.systemPrompt.assemble().includes('新技能'), false)
})

test('startup migrates legacy .biu/skills directories once', async () => {
  const legacy = join(process.env.BIU_SKILLS_DIR!, 'abc')
  mkdirSync(join(legacy, 'cap'), { recursive: true })
  writeFileSync(
    join(legacy, 'SKILL.md'),
    '---\nname: ABC\ndescription: 旧目录技能\n---\n\n读取 [能力](cap/one.md)。',
  )
  writeFileSync(join(legacy, 'cap/one.md'), '能力正文')

  const first = await boot()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const record = new SkillRegistry().get('abc')
  assert.ok(record)
  assert.ok(record.pages['cap/one.md'])
  assert.match(String(first.database.pages.get(record.entryPageId)?.notes), /\[@ id="page\//)

  const pageCount = first.database.pages.size
  await first.ctx.skills.migrateLegacyDirectories()
  assert.equal(first.database.pages.size, pageCount)
})

test('runtime rescan discovers a Skill directory added after startup', async () => {
  const { ctx, http } = await boot()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(http.routes.has('POST /api/skills/rescan'))

  const legacy = join(process.env.BIU_SKILLS_DIR!, 'late-skill')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(
    join(legacy, 'SKILL.md'),
    '---\nname: Late Skill\ndescription: 运行期间新增\n---\n\n新增正文',
  )

  assert.equal(await ctx.skills.migrateLegacyDirectories(), 1)
  assert.equal(new SkillRegistry().get('late-skill')?.name, 'Late Skill')
})

test('explicit sync moves changes both ways and rejects concurrent edits', async () => {
  const legacy = join(process.env.BIU_SKILLS_DIR!, 'abc')
  mkdirSync(join(legacy, 'cap'), { recursive: true })
  writeFileSync(
    join(legacy, 'SKILL.md'),
    '---\nname: ABC\ndescription: 双向同步测试\n---\n\n读取 [能力](cap/one.md)。',
  )
  writeFileSync(join(legacy, 'cap/one.md'), '旧能力')
  const { ctx, database } = await boot()
  await new Promise((resolve) => setTimeout(resolve, 10))

  writeFileSync(join(legacy, 'cap/one.md'), '文件夹的新能力')
  const pulled = await ctx.skills.syncFromDirectory('abc')
  assert.equal(pulled.status, 'synced')
  let record = new SkillRegistry().get('abc')!
  assert.equal(database.pages.get(record.pages['cap/one.md']!)?.notes, '文件夹的新能力')

  await database.writeContent(`/pages/${record.pages['cap/one.md']}`, 'Page 的新能力')
  const pushed = await ctx.skills.syncToDirectory('abc')
  assert.equal(pushed.status, 'synced')
  assert.equal(readFileSync(join(legacy, 'cap/one.md'), 'utf8'), 'Page 的新能力')
  assert.match(readFileSync(join(legacy, 'SKILL.md'), 'utf8'), /\[能力]\(cap\/one\.md\)/)

  record = new SkillRegistry().get('abc')!
  writeFileSync(join(legacy, 'cap/one.md'), '文件夹冲突')
  await database.writeContent(`/pages/${record.pages['cap/one.md']}`, 'Page 冲突')
  await assert.rejects(() => ctx.skills.syncFromDirectory('abc'), /同步冲突/)
  await assert.rejects(() => ctx.skills.syncToDirectory('abc'), /同步冲突/)
})
