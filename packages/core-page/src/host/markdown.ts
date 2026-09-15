import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export function splitMarkdown(raw: string): { matter: Record<string, unknown>; body: string } {
  const text = String(raw ?? '').replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) return { matter: {}, body: text }
  const afterOpen = text.slice(3)
  const openNl = afterOpen.startsWith('\r\n') ? 2 : afterOpen.startsWith('\n') ? 1 : 0
  if (!openNl) return { matter: {}, body: text }
  const rest = afterOpen.slice(openNl)
  const match = rest.match(/\r?\n---(?:\r?\n|$)/)
  if (!match || match.index == null) return { matter: {}, body: text }
  const yamlText = rest.slice(0, match.index)
  const body = rest.slice(match.index + match[0].length)
  const parsed = parseYaml(yamlText)
  const matter = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  return { matter, body }
}

export function dumpMarkdown(matter: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(matter, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n${body}`
}
