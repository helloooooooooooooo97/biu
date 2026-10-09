import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  isHtmlPickSurface,
  stampHtmlPickSurfaces,
  stampHtmlSource,
  htmlBlockKey,
} from '../../../../.plugin-dev/page-html-blocks/web/stamp-picks.ts'

test('stamps every div and span plus semantic nodes', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="card">
      <h2>爱乐之城</h2>
      <p>一部歌舞片</p>
      <span class="chip">标签</span>
      <button type="button">播放</button>
      <a href="#x">预告</a>
      <img alt="海报" src="about:blank" />
      <div id="score">8.6</div>
    </div>
  `
  document.body.append(root)
  stampHtmlPickSurfaces(root, '0-abcd', { plugin: 'page-html-blocks' })
  const stamped = [...root.querySelectorAll('[data-html-pick]')]
  if (root.hasAttribute('data-html-pick') && !stamped.includes(root)) stamped.unshift(root)
  const tags = stamped.map((el) => el.tagName)
  assert.equal(root.getAttribute('data-biu-kind'), 'html')
  assert.ok(tags.includes('DIV'))
  assert.ok(tags.includes('H2'))
  assert.ok(tags.includes('SPAN'))
  assert.ok(tags.includes('BUTTON'))
  const chip = root.querySelector('.chip')
  assert.equal(chip?.getAttribute('data-biu-plugin'), 'page-html-blocks')
  assert.equal(isHtmlPickSurface(chip!), true)
  const divs = [...root.querySelectorAll('div')]
  const spans = [...root.querySelectorAll('span')]
  assert.ok(divs.every((el) => el.hasAttribute('data-biu-id')))
  assert.ok(spans.every((el) => el.hasAttribute('data-biu-id')))
  root.remove()
})

test('htmlBlockKey is stable for the same host and source', () => {
  const editor = document.createElement('div')
  editor.className = 'tiptap'
  const a = document.createElement('div')
  a.setAttribute('data-page-block', 'html')
  const b = document.createElement('div')
  b.setAttribute('data-page-block', 'htmlframe')
  editor.append(a, b)
  assert.equal(htmlBlockKey(a, '<p>x</p>'), htmlBlockKey(a, '<p>x</p>'))
  assert.notEqual(htmlBlockKey(a, '<p>x</p>'), htmlBlockKey(b, '<p>x</p>'))
  assert.notEqual(htmlBlockKey(a, '<p>x</p>'), htmlBlockKey(a, '<p>y</p>'))
})

test('stampHtmlSource hits every poster div and span', () => {
  const html = `<div style="min-height:340px">
    <div style="pointer-events:none"></div>
    <div>
      <div>LA LA</div>
      <div>LAND <span>爱乐之城</span></div>
      <span>🏆 奥斯卡最佳导演</span>
    </div>
  </div>`
  const stamped = stampHtmlSource(html, '0-poster', 'page-html-blocks')
  const wrap = document.createElement('div')
  wrap.innerHTML = stamped
  const divs = [...wrap.querySelectorAll('div')]
  const spans = [...wrap.querySelectorAll('span')]
  assert.ok(divs.length > 0)
  assert.ok(divs.every((el) => el.hasAttribute('data-biu-id')))
  assert.ok(spans.every((el) => el.hasAttribute('data-biu-id')))
  assert.ok(wrap.querySelector('[style*="pointer-events:none"]')?.hasAttribute('data-biu-kind'))
})
