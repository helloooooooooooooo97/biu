import { afterEach, beforeEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import * as skills from './index.ts'
import { skillsCollection } from './collection.ts'
import { parseFrontmatter, parseSkillRowId, renderSkillFile, skillFileId, slugify } from './store.ts'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biu-skills-'))
  process.env.BIU_SKILLS_DIR = dir
})

afterEach(() => {
  delete process.env.BIU_SKILLS_DIR
  rmSync(dir, { recursive: true, force: true })
})

function seed(id: string, text: string) {
  mkdirSync(join(dir, id), { recursive: true })
  writeFileSync(join(dir, id, 'SKILL.md'), text, 'utf8')
}

async function boot() {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(skills)
  return ctx
}

test('frontmatter: reads name / description / enabled and keeps the body', () => {
  const parsed = parseFrontmatter('---\nname: Deploy\ndescription: "when: shipping"\nenabled: false\n---\n\n# Steps\nrun it\n')
  assert.equal(parsed.meta.name, 'Deploy')
  assert.equal(parsed.meta.description, 'when: shipping')
  assert.equal(parsed.meta.enabled, 'false')
  assert.equal(parsed.body, '# Steps\nrun it')
})

test('frontmatter: a file without frontmatter is all body', () => {
  const parsed = parseFrontmatter('# Just markdown\n')
  assert.deepEqual(parsed.meta, {})
  assert.equal(parsed.body, '# Just markdown')
})

test('frontmatter round-trips, and enabled is only written when off', () => {
  const rendered = renderSkillFile({ id: 'deploy', name: 'Deploy', description: 'when: shipping', enabled: true }, 'body')
  assert.equal(rendered.includes('enabled:'), false)
  const back = parseFrontmatter(rendered)
  assert.equal(back.meta.description, 'when: shipping')
  assert.equal(back.body, 'body')
  const off = parseFrontmatter(renderSkillFile({ id: 'x', name: 'X', description: 'd', enabled: false }, 'b'))
  assert.equal(off.meta.enabled, 'false')
})

test('slugify builds ids that pass validation', () => {
  assert.equal(slugify('Deploy To Prod'), 'deploy-to-prod')
  assert.equal(slugify('  2 Fast!  '), 'fast')
})

test('the prompt section lists skills without inlining their bodies', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布到生产环境时用\n---\n机密正文不该进 prompt\n')
  const ctx = await boot()
  const assembled = ctx.systemPrompt.assemble()
  assert.equal(assembled.includes('<available_skills>'), true)
  assert.equal(assembled.includes('deploy（Deploy）：发布到生产环境时用'), true)
  assert.equal(assembled.includes('机密正文不该进 prompt'), false)
})

test('no skills means no section at all', async () => {
  const ctx = await boot()
  assert.equal(ctx.skills.promptSection(), '')
  assert.equal(ctx.systemPrompt.assemble().includes('available_skills'), false)
})

test('disabled skills and skills without description stay out of the prompt', async () => {
  seed('off', '---\nname: Off\ndescription: 停用的技能\nenabled: false\n---\nbody\n')
  seed('vague', '---\nname: Vague\n---\nbody\n')
  seed('good', '---\nname: Good\ndescription: 可用\n---\nbody\n')
  const ctx = await boot()
  assert.deepEqual(ctx.skills.summaries().map((item) => item.id), ['good'])
  // 表里仍然看得到它们，并且缺 description 的那行会带上原因。
  const rows = ctx.skills.list()
  assert.deepEqual(rows.map((item) => item.id), ['good', 'off', 'vague'])
  assert.equal(rows.find((item) => item.id === 'vague')?.error.includes('description'), true)
})

test('skill_read returns the full body, skill_list only the summaries', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布时用\n---\n# 步骤\n1. 跑测试\n')
  const ctx = await boot()
  const listed = (await ctx.tools.invoke('skill_list')) as Array<Record<string, unknown>>
  assert.deepEqual(Object.keys(listed[0]!).sort(), ['description', 'id', 'name', 'path'])
  const read = (await ctx.tools.invoke('skill_read', { id: 'deploy' })) as {
    body: string
    dir: string
    files: Array<{ path: string }>
  }
  assert.equal(read.body, '# 步骤\n1. 跑测试')
  assert.equal(read.dir, join(dir, 'deploy'))
  assert.deepEqual(read.files.map((item) => item.path), ['SKILL.md'])
  await assert.rejects(() => ctx.tools.invoke('skill_read', { id: 'nope' }), /unknown skill/)
})

