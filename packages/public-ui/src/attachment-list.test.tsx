import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AttachmentList, AttachmentMark } from './attachment-list.tsx'

const source = readFileSync(resolve(import.meta.dirname, './attachment-list.tsx'), 'utf8')

test('attachment list renders one downloadable row per file', () => {
  const html = renderToStaticMarkup(
    <AttachmentList
      items={[
        { name: 'capture.mjs', path: 'scripts/capture.mjs', href: '/api/skills/file?id=a&path=scripts%2Fcapture.mjs' },
        { name: 'DESIGN.md', href: '/api/skills/file?id=a&path=DESIGN.md' },
      ]}
    />,
  )
  assert.equal((html.match(/biu-attachment"/g) ?? []).length, 2)
  assert.match(html, /下载 capture\.mjs/)
  assert.match(html, /download="capture\.mjs"/)
  assert.match(html, /scripts\/capture\.mjs/)
})

test('attachment mark carries the paperclip glyph and a download control', () => {
  const html = renderToStaticMarkup(
    <AttachmentMark name="a.py" href="/api/skills/file?id=a&path=a.py" />,
  )
  assert.match(html, /biu-attachment-icon/)
  assert.match(html, /<svg/)
  assert.match(html, /biu-attachment-btn/)
})

test('empty list renders nothing', () => {
  assert.equal(renderToStaticMarkup(<AttachmentList items={[]} />), '')
})

test('attachment list does not depend on an icon package', () => {
  assert.doesNotMatch(source, /@heroicons/)
})
