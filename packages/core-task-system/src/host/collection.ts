import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'

type Actor = {
  name?: string
  sessionId?: string
  kind?: string
  mascot?: { shape: string; color: string; eye?: number }
}

type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
}

type TaskReport = {
  sessionId?: string
  turn?: number | null
  usage?: Usage
}

type TaskRow = DbRecord & {
  title?: string
  creator?: Actor | null
  assignee?: Actor | null
  parentId?: string | null
  dependsOn?: string[]
  blocked?: boolean
  reports?: TaskReport[]
  usage?: Usage
  trigger?: unknown
  nextTriggerAt?: number | null
}

export type TasksLike = {
  list: (filter?: { q?: string; status?: string }) => TaskRow[]
  get: (id: string) => TaskRow | undefined
  update: (id: string, patch: Record<string, unknown>) => DbRecord
  create: (input: Record<string, unknown> & { title: string; creator: Actor }) => TaskRow
  delete: (id: string) => boolean
}

export type TaskRecordActions = {
  report: (id: string, record: DbRecord, args?: Record<string, unknown>) => unknown | Promise<unknown>
  deliver: (id: string, record: DbRecord, args?: Record<string, unknown>) => unknown | Promise<unknown>
}

export type TaskPeople = {
  resolveCreator?: () => Actor | Promise<Actor>
  resolveAssignee?: (input: {
    assignee?: unknown
    assigneeSessionId?: string | null
  }) => Actor | null | Promise<Actor | null>
}

const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalTokens: 0 }

function asUsage(value: unknown): Usage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  const totalTokens = Number(rec.totalTokens)
  const inputTokens = Number(rec.inputTokens)
  const outputTokens = Number(rec.outputTokens)
  const cacheReadTokens = Number(rec.cacheReadTokens)
  if (![totalTokens, inputTokens, outputTokens, cacheReadTokens].some((n) => Number.isFinite(n) && n > 0)) return null
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    cacheReadTokens: Number.isFinite(cacheReadTokens) ? cacheReadTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  }
}

function addUsage(...usages: Usage[]): Usage {
  const next = { ...ZERO_USAGE }
  for (const usage of usages) {
    next.inputTokens += usage.inputTokens
    next.outputTokens += usage.outputTokens
    next.cacheReadTokens += usage.cacheReadTokens
    next.totalTokens += usage.totalTokens
  }
  return next
}

function ownUsage(row: TaskRow): Usage {
  const stored = asUsage(row.usage)
  if (stored) return stored
  const byKey = new Map<string, Usage>()
  for (const report of row.reports ?? []) {
    const usage = asUsage(report.usage)
    if (!usage) continue
    byKey.set(`${report.sessionId ?? ''}:${report.turn ?? ''}`, usage)
  }
  return byKey.size ? addUsage(...byKey.values()) : ZERO_USAGE
}

function parentChain(row: TaskRow, lookup: (id: string) => TaskRow | undefined) {
  const parts: string[] = []
  let cur: TaskRow | undefined = row
  for (let guard = 0; guard < 16 && cur?.parentId; guard++) {
    const parent = lookup(cur.parentId)
    if (!parent) break
    parts.unshift(String(parent.title ?? ''))
    cur = parent
  }
  return parts.filter(Boolean).join(' / ')
}

function taskRecord(row: TaskRow, lookup: (id: string) => TaskRow | undefined, usage: Usage, aggregate: boolean): DbRecord {
  return {
    id: row.id,
    title: row.title ?? '',
    status: row.status ?? 'todo',
    priority: row.priority ?? 'med',
    difficulty: row.difficulty ?? 'med',
    project: row.project ?? '',
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    dueAt: row.dueAt ?? null,
    description: row.description ?? '',
    notes: row.notes ?? '',
    creator: row.creator?.name ?? '用户',
    creatorSessionId: row.creator?.sessionId ?? '',
    creatorActor: row.creator ?? { kind: 'user', name: '用户' },
    assignee: row.assignee?.name ?? '',
    assigneeSessionId: row.assignee?.sessionId ?? '',
    assigneeActor: row.assignee ?? null,
    parentId: row.parentId ?? null,
    dependsOn: Array.isArray(row.dependsOn) ? row.dependsOn.map(String).filter(Boolean) : [],
    blocked: Boolean(row.blocked),
    parentChain: parentChain(row, lookup),
    usage: usage.totalTokens,
    usageParts: { ...usage, aggregate },
    reports: row.reports ?? [],
    trigger: row.trigger ?? null,
    nextTriggerAt: row.nextTriggerAt ?? null,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? 0,
    ...recordBuiltinValues(row),
  }
}

