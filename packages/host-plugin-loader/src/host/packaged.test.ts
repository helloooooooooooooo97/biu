import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { importConfiguredPackage } from './index.ts'

const key = Symbol.for('biu.packagedHostModules')

afterEach(() => {
  delete (globalThis as any)[key]
})

test('packaged host resolves configured modules without workspace sources', async () => {
  const expected = { name: 'packed-plugin' }
  ;(globalThis as any)[key] = {
    '@biu/packed-plugin/host': async () => expected,
  }

  const loaded = await importConfiguredPackage('/path/that/does/not/exist', '@biu/packed-plugin/host')
  assert.equal(loaded, expected)
})
