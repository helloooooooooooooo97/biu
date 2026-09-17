import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { packedAudioPath, setInstallDir } from './host.ts'

test('packed bgm lives under plugin assets/', () => {
  setInstallDir(resolve(import.meta.dirname))
  const path = packedAudioPath('bgm.mp3')
  assert.match(path.replaceAll('\\', '/'), /\/assets\/bgm\.mp3$/)
})
