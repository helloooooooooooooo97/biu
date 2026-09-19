import { Service, type Context } from 'cordis'
import { DATABASE_CHANNEL } from '@biu/type-file-system'
import { NoticesStore, type NoticeInput } from './notices-store.ts'

export class NoticesService extends Service {
  store = new NoticesStore()

  constructor(ctx: Context) {
    super(ctx, 'notices')
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

declare module 'cordis' {
  interface Context {
    notices: NoticesService
  }
}
