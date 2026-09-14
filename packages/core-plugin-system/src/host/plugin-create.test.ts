/** @vitest-environment node */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { PluginStoreService } from './index.ts'
import { compileStoreModule } from './plugin-create.ts'
import { pluginsCollection } from './collection.ts'
import type { PluginStoreService as Store } from './store.ts'

function stubHub(ctx: Context) {
  ;(ctx as unknown as { hub: unknown }).hub = {
    adopt: async () => {},
    drop: async () => {},
    snapshot: () => ({ plugins: [] }),
  }
}

async function installViaSandbox(store: PluginStoreService, input: Parameters<PluginStoreService['initSandbox']>[0]) {
  await store.initSandbox(input)
  return store.pack(input.id)
}

test('list writes createdAt into old manifests and does not use directory ctime', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-created-at-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const pluginDir = join(dir, '.plugin')
    const idDir = join(pluginDir, 'store-old')
    const { mkdir, utimes } = await import('node:fs/promises')
    await mkdir(idDir, { recursive: true })
    await writeFile(
      join(idDir, 'manifest.json'),
      `${JSON.stringify({ id: 'store-old', name: 'Old', blurb: 'x', tags: [], author: '', authorUrl: '' }, null, 2)}\n`,
    )
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    const listed = await store.list()
    const createdAt = listed[0]?.createdAt
    assert.ok(typeof createdAt === 'number' && createdAt > 0)
    const onDisk = JSON.parse(await readFile(join(idDir, 'manifest.json'), 'utf8')) as { createdAt: number }
    assert.equal(onDisk.createdAt, createdAt)
    await utimes(idDir, 1, 1)
    await writeFile(join(idDir, 'host.js'), 'export const name = "store-old"\n')
    const ctx2 = new Context()
    stubHub(ctx2)
    const store2 = new PluginStoreService(ctx2, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    const listed2 = await store2.list()
    assert.equal(listed2[0]?.createdAt, createdAt)
    await writeFile(
      join(idDir, 'manifest.json'),
      `${JSON.stringify({ id: 'store-old', name: 'Old', blurb: 'x', tags: [], author: '', authorUrl: '', createdAt: 0 }, null, 2)}\n`,
    )
    const ctx3 = new Context()
    stubHub(ctx3)
    const store3 = new PluginStoreService(ctx3, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    const listed3 = await store3.list()
    assert.ok((listed3[0]?.createdAt ?? 0) > 0)
    const fixed = JSON.parse(await readFile(join(idDir, 'manifest.json'), 'utf8')) as { createdAt: number }
    assert.equal(fixed.createdAt, listed3[0]?.createdAt)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sandbox then pack compiles host source into .plugin/<id>/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-create-small-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const pluginDir = join(dir, '.plugin')
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await installViaSandbox(store, {
      id: 'store-echo',
      name: 'Echo',
      tags: ['tool', 'demo'],
      author: 'Biu',
      authorUrl: 'https://example.com',
      hostJs: `export const name = 'store-echo'\nexport function apply(ctx: { ok: boolean }) { return ctx.ok }`,
    })
    const manifest = JSON.parse(await readFile(join(pluginDir, 'store-echo', 'manifest.json'), 'utf8')) as {
      tags: string[]
      author: string
      createdAt: number
    }
    assert.deepEqual(manifest.tags, ['tool', 'demo'])
    assert.equal(manifest.author, 'Biu')
    assert.ok(manifest.createdAt > 0)
    const listed = await store.list()
    assert.equal(listed[0]?.createdAt, manifest.createdAt)
    assert.equal(listed[0]?.lastRunAt, null)
    assert.deepEqual(listed[0]?.shell, {
      width: 480,
      height: 360,
      minWidth: 200,
      minHeight: 160,
      resizable: true,
    })
    const hostJs = await readFile(join(pluginDir, 'store-echo', 'host.js'), 'utf8')
    assert.match(hostJs, /\bapply\b/)
    assert.doesNotMatch(hostJs, /ctx: \{/)
    const readme = await readFile(join(pluginDir, 'store-echo', 'README.md'), 'utf8')
    assert.match(readme, /^# Echo\n/)
    await store.writeReadme('store-echo', '# Echo\n\n自定义介绍\n')
    assert.equal(await store.readReadme('store-echo'), '# Echo\n\n自定义介绍\n')
    await store.initSandbox({ id: 'store-empty', name: 'Empty' })
    await assert.rejects(() => store.pack('store-empty'), /host\.ts/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sandbox then pack writes manifest.shell from input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-shell-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const pluginDir = join(dir, '.plugin')
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), join(dir, '.plugin-dev')).open()
    await installViaSandbox(store, {
      id: 'store-game',
      name: 'Game',
      shell: { width: 640, height: 480, resizable: false },
      webJs: `export const name = 'store-game'\nexport function apply() {}`,
    })
    const manifest = JSON.parse(await readFile(join(pluginDir, 'store-game', 'manifest.json'), 'utf8')) as {
      shell: { width: number; height: number; resizable: boolean }
    }
    assert.equal(manifest.shell.width, 640)
    assert.equal(manifest.shell.height, 480)
    assert.equal(manifest.shell.resizable, false)
    const listed = await store.list()
    assert.equal(listed[0]?.shell.width, 640)
    assert.equal(listed[0]?.shell.resizable, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sandbox with web rejects missing shell size', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-shell-required-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await assert.rejects(
      () =>
        store.initSandbox({
          id: 'store-game',
          name: 'Game',
          webJs: `export const name = 'store-game'\nexport function apply() {}`,
        }),
      /shell\.width and shell\.height/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pack with web rejects sandbox manifest without shell size', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-pack-shell-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({ id: 'store-ui', name: 'UI' })
    const sandbox = join(dir, '.plugin-dev', 'store-ui')
    await writeFile(
      join(sandbox, 'web.tsx'),
      `export const name = 'store-ui'\nexport function apply() {}\n`,
    )
    await assert.rejects(() => store.pack('store-ui'), /shell\.width and shell\.height/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sandbox and pack allow web without shell when headless', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-headless-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await installViaSandbox(store, {
      id: 'store-skin',
      name: 'Skin',
      headless: true,
      webJs: `export const name = 'store-skin'\nexport function apply() {}`,
    })
    const created = JSON.parse(await readFile(join(dir, '.plugin', 'store-skin', 'manifest.json'), 'utf8')) as {
      headless?: boolean
      shell?: unknown
    }
    assert.equal(created.headless, true)
    assert.equal(created.shell, undefined)
    const listed = await store.list()
    assert.equal(listed[0]?.headless, true)
    assert.equal(listed[0]?.shell, undefined)

    await store.initSandbox({ id: 'store-skin-src', name: 'Skin Src', headless: true })
    const sandbox = join(dir, '.plugin-dev', 'store-skin-src')
    await writeFile(join(sandbox, 'web.tsx'), `export const name = 'store-skin-src'\nexport function apply() {}\n`)
    await store.pack('store-skin-src')
    const packed = JSON.parse(await readFile(join(dir, '.plugin', 'store-skin-src', 'manifest.json'), 'utf8')) as {
      headless?: boolean
      shell?: unknown
    }
    assert.equal(packed.headless, true)
    assert.equal(packed.shell, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('initSandbox writes source; pack bundles into .plugin/<id>/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-create-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const pluginDir = join(dir, '.plugin')
    const sandboxDir = join(dir, '.plugin-dev')
    const store = new PluginStoreService(ctx, pluginDir, join(dir, 'store.json'), sandboxDir).open()
    const result = await store.initSandbox({
      id: 'store-echo',
      name: 'Echo',
      blurb: '回声',
      hostJs: `export const name = 'store-echo'\nexport function apply(ctx: { ok: boolean }) { return ctx.ok }`,
    })
    assert.equal(result.sandboxPath, join(sandboxDir, 'store-echo'))
    const sandboxReadme = await readFile(join(sandboxDir, 'store-echo', 'README.md'), 'utf8')
    assert.match(sandboxReadme, /回声/)
    const packed = await store.pack('store-echo')
    assert.equal(packed.pluginPath, join(pluginDir, 'store-echo'))
    const manifest = JSON.parse(await readFile(join(pluginDir, 'store-echo', 'manifest.json'), 'utf8')) as {
      id: string
      name: string
    }
    assert.equal(manifest.id, 'store-echo')
    const hostJs = await readFile(join(pluginDir, 'store-echo', 'host.js'), 'utf8')
    assert.match(hostJs, /\bapply\b/)
    assert.doesNotMatch(hostJs, /ctx: \{/)
    const packedReadme = await readFile(join(pluginDir, 'store-echo', 'README.md'), 'utf8')
    assert.equal(packedReadme, sandboxReadme)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pack bundles relative imports from sandbox', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-pack-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({ id: 'store-math', name: 'Math' })
    const sandbox = join(dir, '.plugin-dev', 'store-math')
    await writeFile(join(sandbox, 'util.ts'), `export const ping = 'pong'\n`)
    await writeFile(
      join(sandbox, 'host.ts'),
      `import { ping } from './util.ts'\nexport const name = 'store-math'\nexport function apply() { return ping }\n`,
    )
    await store.pack('store-math')
    const hostJs = await readFile(join(dir, '.plugin', 'store-math', 'host.js'), 'utf8')
    assert.match(hostJs, /pong/)
    assert.doesNotMatch(hostJs, /from ['"]\.\/util/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sandbox/pack live on the plugins collection, not as tools', () => {
  const spec = pluginsCollection({
    list: () => Promise.resolve([]),
    listSandboxes: () => Promise.resolve([]),
    readReadme: async () => '',
    writeReadme: async () => {},
    openPlugin() {},
    close() {},
    pack() {},
    uninstall() {},
    initSandbox: async () => ({ id: 'x', sandboxPath: '/tmp/x' }),
  } as Store)
  const ids = spec.actions?.map((item) => item.id) ?? []
  assert.deepEqual(ids, ['sandbox', 'start', 'stop', 'pack', 'reload', 'uninstall'])
  const sandbox = spec.actions?.find((item) => item.id === 'sandbox')
  const pack = spec.actions?.find((item) => item.id === 'pack')
  assert.equal(spec.actions?.find((item) => item.id === 'create'), undefined)
  assert.equal(sandbox?.allowMissing, true)
  assert.match(JSON.stringify(sandbox?.parameters), /listing\.shell/)
  assert.match(String(pack?.parameters?.description ?? ''), /host\.ts/)
  assert.match(String(pack?.parameters?.description ?? ''), /沙箱 package.json/)
})

test('pack web jsx uses globalThis.React instead of bundling npm react', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-pack-jsx-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({
      id: 'store-jsx',
      name: 'JSX',
      shell: { width: 320, height: 200 },
    })
    const sandbox = join(dir, '.plugin-dev', 'store-jsx')
    await writeFile(
      join(sandbox, 'web.tsx'),
      `export const name = 'store-jsx'\nexport const inject = ['slots']\nfunction Hi() { return <div data-testid="hi">hi</div> }\nexport function apply(ctx: { slots: { place: (name: string, Comp: unknown, opt: unknown) => void } }) {\n  ctx.slots.place('plugin-store-extras', Hi, { key: 'store-jsx' })\n}\n`,
    )
    await store.pack('store-jsx')
    const webJs = await readFile(join(dir, '.plugin', 'store-jsx', 'web.js'), 'utf8')
    assert.match(webJs, /globalThis\.React/)
    assert.match(webJs, /createElement/)
    assert.doesNotMatch(webJs, /node_modules\/react/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pack maps react/jsx-runtime to globalThis.ReactJSXRuntime', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-pack-jsx-rt-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({
      id: 'store-jsx-rt',
      name: 'JSXRT',
      shell: { width: 320, height: 200 },
    })
    const sandbox = join(dir, '.plugin-dev', 'store-jsx-rt')
    await writeFile(
      join(sandbox, 'web.tsx'),
      `import { jsx } from 'react/jsx-runtime'\nexport const name = 'store-jsx-rt'\nexport function apply() { return jsx('div', { children: 'hi' }, 'k') }\n`,
    )
    await store.pack('store-jsx-rt')
    const webJs = await readFile(join(dir, '.plugin', 'store-jsx-rt', 'web.js'), 'utf8')
    assert.match(webJs, /ReactJSXRuntime/)
    assert.doesNotMatch(webJs, /node_modules\/react/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pack bundles npm deps but keeps react on globalThis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-npm-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({
      id: 'store-dep',
      name: 'Dep',
      headless: true,
    })
    const sandbox = join(dir, '.plugin-dev', 'store-dep')
    const pkg = join(dir, '.plugin-dev', 'store-dep', 'node_modules', 'tiny-ping')
    await writeFile(join(sandbox, 'web.tsx'), `import { ping } from 'tiny-ping'\nimport { useMemo } from 'react'\nexport const name = 'store-dep'\nexport function apply() { return ping + useMemo(() => 1, []) }\n`)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(pkg, { recursive: true })
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'tiny-ping', type: 'module', main: 'index.js' }))
    await writeFile(join(pkg, 'index.js'), `export const ping = 'pong'\n`)
    await store.pack('store-dep')
    const webJs = await readFile(join(dir, '.plugin', 'store-dep', 'web.js'), 'utf8')
    assert.match(webJs, /pong/)
    assert.match(webJs, /globalThis\.React/)
    assert.doesNotMatch(webJs, /from ['"]react['"]/)
    assert.doesNotMatch(webJs, /from ['"]tiny-ping['"]/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pack installs sandbox package.json deps without host node_modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-sandbox-npm-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({
      id: 'store-file-dep',
      name: 'File dep',
      headless: true,
    })
    const sandbox = join(dir, '.plugin-dev', 'store-file-dep')
    const vendor = join(sandbox, 'vendor', 'tiny-ping')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(vendor, { recursive: true })
    await writeFile(join(vendor, 'package.json'), JSON.stringify({ name: 'tiny-ping', type: 'module', main: 'index.js' }))
    await writeFile(join(vendor, 'index.js'), `export const ping = 'from-sandbox'\n`)
    await writeFile(
      join(sandbox, 'package.json'),
      `${JSON.stringify({ name: 'store-file-dep', private: true, dependencies: { 'tiny-ping': 'file:./vendor/tiny-ping' } }, null, 2)}\n`,
    )
    await writeFile(
      join(sandbox, 'web.tsx'),
      `import { ping } from 'tiny-ping'\nexport const name = 'store-file-dep'\nexport function apply() { return ping }\n`,
    )
    await store.pack('store-file-dep')
    const webJs = await readFile(join(dir, '.plugin', 'store-file-dep', 'web.js'), 'utf8')
    assert.match(webJs, /from-sandbox/)
    assert.doesNotMatch(webJs, /from ['"]tiny-ping['"]/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pack rejects @biu imports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-biu-'))
  try {
    const ctx = new Context()
    stubHub(ctx)
    const store = new PluginStoreService(
      ctx,
      join(dir, '.plugin'),
      join(dir, 'store.json'),
      join(dir, '.plugin-dev'),
    ).open()
    await store.initSandbox({ id: 'store-biu', name: 'Biu', headless: true })
    const sandbox = join(dir, '.plugin-dev', 'store-biu')
    await writeFile(
      join(sandbox, 'web.tsx'),
      `import { foo } from '@biu/web-slots'\nexport const name = 'store-biu'\nexport function apply() { return foo }\n`,
    )
    await assert.rejects(() => store.pack('store-biu'), /@biu\/web-slots/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('compileStoreModule strips TypeScript in-process', async () => {
  const code = await compileStoreModule(
    `export const name = 'store-echo'\nexport function apply(ctx: { ok: boolean }) { return ctx.ok }`,
    'host',
  )
  assert.match(code, /\bapply\b/)
  assert.doesNotMatch(code, /ctx: \{/)
})

test('excalidraw board onChange does not setState', async () => {
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-excalidraw/web.tsx'), 'utf8')
  const onChange = src.match(/const onChange = useCallback\([\s\S]*?\}, \[file\]\)/)?.[0]
  assert.ok(onChange)
  assert.doesNotMatch(onChange, /setScene/)
  assert.match(onChange, /saveScene/)
  assert.match(src, /function reloadHost/)
  assert.match(src, /appliedEtag/)
  assert.match(src, /function parkHost/)
  assert.match(src, /parkHost\(host\)/)
  assert.match(src, /data-page-block-expand/)
  assert.match(src, /host\.expanded = false/)
  assert.match(src, /export const inject/)
  assert.match(src, /View: Board/)
})
