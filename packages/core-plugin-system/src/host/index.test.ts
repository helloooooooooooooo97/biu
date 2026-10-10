/** @vitest-environment node */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import type { CatalogEntry } from '@biu/host-hub'
import { PluginStoreService, defaultPluginDir, defaultStatePath } from './index.ts'
import { hashInstalledPluginCode } from './store.ts'

function stubHub(ctx: Context) {
  const adopted: string[] = []
  const dropped: string[] = []
  const forks = new Map<string, CatalogEntry>()
  ;(ctx as unknown as { hub: unknown }).hub = {
    async adopt(entry: CatalogEntry) {
      forks.set(entry.id, entry)
      adopted.push(entry.id)
    },
    async drop(id: string) {
      forks.delete(id)
      dropped.push(id)
    },
    snapshot() {
      return {
        plugins: [...forks.values()].map((entry) => ({
          id: entry.id,
          enabled: true,
          state: 'active',
          web: entry.web,
        })),
      }
    },
  }
  return { adopted, dropped, forks }
}

test('builtin sandboxes stay in the plugin list without draft permission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-builtin-'))
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const ctx = new Context()
    stubHub(ctx)
    const sandbox = join(dir, '.plugin-dev')
    const store = new PluginStoreService(ctx, join(dir, '.plugin'), join(dir, 'store.json'), sandbox).open()
    await mkdir(join(sandbox, 'api-playground'), { recursive: true })
    await mkdir(join(sandbox, 'my-draft'), { recursive: true })
    await writeFile(join(sandbox, 'api-playground', 'manifest.json'), `${JSON.stringify({
      id: 'api-playground',
      name: 'API 调试块',
      blurb: '调试',
      tags: [],
      author: 'BIU官方',
      authorUrl: 'https://github.com/helloooooooooooooo97/biu',
      builtin: true,
      createdAt: 1,
    })}\n`)
    await writeFile(join(sandbox, 'my-draft', 'manifest.json'), `${JSON.stringify({
      id: 'my-draft',
      name: '我的草稿',
      blurb: '草稿',
      tags: [],
      author: 'Ada',
      authorUrl: '',
      createdAt: 1,
    })}\n`)
    const rows = await store.listSandboxes()
    assert.deepEqual(rows.map((row) => row.id), ['api-playground'])
    assert.equal(store.isBuiltin('api-playground'), true)
    assert.equal(store.isBuiltin('my-draft'), false)
    ;(ctx as unknown as { get(name: string): unknown }).get = (name: string) =>
      name === 'account' ? { store: { isMember: () => true } } : undefined
    const visible = await runWithAccount('ada', () => runWithRequestWorkspace('ws', () => store.listSandboxes()))
    assert.deepEqual(visible.map((row) => row.id).sort(), ['api-playground', 'my-draft'])
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('online members can open a sandbox without instance draft permission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-sandbox-member-'))
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const ctx = new Context()
    stubHub(ctx)
    ;(ctx as unknown as { get(name: string): unknown }).get = (name: string) =>
      name === 'account' ? { store: { isMember: (accountId: string) => accountId === 'ada' } } : undefined
    const store = new PluginStoreService(ctx, join(dir, '.plugin'), join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await assert.rejects(
      () => runWithAccount('bob', () => runWithRequestWorkspace('ws', () => store.initSandbox({ id: 'bob-plug', name: 'Bob' }))),
      /需要登录/,
    )
    const created = await runWithAccount('ada', () =>
      runWithRequestWorkspace('ws', () => store.initSandbox({ id: 'ada-plug', name: 'Ada' })),
    )
    assert.equal(created.id, 'ada-plug')
    await access(join(dir, '.plugin-dev', 'ada-plug', 'manifest.json'))
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('online members can pack without instance install permission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-pack-member-'))
  const previous = process.env.BIU_ONLINE
  const members = new Set(['ada'])
  try {
    const ctx = new Context()
    stubHub(ctx)
    ;(ctx as unknown as { get(name: string): unknown }).get = (name: string) =>
      name === 'account'
        ? { store: { isMember: (accountId: string) => members.has(accountId) } }
        : undefined
    const store = new PluginStoreService(ctx, join(dir, '.plugin'), join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store.initSandbox({
      id: 'pack-me',
      name: '打包',
      blurb: '成员可装',
      hostJs: 'export default function apply() {}\n',
    })
    process.env.BIU_ONLINE = '1'
    await assert.rejects(
      () => runWithAccount('bob', () => runWithRequestWorkspace('ws', () => store.pack('pack-me'))),
      /需要登录/,
    )
    const packed = await runWithAccount('ada', () => runWithRequestWorkspace('ws', () => store.pack('pack-me')))
    assert.equal(packed.id, 'pack-me')
    await access(join(dir, '.plugin', 'pack-me', 'host.js'))
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('default plugin dir is repo-root .plugin, not nested catalog', () => {
  const dir = defaultPluginDir().replace(/\\/g, '/')
  assert.equal(dir.endsWith('/.plugin') || dir.endsWith('.plugin'), true)
  assert.equal(dir.includes('plugin-catalog'), false)
  assert.equal(dir.includes('.biu'), false)
})

test('default store state is .plugin/store.json', () => {
  const path = defaultStatePath().replace(/\\/g, '/')
  assert.ok(path.endsWith('/.plugin/store.json') || path.endsWith('.plugin/store.json'))
})

test('restore skips a broken enabled plugin and continues', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  const pluginDir = join(dir, '.plugin')
  try {
    const ctx = new Context()
    const { adopted } = stubHub(ctx)
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store.initSandbox({
      id: 'store-ok',
      name: 'Ok',
      hostJs: `export const name = 'store-ok'\nexport function apply() {}\n`,
    })
    await store.pack('store-ok')
    await store.openPlugin('store-ok')
    await store.initSandbox({
      id: 'store-bad',
      name: 'Bad',
      hostJs: `export const name = 'store-bad'\nexport function apply() {}\n`,
    })
    await store.pack('store-bad')
    await store.openPlugin('store-bad')
    await writeFile(join(pluginDir, 'store-bad', 'host.js'), 'throw new SyntaxError("nope")\n')
    const ctx2 = new Context()
    const { adopted: restored } = stubHub(ctx2)
    const store2 = new PluginStoreService(ctx2, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store2.restore()
    assert.ok(restored.includes('store-ok'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a failed open does not leave the plugin running', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  const pluginDir = join(dir, '.plugin')
  try {
    const ctx = new Context()
    const { dropped } = stubHub(ctx)
    const hub = (ctx as unknown as { hub: { adopt: (entry: CatalogEntry) => Promise<void> } }).hub
    hub.adopt = async () => {
      throw new Error('boom')
    }
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store.initSandbox({
      id: 'store-fail',
      name: 'Fail',
      hostJs: `export const name = 'store-fail'\nexport function apply() {}\n`,
    })
    await store.pack('store-fail')
    await assert.rejects(() => store.openPlugin('store-fail'), /boom/)
    const row = (await store.list()).find((item) => item.id === 'store-fail')
    assert.equal(row?.enabled, false)
    assert.equal(row?.running, false)
    assert.ok(dropped.includes('store-fail'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('missing .plugin lists no plugins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(ctx, join(dir, 'missing'), join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    assert.deepEqual(await store.list(), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sandbox then pack writes .plugin/<id>/; close keeps code; uninstall deletes .plugin/<id>/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  const pluginDir = join(dir, '.plugin')
  try {
    const ctx = new Context()
    const { adopted, dropped, forks } = stubHub(ctx)
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store.initSandbox({
      id: 'store-echo',
      name: 'Echo',
      hostJs: `export const name = 'store-echo'\nexport function apply() {}\n`,
    })
    const created = await store.pack('store-echo')
    assert.equal(created.pluginPath, join(pluginDir, 'store-echo'))
    const echo = (await store.list()).find((item) => item.id === 'store-echo')
    assert.ok(echo)
    assert.equal(echo.enabled, false)

    const opened = await store.openPlugin('store-echo')
    assert.equal(opened?.enabled, true)
    const saved = JSON.parse(await readFile(join(dir, 'store.json'), 'utf8')) as { enabled: string[] }
    assert.deepEqual(saved.enabled, ['store-echo'])
    assert.deepEqual(adopted, ['store-echo'])
    assert.equal(forks.get('store-echo')?.packageName, 'store:store-echo')
    assert.equal(forks.get('store-echo')?.web, undefined)
    assert.match(await store.readInstalledFile('store-echo', 'host.js'), /store-echo/)

    await store.close('store-echo')
    assert.deepEqual(dropped, ['store-echo'])
    assert.equal((await store.list()).find((item) => item.id === 'store-echo')?.enabled, false)
    await access(join(pluginDir, 'store-echo', 'host.js'))

    await store.uninstall('store-echo')
    assert.equal((await store.list()).find((item) => item.id === 'store-echo'), undefined)
    await assert.rejects(() => access(join(pluginDir, 'store-echo', 'host.js')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('uninstall deletes .plugin/<id>/ and leaves .plugin-dev/<id>/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  const pluginDir = join(dir, '.plugin')
  const sandboxDir = join(dir, '.plugin-dev')
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), sandboxDir).open()
    await store.initSandbox({
      id: 'store-keep-src',
      name: 'Keep src',
      hostJs: `export const name = 'store-keep-src'\nexport function apply() {}\n`,
    })
    await store.pack('store-keep-src')
    await access(join(pluginDir, 'store-keep-src', 'host.js'))
    await access(join(sandboxDir, 'store-keep-src', 'host/index.ts'))
    await store.uninstall('store-keep-src')
    await assert.rejects(() => access(join(pluginDir, 'store-keep-src', 'host.js')))
    await access(join(sandboxDir, 'store-keep-src', 'host/index.ts'))
    await access(join(sandboxDir, 'store-keep-src', 'manifest.json'))
    const row = (await store.listSandboxes()).find((item) => item.id === 'store-keep-src')
    assert.ok(row)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('destroy deletes both the installed plugin and its sandbox', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  const pluginDir = join(dir, '.plugin')
  const sandboxDir = join(dir, '.plugin-dev')
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), sandboxDir).open()
    await store.initSandbox({
      id: 'store-gone',
      name: 'Gone',
      hostJs: `export const name = 'store-gone'\nexport function apply() {}\n`,
    })
    await store.pack('store-gone')
    await store.destroy('store-gone')
    await assert.rejects(() => access(join(pluginDir, 'store-gone', 'host.js')))
    await assert.rejects(() => access(join(sandboxDir, 'store-gone', 'manifest.json')))
    assert.equal((await store.list()).find((item) => item.id === 'store-gone'), undefined)
    assert.equal((await store.listSandboxes()).find((item) => item.id === 'store-gone'), undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('web-only plugin opens without host.js', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  try {
    const ctx = new Context()
    const { forks } = stubHub(ctx)
    const store = new PluginStoreService(ctx, join(dir, '.plugin'), join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store.initSandbox({
      id: 'store-banner',
      name: 'Banner',
      shell: { width: 360, height: 240 },
      webJs: `export const name = 'store-banner-web'\nexport const inject = ['slots']\nexport function apply() {}\n`,
    })
    await assert.rejects(() => store.pack('store-empty'), /sandbox not found/)
    await store.pack('store-banner')
    const sandboxes = await store.listSandboxes()
    assert.equal(sandboxes.find((row) => row.id === 'store-banner')?.hasWeb, true)
    await store.openPlugin('store-banner')
    const listed = (await store.list()).find((row) => row.id === 'store-banner')
    assert.ok(listed?.codeVersion)
    assert.match(listed.codeVersion, /^[0-9a-f]{12}$/)
    // web 入口会带上整包代码 hash（host + web），用于让前端在重打包后重新加载。
    assert.equal(
      forks.get('store-banner')?.web,
      `/api/plugin-store/files/store-banner/web.js?v=${listed.codeVersion}`,
    )
    assert.equal(listed.codeVersion, await hashInstalledPluginCode(join(dir, '.plugin', 'store-banner')))
    await assert.rejects(() => store.readInstalledFile('store-banner', 'host.js'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('codeVersion hashes host.js and web.js together', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-root-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const pluginDir = join(dir, '.plugin')
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await store.initSandbox({
      id: 'store-both',
      name: 'Both',
      shell: { width: 360, height: 240 },
      hostJs: `export const name = 'store-both'\nexport function apply() {}\n`,
      webJs: `export const name = 'store-both-web'\nexport const inject = ['slots']\nexport function apply() {}\n`,
    })
    await store.pack('store-both')
    const packed = join(pluginDir, 'store-both')
    const before = await hashInstalledPluginCode(packed)
    const listed = (await store.list()).find((row) => row.id === 'store-both')
    assert.equal(listed?.codeVersion, before)
    assert.ok(listed?.hasHost)
    assert.ok(listed?.hasWeb)
    await writeFile(join(packed, 'host.js'), `export const name = 'store-both'\nexport function apply() { return 1 }\n`)
    const afterHost = await hashInstalledPluginCode(packed)
    assert.notEqual(afterHost, before)
    await writeFile(join(packed, 'web.js'), `export const name = 'store-both-web'\nexport function apply() { return 2 }\n`)
    const afterWeb = await hashInstalledPluginCode(packed)
    assert.notEqual(afterWeb, afterHost)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
