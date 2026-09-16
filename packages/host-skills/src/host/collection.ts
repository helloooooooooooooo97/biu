import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import type { SkillsService } from './index.ts'
import type { SkillImportFile, SkillRecord } from './store.ts'

function asRecord(skill: SkillRecord, withNotes = true, files: string[] = []): DbRecord {
  return {
    id: skill.id,
    title: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    source: skill.source,
    notes: withNotes ? skill.notes : '',
    fileList: files.join('\n'),
    ...recordBuiltinValues({
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      parentId: '',
      tags: skill.tags,
      emoji: skill.emoji,
    }),
  }
}

export function skillsCollection(skills: SkillsService): CollectionSpec {
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
        'Skill 是独立的一张表。从 GitHub 安装：db_create /skills，带 files[]（[{path, from}] 整包拷贝，from 限工作区或 /tmp）。' +
        'SKILL.md 进正文；其它路径写进 .biu/skill/<id>/。纯正文只写 notes。' +
        'source 填上游 URL。列表 db_list /skills。改名字/说明/来源/开关 db_update。正文 db_content。删除 db_delete。' +
        '额外文件用 bash 直接读写：技能目录是 .biu/skill/<id>/，已落盘的文件见记录的 fileList 字段。' +
        '本表只有 enable / disable 两个动作。',
      order: 50,
      icon: 'academic-cap',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      contentField: 'notes',
      columns: ['title', 'description', 'source', 'enabled'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '名字', writable: true },
        description: {
          type: 'string',
          label: '何时使用',
          writable: true,
          description: '写清 Agent 应在什么情况下使用这个技能。',
        },
        enabled: { type: 'boolean', label: '已启用', writable: true },
        source: {
          type: 'url',
          label: '来源',
          writable: true,
          description: '上游链接，例如 GitHub 仓库或具体 SKILL.md 的 URL，用来追溯版权。',
        },
        notes: { type: 'file', label: '正文', writable: true },
        files: {
          type: 'file',
          label: '文件包',
          writable: true,
          description:
            '仅创建时用。整包：[{ path, from }] 或 { path, content }。from 是磁盘源路径（工作区或 /tmp），不要把脚本全文塞进来。没有 files 时写 notes 即纯正文。',
        },
        fileList: {
          type: 'attachment',
          label: '已有文件',
          writable: false,
          description:
            '只读。这条技能目录（.biu/skill/<id>/）里已落盘的文件，相对路径、每行一个、已排序。由磁盘实时算出，不是存储字段。',
        },
      },
    },
    list: () => skills.list().map((item) => asRecord(item, false, skills.filesOf(item.id))),
    get: (id) => {
      const skill = skills.recordOrNull(id)
      return skill ? asRecord(skill, true, skills.filesOf(skill.id)) : null
    },
    create: async (rows) => {
      const out: DbRecord[] = []
      for (const fields of rows) {
        const pack = asCreateFiles(fields.files)
        const created = pack?.length
          ? skills.import({
              id: String(fields.id ?? ''),
              name: String(fields.title ?? fields.name ?? ''),
              description: String(fields.description ?? ''),
              source: String(fields.source ?? ''),
              tags: fields.tags,
              emoji: fields.emoji,
              enabled: fields.enabled as boolean | undefined,
              files: pack,
              // 不传 draft：由 store 按“记录字段 + SKILL.md frontmatter”综合判定。
            })
          : skills.create({
              id: String(fields.id ?? ''),
              name: String(fields.title ?? fields.name ?? ''),
              description: String(fields.description ?? ''),
              source: String(fields.source ?? ''),
              tags: fields.tags,
              emoji: fields.emoji,
              enabled: fields.enabled as boolean | undefined,
              notes: String(fields.notes ?? fields.body ?? ''),
              draft: !String(fields.description ?? '').trim(),
            })
        out.push(asRecord(created, true, skills.filesOf(created.id)))
      }
      return out
    },
    update: (id, patch) => {
      const next = skills.patch(id, {
        ...(patch.title !== undefined ? { name: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
      })
      return asRecord(next, true, skills.filesOf(next.id))
    },
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) skills.remove(id)
      return ids
    },
    actions: [
      {
        id: 'enable',
        label: '启用',
        when: { enabled: false },
        run: (id) => skills.setEnabled(id, true),
      },
      {
        id: 'disable',
        label: '停用',
        when: { enabled: true },
        run: (id) => skills.setEnabled(id, false),
      },
    ],
  }
}

function asCreateFiles(value: unknown): SkillImportFile[] | undefined {
  if (value == null || value === '') return undefined
  if (!Array.isArray(value)) throw new Error('files must be an array')
  return value.map((item) => {
    const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    return {
      path: String(rec.path ?? ''),
      content: rec.content == null ? undefined : String(rec.content),
      from: rec.from == null ? undefined : String(rec.from),
    }
  })
}
