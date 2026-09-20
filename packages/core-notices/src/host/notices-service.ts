import { Service, type Context } from 'cordis'
import { dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'
import { DATABASE_CHANNEL } from '@biu/type-file-system'
import { noticesCollection } from './notices-collection.ts'
import { NoticesStore, type NoticeInput } from './notices-store.ts'

export class NoticesService extends Service {
  store = new NoticesStore()

  constructor(ctx: Context) {
    super(ctx, 'notices')
    ctx.inject(['database'], (inner) => {
      inner.database.register(noticesCollection(this.store))
    })
    ctx.inject(['http'], (inner) => {
      inner.http.route('POST', '/api/db/notices/clear', (route: { send: (status: number, body: unknown) => void }) => {
        route.send(200, { ok: true, cleared: this.clear() })
      })
    })
  }

  open(path: string) {
    this.store.open(path)
    return this
  }

  push(input: NoticeInput) {
    const row = this.store.push(input)
    if (row) this.bump()
    return row
  }

  markSourceRead(sourceKey: string) {
    const n = this.store.markSourceRead(sourceKey)
    if (n) this.bump()
    return n
  }

  clear() {
    const n = this.store.clear()
    if (n) this.bump()
    return n
  }

  private bump() {
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    http?.broadcast?.(DATABASE_CHANNEL, { ts: Date.now() })
  }
}

export const name = 'core-notices'

export function apply(ctx: Context) {
  new NoticesService(ctx).open(process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'notices.json'))
}

declare module 'cordis' {
  interface Context {
    notices: NoticesService
  }
}
