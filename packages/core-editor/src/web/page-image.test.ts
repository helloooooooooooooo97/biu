import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import {
  collectClipboardImages,
  insertClipboardImages,
  stripPastedDataImages,
  uploadPageImage,
} from './page-image.ts'
import { pageEditorExtensions } from './kit.ts'

test('uploadPageImage PUTs to hash storage and returns the asset href', async () => {
  const calls: Array<{ url: string; method: string }> = []
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? 'GET') })
    return new Response(JSON.stringify({ name: 'ab'.repeat(32) + '.png', href: '/api/db/file/' + 'ab'.repeat(32) + '.png' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const href = await uploadPageImage(new File([new Uint8Array([0x89, 0x50])], 'shot.png', { type: 'image/png' }))
    assert.match(calls[0]?.url ?? '', /\/api\/db\/file\/hash\//)
    assert.equal(calls[0]?.method, 'PUT')
    assert.match(href, /^\/api\/db\/file\/[a-f0-9]+\.png$/i)
  } finally {
    globalThis.fetch = prev
  }
})

test('insertClipboardImages writes an asset href, not a data URL', async () => {
  const prev = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ href: '/api/db/file/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef.png' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: 'hello',
    contentType: 'markdown',
  })
  try {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'paste.png', { type: 'image/png' })
    await insertClipboardImages(editor, [file], editor.state.selection.from)
    const md = editor.getMarkdown()
    assert.match(md, /\/api\/db\/file\/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\.png/)
    assert.doesNotMatch(md, /data:image/)
  } finally {
    editor.destroy()
    globalThis.fetch = prev
  }
})

test('collectClipboardImages keeps image files and stripPastedDataImages drops inline data URLs', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
  const clipboard = {
    files: [file],
    items: [] as DataTransferItem[],
  } as unknown as DataTransfer
  assert.equal(collectClipboardImages(clipboard).length, 1)
  assert.equal(stripPastedDataImages('<p>x</p><img src="data:image/png;base64,QQ==">'), '<p>x</p>')
})
