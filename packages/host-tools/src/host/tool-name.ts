import { randomBytes } from 'node:crypto'

/** OpenAI / Anthropic function name。 */
export const TOOL_API_NAME = /^[a-zA-Z0-9_-]{1,64}$/

export function stripToolApiName(raw: string) {
  const input = String(raw ?? '').trim()
  if (TOOL_API_NAME.test(input)) return input
  const stripped = input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return TOOL_API_NAME.test(stripped) ? stripped : ''
}

function randomToolApiName(taken: ReadonlySet<string>) {
  for (let i = 0; i < 16; i += 1) {
    const name = `tool_${randomBytes(4).toString('hex')}`
    if (TOOL_API_NAME.test(name) && !taken.has(name)) return name
  }
  throw new Error('cannot allocate tool name')
}

/** 合法则原样；否则去掉非法字符；还不行则 tool_ + 随机 id。 */
export function toolNameForApi(raw: string, taken: ReadonlySet<string> = new Set()) {
  const stripped = stripToolApiName(raw)
  if (stripped) return stripped
  return randomToolApiName(taken)
}
