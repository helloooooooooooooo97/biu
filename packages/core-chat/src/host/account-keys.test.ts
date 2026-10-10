import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'
import { accountKeyOwner, readAccountApiKeys, writeAccountApiKeys } from './index.ts'

test('each account keeps its own model api key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-chat-keys-'))
  const previousHome = process.env.BIU_HOME
  const previousOnline = process.env.BIU_ONLINE
  process.env.BIU_HOME = dir
  process.env.BIU_ONLINE = '1'
  try {
    assert.equal(accountKeyOwner(), '')
    writeAccountApiKeys({ deepseek: 'should-not-write' })
    assert.equal(readAccountApiKeys().deepseek ?? '', '')

    runWithAccount('ada', () => {
      writeAccountApiKeys({ ...readAccountApiKeys(), deepseek: 'ada-key' })
    })
    runWithAccount('bob', () => {
      writeAccountApiKeys({ ...readAccountApiKeys(), deepseek: 'bob-key' })
    })
    assert.equal(runWithAccount('ada', () => readAccountApiKeys().deepseek), 'ada-key')
    assert.equal(runWithAccount('bob', () => readAccountApiKeys().deepseek), 'bob-key')
    assert.notEqual(
      runWithAccount('ada', () => readAccountApiKeys().deepseek),
      runWithAccount('bob', () => readAccountApiKeys().deepseek),
    )
  } finally {
    if (previousHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = previousHome
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    rmSync(dir, { recursive: true, force: true })
  }
})

test('desktop without a login stores keys for the local owner only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-chat-keys-local-'))
  const previousHome = process.env.BIU_HOME
  const previousOnline = process.env.BIU_ONLINE
  process.env.BIU_HOME = dir
  process.env.BIU_ONLINE = '0'
  try {
    assert.equal(accountKeyOwner(), 'local')
    writeAccountApiKeys({ openai: 'desktop-key' })
    assert.equal(readAccountApiKeys().openai, 'desktop-key')
    process.env.BIU_ONLINE = '1'
    assert.equal(readAccountApiKeys().openai ?? '', '')
  } finally {
    if (previousHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = previousHome
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    rmSync(dir, { recursive: true, force: true })
  }
})
