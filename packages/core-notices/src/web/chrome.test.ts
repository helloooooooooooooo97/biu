import { test } from 'vitest'
import assert from 'node:assert/strict'
import { noticeFiles } from './chrome.tsx'

test('notice detail cards read the content list, not the summary', () => {
  assert.deepEqual(
    noticeFiles([
      { name: 'cover.png', href: '/api/db/file/cover.png', image: true },
      { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false },
      { name: '', href: '/api/db/file/skip' },
    ]),
    [
      { name: 'cover.png', href: '/api/db/file/cover.png', image: true },
      { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false },
    ],
  )
  assert.deepEqual(noticeFiles('页面和记录都不再用到下面这些文件。'), [])
})
