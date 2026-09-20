import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { liftToolImages } from './tool-images.ts'
import { artifactsDir } from './artifacts.ts'
import type { LlmMessage } from '@biu/host-llm'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const DATA_URL = `data:image/png;base64,${TINY_PNG.toString('base64')}`

test('liftToolImages turns bash artifacts into image_url blocks', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-lift-'))
  const dir = artifactsDir('sess-1', baseDir)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'shot.png'), TINY_PNG)

  const messages: LlmMessage[] = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: '1', type: 'function', function: { name: 'bash', arguments: '{}' } }],
    },
    {
      role: 'tool',
      tool_call_id: '1',
      content: JSON.stringify({
        stdout: 'wrote shot.png',
        artifacts: [{ name: 'shot.png', mime: 'image/png', url: '/api/sessions/sess-1/artifacts/shot.png' }],
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-1', { baseDir })
  const parts = lifted[1]?.content as Array<{ type: string; text?: string; image_url?: { url: string } }>
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[1]?.type, 'image_url')
  assert.equal(parts[1]?.image_url?.url, DATA_URL)
})

test('liftToolImages reads web_fetch local image files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-lift-web-'))
  const path = join(dir, 'hero.png')
  await writeFile(path, TINY_PNG)
  const messages: LlmMessage[] = [
    {
      role: 'tool',
      tool_call_id: '2',
      content: JSON.stringify({
        file: { path, mime: 'image/png', bytes: TINY_PNG.length },
        text: `saved image → ${path}`,
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-web')
  const parts = lifted[0]?.content as Array<{ type: string; image_url?: { url: string } }>
  assert.equal(parts[1]?.image_url?.url, DATA_URL)
})

test('liftToolImages leaves plain tool text alone', async () => {
  const messages: LlmMessage[] = [{ role: 'tool', tool_call_id: '3', content: 'pong' }]
  const lifted = await liftToolImages(messages, 'sess')
  assert.equal(lifted[0]?.content, 'pong')
})
