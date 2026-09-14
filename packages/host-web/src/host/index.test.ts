import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-system-prompt'
import * as web from './index.ts'
import { parseDuckDuckGoHtml, stripTags, unwrapDuckHref, WebError, WebService } from './index.ts'

const SAMPLE = `
<html><body>
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">TypeScript <b>Handbook</b></a>
  <a class="result__snippet" href="#">Official docs for the language.</a>
  <a rel="nofollow" class="result__a" href="https://developer.mozilla.org/en-US/docs/Web">MDN Web Docs</a>
  <a class="result__snippet" href="#">Web platform reference.</a>
</body></html>
`

test('parses duckduckgo html results and unwraps uddg redirects', () => {
  const hits = parseDuckDuckGoHtml(SAMPLE)
  assert.equal(hits.length, 2)
  assert.equal(hits[0]?.title, 'TypeScript Handbook')
  assert.equal(hits[0]?.url, 'https://example.com/docs')
  assert.match(hits[0]?.snippet ?? '', /Official docs/)
  assert.equal(hits[1]?.url, 'https://developer.mozilla.org/en-US/docs/Web')
  assert.equal(
    unwrapDuckHref('https://duckduckgo.com/l/?uddg=https%3A%2F%2Ffoo.example%2Fa'),
    'https://foo.example/a',
  )
  assert.equal(stripTags('<p>Hi&nbsp;<b>there</b></p>'), 'Hi there')
})

test('web_search / web_fetch match Claude/DSH: query in, sources + fetch text out', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('html.duckduckgo.com')) return new Response(SAMPLE, { status: 200 })
    if (url.includes('example.com/docs')) {
      return new Response('<html><script>x</script><p>Hello docs</p></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url.includes('example.com/missing')) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('nope', { status: 404 })
  }) as typeof fetch

  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(web)
  try {
    const searched = (await ctx.tools.invoke('web_search', { query: 'typescript handbook' })) as {
      sources: Array<{ title: string; url: string }>
    }
    assert.ok(searched.sources.length >= 2)
    assert.equal(searched.sources[0]?.title, 'TypeScript Handbook')
    assert.match(ctx.systemPrompt.assemble(), /web_search/)

    const fetched = (await ctx.tools.invoke('web_fetch', { url: 'https://example.com/docs' })) as {
      text: string
      status: number
    }
    assert.equal(fetched.status, 200)
    assert.match(fetched.text, /Hello docs/)
    assert.doesNotMatch(fetched.text, /script/)

    const missing = (await ctx.tools.invoke('web_fetch', { url: 'https://example.com/missing' })) as { status: number }
    assert.equal(missing.status, 404)

    await assert.rejects(() => ctx.tools.invoke('web_fetch', { url: 'http://127.0.0.1/' }), /WEB_BLOCKED_URL|private/)
    await assert.rejects(() => ctx.tools.invoke('web_search', { query: '   ' }), /required/)
  } finally {
    globalThis.fetch = original
  }
})

test('ctx.web selects a single provider and errors when ambiguous', async () => {
  const ambiguous = new Context()
  const web = new WebService(ambiguous)
  web.registerSearchProvider({
    id: 'a',
    available: () => true,
    search: async () => ({ sources: [{ url: 'https://a.example' }], truncated: false }),
  })
  web.registerSearchProvider({
    id: 'b',
    available: () => true,
    search: async () => ({ sources: [{ url: 'https://b.example' }], truncated: false }),
  })
  await assert.rejects(() => web.search({ query: 'x' }), (error: unknown) => {
    assert.ok(error instanceof WebError)
    assert.equal(error.code, 'WEB_PROVIDER_AMBIGUOUS')
    return true
  })

  const picked = new Context()
  const one = new WebService(picked, { searchProvider: 'b' })
  one.registerSearchProvider({
    id: 'a',
    available: () => true,
    search: async () => ({ sources: [{ url: 'https://a.example' }], truncated: false }),
  })
  one.registerSearchProvider({
    id: 'b',
    available: () => true,
    search: async () => ({ sources: [{ url: 'https://b.example', title: 'B' }], truncated: false }),
  })
  const result = await one.search({ query: 'x', maxResults: 1 })
  assert.equal(result.sources[0]?.url, 'https://b.example')
})
