import type { ReactNode } from 'react'

const STYLE_ID = 'biu-public-ui-attachment-list'
const CSS = `
.biu-attachments{display:inline-flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;max-width:100%}
.biu-attachment{display:inline-flex;align-items:center;gap:6px;height:22px;max-width:100%;padding:0 6px;border-radius:5px;font-size:13px;line-height:22px;background:color-mix(in srgb,var(--biu-attachment,#787774) 12%,transparent);color:var(--dsw-tag-ink,#2c2c2b)}
.biu-attachment-icon{display:inline-flex;width:14px;height:14px;flex:none;opacity:.8}
.biu-attachment-icon svg{width:14px;height:14px;display:block}
.biu-attachment-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none;color:inherit}
.biu-attachment-name:hover{text-decoration:underline}
.biu-attachment-path{color:var(--dsw-label-3,#8a8a86);font-size:12px}
.biu-attachment-tools{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.biu-attachment-btn{border:0;background:transparent;padding:0;margin:0;color:inherit;opacity:.6;cursor:pointer;display:inline-flex;align-items:center;line-height:0}
.biu-attachment-btn:hover{opacity:1}
.biu-attachment-btn.is-danger:hover{color:#c4554d}
`

export function ensureAttachmentListStyle() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== CSS) style.textContent = CSS
}

export function PaperClipMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M11.914 4.086a2 2 0 0 0-2.828 0l-4.5 4.5a3 3 0 1 0 4.243 4.243l3.5-3.5a.75.75 0 1 0-1.061-1.06l-3.5 3.5a1.5 1.5 0 1 1-2.121-2.122l4.5-4.5a.5.5 0 0 1 .707.708l-4.5 4.5a.75.75 0 1 0 1.06 1.06l3.5-3.5a.75.75 0 1 0-1.06-1.06l-3.5 3.5a.75.75 0 0 0 1.06 1.06l4.5-4.5a2 2 0 0 0 0-2.828Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function DownloadMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M8.75 1.5a.75.75 0 0 0-1.5 0v6.19L5.03 5.47a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 7.69V1.5Z" />
      <path d="M2.75 10.5a.75.75 0 0 1 .75.75v1.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 12.25 14.5h-8.5A1.75 1.75 0 0 1 2 12.75v-1.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
  )
}

export function AttachmentMark({ href, name, path, onRemove }: {
  href: string
  name: string
  /** 可选的完整相对路径，显示在文件名旁边。 */
  path?: string
  onRemove?: () => void
}) {
  ensureAttachmentListStyle()
  return (
    <span className="biu-attachment">
      <span className="biu-attachment-icon">
        <PaperClipMark />
      </span>
      <a className="biu-attachment-name" href={href} download={name} title={path || name}>
        {name}
      </a>
      {path && path !== name ? <span className="biu-attachment-path">{path}</span> : null}
      <span className="biu-attachment-tools">
        <a
          className="biu-attachment-btn"
          href={href}
          download={name}
          title="下载"
          aria-label={`下载 ${name}`}
        >
          <DownloadMark />
        </a>
        {onRemove ? (
          <button
            type="button"
            className="biu-attachment-btn is-danger"
            title="删除"
            aria-label={`删除 ${name}`}
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
          >
            <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        ) : null}
      </span>
    </span>
  )
}

/** 一列可下载的附件。每个 item 至少给 { name, href }。 */
export function AttachmentList({ items, children }: {
  items: { name: string; href: string; path?: string; onRemove?: () => void }[]
  children?: ReactNode
}) {
  ensureAttachmentListStyle()
  if (!items.length && !children) return null
  return (
    <span className="biu-attachments">
      {items.map((item, index) => (
        <AttachmentMark
          key={`${item.href}-${index}`}
          href={item.href}
          name={item.name}
          path={item.path}
          onRemove={item.onRemove}
        />
      ))}
      {children}
    </span>
  )
}
