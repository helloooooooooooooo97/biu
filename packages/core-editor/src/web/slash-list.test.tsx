import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { scrollMenuChild, SlashList } from './slash-list.tsx'
import { SLASH_ITEMS } from './slash.ts'

test('scrollMenuChild only moves the menu scrollTop', () => {
  const list = document.createElement('div')
  const item = document.createElement('button')
  Object.defineProperty(list, 'clientHeight', { value: 80 })
  Object.defineProperty(list, 'scrollTop', { value: 0, writable: true })
  Object.defineProperty(item, 'offsetTop', { value: 200 })
  Object.defineProperty(item, 'offsetHeight', { value: 46 })
  scrollMenuChild(list, item)
  assert.equal(list.scrollTop, 166)
})

test('slash list keeps overflow-y auto', () => {
  const style = document.createElement('style')
  style.textContent = PAGE_EDITOR_STYLE
  document.head.appendChild(style)
  const ref = createRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }>()
  const { container } = render(<SlashList ref={ref} items={SLASH_ITEMS} command={() => undefined} />)
  const list = container.querySelector('.page-slash-list') as HTMLDivElement
  act(() => {
    ref.current?.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
  })
  assert.equal(getComputedStyle(list).overflowY, 'auto')
  assert.equal(getComputedStyle(container.querySelector('.page-slash') as HTMLDivElement).position, 'fixed')
  assert.equal(getComputedStyle(container.querySelector('.page-slash') as HTMLDivElement).zIndex, '10000')
  assert.equal(getComputedStyle(container.querySelector('.page-slash-icon') as HTMLElement).width, '18px')
  assert.match(container.innerHTML, /关闭菜单/)
  assert.match(container.innerHTML, /基础模块/)
  assert.match(PAGE_EDITOR_STYLE, /html:not\(\.dark\) \.page-editor \.tiptap \.is-empty::before\{[^}]*color:#bcbab6/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-slash\{[^}]*border:1px solid/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-slash-item\{[^}]*border:1px solid transparent/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /width:46px/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /\.page-slash\{[^}]*0 0 0 1px/)
  style.remove()
})
