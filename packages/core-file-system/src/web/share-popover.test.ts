import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('share panel copies link and password together, without a separate pin copy', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  assert.match(src, /shareClipboardText/)
  assert.match(src, /复制链接和密码/)
  assert.match(src, /生成并复制链接/)
  assert.match(src, /换一组后即可连同链接一起复制/)
  assert.doesNotMatch(src, /copyText\(pin/)
  assert.doesNotMatch(src, /setCopied\('pin'\)/)
})
