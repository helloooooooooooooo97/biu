import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { PickChip } from '@biu/core-pick/web'
import { mentionPickFromAttrs, openMention } from './mention-ref.ts'

export function MentionChipView({ node }: NodeViewProps) {
  const id = String(node.attrs.id ?? '')
  const pick = mentionPickFromAttrs(node.attrs)
  return (
    <NodeViewWrapper
      as="span"
      className="mention"
      data-type="mention"
      data-id={id}
      data-kind={pick.kind}
      contentEditable={false}
      onClick={(event: { preventDefault: () => void; stopPropagation: () => void }) => {
        event.preventDefault()
        event.stopPropagation()
        openMention(id)
      }}
    >
      <PickChip pick={pick} />
    </NodeViewWrapper>
  )
}
