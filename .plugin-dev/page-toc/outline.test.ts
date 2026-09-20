import { test } from 'vitest'
import assert from 'node:assert/strict'
import { headingElById, headingsFromPage, pageRootFrom } from './outline.ts'

test('headingsFromPage extracts h1–h3, skips chrome and the toc host', () => {
  const root = document.createElement('div')
  root.className = 'fsdb-detail-main'
  root.innerHTML = `
    <h1 class="fsdb-detail-title">Record title</h1>
    <div class="page-editor">
      <div class="page-toc-host"><h2>目录自己</h2></div>
      <h1>Intro</h1>
      <p>body</p>
      <h2>Section</h2>
      <h3>Detail</h3>
      <h2></h2>
      <h4>ignored</h4>
    </div>
    <h3 class="fsdb-detail-extra-title">Related</h3>
  `
  const host = root.querySelector('.page-toc-host')
  assert.ok(host)
  assert.deepEqual(
    headingsFromPage(root, host).map((item) => [item.id, item.text, item.level]),
    [
      ['heading-0', 'Intro', 1],
      ['heading-1', 'Section', 2],
      ['heading-2', 'Detail', 3],
    ],
  )
  assert.equal(headingElById(root, 'heading-1', host)?.textContent?.trim(), 'Section')
})

test('pageRootFrom uses the page shell; inspector without page DOM is empty', () => {
  const page = document.createElement('div')
  page.className = 'fsdb-detail-main'
  page.innerHTML = `<div class="page-editor"><div class="page-toc-host"></div><h1>A</h1></div>`
  const host = page.querySelector('.page-toc-host')
  assert.equal(pageRootFrom(host), page)
  assert.deepEqual(
    headingsFromPage(pageRootFrom(host)!, host).map((item) => item.text),
    ['A'],
  )

  const orphan = document.createElement('div')
  orphan.className = 'page-toc-host'
  document.body.appendChild(orphan)
  assert.equal(pageRootFrom(orphan), null)
  orphan.remove()
})
