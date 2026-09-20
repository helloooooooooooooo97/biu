import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asPublicProfile, readWorkspaceProfile, writeWorkspaceProfile } from './workspace-profile.ts'

test('workspace profile stores preferred name and rejects oversized avatars', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-profile-'))
  process.env.BIU_PROFILE = join(dir, 'profile.json')
  assert.equal(readWorkspaceProfile().name, '')
  const saved = writeWorkspaceProfile({ name: '  蓝团  ', avatar: '' })
  assert.equal(saved.name, '蓝团')
  assert.equal(saved.theme, 'light')
  assert.equal(asPublicProfile(saved).displayName, '蓝团')
  assert.equal(writeWorkspaceProfile({ theme: 'dark' }).theme, 'dark')
  assert.equal(readWorkspaceProfile().name, '蓝团')
  assert.equal(asPublicProfile().theme, 'dark')
  assert.deepEqual(asPublicProfile().pagePrefs, {
    wide: false,
    outlineExpand: true,
    outlinePin: false,
    navPin: false,
    bodySize: 'md',
    bodyGap: 'md',
  })
  assert.equal(writeWorkspaceProfile({ pagePrefs: { wide: true, bodySize: 'lg' } }).pagePrefs.wide, true)
  assert.equal(readWorkspaceProfile().pagePrefs.bodySize, 'lg')
  assert.equal(writeWorkspaceProfile({ theme: 'light' }).pagePrefs.wide, true)
  assert.throws(() => writeWorkspaceProfile({ avatar: `data:image/jpeg;base64,${'a'.repeat(240_001)}` }))
})
