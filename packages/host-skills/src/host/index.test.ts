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
  assert.match(prompt, /\.biu\/skill\//)
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
  const listed = ctx.skills.filesOf('abc')
  assert.deepEqual(listed, ['cap/cap1.md'])
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
  assert.equal(spec.schema.fields.fileList?.writable, false)
  assert.equal(spec.actions?.map((item) => item.id).join(','), 'enable,disable')
})

test('import enables the skill when only the frontmatter carries a description', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  // 没有 records 字段 description，说明只在 SKILL.md frontmatter 里。
  await spec.create!([{ files: fixture.files }])
  const row = await spec.get!('abc')

  assert.equal(row?.description, '需要执行 ABC 流程时使用')
  assert.equal(row?.enabled, true)
})

test('import stays a disabled draft when nothing carries a description', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ files: [{ path: 'SKILL.md', content: '# 没有 frontmatter 说明' }] }])
  const rows = await spec.list()

  assert.equal(rows[0]?.enabled, false)
})

test('fileList is a read-only field derived from disk', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '需要执行 ABC 流程时使用', files: fixture.files }])

  const rows = await spec.list()
  assert.equal(rows[0]?.fileList, 'cap/cap1.md')

  const detail = await spec.get!('abc')
  assert.equal(detail?.fileList, 'cap/cap1.md')

  // 落盘一个新脚本后，派生字段立刻反映出来（无需重写记录）。
  const store = new SkillsStore()
  const target = join(store.filesDir('abc'), 'scripts', 'run.mjs')
  mkdirSync(join(store.filesDir('abc'), 'scripts'), { recursive: true })
  writeFileSync(target, 'export {}\n')
  assert.equal((await spec.get!('abc'))?.fileList, 'cap/cap1.md\nscripts/run.mjs')
})

test('browser directory import creates an independent Skill record', async () => {
  const { http } = await boot()
  const handler = http.routes.get('POST /api/skills/import')
  assert.ok(handler)

  const replies: Array<{ code: number; body: unknown }> = []
  await handler!({
    json: async () => fixture,
    send: (code: number, body: unknown) => replies.push({ code, body }),
  })

  assert.deepEqual(replies, [{ code: 201, body: { ok: true, id: 'abc' } }])
  assert.equal(new SkillsStore().get('abc')?.notes, '先阅读能力一。')
  assert.equal(readFileSync(join(process.env.BIU_SKILL_ROOT!, 'abc/cap/cap1.md'), 'utf8'), '能力一')
})

test('skill files are downloadable over the read-only file route', async () => {
  const { ctx, http } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '需要执行 ABC 流程时使用', files: fixture.files }])

  const handler = http.routes.get('GET /api/skills/file')
  assert.ok(handler)

  const chunks: string[] = []
  const route = {
    query: new URLSearchParams('id=abc&path=cap%2Fcap1.md'),
    res: {
      writeHead: () => {},
      end: (body: string) => chunks.push(body),
    },
    send: (code: number, body: unknown) => chunks.push(`${code}:${JSON.stringify(body)}`),
  }
  await handler!(route)

  assert.equal(chunks.join(''), '能力一')

  // 越界路径必须被拒。
  const blocked: string[] = []
  await handler!({
    query: new URLSearchParams('id=abc&path=..%2Fabc.md'),
    res: { writeHead: () => {}, end: (b: string) => blocked.push(b) },
    send: (_c: number, b: unknown) => blocked.push(JSON.stringify(b)),
  })
  assert.match(blocked.join(''), /invalid skill file path/)
})

test('/skills new button creates a disabled draft before description is filled', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  const rows = await spec.create!([{ title: '新技能' }])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.title, '新技能')
  assert.equal(rows[0]?.id, 'new-skill')
  assert.equal(rows[0]?.description, '')
  assert.equal(rows[0]?.enabled, false)
  assert.equal(ctx.systemPrompt.assemble().includes('新技能'), false)

  const again = await spec.create!([{}])
  assert.equal(again[0]?.id, 'new-skill')
  assert.equal(new SkillsStore().list().filter((item) => item.name === '新技能').length, 1)
})

test('blank create reuses one draft instead of timestamp ids', () => {
  const store = new SkillsStore()
  const first = store.create({})
  const second = store.create({ name: '新技能' })
  assert.equal(first.id, 'new-skill')
  assert.equal(second.id, first.id)
  assert.equal(store.list().length, 1)
})

test('legacy empty placeholder directories are not imported on boot', async () => {
  const empty = join(process.env.BIU_SKILLS_DIR!, '空技能')
  mkdirSync(empty, { recursive: true })
  writeFileSync(join(empty, 'SKILL.md'), '---\nname: 新技能\ndescription: ""\n---\n\n')

  const { ctx } = await boot()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(new SkillsStore().list().length, 0)
  assert.equal(ctx.skills.migrateLegacyDirectories(), 0)
  assert.equal(new SkillsStore().list().length, 0)
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

test('legacy skill directories are migrated, and skill HTTP routes are exposed', async () => {
  const { ctx, http } = await boot()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual([...http.routes.keys()], ['POST /api/skills/import', 'GET /api/skills/file'])

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

test('skills only exposes enable/disable; files are read and written through the workspace path', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'Pretty', description: '画图时用', notes: '正文' }])
  assert.deepEqual(spec.actions?.map((item) => item.id), ['enable', 'disable'])

  // 与 agent 用 bash 写文件等价：直接落到 .biu/skill/<id>/ 下。
  const store = new SkillsStore()
  const scripts = join(store.filesDir('pretty'), 'scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(join(scripts, 'copied.mjs'), 'export const fromDisk = 1\n')

  assert.deepEqual(ctx.skills.filesOf('pretty'), ['scripts/copied.mjs'])
  assert.equal(store.readFile('pretty', 'scripts/copied.mjs').text, 'export const fromDisk = 1\n')
  assert.equal((await spec.get!('pretty'))?.fileList, 'scripts/copied.mjs')
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

test('db_update can set skill tags and persist them', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '说明', notes: '正文' }])
  const updated = await spec.update!('abc', { tags: ['design', 'ux'] })
  assert.deepEqual(updated.tags, ['design', 'ux'])
  assert.deepEqual(new SkillsStore().get('abc')?.tags, ['design', 'ux'])
  const again = await spec.update!('abc', { tags: [] })
  assert.deepEqual(again.tags, [])
  assert.deepEqual(new SkillsStore().get('abc')?.tags, [])
})

test('db_content can update Skill notes without touching pages', async () => {
  const { ctx } = await boot()
  const spec = (ctx.database as FakeDatabase).specs.find((item) => item.path === '/skills')!
  await spec.create!([{ title: 'ABC', description: '说明', notes: '旧正文' }])
  const updated = await spec.update!('abc', { notes: '新正文' })
  assert.equal(updated.notes, '新正文')
  assert.equal(new SkillsStore().get('abc')?.notes, '新正文')
})
