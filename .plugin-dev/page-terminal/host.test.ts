import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildMysqlArgs, isUnsafeMysqlSql } from './host.ts'

test('mysql batch arguments keep credentials out of argv', () => {
  const args = buildMysqlArgs('select 1', {
    host: 'db.internal',
    port: 3307,
    user: 'reader',
    password: 'secret',
    database: 'analytics',
  })

  assert.deepEqual(args, [
    '-h',
    'db.internal',
    '-P',
    '3307',
    '-u',
    'reader',
    '--connect-timeout=8',
    '--batch',
    '--raw',
    '--default-character-set=utf8mb4',
    '-D',
    'analytics',
    '-e',
    'select 1',
  ])
  assert.doesNotMatch(args.join(' '), /secret/)
})

test('mysql batch rejects client-side shell escape commands', () => {
  assert.equal(isUnsafeMysqlSql('select 1'), false)
  assert.equal(isUnsafeMysqlSql('\\! rm -rf /'), true)
  assert.equal(isUnsafeMysqlSql('SYSTEM uname -a'), true)
  assert.equal(isUnsafeMysqlSql('source secrets.sql'), true)
})
