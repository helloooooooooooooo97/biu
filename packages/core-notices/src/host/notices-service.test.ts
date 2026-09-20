import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { apply } from './notices-service.ts'

test('notices plugin registers /notices when database is present', async () => {
  const ctx = new Context()
  const paths: string[] = []
  const routes: string[] = []
  class DatabaseStub extends Service {
    constructor(c: Context) {
      super(c, 'database')
    }
    register(spec: { path: string }) {
      paths.push(spec.path)
    }
  }
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route(_method: string, pattern: string) {
      routes.push(pattern)
    }
  }
  new DatabaseStub(ctx)
  new HttpStub(ctx)
  await ctx.plugin({ apply })
  assert.equal(paths.includes('/notices'), true)
  assert.equal(routes.includes('/api/db/notices/clear'), true)
  assert.equal(Boolean(ctx.get('notices')), true)
})
