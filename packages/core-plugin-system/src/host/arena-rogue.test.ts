import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ArenaGame } from '../../../../.plugin-dev/arena-rogue/web/game.ts'

test('arena-rogue is a resizable window plugin with 12 weapons and extras slot', async () => {
  const dir = resolve(import.meta.dirname, '../../../../.plugin-dev/arena-rogue')
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')) as {
    id: string
    name?: string
    headless?: boolean
    shell?: { width: number; height: number; resizable?: boolean }
  }
  const web = await readFile(resolve(dir, 'web/index.tsx'), 'utf8')
  const game = await readFile(resolve(dir, 'web/game.ts'), 'utf8')
  const weapons = await readFile(resolve(dir, 'web/weapons.ts'), 'utf8')
  assert.equal(manifest.id, 'arena-rogue')
  assert.equal(manifest.name, '枪火')
  assert.equal(manifest.headless, undefined)
  assert.equal(manifest.shell?.resizable, true)
  assert.ok((manifest.shell?.width ?? 0) >= 800)
  assert.match(web, /export const name = 'arena-rogue'/)
  assert.match(web, /plugin-store-extras/)
  assert.match(web, /key: 'arena-rogue'/)
  assert.match(web, /inset: 0/)
  assert.doesNotMatch(game, /setTransform\(1,\s*0,\s*0,\s*1/)
  assert.match(game, /fieldW/)
  assert.match(game, /fieldH/)
  assert.equal([...weapons.matchAll(/id: '/g)].length, 12)
})

test('draw applies devicePixelRatio transform and fills the css window', () => {
  const g = new ArenaGame()
  g.w = 1920
  g.h = 1080
  g.dpr = 1
  g.start()
  const transforms: number[][] = []
  const fills: Array<{ w: number; h: number }> = []
  const ctx = new Proxy(
    {
      canvas: { width: 3840, height: 2160, clientWidth: 1920, clientHeight: 1080 },
      setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
        transforms.push([a, b, c, d, e, f])
      },
      fillRect(_x: number, _y: number, w: number, h: number) {
        fills.push({ w, h })
      },
    },
    {
      get(target, prop, recv) {
        if (prop in target) return Reflect.get(target, prop, recv)
        return () => {}
      },
      set() {
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  g.draw(ctx)
  assert.deepEqual(transforms[0], [2, 0, 0, 2, 0, 0])
  assert.equal(g.dpr, 2)
  assert.ok(fills.some((row) => row.w === 1920 && row.h === 1080))
})
