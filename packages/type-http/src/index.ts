import type { IncomingMessage, ServerResponse } from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RouteContext {
  req: IncomingMessage
  res: ServerResponse
  params: Record<string, string>
  query: URLSearchParams
  json<T = unknown>(): Promise<T>
  bytes(): Promise<Buffer>
  send(status: number, body: unknown): void
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>

export interface PageSpec {
  id: string
  title: string
  subtitle: string
  plugin: string
  kind: string
}

export const HUB_CHANGE = 'hub/change' as const
export const HUB_CHANNEL_SNAPSHOT = 'snapshot' as const
export const HUB_CHANNEL_EVENT = 'event' as const

export const httpRequest = new AsyncLocalStorage<{ cookie?: string; unrestricted?: boolean }>()

export function currentHttpCookie() {
  return httpRequest.getStore()?.cookie
}
