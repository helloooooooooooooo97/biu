import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import type { SkillsService } from './index.ts'
import type { SkillRecord } from './store.ts'

function asRecord(skill: SkillRecord, withNotes = true): DbRecord {
  return {
    id: skill.id,
    title: skill.name,
    description: skill.description,
    enabled: skill.enabled,
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
        'Skill 是独立的一张表，不挂到 /pages。每条记录自己的名字、何时使用、开关和正文。' +
        '列表 db_list /skills。新建 db_create /skills。改名字/说明/开关 db_update /skills/<id>。正文 db_content /skills/<id>。删除 db_delete。' +
        '每次对话只注入已启用且写了说明的摘要；需要时用 skill_read 或 db_content 读正文。' +
        '本表动作只有 enable / disable。',
      order: 50,
      icon: 'academic-cap',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      contentField: 'notes',
      columns: ['title', 'description', 'enabled'],
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
        notes: { type: 'file', label: '正文', writable: true },
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
        const created = skills.create({
          id: String(fields.id ?? ''),
          name: String(fields.title ?? fields.name ?? ''),
          description: String(fields.description ?? ''),
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
    ],
  }
}
