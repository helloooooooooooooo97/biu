import type { LanguageFn } from 'highlight.js'
import http from 'highlight.js/lib/languages/http'
import { common, createLowlight } from 'lowlight'

const inner = createLowlight(common)
inner.register('http', http as LanguageFn)

/**
 * CodeBlockLowlight 会拿 highlight.js 全局 core 判断语言是否“已注册”。
 * 聊天侧一旦 import 了完整 hljs，http 等语言在全局是有的，但 lowlight(common)
 * 实例里没有，highlight() 会直接抛错把整页 Shell 打挂。
 */
export const pageLowlight = {
  highlight(language: string, value: string, options?: { prefix?: string }) {
    if (language && inner.registered(language)) return inner.highlight(language, value, options)
    return inner.highlightAuto(value, options)
  },
  highlightAuto(value: string, options?: { prefix?: string; subset?: readonly string[] | null }) {
    return inner.highlightAuto(value, options)
  },
  listLanguages() {
    return inner.listLanguages()
  },
  register: inner.register.bind(inner),
  registerAlias: inner.registerAlias.bind(inner),
  registered(name: string) {
    return inner.registered(name)
  },
}
