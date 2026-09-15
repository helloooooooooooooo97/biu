import { Service, type Context } from 'cordis'
import { skillsCollection } from './collection.ts'
import {
  createSkill,
  listSkillEntries,
  listSkills,
  patchSkill,
  readSkill,
  readSkillEntry,
  removeSkill,
  removeSkillEntry,
  skillsDir,
  writeSkillBody,
  writeSkillEntry,
  writeSkillFile,
  type SkillRecord,
} from './store.ts'

export type SkillSummary = {
  id: string
  name: string
  description: string
  path: string
}

/**
 * 技能不整段塞进 system prompt：prompt 里只有名字、一句说明和路径，
 * Agent 判断相关时再用 skill_read 取全文。加技能不会按比例吃掉上下文。
 */
export class SkillsService extends Service {
  private dir: string

  constructor(ctx: Context) {
    super(ctx, 'skills')
    this.dir = skillsDir()
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
      // File System 还没挂上时不影响技能本身。
    }
  }

  list(): SkillRecord[] {
    return listSkills(this.dir)
  }

  listEnabled(): SkillRecord[] {
    return this.list().filter((skill) => skill.enabled && skill.description.trim())
  }

  summaries(): SkillSummary[] {
    return this.listEnabled().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      path: skill.path,
    }))
  }

  read(id: string) {
    const skill = readSkill(id, this.dir)
    if (!skill) throw new Error(`unknown skill: ${id}`)
    return skill
  }

  create(input: { id?: string; name?: string; description?: string; body?: string }) {
    const created = createSkill(input, this.dir)
    this.changed()
    return created
  }

  patch(id: string, patch: { name?: unknown; description?: unknown; enabled?: unknown }) {
    const next = patchSkill(id, patch, this.dir)
    this.changed()
    return next
  }

  setEnabled(id: string, enabled: boolean) {
    return this.patch(id, { enabled })
  }

  writeBody(id: string, body: string) {
    const next = writeSkillBody(id, body, this.dir)
    this.changed()
    return next
  }

  writeFile(id: string, file: string, content: string) {
    const written = writeSkillFile(id, file, content, this.dir)
    this.changed()
    return written
  }

  listEntries(id: string) {
    return listSkillEntries(id, this.dir)
  }

  readEntry(id: string, rel: string) {
    return readSkillEntry(id, rel, this.dir)
  }

  writeEntry(id: string, rel: string, content: string) {
    const next = writeSkillEntry(id, rel, content, this.dir)
    this.changed()
    return next
  }

  removeEntry(id: string, rel: string) {
    const removed = removeSkillEntry(id, rel, this.dir)
    this.changed()
    return removed
  }

  remove(id: string) {
    const removed = removeSkill(id, this.dir)
    this.changed()
    return removed
  }

  /** 一个技能都没启用时返回空串，systemPrompt.assemble 会把它过滤掉。 */
  promptSection() {
    const skills = this.listEnabled()
    if (!skills.length) return ''
    const lines = skills.map((skill) => `- ${skill.id}（${skill.name}）：${skill.description}`)
    return [
      '<available_skills>',
      '这些技能是按需加载的操作手册，正文没有展开。先看 description 判断是否与当前任务相关：',
      '相关就用 skill_read 读全文，按里面的步骤做，不要凭名字猜内容；不相关就别读。',
      '技能目录在会话工作区之外，fs_read 打不开，一律走 skill_read。',
      ...lines,
      '</available_skills>',
    ].join('\n')
  }
}

export const name = 'skills'
export const inject = ['tools']

export function apply(ctx: Context) {
  const skills = new SkillsService(ctx)

  ctx.tools.register({
    name: 'skill_list',
    description:
      '列出可用技能（id、名字、一句说明、SKILL.md 路径）。system prompt 里已带这份清单，通常不必再调；需要连被停用的一起看时传 all=true。',
    parameters: {
      type: 'object',
      properties: { all: { type: 'boolean', description: '连停用的和缺 description 的一起列出' } },
    },
    execute: (args) => {
      if (args.all === true) {
        return skills.list().map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          enabled: skill.enabled,
          path: skill.path,
          error: skill.error,
        }))
      }
      return skills.summaries()
    },
  })
  ctx.tools.register({
    name: 'skill_read',
    description:
      '读一个技能的全文。判断某个技能与当前任务相关后再调用，然后按正文里的步骤执行。' +
      '正文提到的附属脚本或模板用 bash 拼 dir 的绝对路径去读或执行；fs_read 读不到它们（技能目录在会话工作区之外）。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'skill_list 或 system prompt 清单里的 id' } },
      required: ['id'],
    },
    execute: (args) => {
      const skill = skills.read(String(args.id))
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        path: skill.path,
        dir: skill.dir,
        enabled: skill.enabled,
        body: skill.body,
        files: skills.listEntries(skill.id)
          .filter((entry) => entry.kind === 'file')
          .map((entry) => ({ path: entry.rel, bytes: entry.bytes })),
      }
    },
  })
  ctx.tools.register({
    name: 'skill_write',
    description:
      '往技能目录里写一个附属文件（脚本、模板、参考资料），路径相对技能目录，可带子目录。' +
      '写完必须在 SKILL.md 正文里写清这个文件是什么、什么时候用、怎么调用——正文是唯一的索引，' +
      '没写进正文的文件后续不会被发现。技能正文本身不走这里：用 db_content /skills/<id>。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '技能 id' },
        file: { type: 'string', description: '相对技能目录的路径，例如 helper.sh 或 templates/report.md' },
        content: { type: 'string', description: '文件内容，覆盖写入' },
      },
      required: ['id', 'file', 'content'],
    },
    execute: (args) => skills.writeFile(String(args.id), String(args.file), String(args.content ?? '')),
  })
}

export type { SkillRecord }
export { skillsDir } from './store.ts'
