import type { PickRef } from './types.ts'

export type ObjectHit = { el: HTMLElement; ref: PickRef }

/** Hover already named an inner html node; a click must not replace it with the block text. */
export function isHtmlObjectPick(ref: PickRef | null | undefined): ref is PickRef {
  return ref?.kind === 'html'
}

/**
 * pointerup 写入哪些 pick。
 * 高亮用的是 pointermove 的对象命中；松手时 ProseMirror 常把整块 html 收成正文选区，
 * 不能让这段选区盖掉已经感知到的内部节点。
 */
export function picksOnPointerUp(input: {
  boxed?: boolean
  boxHits?: PickRef[]
  hover: ObjectHit | null
  point: ObjectHit | null
  text: PickRef | null
}): PickRef[] {
  if (input.boxed) return input.boxHits ?? []
  const object = input.hover ?? input.point
  if (isHtmlObjectPick(object?.ref)) return [object.ref]
  if (input.text) return [input.text]
  if (object) return [object.ref]
  return []
}
