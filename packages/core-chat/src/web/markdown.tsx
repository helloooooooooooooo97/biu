import { memo, useLayoutEffect, useRef } from 'react'
import 'highlight.js/styles/github-dark.css'
import { bindCodeCopyClicks, enhanceCodeCopy } from './code-copy.ts'
import { getCachedMarkdownHtml, parseMarkdownLive, parseMarkdownSync } from './markdown-render.ts'

/**
 * 对话气泡内的 Markdown（GFM）。
 *
 * 定稿后：渲染期同步取 LRU 缓存；未命中则同步 parse 一次并写入缓存。
 * 虚表滚走再滚回 = 同 text 必命中缓存 → 首帧就是 HTML，不再闪「加载一下」。
 * 流式：已闭合的 ``` 代码块立刻定稿高亮；未闭合围栏仍轻量 parse。chunk 已按帧合并。
 */
export const MarkdownBody = memo(function MarkdownBody({
  text,
  className = '',
  streaming = false,
}: {
  text: string
  className?: string
  /** 流式中：闭合代码块高亮，未闭合围栏轻量 parse */
  streaming?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const html = text
    ? streaming
      ? parseMarkdownLive(text)
      : (getCachedMarkdownHtml(text) ?? parseMarkdownSync(text))
    : ''

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    enhanceCodeCopy(root)
    return bindCodeCopyClicks(root)
  }, [html])

  if (!text) return null

  return (
    <div
      ref={rootRef}
      className={`chat-md${streaming ? ' chat-md-stream' : ''} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