test('skill_list all=true also shows disabled and broken rows', async () => {
  seed('off', '---\nname: Off\ndescription: d\nenabled: false\n---\nbody\n')
  const ctx = await boot()
  assert.deepEqual(await ctx.tools.invoke('skill_list'), [])
  const all = (await ctx.tools.invoke('skill_list', { all: true })) as Array<{ id: string; enabled: boolean }>
  assert.deepEqual(all.map((item) => [item.id, item.enabled]), [['off', false]])
})

test('toggling enabled rewrites the frontmatter and keeps the body', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布时用\n---\n# 步骤\n1. 跑测试\n')
  const ctx = await boot()
  ctx.skills.setEnabled('deploy', false)
  assert.equal(ctx.skills.read('deploy').enabled, false)
  assert.equal(ctx.skills.promptSection(), '')
  assert.equal(ctx.skills.read('deploy').body, '# 步骤\n1. 跑测试')
  ctx.skills.setEnabled('deploy', true)
  assert.equal(ctx.skills.read('deploy').enabled, true)
  assert.equal(readFileSync(join(dir, 'deploy', 'SKILL.md'), 'utf8').includes('enabled:'), false)
})

test('create derives the id from the name and demands a description', async () => {
  const ctx = await boot()
  const created = ctx.skills.create({ name: 'Deploy To Prod', description: '发布时用', body: 'step' })
  assert.equal(created.id, 'deploy-to-prod')
  assert.equal(created.enabled, true)
  assert.throws(() => ctx.skills.create({ name: 'No Desc' }), /description is required/)
  assert.throws(() => ctx.skills.create({ name: 'Deploy To Prod', description: 'x' }), /already exists/)
})

test('remove deletes the whole skill directory', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: d\n---\nbody\n')
  writeFileSync(join(dir, 'deploy', 'helper.sh'), 'echo hi', 'utf8')
  const ctx = await boot()
  assert.deepEqual(ctx.skills.remove('deploy'), { id: 'deploy', removed: true })
  assert.deepEqual(ctx.skills.list(), [])
  assert.throws(() => ctx.skills.read('deploy'), /unknown skill/)
})

test('skill_write puts attachments in the skill directory, subdirs included', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: d\n---\nbody\n')
  const ctx = await boot()
  const written = (await ctx.tools.invoke('skill_write', {
    id: 'deploy',
    file: 'helper.sh',
    content: 'echo hi\n',
  })) as { file: string; path: string; bytes: number }
  assert.equal(written.file, 'helper.sh')
  assert.equal(written.path, join(dir, 'deploy', 'helper.sh'))
  assert.equal(readFileSync(join(dir, 'deploy', 'helper.sh'), 'utf8'), 'echo hi\n')
  // 子目录自动创建。
  await ctx.tools.invoke('skill_write', { id: 'deploy', file: 'templates/report.md', content: '# r' })
  assert.equal(readFileSync(join(dir, 'deploy', 'templates', 'report.md'), 'utf8'), '# r')
  // 覆盖写。
  await ctx.tools.invoke('skill_write', { id: 'deploy', file: 'helper.sh', content: 'echo bye\n' })
  assert.equal(readFileSync(join(dir, 'deploy', 'helper.sh'), 'utf8'), 'echo bye\n')
})

test('skill_write refuses to escape the skill directory', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: d\n---\nbody\n')
  seed('other', '---\nname: Other\ndescription: d\n---\nbody\n')
  const ctx = await boot()
  const write = (file: string) => ctx.tools.invoke('skill_write', { id: 'deploy', file, content: 'x' })
  await assert.rejects(() => write('../other/SKILL.md'), /escapes the skill directory/)
  await assert.rejects(() => write('../../outside.txt'), /escapes the skill directory/)
  await assert.rejects(() => write('nested/../../outside.txt'), /escapes the skill directory/)
  await assert.rejects(() => write('/etc/passwd'), /must be relative/)
  await assert.rejects(() => write(''), /file is required/)
  await assert.rejects(() => write('   '), /file is required/)
  // 另一个技能的正文没被动过。
  assert.equal(readFileSync(join(dir, 'other', 'SKILL.md'), 'utf8').includes('name: Other'), true)
})

test('skill_write cannot be used to bypass the frontmatter logic', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: d\n---\nbody\n')
  const ctx = await boot()
  await assert.rejects(
    () => ctx.tools.invoke('skill_write', { id: 'deploy', file: 'SKILL.md', content: 'raw' }),
    /db_content/,
  )
  await assert.rejects(
    () => ctx.tools.invoke('skill_write', { id: 'deploy', file: './SKILL.md', content: 'raw' }),
    /db_content/,
  )
  // 子目录里叫 SKILL.md 是允许的，那不是技能入口。
  await ctx.tools.invoke('skill_write', { id: 'deploy', file: 'examples/SKILL.md', content: 'sample' })
  assert.equal(ctx.skills.read('deploy').body, 'body', '技能正文没被改写')
})

