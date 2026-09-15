import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import type { SkillsService } from './index.ts'
import {
  parseSkillRowId,
  skillFileId,
  slugify,
  type SkillEntry,
  type SkillRecord,
} from './store.ts'

const DRAFT_DESCRIPTION = '待补充：写清什么情况下该用这个技能。填好之前这行是停用的，Agent 看不到。'

function draftId(taken: readonly string[]) {
  const used = new Set(taken)
  let id = 'new-skill'
  for (let n = 2; used.has(id); n++) id = `new-skill-${n}`
  return id
}

const CREATE_DESCRIPTION =
  '新建一个技能，写成 .biu/skills/<id>/SKILL.md（记录可以还不存在，id 就是这行的 id；不传 id 则从 name 生成）。' +
  'description 必填且要写清「什么时候该用这个技能」——Agent 只靠它决定是否读全文，写得含糊技能就永远不会被用上。' +
  'body 是 SKILL.md 正文（Markdown 步骤），可以先建空的再点开 SKILL.md 用 db_content 写。'

const WRITE_DESCRIPTION =
  '表格按目录展开：技能是父行，点开文件才看正文。SKILL.md 用 db_content path=/skills/<技能id>:SKILL.md；' +
  '其它文件用 db_content path=/skills/<技能id>:<encodeURIComponent(相对路径)>。' +
  'name / description / enabled 写在技能父行上（db_update /skills/<技能id>）。附属文件也可用 skill_write。'

function asSkillRecord(skill: SkillRecord): DbRecord {
  return {
    id: skill.id,
    title: skill.name,
    kind: 'skill',
    description: skill.description,
    enabled: skill.enabled,
    path: skill.path,
    dir: skill.dir,
    bytes: skill.bytes,
    error: skill.error,
    body: '',
    ...recordBuiltinValues({ createdAt: skill.createdAt, updatedAt: skill.updatedAt, parentId: '' }),
  }
}

function asEntryRecord(entry: SkillEntry, body = ''): DbRecord {
  const parentId = entry.parentRel ? skillFileId(entry.skillId, entry.parentRel) : entry.skillId
  return {
    id: skillFileId(entry.skillId, entry.rel),
    title: entry.name,
    kind: entry.kind,
    description: '',
    enabled: false,
    path: entry.path,
    dir: '',
    bytes: entry.bytes,
    error: entry.error,
    body,
    ...recordBuiltinValues({ createdAt: entry.createdAt, updatedAt: entry.updatedAt, parentId }),
  }
}