function recordsWithUsage(rows: TaskRow[]): DbRecord[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const kids = new Map<string, string[]>()
  for (const row of rows) {
    const parent = String(row.parentId ?? '')
    if (!parent) continue
    const list = kids.get(parent) ?? []
    list.push(row.id)
    kids.set(parent, list)
  }
  const own = new Map(rows.map((row) => [row.id, ownUsage(row)]))
  const memo = new Map<string, Usage>()
  const roll = (id: string): Usage => {
    const hit = memo.get(id)
    if (hit) return hit
    const next = addUsage(own.get(id) ?? ZERO_USAGE, ...(kids.get(id) ?? []).map(roll))
    memo.set(id, next)
    return next
  }
  return rows.map((row) =>
    taskRecord(row, (id) => byId.get(id), roll(row.id), Boolean(kids.get(row.id)?.length)),
  )
}

async function resolvedAssignee(
  people: TaskPeople | undefined,
  fields: Record<string, unknown>,
): Promise<Actor | null | undefined> {
  if (!people?.resolveAssignee) return undefined
  if (!('assignee' in fields) && !('assigneeSessionId' in fields)) return undefined
  return people.resolveAssignee({
    ...('assigneeSessionId' in fields ? { assigneeSessionId: fields.assigneeSessionId == null ? '' : String(fields.assigneeSessionId) } : {}),
    ...('assignee' in fields ? { assignee: fields.assignee } : {}),
  })
}

