import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('tool panels match the step bar: sidebar fill, no border', () => {
  const source = readFileSync(resolve(import.meta.dirname, './tool-card.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.doesNotMatch(source, /#1e1f24|#e8eaed|#8ab4f8/)
  assert.match(source, /parsed\.kind === 'bash'[\s\S]*bg-\(--dsw-sidebar\)[\s\S]*text-\(--dsw-label-2\)/)
  assert.match(source, /detail\.kind === 'bash'[\s\S]*bg-\(--dsw-sidebar\)/)
  assert.match(source, /prettyJsonString\(rawArguments\)[\s\S]*bg-\(--dsw-sidebar\)|bg-\(--dsw-sidebar\)[\s\S]*prettyJsonString/)
  assert.equal((source.match(/border border-\(--dsw-border\)/g) || []).length, 0)
  assert.match(css, /\.chat-step-bar\s*\{[^}]*background:\s*var\(--dsw-sidebar\)/s)
  assert.match(
    css,
    /\.tool-call-head:hover::before,\s*\.tool-call-head\.is-open::before\s*\{[^}]*background:\s*var\(--dsw-sidebar\)/s,
  )
  assert.doesNotMatch(source, /CheckCircleIcon|XCircleIcon|tool-call-status/)
  assert.match(source, /tool-call-chevron \$\{status\.className\}/)
  assert.match(source, /tool-call-head\$\{open \? ' is-open' : ''\} \$\{status\.className\}/)
  assert.match(css, /\.tool-call-head\.is-open\.is-ok::before[\s\S]*#448361 22%/)
  assert.match(css, /\.tool-call-head\.is-open\.is-fail::before[\s\S]*#c4554d 22%/)
  assert.match(css, /\.tool-call-chevron\.is-ok\s*\{[^}]*color:\s*#448361/s)
  assert.match(css, /\.tool-call-chevron\.is-fail\s*\{[^}]*color:\s*#c4554d/s)
  assert.match(css, /\.tool-call-inspect\s*\{[^}]*opacity:\s*0/s)
  assert.match(css, /\.tool-call-head:hover \.tool-call-inspect/s)
  assert.match(source, /tool-call-chars/)
  assert.match(source, /toolOutputChars/)
  assert.match(source, /detail\.kind === 'chart'/)
  assert.match(source, /className="tool-chart"/)
})

test('any tool result can be zoomed: shared float chrome, no height caps inside', () => {
  const source = readFileSync(resolve(import.meta.dirname, './tool-card.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  // 放大按钮挂在每张卡的头上，不限工具类型
  assert.match(source, /data-testid="tool-call-zoom"/)
  assert.match(source, /ArrowsPointingOutIcon/)
  // 浮层沿用 .biu-float，且挂到 body 以躲开卡片 overflow 和检查器 z-index
  assert.match(source, /className="biu-float-overlay[^"]*" data-testid="tool-zoom"/)
  assert.match(source, /createPortal\([\s\S]*document\.body/)
  assert.match(source, /event\.key === 'Escape'/)
  // 全屏里复用同一个 ToolBody，只是换成高画布
  assert.match(source, /<ToolBody parsed=\{parsed\} rawArguments=\{rawArguments\} detail=\{detail\} tall \/>/)
  assert.match(source, /const height = tall \? 460 : 200/)
  // 卡片里的 max-h-* 必须在放大层内失效，否则放大了还是只能看一小截
  assert.match(css, /\.tool-zoom-body pre,[\s\S]*?max-height:\s*none/)
  // 放大就是全屏：撑满 overlay，并让开 .biu-float-overlay 的居中内边距
  assert.match(css, /\.tool-zoom\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s)
  assert.match(css, /\.tool-zoom-overlay\s*\{[^}]*padding:\s*0/s)
  // 全屏下关闭按钮不能被内容挤走
  assert.match(css, /\.tool-zoom > \.biu-float-head\s*\{[^}]*flex:\s*none/s)
  assert.match(source, /biu-float-overlay tool-zoom-overlay/)
  assert.match(css, /\.tool-call-chars\s*\{[^}]*tabular-nums/s)
})
