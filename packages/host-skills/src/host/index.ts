import { Service, type Context } from 'cordis'
import { skillsCollection } from './collection.ts'
import {
  importSkillPages,
  legacySkillImports,
  readSkillDirectory,
  resolveSkillPage,
  skillFilesFromPages,
  skillFilesHash,
  skillPageHash,
  SkillRegistry,
  skillsRegistryFile,
  syncSkillPagesFromFiles,
  writeSkillDirectory,
  type SkillImportInput,
  type SkillRecord,
} from './store.ts'

export type SkillSummary = {
  id: string
  name: string
  description: string
  rootPageId: string
  entryPageId: string
  entryPath: string
}

type PageContentResult = {
  value?: unknown
}

export class SkillsService extends Service {
  private registry: SkillRegistry

  constructor(ctx: Context) {
    super(ctx, 'skills')
    this.registry = new SkillRegistry(skillsRegistryFile())
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
      // File System 尚未挂载时不影响注册表本身。
    }
  }

  list(): SkillRecord[] {
    return this.registry.list()
  }

  listEnabled() {
    return this.list().filter((skill) => skill.enabled && skill.description.trim())
  }

  summaries(): SkillSummary[] {
    return this.listEnabled().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      rootPageId: skill.rootPageId,
      entryPageId: skill.entryPageId,
      entryPath: skill.entryPath,
    }))
  }

  record(id: string) {
    const skill = this.registry.get(id)
    if (!skill) throw new Error(`unknown skill: ${id}`)
    return skill
  }

  async read(id: string, target = '', from = '') {
    const skill = this.record(id)
    const resolved = resolveSkillPage(skill, target, from)
    const content = await this.ctx.database.content(`/pages/${resolved.pageId}`) as PageContentResult
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: skill.enabled,
      rootPageId: skill.rootPageId,
      entryPageId: skill.entryPageId,
      entryPath: skill.entryPath,
      pageId: resolved.pageId,
      relativePath: resolved.path,
      body: String(content.value ?? ''),
      pages: skill.pages,
    }
  }

  async import(input: SkillImportInput) {
    const wanted = String(input.id ?? '').trim()
    if (wanted && this.registry.get(wanted)) throw new Error(`skill already exists: ${wanted}`)
    let imported = await importSkillPages(this.ctx.database, input)
    if (this.registry.get(imported.id)) throw new Error(`skill already exists: ${imported.id}`)
    if (input.source !== 'legacy-directory-migration') {
      const files = await skillFilesFromPages(this.ctx.database, imported)
      writeSkillDirectory(imported.directory, files)
      imported = { ...imported, folderHash: skillFilesHash(files) }
    }
    this.registry.put(imported)
    this.changed()
    return imported
  }

  private async syncHashes(skill: SkillRecord) {
    const files = readSkillDirectory(skill.directory)
    return {
      files,
      folderHash: skillFilesHash(files),
      pageHash: await skillPageHash(this.ctx.database, skill),
    }
  }

  async syncFromDirectory(id: string) {
    const skill = this.record(id)
    const current = await this.syncHashes(skill)
    if (!skill.folderHash || !skill.pageHash) {
      const initialized = {
        ...skill,
        folderHash: current.folderHash,
        pageHash: current.pageHash,
        syncedAt: Date.now(),
      }
      this.registry.put(initialized)
      return { direction: 'from-directory', status: 'initialized', skill: initialized }
    }
    if (current.folderHash === skill.folderHash) {
      return { direction: 'from-directory', status: 'unchanged', skill }
    }
    if (current.pageHash !== skill.pageHash) {
      throw new Error('同步冲突：文件夹和 Page 在上次同步后都发生了修改，请先选择要保留的一侧')
    }
    const synced = await syncSkillPagesFromFiles(this.ctx.database, skill, current.files)
    this.registry.put(synced.record)
    this.changed()
    return { direction: 'from-directory', status: 'synced', ...synced }
  }

  async syncToDirectory(id: string) {
    const skill = this.record(id)
    const current = await this.syncHashes(skill)
    if (!skill.folderHash || !skill.pageHash) {
      const initialized = {
        ...skill,
        folderHash: current.folderHash,
        pageHash: current.pageHash,
        syncedAt: Date.now(),
      }
      this.registry.put(initialized)
      return { direction: 'to-directory', status: 'initialized', skill: initialized }
    }
    if (current.pageHash === skill.pageHash) {
      return { direction: 'to-directory', status: 'unchanged', skill }
    }
    if (current.folderHash !== skill.folderHash) {
      throw new Error('同步冲突：文件夹和 Page 在上次同步后都发生了修改，请先选择要保留的一侧')
    }
    const files = await skillFilesFromPages(this.ctx.database, skill)
    writeSkillDirectory(skill.directory, files)
    const next = {
      ...skill,
      folderHash: skillFilesHash(files),
      pageHash: current.pageHash,
      syncedAt: Date.now(),
    }
    this.registry.put(next)
    this.changed()
    return { direction: 'to-directory', status: 'synced', files: files.length, skill: next }
  }

  async migrateLegacyDirectories() {
    const registered = new Set(this.list().map((skill) => skill.id))
    let migrated = 0
    for (const input of legacySkillImports()) {
      const id = String(input.id)
      if (registered.has(id)) continue
      const imported = await importSkillPages(this.ctx.database, input)
      this.registry.put(imported)
      registered.add(imported.id)
      migrated += 1
    }
    for (const skill of this.list()) {
      if (skill.folderHash && skill.pageHash && skill.syncedAt) continue
      const current = await this.syncHashes(skill)
      this.registry.put({
        ...skill,
        folderHash: current.folderHash,
        pageHash: current.pageHash,
        syncedAt: Date.now(),
      })
    }
    if (migrated) this.changed()
    return migrated
  }

  patch(id: string, patch: { name?: unknown; description?: unknown; enabled?: unknown }) {
    const next = this.registry.patch(id, {
      ...(patch.name !== undefined ? { name: String(patch.name) } : {}),
      ...(patch.description !== undefined ? { description: String(patch.description) } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled !== false } : {}),
    })
    this.changed()
    return next
  }

  setEnabled(id: string, enabled: boolean) {
    return this.patch(id, { enabled })
  }

  remove(id: string) {
    const removed = this.registry.remove(id)
    this.changed()
    return removed
  }

  promptSection() {
    const skills = this.listEnabled()
    if (!skills.length) return ''
    const lines = skills.map(
      (skill) =>
        `- ${skill.id}（${skill.name}）：${skill.description}；根页面 /pages/${skill.rootPageId}`,
    )
    return [
      '<available_skills>',
      '这些技能存成 Page 树；这里只列摘要，不展开正文。',
      '相关时用 skill_read 读取入口 Page。正文中的 Page 引用按需用 db_content 继续读，不要一次展开整棵树。',
      '相对引用可继续调用 skill_read，并传 path 与 from（当前 relativePath）；导入时能解析的 Markdown 相对链接已改成 Page 引用。',
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
    description: '列出 Skill 仓库注册信息。默认只列已启用项；all=true 包含停用项。',
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
        rootPageId: skill.rootPageId,
        entryPageId: skill.entryPageId,
        entryPath: skill.entryPath,
      })),
  })

  ctx.tools.register({
    name: 'skill_read',
    description:
      '按需读取 Skill 的入口 Page，或解析标准目录中的相对路径。path 省略时读取 SKILL.md；' +
      '读取 ../skill.md 之类引用时同时传 from=当前返回的 relativePath。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        path: { type: 'string' },
        from: { type: 'string' },
      },
      required: ['id'],
    },
    execute: (args) =>
      skills.read(String(args.id), String(args.path ?? ''), String(args.from ?? '')),
  })

  ctx.tools.register({
    name: 'skill_import',
    description:
      '把标准 Skill 目录导入为 Page 树并注册到 /skills。files 的 path 可包含根目录名；根目录必须有 SKILL.md。',
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
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
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
        source: 'skill_import',
      }),
  })

  ctx.http.route('POST', '/api/skills/import', async (route) => {
    try {
      const body = await route.json<SkillImportInput>()
      const imported = await skills.import({ ...body, source: body.source || 'browser-directory' })
      route.send(200, { ok: true, skill: imported })
    } catch (error) {
      route.send(400, { ok: false, error: String(error instanceof Error ? error.message : error) })
    }
  })

  ctx.http.route('POST', '/api/skills/rescan', async (route) => {
    try {
      const migrated = await skills.migrateLegacyDirectories()
      route.send(200, { ok: true, imported: migrated })
    } catch (error) {
      route.send(400, { ok: false, error: String(error instanceof Error ? error.message : error) })
    }
  })

  // Core Page 在插件清单中可能晚于 Skills 挂载；让本轮插件装载完成后再迁移。
  const migrationTimer = setTimeout(() => {
    void skills.migrateLegacyDirectories()
      .then((migrated) => {
        if (migrated) ctx.logger('skills').info(`migrated ${migrated} legacy skill directories into Page trees`)
      })
      .catch((error) => ctx.logger('skills').error(error))
  }, 0)
  ctx.effect(() => () => clearTimeout(migrationTimer))
}

export type { SkillImportFile, SkillImportInput, SkillRecord } from './store.ts'
export { skillsRegistryFile } from './store.ts'