export function skillsCollection(skills: SkillsService): CollectionSpec {
  const find = (id: string) => {
    try {
      const parsed = parseSkillRowId(id)
      if (!parsed.rel) {
        const skill = skills.list().find((item) => item.id === parsed.skillId)
        return skill ? asSkillRecord(skill) : null
      }
      const entry = skills.readEntry(parsed.skillId, parsed.rel)
      return asEntryRecord(entry, entry.body)
    } catch {
      return null
    }
  }
  return {
    id: 'skills',
    path: '/skills',
    label: '技能',
    view: {
      moduleId: 'skills',
      route: '/skills',
      title: '技能',
      inspector: true,
      blurb:
        '这是技能表（按需加载的操作手册），不是插件（插件在 /plugins）也不是 MCP 服务器（那在 /mcp）。' +
        '一行技能 = 一个 .biu/skills/<id>/ 目录，下面的文件是子行；点文件才打开正文，不要把技能行当成 SKILL.md。' +
        '技能不是工具：正文不会进 system prompt，Agent 只看到 id、name、description，相关时才 skill_read。' +
        `${WRITE_DESCRIPTION} ` +
        '新建一行会得到一个停用的草稿：把「何时使用」填上再打开 enabled，它才会进 Agent 的清单。' +
        '本表动作（只对技能父行）：create=一次填好新建；enable / disable=进出清单；uninstall=删整个目录。' +
        'error 列有值说明缺 description，那一行不会被 Agent 看到。',
      order: 50,
      icon: 'document',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      contentField: 'body',
      parentField: 'parentId',
      columns: ['title', 'kind', 'description', 'enabled', 'bytes', 'error'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '名字', writable: true, description: '技能是 frontmatter 的 name；文件是文件名' },
        kind: { type: 'select', label: '类型', enum: ['skill', 'file', 'folder'] },
        description: {
          type: 'string',
          label: '何时使用',
          writable: true,
          description: '写在技能父行上。写清什么情况下该用这个技能，Agent 只靠这句判断。',
        },
        enabled: { type: 'boolean', label: '已启用', writable: true, description: '只对技能父行有效。false 时不进 system prompt 清单' },
        path: { type: 'string', label: '路径' },
        dir: { type: 'string', label: '目录' },
        bytes: { type: 'number', label: '大小' },
        error: { type: 'string', label: '错误' },
        body: { type: 'file', label: '正文', writable: true, description: WRITE_DESCRIPTION },
        parentId: { ...REQUIRED_RECORD_FIELDS.parentId, writable: false },
      },
    },
    list: () => {
      const out: DbRecord[] = []
      for (const skill of skills.list()) {
        out.push(asSkillRecord(skill))
        for (const entry of skills.listEntries(skill.id)) {
          out.push(asEntryRecord(entry))
        }
      }
      return out
    },
    get: find,
    create: async (rows) => {
      const out: DbRecord[] = []
      for (const fields of rows) {
        const name = String(fields.title ?? '').trim()
        const described = String(fields.description ?? '').trim()
        const created = skills.create({
          id: String(fields.id ?? '').trim() || slugify(name) || draftId(skills.list().map((item) => item.id)),
          name: name || '新技能',
          description: described || DRAFT_DESCRIPTION,
          body: String(fields.body ?? ''),
        })
        if (!described) skills.setEnabled(created.id, false)
        const row = find(created.id)
        if (!row) throw new Error(`unknown skill: ${created.id}`)
        out.push(row)
      }
      return out
    },
    update: async (id, patch) => {
      const parsed = parseSkillRowId(id)
      if (parsed.rel) {
        if (parsed.rel.includes('/') && 'title' in patch) {
          throw new Error('文件名请在磁盘上改；表格里只编辑正文')
        }
        if ('body' in patch) skills.writeEntry(parsed.skillId, parsed.rel, String(patch.body ?? ''))
        const row = find(id)
        if (!row) throw new Error(`unknown skill file: ${id}`)
        return row
      }
      if ('body' in patch) skills.writeBody(parsed.skillId, String(patch.body ?? ''))
      const meta: { name?: unknown; description?: unknown; enabled?: unknown } = {}
      if ('title' in patch) meta.name = patch.title
      if ('description' in patch) meta.description = patch.description
      if ('enabled' in patch) meta.enabled = patch.enabled
      if (Object.keys(meta).length) skills.patch(parsed.skillId, meta)
      const row = find(parsed.skillId)
      if (!row) throw new Error(`unknown skill: ${parsed.skillId}`)
      return row
    },
    remove: (query) => {
      const ids = (query.ids ?? []).filter(Boolean)
      const removed: string[] = []
      for (const id of ids) {
        const parsed = parseSkillRowId(id)
        if (parsed.rel) skills.removeEntry(parsed.skillId, parsed.rel)
        else skills.remove(parsed.skillId)
        removed.push(id)
      }
      return removed
    },
    actions: [
      {
        id: 'create',
        label: '新建技能',
        for: 'agent',
        placement: [],
        allowMissing: true,
        description: CREATE_DESCRIPTION,
        parameters: {
          type: 'object',
          description: CREATE_DESCRIPTION,
          properties: {
            name: { type: 'string', description: '显示名' },
            description: { type: 'string', description: '什么时候该用这个技能（必填）' },
            body: { type: 'string', description: 'Markdown 正文，可留空后点开 SKILL.md 写' },
          },
          required: ['description'],
        },
        run: (id, _record, args = {}) => {
          if (id.includes(':')) throw new Error('create 只对技能父行：path=/skills/<技能id>')
          return skills.create({
            id,
            name: String(args.name ?? id),
            description: String(args.description ?? ''),
            body: String(args.body ?? ''),
          })
        },
      },
      {
        id: 'enable',
        label: '启用',
        when: { kind: 'skill', enabled: false },
        description: '把这个技能放回 system prompt 的可用清单（改写 SKILL.md 的 frontmatter）。',
        run: (id) => skills.setEnabled(parseSkillRowId(id).skillId, true),
      },
      {
        id: 'disable',
        label: '停用',
        when: { kind: 'skill', enabled: true },
        description: '从 system prompt 清单里拿掉，文件留在盘上，之后 enable 就能回来。',
        run: (id) => skills.setEnabled(parseSkillRowId(id).skillId, false),
      },
      {
        id: 'uninstall',
        label: '删除',
        tone: 'danger',
        confirm: '确定删除这个技能？整个目录会被删掉。',
        when: { kind: 'skill' },
        description: '删掉 .biu/skills/<id>/ 整个目录，包括附带的脚本和模板。只想停用请用 disable。',
        run: (id) => skills.remove(parseSkillRowId(id).skillId),
      },
    ],
  }
}
