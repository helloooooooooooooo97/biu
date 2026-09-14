export class WebError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WebError'
  }
}

export type WebSearchRequest = {
  readonly query: string
  readonly maxResults?: number
}

export type WebSearchSource = {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

export type WebSearchResult = {
  readonly content?: string
  readonly sources: readonly WebSearchSource[]
  readonly truncated: boolean
}

export type WebFetchRequest = {
  readonly url: string
}

export type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }

export type WebFetchResult = {
  readonly url: string
  readonly statusCode: number
  readonly body: WebFetchBody
  readonly truncated: boolean
}

export type WebSearchProvider = {
  readonly id: string
  available(): boolean
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>
}

export type WebFetchProvider = {
  readonly id: string
  available(): boolean
  fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
}

export type WebConfig = {
  searchProvider?: string
  fetchProvider?: string
  searchMaxResults?: number
}
