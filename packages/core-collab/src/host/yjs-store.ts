import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as Y from 'yjs'

export function pageDocName(pageId: string) {
  return `page.${pageId}`
}

export function pageIdFromDoc(name: string) {
  if (!name.startsWith('page.')) return ''
  return name.slice(5)
}

export class YjsStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  pathFor(pageId: string) {
    return join(this.dir, `${pageId}.bin`)
  }

  load(pageId: string) {
    try {
      return new Uint8Array(readFileSync(this.pathFor(pageId)))
    } catch {
      return null
    }
  }

  save(pageId: string, update: Uint8Array) {
    mkdirSync(dirname(this.pathFor(pageId)), { recursive: true })
    writeFileSync(this.pathFor(pageId), update)
  }

  applyTo(doc: Y.Doc, pageId: string) {
    const update = this.load(pageId)
    if (update?.length) Y.applyUpdate(doc, update)
  }

  encode(doc: Y.Doc) {
    return Y.encodeStateAsUpdate(doc)
  }
}
