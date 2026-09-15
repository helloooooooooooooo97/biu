import type { SVGProps } from 'react'
import { TrashIcon } from '@heroicons/react/16/solid'

export function TrashGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <TrashIcon aria-hidden className={className ?? 'size-4 shrink-0'} {...props} />
}
