import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { actionIcon, DefaultCell } from './fsdb-cells.tsx'

test('Skill sync actions use distinct directional icons', () => {
  const pull = render(actionIcon('sync-from-directory'))
  const push = render(actionIcon('sync-to-directory'))
  const fallback = render(actionIcon('unknown-action'))
  assert.notEqual(pull.container.innerHTML, push.container.innerHTML)
  assert.notEqual(pull.container.innerHTML, fallback.container.innerHTML)
  assert.notEqual(push.container.innerHTML, fallback.container.innerHTML)
})

test('enable and disable actions use play and stop glyphs', () => {
  const on = render(actionIcon('enable'))
  const off = render(actionIcon('disable'))
  const play = render(actionIcon('play'))
  const stop = render(actionIcon('stop'))
  const bolt = render(actionIcon('unknown-action'))
  assert.equal(on.container.innerHTML, play.container.innerHTML)
  assert.equal(off.container.innerHTML, stop.container.innerHTML)
  assert.notEqual(on.container.innerHTML, off.container.innerHTML)
  assert.notEqual(on.container.innerHTML, bolt.container.innerHTML)
  assert.notEqual(off.container.innerHTML, bolt.container.innerHTML)
})

test('attachment cells render a file link, not a broken image', () => {
  const { container } = render(
    <DefaultCell field={{ type: 'attachment' }} value={{ name: 'notes.pdf', href: 'https://cdn.example/notes.pdf' }} />,
  )
  assert.equal(container.querySelector('img'), null)
  const name = container.querySelector('.fsdb-file-name')
  assert.equal(name?.textContent, 'notes.pdf')
  const download = container.querySelector('a.fsdb-file-dl') as HTMLAnchorElement
  assert.equal(download?.href, 'https://cdn.example/notes.pdf')
  assert.equal(download?.getAttribute('download'), 'notes.pdf')
  assert.equal(container.querySelector('[data-testid="fsdb-file-remove"]'), null)
})

test('writable attachment cells can delete the file', () => {
  let next: unknown = null
  const { container } = render(
    <DefaultCell
      field={{ type: 'attachment', writable: true }}
      value={{ name: 'notes.pdf', href: 'https://cdn.example/notes.pdf' }}
      onChange={(value) => {
        next = value
      }}
    />,
  )
  const remove = container.querySelector('[data-testid="fsdb-file-remove"]') as HTMLButtonElement
  assert.equal(Boolean(remove), true)
  remove.click()
  assert.equal(next, '')
})

test('attachment cells can show more than one file', () => {
  const { container } = render(
    <DefaultCell
      field={{ type: 'attachment' }}
      value={[
        { name: 'a.pdf', href: 'https://cdn.example/a.pdf' },
        { name: 'b.pdf', href: 'https://cdn.example/b.pdf' },
      ]}
    />,
  )
  assert.equal(container.querySelectorAll('.fsdb-file-name').length, 2)
  assert.equal(container.querySelectorAll('a.fsdb-file-dl').length, 2)
})

test('image cells still render a thumbnail', () => {
  const { container } = render(<DefaultCell field={{ type: 'image' }} value="/page-covers/blue.png" />)
  const img = container.querySelector('img') as HTMLImageElement
  assert.equal(Boolean(img?.src.endsWith('/page-covers/blue.png')), true)
  assert.equal(img?.getAttribute('width'), '28')
  assert.equal(img?.getAttribute('height'), '18')
})

test('image cells can show more than one thumbnail', () => {
  const { container } = render(
    <DefaultCell field={{ type: 'image' }} value={['/page-covers/blue.png', '/page-covers/red.png']} />,
  )
  assert.equal(container.querySelectorAll('img').length, 2)
})

test('url cells open in a new tab instead of downloading', () => {
  const { container } = render(<DefaultCell field={{ type: 'url' }} value="https://example.com/page" />)
  assert.equal(container.querySelector('.fsdb-file-dl'), null)
  const open = container.querySelector('a.fsdb-file-open') as HTMLAnchorElement
  assert.equal(open?.href, 'https://example.com/page')
  assert.equal(open?.target, '_blank')
  assert.equal(open?.rel.includes('noopener'), true)
  assert.equal(open?.getAttribute('download'), null)
  assert.equal(container.querySelector('.fsdb-file-name')?.textContent, 'https://example.com/page')
})

test('empty cells render no placeholder copy', () => {
  const text = render(<DefaultCell field={{ type: 'string' }} value="" />)
  assert.equal(text.container.textContent, '')
  const select = render(<DefaultCell field={{ type: 'select' }} value="" />)
  assert.equal(select.container.textContent, '')
  const file = render(<DefaultCell field={{ type: 'attachment' }} value="" />)
  assert.equal(file.container.textContent, '')
  const number = render(<DefaultCell field={{ type: 'number' }} value={0} />)
  assert.equal(number.container.textContent, '')
  const href = render(<DefaultCell field={{ type: 'url' }} value="" />)
  assert.equal(href.container.textContent, '')
  const emptyFile = render(<DefaultCell field={{ type: 'attachment' }} value={{}} />)
  assert.equal(emptyFile.container.textContent, '')
})

test('image zoom uses antd Image preview', () => {
  const cells = readFileSync(resolve(import.meta.dirname, './fsdb-cells.tsx'), 'utf8')
  const media = readFileSync(resolve(import.meta.dirname, './cell-media.tsx'), 'utf8')
  const thumbs = readFileSync(resolve(import.meta.dirname, '../../../core-chat/src/web/image-thumbs.tsx'), 'utf8')
  const tools = readFileSync(resolve(import.meta.dirname, '../../../core-chat/src/web/tool-card.tsx'), 'utf8')
  assert.match(cells, /from 'antd'/)
  assert.match(cells, /Image\.PreviewGroup/)
  assert.doesNotMatch(cells, /fsdb-lightbox/)
  assert.match(media, /from 'antd'/)
  assert.match(media, /Image\.PreviewGroup/)
  assert.match(thumbs, /from 'antd'/)
  assert.match(thumbs, /Image\.PreviewGroup/)
  assert.doesNotMatch(thumbs, /composer-image-lightbox/)
  assert.match(tools, /Image\.PreviewGroup/)
})