export function tasksCollection(tasks: TasksLike, recordActions?: TaskRecordActions, people?: TaskPeople): CollectionSpec {
  return {
    id: 'tasks',
    path: '/tasks',
    label: '任务',
    view: {
      moduleId: 'tasks',
      route: '/tasks',
      title: '任务',
      inspector: true,
      blurb: '可读写的任务行。列表 db_list /tasks，读一行 db_read /tasks/<id>。改标题/状态/优先级/难度/项目/标签/截止：db_update。执行人 assignee：写成另一个代理的会话 id（一个代理=一个 session，见 /sessions）。创建人 createdBy 由系统自记，不可写，不要另开一列。用户说「让某某 agent 去做」= 先 db_update 把 assignee 写成那个会话 id，再 deliver。新建 db_create，删除 db_delete。长描述用 db_content（字段名 description），不要写进 notes。本表动作（db_action path=/tasks/<任务id> action=…）：deliver=把这条任务发给执行人那个代理（必须先有 assignee.sessionId；可选 args.text 当派工词；wait 默认 true，等到它这一回合结束）；report=正在执行的那个代理汇报进度（必填 args.status=doing 做到一半 或 done 做完，可选 note；会记进 reports 并改任务 status）。你自己若是执行人，做完用 report，不要只改 status。',
      order: 21,
      icon: 'check-circle',
    },
    schema: {
      labelField: 'title',
      contentField: 'description',
      contentBackend: 'editorContent',
      parentField: 'parentId',
      columns: ['title', 'status', 'priority', 'difficulty', 'usage', 'createdBy', 'assignee', 'project', 'tags', 'dueAt'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题', writable: true },
        status: { type: 'select', label: '状态', writable: true, enum: ['todo', 'doing', 'done', 'failed'] },
        priority: { type: 'select', label: '优先级', writable: true, enum: ['low', 'med', 'high'] },
        difficulty: { type: 'select', label: '难度', writable: true, enum: ['low', 'med', 'high'] },
        usage: { type: 'number', label: '消耗', computed: true, sortable: true },
        project: { type: 'string', label: '项目', writable: true },
        tags: { type: 'multi-select', label: '标签', writable: true },
        dueAt: { type: 'datetime', label: '截止', writable: true },
        description: { type: 'file', label: '描述', writable: true },
        notes: { type: 'string', label: '备忘', writable: true },
        assignee: { type: 'string', label: '执行人', writable: true },
        parentId: { type: 'ref', label: '父任务', writable: true },
        dependsOn: { type: 'multi-ref', label: '依赖', writable: true },
      },
    },
    records: { update: true, create: true, delete: true },
    list: (query) => {
      if (query?.ids?.length) {
        const rows = query.ids.map((id) => tasks.get(id)).filter((row): row is TaskRow => Boolean(row))
        return recordsWithUsage(rows)
      }
      return recordsWithUsage(tasks.list(query?.q ? { q: query.q } : {}))
    },
    get: (id) => recordsWithUsage(tasks.list()).find((row) => row.id === id) ?? null,
    update: async (id, patch) => {
      const nextPatch = { ...patch }
      const assignee = await resolvedAssignee(people, patch)
      if (assignee !== undefined) {
        nextPatch.assignee = assignee
        delete nextPatch.assigneeSessionId
      }
      if (people?.resolveAssignee && ('creator' in patch || 'creatorSessionId' in patch)) {
        const creator = await people.resolveAssignee({
          ...('creatorSessionId' in patch ? { assigneeSessionId: patch.creatorSessionId == null ? '' : String(patch.creatorSessionId) } : {}),
          ...('creator' in patch ? { assignee: patch.creator } : {}),
        })
        nextPatch.creator = creator ?? { kind: 'user', name: '用户' }
        delete nextPatch.creatorSessionId
      }
      const next = tasks.update(id, nextPatch) as TaskRow
      const rows = tasks.list().map((row) => (row.id === id ? { ...row, ...next, id } : row))
      return recordsWithUsage(rows).find((row) => row.id === id) ?? taskRecord(next, (pid) => tasks.get(pid), ZERO_USAGE, false)
    },
    create: async (rows) =>
      Promise.all(
        rows.map(async (fields = {}) => {
          const title = typeof fields.title === 'string' && fields.title.trim() ? fields.title.trim() : '未命名任务'
          const creator = people?.resolveCreator ? await people.resolveCreator() : { kind: 'user', name: '用户' }
          const assignee = await resolvedAssignee(people, fields)
          const row = tasks.create({
            ...fields,
            title,
            creator,
            ...(assignee !== undefined ? { assignee } : {}),
          })
          return recordsWithUsage(tasks.list()).find((item) => item.id === row.id) ?? taskRecord(row, (pid) => tasks.get(pid), ZERO_USAGE, false)
        }),
      ),
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        if (!tasks.delete(id)) throw new Error(`unknown task: ${id}`)
      }
      return ids
    },
    actions: recordActions
      ? [
          {
            id: 'report',
            label: '汇报进度',
            for: 'agent',
            placement: [],
            description:
              '当前这个代理（就是你所在的会话）向任务汇报。args.status 必须是 doing（做到一半）或 done（做完）；可选 note。会追加 reports，并改任务 status。做任务请用这个，不要只 db_update status。',
            parameters: {
              type: 'object',
              description: 'status=doing|done；note 为给人/创建者看的一句进度。',
              properties: {
                status: { type: 'string', enum: ['doing', 'done'], description: 'doing=做到一半，done=本任务完成' },
                note: { type: 'string', description: '可选。简短说明做了什么、卡在哪' },
              },
              required: ['status'],
            },
            run: (id, record, args) => recordActions.report(id, record, args),
          },
          {
            id: 'deliver',
            label: '派工',
            for: 'both',
            placement: ['row', 'detail'],
            description:
              '把任务发给执行人那个代理。一个代理=一个 /sessions 行。先 db_update assignee 为它的会话 id，没有 sessionId 会失败。args.text 可覆盖派工词；wait 默认 true 等它这一回合，false 只入队。用户说「让另一个 agent 做」就是：找到或 db_create 那个会话 → 写入 assignee → deliver。',
            parameters: {
              type: 'object',
              description: '可选 text 覆盖派工说明；wait=false 时立即返回 queued。',
              properties: {
                text: { type: 'string', description: '派给执行会话的文本；不传则用任务标题+描述拼默认稿' },
                wait: { type: 'boolean', description: '默认 true。false=只入队不等回复' },
              },
            },
            run: (id, record, args) => recordActions.deliver(id, record, args),
          },
        ]
      : undefined,
  }
}
