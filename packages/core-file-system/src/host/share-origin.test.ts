import { test } from 'vitest'
import assert from 'node:assert/strict'
import { publicShareUrl } from './share-origin.ts'

test('SHARE_PORT wins over localhost Host when minting share links', () => {
  const prevPort = process.env.SHARE_PORT
  const prevUrl = process.env.SHARE_PUBLIC_URL
  process.env.SHARE_PORT = '3142'
  delete process.env.SHARE_PUBLIC_URL
  try {
    const url = publicShareUrl({ headers: { host: '127.0.0.1:3141' } } as never, 'tok')
    assert.match(url, /:3142\/share\/tok$/)
    assert.doesNotMatch(url, /127\.0\.0\.1:3141/)
  } finally {
    if (prevPort === undefined) delete process.env.SHARE_PORT
    else process.env.SHARE_PORT = prevPort
    if (prevUrl === undefined) delete process.env.SHARE_PUBLIC_URL
    else process.env.SHARE_PUBLIC_URL = prevUrl
  }
})

test('SHARE_PUBLIC_URL overrides detected origin', () => {
  const prev = process.env.SHARE_PUBLIC_URL
  process.env.SHARE_PUBLIC_URL = 'http://192.168.1.8:3142/'
  try {
    assert.equal(
      publicShareUrl({ headers: { host: '127.0.0.1:3141' } } as never, 'tok'),
      'http://192.168.1.8:3142/share/tok',
    )
  } finally {
    if (prev === undefined) delete process.env.SHARE_PUBLIC_URL
    else process.env.SHARE_PUBLIC_URL = prev
  }
})
