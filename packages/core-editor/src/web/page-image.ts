import type { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function fileFingerprint(file: File) {
  return `${file.type}\0${file.size}`
}

export function uniqueImageFiles(files: Array<File | null | undefined>): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const file of files) {
    if (!file || !IMAGE_MIMES.has(file.type)) continue
    const key = fileFingerprint(file)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

export function collectClipboardImages(clipboard: DataTransfer | null | undefined): File[] {
  if (!clipboard) return []
  const fromFiles = uniqueImageFiles(Array.from(clipboard.files ?? []))
  if (fromFiles.length) return fromFiles
  return uniqueImageFiles(Array.from(clipboard.items ?? []).map((item) => (item.kind === 'file' ? item.getAsFile() : null)))
}

function safeAssetFileName(name: string) {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')
  return base || `image-${Date.now()}.png`
}

export async function uploadPageImage(file: File) {
  const hint = `${Date.now()}-${safeAssetFileName(file.name)}`
  const res = await fetch(`/api/db/file/hash/${encodeURIComponent(hint)}`, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; href?: string; name?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  const name = body.name || hint
  return body.href || `/api/db/file/${encodeURIComponent(name)}`
}

function insertSrc(editor: Editor, src: string, pos: number) {
  if (editor.isDestroyed || !src) return
  editor.chain().focus().insertContentAt(pos, { type: 'image', attrs: { src, alt: '' } }).run()
}

export async function insertClipboardImages(editor: Editor, files: File[], pos: number) {
  let at = pos
  for (const file of files) {
    try {
      const src = await uploadPageImage(file)
      if (editor.isDestroyed) return
      insertSrc(editor, src, at)
      at += 1
    } catch {
      /* skip failed upload */
    }
  }
}

export function stripPastedDataImages(html: string) {
  return html.replace(/<img\b[^>]*\bsrc=["']data:image[^"']*["'][^>]*>/gi, '')
}

const pageImagePasteKey = new PluginKey('page-image-paste')

export const pageImage = Image.extend({
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: pageImagePasteKey,
        props: {
          transformPastedHTML(html) {
            return stripPastedDataImages(html)
          },
          handlePaste(_view, event) {
            const files = collectClipboardImages(event.clipboardData)
            if (!files.length) return false
            event.preventDefault()
            const pos = editor.state.selection.from
            void insertClipboardImages(editor, files, pos)
            return true
          },
          handleDrop(view, event) {
            const files = uniqueImageFiles(Array.from(event.dataTransfer?.files ?? []))
            if (!files.length) return false
            event.preventDefault()
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            const pos = coords?.pos ?? editor.state.selection.from
            void insertClipboardImages(editor, files, pos)
            return true
          },
        },
      }),
    ]
  },
}).configure({ inline: false, allowBase64: false })
