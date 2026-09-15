import { useState } from 'react'
import { Bars3BottomLeftIcon, CheckIcon } from '@heroicons/react/16/solid'
import { HeadlessPopover } from '@biu/public-ui'
import { normalizePageSize, PAGE_SIZES } from './saved-view.ts'

/** 每页条数菜单自己管开合，避免点开时把整张表跟着 setState。 */
export function PagerSizeControl({
  pageSize,
  onChange,
}: {
  pageSize: number
  onChange: (size: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="fsdb-pager-size">
      <HeadlessPopover
        open={open}
        onOpenChange={setOpen}
        side="top"
        align="end"
        trigger={
          <button
            type="button"
            className={`tasks-icon-btn fsdb-pager-size-btn${open ? ' is-active' : ''}`}
            aria-label={`每页 ${pageSize} 条`}
            aria-haspopup="menu"
            aria-expanded={open}
            title={`每页 ${pageSize} 条`}
          >
            <Bars3BottomLeftIcon aria-hidden className="size-[14px]" />
            <span>{pageSize}</span>
          </button>
        }
      >
        <div className="fsdb-pager-size-menu" role="menu">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`fsdb-pager-size-option${size === pageSize ? ' is-active' : ''}`}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                const next = normalizePageSize(size)
                if (next !== pageSize) onChange(next)
              }}
            >
              {size}
              {size === pageSize ? <CheckIcon aria-hidden className="size-[14px]" /> : null}
            </button>
          ))}
        </div>
      </HeadlessPopover>
    </div>
  )
}
