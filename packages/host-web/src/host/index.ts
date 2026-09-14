import type { Context } from 'cordis'
import { duckDuckGoSearchProvider } from './ddg.ts'
import { httpFetchProvider } from './http-fetch.ts'
import { WebService } from './service.ts'
import { registerWebTools } from './tools.ts'
import type { WebConfig } from './types.ts'

export { WebError } from './types.ts'
export {
  parseBingHtml,
  parseDuckDuckGoHtml,
  parseWikiOpenSearch,
  stripTags,
  unwrapBingHref,
  unwrapDuckHref,
} from './html.ts'
export { WebService } from './service.ts'

export const name = 'web'
export const inject = ['tools', 'systemPrompt']

export function apply(ctx: Context, config?: WebConfig) {
  const web = new WebService(ctx, config ?? {})
  web.registerSearchProvider(duckDuckGoSearchProvider())
  web.registerFetchProvider(httpFetchProvider())
  registerWebTools(ctx)
}
