import { recordBuiltinValues, REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import type { SkillsService } from './index.ts'
import { slugify, type SkillRecord } from './store.ts'

function asRecord(skill: SkillRecord): DbRecord {
  return {
    id: skill.id,
    title: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    rootPageId: skill.rootPageId,
    entryPageId: skill.entryPageId,
    entryPath: skill.entryPath,
    source: skill.source,
    importedAt: skill.importedAt,
    directory: skill.directory,
    syncedAt: skill.syncedAt,
    error: skill.error,
    ...recordBuiltinValues({
      createdAt: skill.importedAt,
      updatedAt: skill.importedAt,
      parentId: '',
    }),
  }
}

export function skillsCollection(skills: SkillsService): CollectionSpec {
  const find = (id: string) => {
    const skill = skills.list().find((item) => item.id === id)
    return skill ? asRecord(skill) : null
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
        'Skill 仓库只保存注册信息，正文和目录树全部是 /pages 中的 Page。' +
        'rootPageId 是技能根 Page，entryPageId 是导入的 SKILL.md Page；parentId 表示目录归属，目录 Page 正文用 @引用列出直接子 Page。' +
        '每次对话只注入已启用技能的 name 与 description；需要时 skill_read 才读取入口 Page。' +
        '创建可用 db_create /skills，目录导入用 db_action path=/skills/<id> action=import。' +
        '双向同步用 sync-from-directory（文件夹到 Page）与 sync-to-directory（Page 写回文件夹）；双方都修改时会拒绝覆盖。',
      order: 50,
      icon: 'document',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      columns: ['title', 'description', 'enabled', 'rootPageId', 'source'],
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
        rootPageId: { type: 'ref', label: '根页面', collection: '/pages' },
        entryPageId: { type: 'ref', label: '入口页面', collection: '/pages' },
        entryPath: { type: 'string', label: '入口相对路径' },
        source: { type: 'string', label: '导入来源' },
        directory: { type: 'string', label: '同步目录' },
        importedAt: { type: 'datetime', label: '导入时间' },
        syncedAt: { type: 'datetime', label: '上次同步' },
        error: { type: 'string', label: '错误' },
      },
    },
    list: () => skills.list().map(asRecord),
    get: find,
    create: async (rows) => {
      const out: DbRecord[] = []
      for (const fields of rows) {
        const title = String(fields.title ?? '').trim() || '新技能'
        const description = String(fields.description ?? '').trim()
        const requestedId = String(fields.id ?? '').trim()
        const generatedId = slugify(title) || `skill-${Date.now().toString(36)}`
        const created = await skills.import({
          id: requestedId || generatedId,
          name: title,
          description,
          enabled: description ? fields.enabled !== false : false,
          draft: !description,
          files: [{ path: 'SKILL.md', content: String(fields.body ?? '') }],
          source: 'created-in-biu',
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
        id: 'import',
        label: '导入目录',
        for: 'agent',
        placement: [],
        allowMissing: true,
        description:
          '把标准 Skill 目录导入为 Page 树。files=[{path,content}]；每个目录与文本文件都会成为 Page，根目录登记到 /skills。',
        parameters: {
          type: 'object',
          properties: {
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
        run: (id, _record, args = {}) =>
          skills.import({
            id,
            name: String(args.name ?? ''),
            description: String(args.description ?? ''),
            files: Array.isArray(args.files) ? args.files as Array<{ path: string; content: string }> : [],
            source: 'db_action',
          }),
      },
      {
        id: 'sync-from-directory',
        label: '从文件夹同步',
        placement: ['row', 'detail'],
        description: '读取本地 Skill 目录中的文本文件，更新对应 Page；双方都改过时拒绝覆盖。',
        run: (id) => skills.syncFromDirectory(id),
      },
      {
        id: 'sync-to-directory',
        label: '写回文件夹',
        placement: ['row', 'detail'],
        description: '把 Skill 的文件 Page 写回本地目录，入口 Page 重建为带 frontmatter 的 SKILL.md。',
        run: (id) => skills.syncToDirectory(id),
      },
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
        id: 'unregister',
        label: '移出仓库',
        tone: 'danger',
        confirm: '只移除 Skill 注册，保留所有关联 Page。确定继续？',
        description: '从每次对话的 Skill 清单中移除，但不删除 Page，避免误删被其它文档引用的内容。',
        run: (id) => skills.remove(id),
      },
    ],
  }
}
