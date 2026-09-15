import type { SVGProps } from 'react'

/** Git-style fork: three nodes, not the share glyph. */
export function ForkGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className ?? 'size-3.5 shrink-0'}
      {...props}
    >
      <path d="M4.75 1.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5ZM4.75 11a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5ZM11.25 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5ZM4 5.75a.75.75 0 0 1 1.5 0v4.5A.75.75 0 0 1 4 10.25v-4.5Zm1.5 2.25h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z" />
    </svg>
  )
}
