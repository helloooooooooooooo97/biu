import type { Context } from 'cordis'
import { hostnameOf, presentFetch, presentSearch } from './present.ts'
import type { WebSearchResult } from './types.ts'

export { hostnameOf, presentFetch, presentSearch }

export function registerWebTools(ctx: Context) {
  ctx.systemPrompt.register(
    'web.access',
    '网上资料用 web_search（不知道 URL 时）；已知链接用 web_fetch。不要用 bash curl/wget 搜网页。引用时写成 markdown 链接。',
  )

  ctx.tools.register({
    name: 'web_search',
    description:
      '在网上搜索当前信息。不知道 URL 时用这个：返回标题、链接和摘要。需要读正文再对链接调用 web_fetch。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '一条搜索词' },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '多条搜索词（对齐 DSH）；有 query 时优先用 query',
        },
      },
    },
    execute: async (args, signal) => {
      const queries = collectQueries(args)
      if (!queries.length) throw new Error('query is required')
      const maxResults = ctx.web.searchMaxResults()
      const batches: WebSearchResult[] = []
      for (const query of queries) {
        batches.push(await ctx.web.search({ query, maxResults }, signal))
        ctx.tools.report(presentSearch(queries, batches))
      }
      return presentSearch(queries, batches)
    },
  })

  ctx.tools.register({
    name: 'web_fetch',
    description: '抓取一个已知的公开 http(s) URL，抽出可读正文。先有链接再用；搜资料请用 web_search。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'https 链接' },
      },
      required: ['url'],
    },
    execute: async (args, signal) => presentFetch(await ctx.web.fetch({ url: String(args.url ?? '') }, signal)),
  })
}

function collectQueries(args: Record<string, unknown>) {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown) => {
    const text = String(value ?? '').trim()
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push(text)
  }
  push(args.query)
  if (Array.isArray(args.queries)) args.queries.forEach(push)
  return out
}
