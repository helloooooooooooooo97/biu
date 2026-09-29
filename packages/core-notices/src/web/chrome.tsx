import type { FsContentProps } from '@biu/type-file-system/ui'
import type { CollectionChrome } from '@biu/type-file-system/ui'

export type NoticeFileCard = {
  name: string
  href: string
  image: boolean
}

export function noticeFiles(value: unknown): NoticeFileCard[] {
  if (!Array.isArray(value)) return []
  const files: NoticeFileCard[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name ?? '').trim()
    const href = String(row.href ?? '').trim()
    if (!name || !href) continue
    files.push({ name, href, image: row.image === true })
  }
  return files
}

function NoticeFiles({ value }: FsContentProps) {
  const files = noticeFiles(value)
  if (!files.length) return null
  return (
    <ul className="notice-files" data-testid="notice-files">
      {files.map((file) => (
        <li key={file.href} className="notice-file">
          {file.image ? <img className="notice-file-img" src={file.href} alt="" /> : null}
          <a className="notice-file-name" href={file.href} target="_blank" rel="noreferrer">
            {file.name}
          </a>
        </li>
      ))}
    </ul>
  )
}

export const noticesChrome: CollectionChrome = {
  Content: NoticeFiles,
}
