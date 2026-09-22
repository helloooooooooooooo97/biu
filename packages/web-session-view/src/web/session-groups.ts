import type { SessionListItem } from './index.ts'

export const UNGROUPED_PROJECT_KEY = '__ungrouped__'
export const UNGROUPED_TAG_KEY = '__untagged__'
export const PINNED_GROUP_KEY = '__pinned__'

export type SidebarGroupKind = 'pinned' | 'project' | 'tag' | 'ungrouped'
export type SidebarGroupBy = 'project' | 'tag'

export interface SessionSidebarGroup {
  key: string
  label: string
  path?: string
  sessions: SessionListItem[]
  updatedAt: number
  kind: SidebarGroupKind
}

/** 有消息用最近一条消息的时间；还没发过消息的会话用 updatedAt。 */
export function sessionActivityAt(item: SessionListItem) {
  return item.lastMessageAt && item.lastMessageAt > 0 ? item.lastMessageAt : item.updatedAt
}

export function compareSessionRows(a: SessionListItem, b: SessionListItem) {
  const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  if (pin) return pin
  return sessionActivityAt(b) - sessionActivityAt(a) || a.id.localeCompare(b.id)
}

/** 悬浮聊天用：按更新时间取最近一条对话（忽略置顶；优先普通 chat）。 */
export function mostRecentSessionId(sessions: SessionListItem[]): string | undefined {
  let best: SessionListItem | undefined
  for (const item of sessions) {
    if (
      !best ||
      item.updatedAt > best.updatedAt ||
      (item.updatedAt === best.updatedAt && item.id.localeCompare(best.id) < 0)
    ) {
      best = item
    }
  }
  return best?.id
}

function sortGroupSessions(group: SessionSidebarGroup) {
  group.sessions.sort(compareSessionRows)
  group.updatedAt = group.sessions.reduce((max, item) => Math.max(max, sessionActivityAt(item)), 0)
}

/** 按绑定文件夹 path 分组；无 path 归入 Ungrouped。组内置顶优先，其余按最近一条消息的时间降序。 */
export function groupSessionsByProject(sessions: SessionListItem[]): SessionSidebarGroup[] {
  const map = new Map<string, SessionSidebarGroup>()
  for (const item of sessions) {
    const path = item.project?.path?.trim()
    const key = path || UNGROUPED_PROJECT_KEY
    const label = path ? item.project?.name?.trim() || folderNameFromPath(path) : '未分组'
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        label,
        ...(path ? { path } : {}),
        sessions: [],
        updatedAt: 0,
        kind: path ? 'project' : 'ungrouped',
      }
      map.set(key, group)
    }
    group.sessions.push(item)
  }

  const groups = [...map.values()]
  for (const group of groups) sortGroupSessions(group)
  groups.sort((a, b) => {
    if (a.key === UNGROUPED_PROJECT_KEY) return 1
    if (b.key === UNGROUPED_PROJECT_KEY) return -1
    return b.updatedAt - a.updatedAt || a.label.localeCompare(b.label)
  })
  return groups
}

/** 按标签分组；一条会话可出现在多个标签下，无标签归入未标签。 */
export function groupSessionsByTag(sessions: SessionListItem[]): SessionSidebarGroup[] {
  const map = new Map<string, SessionSidebarGroup>()
  const untagged: SessionListItem[] = []
  for (const item of sessions) {
    const tags = (item.tags ?? []).map((tag) => tag.trim()).filter(Boolean)
    if (!tags.length) {
      untagged.push(item)
      continue
    }
    for (const tag of tags) {
      const key = `tag:${tag}`
      let group = map.get(key)
      if (!group) {
        group = { key, label: tag, sessions: [], updatedAt: 0, kind: 'tag' }
        map.set(key, group)
      }
      group.sessions.push(item)
    }
  }
  const groups = [...map.values()]
  for (const group of groups) sortGroupSessions(group)
  groups.sort((a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label))
  if (untagged.length) {
    const group: SessionSidebarGroup = {
      key: UNGROUPED_TAG_KEY,
      label: '未标签',
      sessions: untagged,
      updatedAt: 0,
      kind: 'ungrouped',
    }
    sortGroupSessions(group)
    groups.push(group)
  }
  return groups
}

export function buildSidebarGroups(sessions: SessionListItem[], groupBy: SidebarGroupBy): SessionSidebarGroup[] {
  const rest = groupBy === 'tag' ? groupSessionsByTag(sessions) : groupSessionsByProject(sessions)
  const pinned = sessions.filter((item) => item.pinned).sort(compareSessionRows)
  if (!pinned.length) return rest
  return [
    {
      key: PINNED_GROUP_KEY,
      label: '收藏',
      sessions: pinned,
      updatedAt: pinned[0]?.updatedAt ?? 0,
      kind: 'pinned',
    },
    ...rest,
  ]
}

export type SidebarSectionKind = 'pinned' | 'project' | 'tag'

/** 置顶区直接携带会话行；项目/标签区按分组。 */
export interface SidebarSection {
  kind: SidebarSectionKind
  label: string
  /** 置顶区专属：直接持有的 pinned 会话（不嵌套重复的分组头）。 */
  sessions?: SessionListItem[]
  /** 项目/标签区：各自的分组列表。 */
  groups?: SessionSidebarGroup[]
}

/**
 * 两板块并存：收藏 / (项目|标签)，自上而下。
 * - 收藏区：所有 pinned 会话（直接携带，不嵌套分组）；无则省去该 section。
 * - 数据分组区：按 groupBy 决定——'project' 按绑定 folder path 分组（未绑定归「未分组」）；
 *   'tag' 按 tag 分组（一条会话可出现在多个标签下，无标签归「未标签」）。
 */
export function buildSidebarSections(
  sessions: SessionListItem[],
  groupBy: SidebarGroupBy = 'project',
): SidebarSection[] {
  const sections: SidebarSection[] = []

  const pinned = sessions.filter((item) => item.pinned).sort(compareSessionRows)
  if (pinned.length) {
    sections.push({
      kind: 'pinned',
      label: '收藏',
      sessions: pinned,
    })
  }

  if (groupBy === 'tag') {
    sections.push({ kind: 'tag', label: '标签', groups: groupSessionsByTag(sessions) })
  } else {
    sections.push({ kind: 'project', label: '项目', groups: groupSessionsByProject(sessions) })
  }

  return sections
}

export function folderNameFromPath(path: string) {
  const cleaned = path.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) || path
}
