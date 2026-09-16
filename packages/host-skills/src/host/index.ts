import { Service, type Context } from 'cordis'
import { skillsCollection } from './collection.ts'
import { legacySkillImports, SkillsStore, type SkillImportInput, type SkillRecord } from './store.ts'

export type SkillSummary = {
  id: string
  name: string
  description: string
  source: string
}

export class SkillsService extends Service {
  private store: SkillsStore

  constructor(ctx: Context) {
    super(ctx, 'skills')
    this.store = new SkillsStore()
    ctx.inject(['systemPrompt'], (inner) => {
      inner.systemPrompt.register('skills', () => this.promptSection())
    })
    ctx.inject(['database'], (inner) => {
      inner.database.register(skillsCollection(this))
    })
  }

  private changed() {
    this.ctx.emit('hub/change')
    try {
      this.ctx.emit('database/change')
    } catch {
      // File System 尚未挂载时不影响仓库本身。
    }
  }

  list(): SkillRecord[] {
    return this.store.list()
  }

  listEnabled() {
    return this.list().filter((skill) => skill.enabled && skill.description.trim())
  }

  summaries(): SkillSummary[] {
    return this.listEnabled().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: skill.source,
    }))
  }

  recordOrNull(id: string) {
    return this.store.get(id)
  }

  record(id: string) {
    const skill = this.store.get(id)
    if (!skill) throw new Error(`unknown skill: ${id}`)
    return skill
  }

  read(id: string) {
    const skill = this.record(id)
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: skill.source,
      enabled: skill.enabled,
      body: skill.notes,
    }
  }

  readFiles(id: string, args: Record<string, unknown> = {}) {
    const path = String(args.path ?? '').trim()
    if (!path) return { files: this.store.listFiles(id) }
    return this.store.readFile(id, path)
  }

  writeFiles(id: string, args: Record<string, unknown> = {}) {
    const path = String(args.path ?? '').trim()
    if (!path) throw new Error('write-files needs path')
    const written = this.store.writeFile(id, path, String(args.content ?? ''))
    this.changed()
    return written
  }

  create(input: Parameters<SkillsStore['create']>[0]) {
    const created = this.store.create(input)
    this.changed()
    return created
  }

  import(input: SkillImportInput) {
    const created = this.store.import(input)
    this.changed()
    return created
  }

  migrateLegacyDirectories() {
    let migrated = 0
    for (const input of legacySkillImports()) {
      const id = String(input.id || '')
      if (!id || this.store.get(id)) continue
      try {
        this.store.import(input)
        migrated += 1
      } catch {
        // 已存在或目录不合法就跳过。
      }
    }
    if (migrated) this.changed()
    return migrated
  }

  patch(id: string, patch: { name?: unknown; description?: unknown; source?: unknown; enabled?: unknown; notes?: unknown }) {
    const next = this.store.patch(id, patch)
    this.changed()
    return next
  }

  setEnabled(id: string, enabled: boolean) {
    return this.patch(id, { enabled })
  }

  remove(id: string) {
    const removed = this.store.remove(id)
    if (removed) this.changed()
    return removed
  }

  promptSection() {
    const howto = [
      '从 GitHub 安装技能：skill_import 的 files 必须带上 SKILL.md 以及仓库里的 scripts/、package.json 等，不要只进口径 Markdown。',
      'SKILL.md 进正文；其它文件写进 .biu/skill/<id>/。漏了的脚本用 db_action path=/skills/<id> action=write-files，args.path 如 scripts/capture.mjs，args.content 为全文。',
      'source 写上游 URL（仓库或具体 md），版权可追溯。',
    ]
    const skills = this.listEnabled()
    const lines = skills.map((skill) => {
      const src = skill.source ? ` 来源 ${skill.source}` : ''
      return `- ${skill.id}（${skill.name}）：${skill.description}${src}`
    })
    return [
      '<available_skills>',
      ...howto,
      ...(skills.length
        ? ['这些技能存在 /skills，这里只列摘要。相关时 skill_read 或 db_content /skills/<id>。', ...lines]
        : ['/skills 目前没有已启用技能。']),
      '</available_skills>',
    ].join('\n')
  }
}

export const name = 'skills'
export const inject = ['tools', 'database', 'http']

export function apply(ctx: Context) {
  const skills = new SkillsService(ctx)

  ctx.tools.register({
    name: 'skill_list',
    description: '列出 /skills。默认只列已启用项；all=true 包含停用项。',
    parameters: {
      type: 'object',
      properties: { all: { type: 'boolean' } },
    },
    execute: (args) =>
      (args.all === true ? skills.list() : skills.summaries()).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        enabled: 'enabled' in skill ? skill.enabled : true,
      })),
  })

  ctx.tools.register({
    name: 'skill_read',
    description: '读取一个 Skill 的正文。和 db_content /skills/<id> 相同。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => skills.read(String(args.id)),
  })

  ctx.tools.register({
    name: 'skill_import',
    description:
      '把带 SKILL.md 的目录收成 /skills 一条记录。files 必须包含 SKILL.md 以及脚本（scripts/*.mjs 等），不要只进口径 Markdown。' +
      'SKILL.md 进正文；其它路径写进 .biu/skill/<id>/。漏了事后 write-files。' +
      'source 填上游 URL（GitHub 仓库或具体文件链接），版权可追溯。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        source: { type: 'string', description: '上游 URL，例如 https://github.com/org/repo/blob/main/skills/foo/SKILL.md' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: { path: { type: 'string' }, content: { type: 'string' } },
            required: ['path', 'content'],
          },
        },
      },
      required: ['files'],
    },
    execute: (args) =>
      skills.import({
        id: String(args.id ?? ''),
        name: String(args.name ?? ''),
        description: String(args.description ?? ''),
        source: String(args.source ?? ''),
        files: Array.isArray(args.files) ? args.files as Array<{ path: string; content: string }> : [],
      }),
  })

  ctx.http.route('POST', '/api/skills/import', async (route) => {
    try {
      const body = await route.json<SkillImportInput>()
      const imported = skills.import(body)
      route.send(200, { ok: true, skill: imported })
    } catch (error) {
      route.send(400, { ok: false, error: String(error instanceof Error ? error.message : error) })
    }
  })

  ctx.http.route('POST', '/api/skills/rescan', async (route) => {
    try {
      const migrated = skills.migrateLegacyDirectories()
      route.send(200, { ok: true, imported: migrated })
    } catch (error) {
      route.send(400, { ok: false, error: String(error instanceof Error ? error.message : error) })
    }
  })

  const migrationTimer = setTimeout(() => {
    try {
      const migrated = skills.migrateLegacyDirectories()
      if (migrated) ctx.logger('skills').info(`migrated ${migrated} legacy skill directories`)
    } catch (error) {
      ctx.logger('skills').error(error)
    }
  }, 0)
  ctx.effect(() => () => clearTimeout(migrationTimer))
}

export type { SkillImportFile, SkillImportInput, SkillRecord } from './store.ts'
export { skillRoot } from './store.ts'
