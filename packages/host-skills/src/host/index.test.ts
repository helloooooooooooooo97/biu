import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import type { CollectionSpec, Database } from '@biu/type-file-system'
import * as skills from './index.ts'
import { packSkillImport, parseFrontmatter, SkillsStore } from './store.ts'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biu-skills-'))
  process.env.BIU_SKILL_ROOT = join(dir, 'skill')
  process.env.BIU_SKILLS_DIR = join(dir, 'legacy-skills')
})

afterEach(() => {
  delete process.env.BIU_SKILL_ROOT
  delete process.env.BIU_SKILLS_DIR
  rmSync(dir, { recursive: true, force: true })
})

class FakeDatabase extends Service implements Database {
  specs: CollectionSpec[] = []

  constructor(ctx: Context) {
    super(ctx, 'database')
  }

  register(spec: CollectionSpec) {
    this.specs.push(spec)
    return { dispose() {} }
  }

  async create() { return { kind: 'created', path: '', items: [] } }
  async writeContent() { return null }
  async content() { return null }
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
      content: '---\nname: ABC\ndescription: 需要执行 ABC 流程时使用\n---\n\n先阅读能力一。',
    },
    { path: 'abc/cap/cap1.md', content: '能力一' },
  ],
}

test('frontmatter keeps discovery metadata separate from body', () => {
  const parsed = parseFrontmatter(fixture.files[0]!.content)
  assert.equal(parsed.meta.name, 'ABC')
  assert.equal(parsed.meta.description, '需要执行 ABC 流程时使用')
  assert.equal(parsed.body, '先阅读能力一。')
})

test('prompt tells agents how to store scripts and source even before any skill exists', async () => {
  const { ctx } = await boot()
  const prompt = ctx.systemPrompt.assemble()
  assert.match(prompt, /write-files/)
  assert.match(prompt, /source/)
  assert.match(prompt, /db_create \/skills/)
  assert.match(prompt, /from/)
})

test('import keeps source url for attribution', () => {
  const store = new SkillsStore()
  const record = store.import({
    source: 'https://github.com/tommyjepsen/awesome-ux-skills/blob/main/skills/craft/SKILL.md',
    files: [
      {
        path: 'design-craft/SKILL.md',
        content: '---\nname: Design Craft\ndescription: 治 AI 味时使用\n---\n\n十二条。',
      },
      { path: 'design-craft/scripts/capture.mjs', content: 'export const capture = 1' },
    ],
  })
  assert.equal(record.source, 'https://github.com/tommyjepsen/awesome-ux-skills/blob/main/skills/craft/SKILL.md')
  assert.match(readFileSync(join(process.env.BIU_SKILL_ROOT!, 'design-craft.md'), 'utf8'), /github.com\/tommyjepsen/)
  assert.deepEqual(store.listFiles(record.id), ['scripts/capture.mjs'])
})

test('directory import keeps SKILL.md as notes and other files on disk', () => {
  const packed = packSkillImport(fixture.files)
  assert.equal(packed.notes, '先阅读能力一。')
  assert.equal(packed.files.length, 1)
  assert.equal(packed.files[0]?.path, 'cap/cap1.md')
})

test('store writes markdown under its own directory, not /pages', () => {
  const store = new SkillsStore()
  const record = store.create({ name: 'ABC', description: '需要时用', notes: '具体技能正文' })
  assert.equal(record.id, 'abc')
  assert.equal(store.get('abc')?.notes, '具体技能正文')
  assert.match(readFileSync(join(process.env.BIU_SKILL_ROOT!, 'abc.md'), 'utf8'), /具体技能正文/)
})

test('each conversation sees summaries while skill_read loads the body on demand', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '需要执行 ABC 流程时使用', files: fixture.files }])
  const prompt = ctx.systemPrompt.assemble()

  assert.match(prompt, /abc（ABC）：需要执行 ABC 流程时使用/)
  assert.doesNotMatch(prompt, /先阅读/)
  const read = await ctx.tools.invoke('skill_read', { id: 'abc' }) as { body: string }
  assert.match(read.body, /先阅读能力一/)
  const listed = ctx.skills.readFiles('abc') as { files: string[] }
  assert.deepEqual(listed.files, ['cap/cap1.md'])
})

test('/skills rows are Skill records, not Page pointers', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '需要执行 ABC 流程时使用', files: fixture.files }])
  const rows = await spec.list()

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.title, 'ABC')
  assert.equal(rows[0]?.enabled, true)
  assert.equal(rows[0]?.rootPageId, undefined)
  assert.equal(spec.schema.fields.source?.type, 'url')
  assert.equal(spec.schema.fields.files?.type, 'file')
  assert.equal(spec.actions?.map((item) => item.id).join(','), 'enable,disable,read-files,write-files')
})

