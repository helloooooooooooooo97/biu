import { useCallback } from 'react'
import type { SlotEntry, SlotKind } from '@biu/type-slots'
import { RenderBoundary } from '@biu/public-ui'
import type { SlotsService } from './service.ts'
import { useSlotEntries } from './use-slots.ts'

function SlotEntryView({ slots, entry }: { slots: SlotsService; entry: SlotEntry }) {
  // props() 须返回稳定对象；renderSlot 稳定后 memo 子树才不会在路由切换时被打穿
  const extra = entry.props?.() ?? {}
  const renderSlot = useCallback(
    (name: string, options?: { kind?: SlotKind }) => <SlotOutlet slots={slots} name={name} kind={options?.kind} />,
    [slots],
  )
  return <entry.Component {...extra} renderSlot={renderSlot} />
}

/** 按缝名挂已登记组件，并注入 renderSlot。会话详情与壳共用，避免把 slot 组件当普通 props 散装。 */
export function SlotOutlet({ slots, name, kind }: { slots: SlotsService; name: string; kind?: SlotKind }) {
  const entries = useSlotEntries(slots, name)
  const resolved = slots.specOf(name)?.kind ?? kind ?? 'list'
  const visible =
    resolved === 'single'
      ? entries.slice(0, 1)
      : [...entries].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return (
    <>
      {visible.map((entry) => (
        // 圈在 SlotEntryView 外面：entry.props?.() 也是在渲染里调的，
        // 放里面的话它自己抛错就没人接了。一个缝崩掉不该带走整个界面。
        <RenderBoundary key={entry.id} label={`${name}/${entry.id}`}>
          <SlotEntryView slots={slots} entry={entry} />
        </RenderBoundary>
      ))}
    </>
  )
}
