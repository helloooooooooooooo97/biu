import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { catalogOf, namesOf, asNameList, mcpChrome } from './chrome.tsx'

test('catalogOf reads server tools from the record', () => {
  const tools = catalogOf({
    id: 'fs',
    catalog: [
      { name: 'read_file', description: '读文件', allowed: true },
      { name: 'write_file', allowed: false },
      { name: '', allowed: true },
    ],
  })
  assert.deepEqual(tools.map((item) => item.name), ['read_file', 'write_file'])
  assert.equal(tools[0]?.allowed, true)
  assert.equal(tools[1]?.allowed, false)
  assert.deepEqual(namesOf({ id: 'fs', catalog: tools }), ['read_file', 'write_file'])
})

test('asNameList keeps allow/deny as exact tool names', () => {
  assert.deepEqual(asNameList(['read_file', ' write_file ', '']), ['read_file', 'write_file'])
})

test('mcp chrome lists tools under the record properties', () => {
  assert.equal(mcpChrome.panes?.[0]?.id, 'tools')
  assert.equal(mcpChrome.panes?.[0]?.label, '工具')
  assert.equal(mcpChrome.panes?.[0]?.place, 'properties')
  assert.equal(mcpChrome.panes?.[0]?.badge?.({ id: 'fs', catalog: [{ name: 'a', allowed: true }] }), 1)
  assert.equal(typeof mcpChrome.cells?.allow, 'function')
  assert.equal(typeof mcpChrome.cells?.deny, 'function')
})

test('mcp tool cards put status in the top-right and filters in the bottom-right', () => {
  const chrome = readFileSync(resolve(import.meta.dirname, './chrome.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(chrome, /className="mcp-tool-dot"/)
  assert.match(chrome, /tool\.allowed \? \(/)
  assert.match(chrome, /className="mcp-tool-actions"/)
  assert.doesNotMatch(chrome, /mcp-tool-state/)
  assert.match(css, /\.mcp-tool-dot\{[^}]*position:absolute/)
  assert.match(css, /\.mcp-tool-dot\{[^}]*top:10px/)
  assert.match(css, /\.mcp-tool-dot\{[^}]*right:10px/)
  assert.match(css, /\.mcp-tool-dot\{[^}]*background:var\(--dsw-ok/)
  assert.match(css, /\.mcp-tool-actions\{[^}]*right:8px/)
  assert.match(css, /\.mcp-tool-actions\{[^}]*bottom:8px/)
})
