import { TAG_TONES, tagTextColor, tagWashColor } from '@biu/public-ui'

/** 与合集标签相同的色相；文字/涂亮直接用饱和色，不叠黑白墨。 */
export const EDITOR_TONES = TAG_TONES

export { tagTextColor, tagWashColor }

export function editorTextColor(tone: string) {
  return tone
}

export function editorHighlightColor(tone: string) {
  return tone
}

export const TEXT_COLORS = [
  { label: '默认', value: '' },
  ...EDITOR_TONES.map((value) => ({ label: value, value: editorTextColor(value) })),
] as const

export const HIGHLIGHT_COLORS = [
  { label: '无', value: '' },
  ...EDITOR_TONES.map((value) => ({ label: value, value: editorHighlightColor(value) })),
] as const
