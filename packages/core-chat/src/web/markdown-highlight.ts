import hljs from 'highlight.js'
import { markedHighlight } from 'marked-highlight'

/**
 * marked 的 markdown-highlight 扩展：为代码块添加 highlight.js 的高亮。
 * 主线程（markdown-render.ts）与 worker（markdown.worker.ts）共用同一份配置。
 */
export const markdownHighlight = markedHighlight({
  // 空语言也带上 hljs，便于统一套用高亮主题色
  emptyLangClass: 'hljs',
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      // 高亮失败时退回原样，保证内容不丢
      try {
        return hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value
      } catch {
        return code
      }
    }
  },
})
