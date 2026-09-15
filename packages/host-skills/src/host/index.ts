import { Service, type Context } from 'cordis'
import { skillsCollection } from './collection.ts'
import { legacySkillImports, SkillsStore, type SkillImportInput, type SkillRecord } from './store.ts'

export type SkillSummary = {
  id: string
  name: string
  description: string
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
      enabled: skill.enabled,
      body: skill.notes,
    }
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

  patch(id: string, patch: { name?: unknown; description?: unknown; enabled?: unknown; notes?: unknown }) {
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
    const skills = this.listEnabled()
    if (!skills.length) return ''
    const lines = skills.map((skill) => `- ${skill.id}（${skill.name}）：${skill.description}`)
    return [
      '<available_skills>',
      '这些技能存在 /skills，这里只列摘要，不展开正文。',
      '相关时用 skill_read 或 db_content /skills/<id> 读取正文。',
      ...lines,
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
    description: '把带 SKILL.md 的目录收成 /skills 里的一条记录。其它 md 会按章节附在正文后面。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
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
