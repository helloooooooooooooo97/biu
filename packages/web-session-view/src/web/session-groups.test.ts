import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  PINNED_GROUP_KEY,
  UNGROUPED_PROJECT_KEY,
  UNGROUPED_TAG_KEY,
  buildSidebarGroups,
  buildSidebarSections,
  folderNameFromPath,
  groupSessionsByProject,
  groupSessionsByTag,
  mostRecentSessionId,
} from './session-groups.ts'
import type { SessionListItem } from './index.ts'

function item(partial: Partial<SessionListItem> & { id: string }): SessionListItem {
  return {
    title: partial.title ?? partial.id,
    eventCount: partial.eventCount ?? 1,
    updatedAt: partial.updatedAt ?? 0,
    ...partial,
  }
}

test('groupSessionsByProject groups by path and puts bare chats in Ungrouped', () => {
  const groups = groupSessionsByProject([
    item({
      id: 'a',
      updatedAt: 10,
      project: { name: 'alpha', path: '/tmp/alpha', boundAt: 1 },
    }),
    item({ id: 'b', updatedAt: 30 }),
    item({
      id: 'c',
      updatedAt: 20,
      project: { name: 'alpha', path: '/tmp/alpha', boundAt: 2 },
    }),
    item({
      id: 'd',
      updatedAt: 40,
      project: { name: 'beta', path: '/tmp/beta', boundAt: 3 },
    }),
  ])

  assert.equal(groups.length, 3)
  assert.equal(groups[0]?.key, '/tmp/beta')
  assert.equal(groups[0]?.label, 'beta')
  assert.deepEqual(
    groups[0]?.sessions.map((row) => row.id),
    ['d'],
  )
  assert.equal(groups[1]?.key, '/tmp/alpha')
  assert.deepEqual(
    groups[1]?.sessions.map((row) => row.id),
    ['c', 'a'],
  )
  assert.equal(groups[2]?.key, UNGROUPED_PROJECT_KEY)
  assert.equal(groups[2]?.label, '未分组')
  assert.deepEqual(
    groups[2]?.sessions.map((row) => row.id),
    ['b'],
  )
})

test('sidebar order follows the latest user or assistant message, not later tool saves', () => {
  const groups = groupSessionsByProject([
    item({ id: 'tooling', title: '工具中', updatedAt: 90, lastMessageAt: 10 }),
    item({ id: 'just-sent', title: '刚发', updatedAt: 20, lastMessageAt: 40 }),
    item({ id: 'empty', title: '还没说话', updatedAt: 30 }),
  ])
  assert.deepEqual(
    groups[0]?.sessions.map((row) => row.id),
    ['just-sent', 'empty', 'tooling'],
  )
})

test('pinned rows sort first inside a project group', () => {
  const groups = groupSessionsByProject([
    item({ id: 'old', updatedAt: 10, project: { name: 'a', path: '/a', boundAt: 1 } }),
    item({ id: 'pin', updatedAt: 5, pinned: true, project: { name: 'a', path: '/a', boundAt: 1 } }),
    item({ id: 'new', updatedAt: 20, project: { name: 'a', path: '/a', boundAt: 1 } }),
  ])
  assert.deepEqual(
    groups[0]?.sessions.map((row) => row.id),
    ['pin', 'new', 'old'],
  )
})

test('groupSessionsByTag splits multi-tag chats and isolates untagged', () => {
  const groups = groupSessionsByTag([
    item({ id: 'a', updatedAt: 3, tags: ['host-ui', 'bug'] }),
    item({ id: 'b', updatedAt: 2, tags: ['host-ui'] }),
    item({ id: 'c', updatedAt: 9 }),
  ])
  const host = groups.find((g) => g.label === 'host-ui')
  assert.ok(host)
  assert.deepEqual(
    host?.sessions.map((row) => row.id),
    ['a', 'b'],
  )
  const bug = groups.find((g) => g.label === 'bug')
  assert.deepEqual(
    bug?.sessions.map((row) => row.id),
    ['a'],
  )
  assert.equal(groups.at(-1)?.key, UNGROUPED_TAG_KEY)
  assert.deepEqual(
    groups.at(-1)?.sessions.map((row) => row.id),
    ['c'],
  )
})

test('buildSidebarGroups prepends a pinned section', () => {
  const groups = buildSidebarGroups(
    [
      item({ id: 'a', updatedAt: 2, pinned: true, project: { name: 'a', path: '/a', boundAt: 1 } }),
      item({ id: 'b', updatedAt: 9, project: { name: 'b', path: '/b', boundAt: 1 } }),
    ],
    'project',
  )
  assert.equal(groups[0]?.key, PINNED_GROUP_KEY)
  assert.deepEqual(
    groups[0]?.sessions.map((row) => row.id),
    ['a'],
  )
  assert.equal(groups[1]?.key, '/b')
})

test('folderNameFromPath takes the last segment', () => {
  assert.equal(folderNameFromPath('/Users/me/work/cordis-web/'), 'cordis-web')
  assert.equal(folderNameFromPath('C:\\repos\\demo'), 'demo')
})

test('buildSidebarSections groups by project by default', () => {
  const sections = buildSidebarSections([
    item({ id: 'a', updatedAt: 2, project: { name: 'x', path: '/x', boundAt: 1 } }),
    item({ id: 'b', updatedAt: 1 }),
  ])
  assert.deepEqual(
    sections.map((s) => s.kind),
    ['project'],
  )
  const projectSection = sections[0]!
  assert.equal(projectSection.label, '项目')
  assert.deepEqual(
    projectSection.groups?.map((g) => g.kind),
    ['project', 'ungrouped'],
  )
})

test('buildSidebarSections groups by tag when groupBy=tag', () => {
  const sections = buildSidebarSections(
    [
      item({ id: 'a', updatedAt: 2, tags: ['ui', 'bug'] }),
      item({ id: 'b', updatedAt: 1 }),
    ],
    'tag',
  )
  assert.deepEqual(
    sections.map((s) => s.kind),
    ['tag'],
  )
  const tagSection = sections[0]!
  assert.equal(tagSection.label, '标签')
  assert.deepEqual(
    tagSection.groups?.map((g) => g.kind),
    ['tag', 'tag', 'ungrouped'],
  )
  assert.deepEqual(
    tagSection.groups?.map((g) => g.label),
    ['bug', 'ui', '未标签'],
  )
})

test('buildSidebarSections keeps a pinned section that holds pinned rows', () => {
  const sections = buildSidebarSections(
    [item({ id: 'a', updatedAt: 2, pinned: true }), item({ id: 'b', updatedAt: 1 })],
    'tag',
  )
  assert.deepEqual(
    sections.map((s) => s.kind),
    ['pinned', 'tag'],
  )
  assert.deepEqual(
    sections[0]?.sessions?.map((r) => r.id),
    ['a'],
  )
})

test('mostRecentSessionId prefers newest chat and ignores pin', () => {
  assert.equal(
    mostRecentSessionId([
      item({ id: 'old', updatedAt: 1, pinned: true }),
      item({ id: 'new', updatedAt: 9 }),
      item({ id: 'older', updatedAt: 2 }),
    ]),
    'new',
  )
})
