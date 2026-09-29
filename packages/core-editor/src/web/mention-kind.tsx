import { PickKindGlyph } from '@biu/core-pick/web'

export type MentionKind = 'page' | 'task' | 'facet' | 'session'

const PAGE_PATH = 'M2.5 3.5A1.5 1.5 0 0 1 4 2h4.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9Z'
const TASK_PATH = 'M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z'
const FACET_PATH = 'M5 3.5A1.5 1.5 0 0 1 6.5 2h3A1.5 1.5 0 0 1 11 3.5H5ZM4.5 5A1.5 1.5 0 0 0 3 6.5v.041a3.02 3.02 0 0 1 .5-.041h9c.17 0 .337.014.5.041V6.5A1.5 1.5 0 0 0 11.5 5h-7ZM12.5 8h-9A1.5 1.5 0 0 0 2 9.5v3A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-3A1.5 1.5 0 0 0 12.5 8Z'
const SESSION_PATH = 'M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.351a.75.75 0 0 0 1.28.53l2.51-2.51c.182-.181.427-.286.684-.294a44.298 44.298 0 0 0 3.837-.293C14.287 10.565 15 9.723 15 8.74V4.26c0-.983-.713-1.825-1.69-1.943a44.447 44.447 0 0 0-10.62 0C1.712 2.435 1 3.277 1 4.26v4.482Z'

export function MentionKindGlyph({ kind }: { kind: MentionKind }) {
  return <PickKindGlyph kind={kind} />
}

function pathNode(d: string, evenodd = false) {
  return evenodd
    ? (['path', { d, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' }] as const)
    : (['path', { d }] as const)
}

export function mentionIconSpec(kind: MentionKind) {
  const attrs = {
    class: 'pick-kind-icon mention-icon',
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    width: '12',
    height: '12',
    'aria-hidden': 'true',
    'data-mention-kind': kind,
  }
  if (kind === 'task') return ['svg', attrs, pathNode(TASK_PATH, true)] as const
  if (kind === 'facet') return ['svg', attrs, pathNode(FACET_PATH)] as const
  if (kind === 'session') return ['svg', attrs, pathNode(SESSION_PATH)] as const
  return ['svg', attrs, pathNode(PAGE_PATH)] as const
}