test('skill_write rejects unknown skills instead of creating a stray directory', async () => {
  const ctx = await boot()
  await assert.rejects(() => ctx.tools.invoke('skill_write', { id: 'nope', file: 'x.sh', content: 'x' }), /unknown skill/)
  assert.deepEqual(ctx.skills.list(), [])
})

test('bytes counts the whole directory, not just SKILL.md', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: d\n---\nbody\n')
  const ctx = await boot()
  const before = ctx.skills.read('deploy').bytes
  await ctx.tools.invoke('skill_write', { id: 'deploy', file: 'helper.sh', content: 'x'.repeat(500) })
  assert.equal(ctx.skills.read('deploy').bytes, before + 500)
})

test('the prompt section points at skill_read and no longer dangles a path', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布时用\n---\nbody\n')
  const ctx = await boot()
  const section = ctx.skills.promptSection()
  assert.equal(section.includes('deploy（Deploy）：发布时用'), true)
  // 之前这里挂着绝对路径，会诱导 agent 去 fs_read，而那条路是走不通的。
  assert.equal(section.includes(join(dir, 'deploy')), false)
  assert.equal(section.includes('fs_read 打不开'), true)
})

test('file row ids never contain slashes and round-trip the relative path', () => {
  assert.equal(skillFileId('deploy', 'SKILL.md').includes('/'), false)
  assert.equal(skillFileId('deploy', 'templates/report.md').includes('/'), false)
  assert.deepEqual(parseSkillRowId('deploy'), { skillId: 'deploy' })
  assert.deepEqual(parseSkillRowId(skillFileId('deploy', 'templates/report.md')), {
    skillId: 'deploy',
    rel: 'templates/report.md',
  })
})

test('the /skills table lists the skill as a parent and every file as a child', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布时用\n---\n# 步骤\n')
  mkdirSync(join(dir, 'deploy', 'templates'), { recursive: true })
  writeFileSync(join(dir, 'deploy', 'helper.sh'), 'echo hi\n', 'utf8')
  writeFileSync(join(dir, 'deploy', 'templates', 'report.md'), '# r\n', 'utf8')
  const ctx = await boot()
  const rows = await skillsCollection(ctx.skills).list()
  assert.deepEqual(
    rows.map((row) => [row.id, row.kind, row.parentId, row.title]),
    [
      ['deploy', 'skill', '', 'Deploy'],
      [skillFileId('deploy', 'SKILL.md'), 'file', 'deploy', 'SKILL.md'],
      [skillFileId('deploy', 'templates'), 'folder', 'deploy', 'templates'],
      [skillFileId('deploy', 'templates/report.md'), 'file', skillFileId('deploy', 'templates'), 'report.md'],
      [skillFileId('deploy', 'helper.sh'), 'file', 'deploy', 'helper.sh'],
    ],
  )
  // 技能父行不带 SKILL.md 正文；点文件才读得到。
  assert.equal(rows[0]?.body, '')
  const skillMd = await skillsCollection(ctx.skills).get!(skillFileId('deploy', 'SKILL.md'))
  assert.equal(skillMd?.body, '# 步骤')
  const helper = await skillsCollection(ctx.skills).get!(skillFileId('deploy', 'helper.sh'))
  assert.equal(helper?.body, 'echo hi\n')
})

test('writing a file row keeps SKILL.md frontmatter intact', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布时用\n---\nold\n')
  const ctx = await boot()
  const spec = skillsCollection(ctx.skills)
  await spec.update!(skillFileId('deploy', 'SKILL.md'), { body: 'new steps' })
  assert.equal(ctx.skills.read('deploy').body, 'new steps')
  assert.equal(ctx.skills.read('deploy').name, 'Deploy')
  ctx.skills.writeFile('deploy', 'notes.md', 'extra')
  await spec.update!(skillFileId('deploy', 'notes.md'), { body: 'changed' })
  assert.equal(ctx.skills.readEntry('deploy', 'notes.md').body, 'changed')
})

test('unplugging the skills plugin drops its tools and its prompt section', async () => {
  seed('deploy', '---\nname: Deploy\ndescription: 发布时用\n---\nbody\n')
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  const fiber = ctx.plugin(skills)
  await fiber
  assert.equal(ctx.tools.names().includes('skill_read'), true)
  assert.equal(ctx.systemPrompt.assemble().includes('available_skills'), true)
  await fiber.dispose()
  assert.equal(ctx.tools.names().includes('skill_read'), false)
  assert.equal(ctx.systemPrompt.assemble().includes('available_skills'), false)
})
