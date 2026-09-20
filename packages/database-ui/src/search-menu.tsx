import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { AnchorMenu } from '@biu/public-ui'

const STYLE_ID = 'biu-database-ui-search'
const CSS = `
.db-search-menu{box-sizing:border-box;padding:6px;background:var(--dsw-sidebar);border:0;border-radius:10px;box-shadow:var(--dsw-shadow);display:flex;flex-direction:column;gap:4px;font-size:14px}
.db-search-field{display:flex;align-items:center;gap:6px;border:0;border-radius:8px;padding:4px 8px;color:var(--dsw-label-3);background:transparent;font-size:14px}
.db-search-field input{flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-label);font-family:inherit;font-size:14px;font-weight:400;line-height:1.4;outline:none}
.db-search-field input::placeholder{font-size:14px;color:var(--dsw-label-3)}
.db-search-list{display:flex;flex-direction:column;gap:1px;max-height:220px;overflow:auto}
.db-search-option{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:6px;padding:5px 6px;background:transparent;color:var(--dsw-label);font-family:inherit;font-size:14px;cursor:pointer;text-align:left}
.db-search-option:hover,.db-search-option.is-selected,.db-search-option.is-active{background:color-mix(in srgb,var(--dsw-business) 12%,transparent)}
.db-search-option-main{display:inline-flex;align-items:center;gap:6px;min-width:0}
.db-search-empty{padding:8px;color:var(--dsw-label-3);font-size:14px}
.db-search-foot{border-top:1px solid var(--dsw-border);margin-top:4px;padding-top:4px}
.db-cell-select{display:inline-flex;position:relative;min-width:0;max-width:100%;box-sizing:border-box;vertical-align:middle}
.db-cell-select-trigger{display:inline-flex;align-items:center;gap:5px;max-width:none;height:22px;border:0;border-radius:4px;padding:0 6px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:500;line-height:22px;cursor:pointer;text-align:left}
.db-cell-select-trigger:hover,.db-cell-select-trigger[data-open]{background:transparent}
.db-cell-select-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-cell-select-caret{flex:none;opacity:.55;color:var(--dsw-label-2)}
.db-cell-select-trigger.is-chip{background:transparent;padding:0;height:auto;max-width:none}
.db-cell-select-trigger.is-chip:hover,.db-cell-select-trigger.is-chip[data-open]{background:transparent}
.db-cell-select-trigger.is-empty{max-width:none;color:var(--dsw-label-3);background:transparent;font-weight:500}
.db-cell-select.is-field{display:block;width:100%}
.db-cell-select.is-field .db-cell-select-trigger{display:flex;justify-content:space-between;gap:6px;width:100%;max-width:none;min-height:28px;border:1px solid var(--dsw-border);border-radius:7px;padding:5px 8px;background:var(--dsw-input);color:var(--dsw-label)}
.db-cell-select.is-field .db-cell-select-trigger:hover,.db-cell-select.is-field .db-cell-select-trigger[data-open]{background:var(--dsw-hover);filter:none}
.db-cell-select.is-field .db-cell-select-trigger.is-empty{color:var(--dsw-label-3)}
.db-cell-multi{position:relative;display:flex;min-width:0;width:100%;max-width:100%;vertical-align:middle}
.db-cell-multi.is-empty{display:flex;width:100%;min-width:0;align-self:stretch}
.db-cell-multi-box{display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;max-width:none;min-height:20px;border:0;border-radius:6px;padding:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.db-cell-multi-box.is-empty{display:flex;width:100%;min-height:22px;min-width:0;align-self:stretch}
.db-cell-multi-box:hover,.db-cell-multi-box[aria-expanded="true"]{background:transparent}
.db-datetime{display:inline-flex;align-items:center;gap:4px;position:relative;min-width:0;width:100%;max-width:100%;vertical-align:middle;color:inherit}
.db-datetime .ant-picker,.db-datetime .ant-picker-focused,.db-datetime .ant-picker:hover,.db-datetime .ant-picker-borderless{width:auto;max-width:100%;padding:0;background:transparent;border:0;box-shadow:none;outline:none}
.db-datetime .ant-picker-borderless:focus-visible,.db-datetime .ant-picker-borderless:has(input:focus-visible){outline:none}
.db-datetime .ant-picker-input > input{font-size:14px;font-weight:500;color:var(--dsw-label);outline:none}
.db-datetime .ant-picker-input > input::placeholder{font-size:14px;font-weight:500;color:var(--dsw-label-3)}
.db-datetime.is-overdue .ant-picker-input > input,.db-datetime.is-overdue{color:var(--dsw-danger)}
.db-datetime .ant-picker-suffix{display:none}
.db-datetime .ant-picker-clear{color:var(--dsw-label-3)}
`

export function ensureDbSearchStyle() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== CSS) style.textContent = CSS
}

function SearchMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.26a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function DbMenu({
  anchor,
  onClose,
  children,
  footer,
  className,
  ...rest
}: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
} & Record<string, unknown>) {
  ensureDbSearchStyle()
  return (
    <AnchorMenu
      anchor={anchor}
      onClose={onClose}
      className={className ? `db-search-menu ${className}` : 'db-search-menu'}
      {...rest}
    >
      {children}
      {footer ? <div className="db-search-foot">{footer}</div> : null}
    </AnchorMenu>
  )
}

export function DbSearchMenu({
  anchor,
  onClose,
  query,
  onQuery,
  placeholder = '搜索',
  children,
  empty,
  footer,
  onEnter,
  searchRef,
  ...rest
}: {
  anchor: HTMLElement | null
  onClose: () => void
  query: string
  onQuery: (next: string) => void
  placeholder?: string
  children: ReactNode
  empty?: ReactNode
  footer?: ReactNode
  onEnter?: () => void
  searchRef?: RefObject<HTMLInputElement | null>
} & Record<string, unknown>) {
  const innerRef = useRef<HTMLInputElement>(null)
  const inputRef = searchRef ?? innerRef
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [inputRef])
  return (
    <DbMenu anchor={anchor} onClose={onClose} footer={footer} {...rest}>
      <label className="db-search-field">
        <SearchMark />
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              onEnter?.()
            }
          }}
        />
      </label>
      <div className="db-search-list">
        {children}
        {empty}
      </div>
    </DbMenu>
  )
}

export function DbSearchOption({
  selected,
  onClick,
  children,
  mark,
}: {
  selected?: boolean
  onClick: () => void
  children: ReactNode
  mark?: ReactNode
}) {
  return (
    <button
      type="button"
      className={`db-search-option${selected ? ' is-selected' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <span className="db-search-option-main">{children}</span>
      {mark}
    </button>
  )
}
