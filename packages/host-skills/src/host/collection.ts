import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import type { SkillsService } from './index.ts'
import type { SkillImportFile, SkillRecord } from './store.ts'

function asRecord(skill: SkillRecord, withNotes = true): DbRecord {
  return {
    id: skill.id,
    title: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    source: skill.source,
    notes: withNotes ? skill.notes : '',
    ...recordBuiltinValues({
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      parentId: '',
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
        '从 GitHub 安装：db_create /skills，带 files[]（[{path, from}] 整包拷贝，from 限工作区或 /tmp）。' +
        'SKILL.md 进正文；其它路径写进 .biu/skill/<id>/。纯正文只写 notes。' +
        '漏掉的脚本事后 db_action path=/skills/<id> action=write-files，args.from + args.path，不要传全文。' +
        'source 填上游 URL。列表 db_list /skills。改名字/说明/来源/开关 db_update。正文 db_content。删除 db_delete。' +
        '读文件 db_action action=read-files。本表还有 enable / disable。',
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
      },
    },
    list: () => skills.list().map((item) => asRecord(item, false)),
    get: (id) => {
      const skill = skills.recordOrNull(id)
      return skill ? asRecord(skill) : null
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
              enabled: fields.enabled as boolean | undefined,
              files: pack,
              draft: !String(fields.description ?? '').trim(),
            })
          : skills.create({
              id: String(fields.id ?? ''),
              name: String(fields.title ?? fields.name ?? ''),
              description: String(fields.description ?? ''),
              source: String(fields.source ?? ''),
              enabled: fields.enabled as boolean | undefined,
              notes: String(fields.notes ?? fields.body ?? ''),
              draft: !String(fields.description ?? '').trim(),
            })
        out.push(asRecord(created))
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
      })
      return asRecord(next)
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
      {
        id: 'read-files',
        label: '读文件',
        for: 'agent',
        placement: [],
        description: '读这条技能 id 目录里的文件。不传 path 列出相对路径；args.path 读一个文件的文本。',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
        run: (id, _record, args = {}) => skills.readFiles(id, args),
      },
      {
        id: 'write-files',
        label: '写文件',
        for: 'agent',
        placement: [],
        description: '往这条技能 id 目录写一个文件。优先 args.from 从磁盘拷贝（工作区或 /tmp），args.path 为目录内相对路径。没有 from 才用 args.content。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            from: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path'],
        },
        run: (id, _record, args = {}) => skills.writeFiles(id, args),
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
