import { test } from 'vitest'
import assert from 'node:assert/strict'
import { COLLAB_HOST_IDS, filterCordisConfig, runtimeMode } from './runtime.ts'

test('BIU_MODE collab is the thin sync runtime', () => {
  assert.equal(runtimeMode({ BIU_MODE: 'collab' }), 'collab')
  assert.equal(runtimeMode({ BIU_MODE: 'client' }), 'client')
  assert.equal(runtimeMode({}), 'client')
})

test('collab mode keeps http tools hub and only fs+collab plugins', () => {
  const next = filterCordisConfig(
    {
      host: [
        { id: 'http', package: '@biu/host-http' },
        { id: 'llm', package: '@biu/host-llm' },
        { id: 'agents', package: '@biu/host-agents' },
        { id: 'tools', package: '@biu/host-tools' },
        { id: 'hub', package: '@biu/host-hub' },
      ],
      plugins: [
        { id: 'core-file-system', package: '@biu/core-file-system/host' },
        { id: 'core-collab', package: '@biu/core-collab/host' },
        { id: 'core-page', package: '@biu/core-page/host' },
        { id: 'core-chat', package: '@biu/core-chat/host' },
      ],
    },
    'collab',
  )
  assert.deepEqual(
    next.host?.map((item) => item.id),
    [...COLLAB_HOST_IDS],
  )
  assert.deepEqual(
    next.plugins?.map((item) => item.id),
    ['core-file-system', 'core-collab', 'core-page'],
  )
})

test('client mode does not drop agent plugins', () => {
  const host = [{ id: 'agents', package: '@biu/host-agents' }]
  const next = filterCordisConfig({ host, plugins: [{ id: 'core-chat', package: 'x' }] }, 'client')
  assert.equal(next.host?.[0]?.id, 'agents')
  assert.equal(next.plugins?.[0]?.id, 'core-chat')
})
