import { createRef } from 'react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, waitFor } from '@testing-library/react'
import { SourceEditor, type SourceEditorHandle } from './source-editor.tsx'

test('source editor uses CodeMirror markdown highlighting and line numbers', () => {
  const src = readFileSync(resolve(import.meta.dirname, './source-editor.tsx'), 'utf8')
  assert.match(src, /@codemirror\/view/)
  assert.match(src, /markdown\(/)
  assert.match(src, /lineNumbers/)
  assert.match(src, /syntaxHighlighting/)
  assert.match(src, /page-source-editor/)
  assert.match(src, /CONTENT_JUMP_EVENT/)
  assert.match(src, /page-agent-edit/)
  assert.match(src, /getLocus/)
  assert.match(src, /isAtStart/)
  assert.match(src, /cm-selectionLayer \.cm-selectionBackground[\s\S]*dsw-pick/)
  assert.doesNotMatch(src, /background: 'Highlight'/)
  assert.doesNotMatch(src, /#F0EFED/)
  assert.doesNotMatch(src, /#E8E0D0/)
  assert.doesNotMatch(src, /#86EFAC/)
  assert.doesNotMatch(src, /#C4B5FD/)
})

test('source editor mounts a CodeMirror view for markdown', async () => {
  const { container } = render(<SourceEditor value={'# Hello\n\nbody'} writable onChange={() => undefined} />)
  await waitFor(() => {
    assert.ok(container.querySelector('.cm-editor'))
  })
  assert.match(container.textContent ?? '', /Hello/)
  assert.ok(container.querySelector('.cm-lineNumbers'))
})

test('source editor reports an empty caret at the start of the document', async () => {
  const ref = createRef<SourceEditorHandle>()
  render(<SourceEditor ref={ref} value={'# Hello\n\nbody'} writable onChange={() => undefined} />)
  await waitFor(() => {
    assert.ok(ref.current)
  })
  assert.equal(ref.current?.isAtStart(), true)
})