test('/skills new button creates a disabled draft before description is filled', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  const rows = await spec.create!([{ title: '新技能' }])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.title, '新技能')
  assert.equal(rows[0]?.description, '')
  assert.equal(rows[0]?.enabled, false)
  assert.equal(ctx.systemPrompt.assemble().includes('新技能'), false)
})

test('startup migrates legacy .biu/skills directories once', async () => {
  const legacy = join(process.env.BIU_SKILLS_DIR!, 'abc')
  mkdirSync(join(legacy, 'cap'), { recursive: true })
  writeFileSync(
    join(legacy, 'SKILL.md'),
    '---\nname: ABC\ndescription: 旧目录技能\n---\n\n读取能力。',
  )
  writeFileSync(join(legacy, 'cap/one.md'), '能力正文')

  const first = await boot()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const record = new SkillsStore().get('abc')
  assert.ok(record)
  assert.match(record.notes, /读取能力/)
  assert.doesNotMatch(record.notes, /能力正文/)
  const store = new SkillsStore()
  assert.deepEqual(store.listFiles('abc'), ['cap/one.md'])
  assert.match(store.readFile('abc', 'cap/one.md').text, /能力正文/)

  assert.equal(first.ctx.skills.migrateLegacyDirectories(), 0)
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

  assert.equal(ctx.skills.migrateLegacyDirectories(), 1)
  assert.equal(new SkillsStore().get('late-skill')?.name, 'Late Skill')
})

test('import writes extra files under the skill id directory', () => {
  const store = new SkillsStore()
  const record = store.import({
    files: [
      {
        path: 'pretty-mermaid/SKILL.md',
        content: '---\nname: Pretty Mermaid\ndescription: 画 Mermaid 图时使用\n---\n\n先读脚本。',
      },
      { path: 'pretty-mermaid/scripts/render.mjs', content: 'export const render = () => {}' },
      { path: 'pretty-mermaid/package.json', content: '{"name":"pretty-mermaid"}' },
    ],
  })
  assert.equal(record.id, 'pretty-mermaid')
  assert.equal(record.notes, '先读脚本。')
  assert.deepEqual(store.listFiles(record.id), ['package.json', 'scripts/render.mjs'])
  assert.match(store.readFile(record.id, 'scripts/render.mjs').text, /export const render/)
})

test('read-files and write-files actions use the skill id directory', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'Pretty', description: '画图时用', notes: '正文' }])
  const write = spec.actions?.find((item) => item.id === 'write-files')
  const read = spec.actions?.find((item) => item.id === 'read-files')
  const src = join(dir, 'capture.mjs')
  writeFileSync(src, 'export const fromDisk = 1\n')
  await write?.run('pretty', { id: 'pretty' }, { path: 'scripts/copied.mjs', from: src })
  assert.deepEqual(await read?.run('pretty', { id: 'pretty' }, {}), { files: ['scripts/copied.mjs'] })
  const file = await read?.run('pretty', { id: 'pretty' }, { path: 'scripts/copied.mjs' }) as { text: string }
  assert.equal(file.text, 'export const fromDisk = 1\n')
  await assert.rejects(
    async () => write!.run('pretty', { id: 'pretty' }, { path: 'scripts/secret.mjs', from: '/etc/passwd' }),
    /workspace or \/tmp/,
  )
})

test('remove deletes the skill markdown and its files directory', () => {
  const store = new SkillsStore()
  const record = store.import({
    files: [
      { path: 'gone/SKILL.md', content: '---\nname: Gone\ndescription: 删掉时用\n---\n\n正文' },
      { path: 'gone/scripts/a.mjs', content: '1' },
    ],
  })
  const dir = store.filesDir(record.id)
  assert.equal(store.remove(record.id), true)
  assert.equal(store.get(record.id), null)
  assert.equal(existsSync(dir), false)
})

test('db_create /skills copies a pack from disk via files[].from', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  const src = join(dir, 'render.mjs')
  writeFileSync(src, 'export const render = () => {}\n')
  await spec.create!([{
    title: 'Pretty Mermaid',
    description: '画图时用',
    source: 'https://github.com/example/pretty-mermaid',
    files: [
      { path: 'SKILL.md', content: '---\nname: Pretty Mermaid\ndescription: 画图时用\n---\n\n先读脚本。' },
      { path: 'scripts/render.mjs', from: src },
    ],
  }])
  const store = new SkillsStore()
  assert.equal(store.get('pretty-mermaid')?.source, 'https://github.com/example/pretty-mermaid')
  assert.equal(store.readFile('pretty-mermaid', 'scripts/render.mjs').text, 'export const render = () => {}\n')
})

test('db_content can update Skill notes without touching pages', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '说明', notes: '旧正文' }])
  const updated = await spec.update!('abc', { notes: '新正文' })
  assert.equal(updated.notes, '新正文')
  assert.equal(new SkillsStore().get('abc')?.notes, '新正文')
})
