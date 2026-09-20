import { pinyin } from 'pinyin-pro'

/** OpenAI 系 function name：字母开头，字母数字下划线短横，≤64。 */
const API_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const HAN = /[\u3400-\u9fff]/

/** 中文转拼音；已是合法 API 名则原样。tools.register 强制走这里。 */
export function toolNameForApi(raw: string) {
  const input = String(raw ?? '').trim()
  if (API_NAME.test(input) && !HAN.test(input)) return input
  const parts: string[] = []
  let buf = ''
  const flush = () => {
    if (!buf) return
    parts.push(buf)
    buf = ''
  }
  for (const ch of input) {
    if (HAN.test(ch)) {
      flush()
      const slug = pinyin(ch, { toneType: 'none', v: true })
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      if (slug) parts.push(slug)
      continue
    }
    if (/[a-zA-Z0-9]/.test(ch)) {
      buf += ch
      continue
    }
    flush()
  }
  flush()
  let out = parts.join('_').replace(/_+/g, '_')
  if (!/^[a-zA-Z]/.test(out)) out = `tool_${out}`.replace(/_+/g, '_')
  out = out.slice(0, 64).replace(/_+$/g, '')
  if (!API_NAME.test(out)) return 'tool'
  return out
}
