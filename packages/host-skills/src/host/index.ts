import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Service, type Context } from 'cordis'
import { skillsCollection } from './collection.ts'
import { LEGACY_MIGRATED, legacySkillImports, SkillsStore, type SkillImportInput, type SkillRecord } from './store.ts'

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

  /** 只读派生：这条技能目录里已落盘的文件（相对路径，已排序）。 */
  filesOf(id: string): string[] {
    try {
      return this.store.listFiles(id)
    } catch {
      return []
    }
  }

  /** 读技能目录里一个文件的文本。相对路径已做越界校验。 */
  fileText(id: string, path: string): string {
    return this.store.readFile(id, path).text
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
    for (const entry of legacySkillImports()) {
      if (entry.input) {
        const id = String(entry.input.id || '')
        if (!(id && this.store.get(id))) {
          try {
            this.store.import(entry.input)
            migrated += 1
          } catch {
            // 已存在或目录不合法就跳过。
          }
        }
      }
      mkdirSync(entry.folder, { recursive: true })
      if (!existsSync(join(entry.folder, LEGACY_MIGRATED))) {
        writeFileSync(join(entry.folder, LEGACY_MIGRATED), '')
      }
    }
    if (migrated) this.changed()
    return migrated
  }

  patch(id: string, patch: { name?: unknown; description?: unknown; source?: unknown; enabled?: unknown; notes?: unknown; tags?: unknown; emoji?: unknown }) {
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
      '从 GitHub 安装技能：db_create /skills，files[] 用 {path, from} 拷整包（from 限工作区或 /tmp），不要把脚本全文塞进 content。',
      '纯正文只写 notes。额外文件用 bash 直接读写技能目录 .biu/skill/<id>/；已落盘的文件见记录的 fileList 字段。',
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

  // 技能目录里的文件下载。浏览器拿不到磁盘，只能走 HTTP。
  // 路径走 query（路由编译器只支持 :name，不吃斜杠），安全性由 store.readFile 的相对路径校验兜住。
  ctx.http.route('GET', '/api/skills/file', async (route) => {
    try {
      const id = String(route.query?.get('id') ?? '').trim()
      const path = String(route.query?.get('path') ?? '').trim()
      if (!id || !path) {
        route.send(400, { error: 'id and path are required' })
        return
      }
      const file = skills.fileText(id, path)
      const name = path.split('/').pop() ?? path
      route.res.writeHead(200, {
        'content-type': skillFileMime(name),
        'content-disposition': `attachment; filename="${encodeURIComponent(name)}"`,
        'cache-control': 'no-store',
      })
      route.res.end(file)
    } catch (error) {
      route.send(404, { error: String(error instanceof Error ? error.message : error) })
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

/** 技能文件下载用的 content-type。技能包以脚本和文本为主，够用即可。 */
function skillFileMime(name: string) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  if (ext === '.md' || ext === '.txt') return 'text/plain; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8'
  if (ext === '.py') return 'text/x-python; charset=utf-8'
  if (ext === '.sh') return 'text/x-shellscript; charset=utf-8'
  if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}
