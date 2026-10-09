export const WEAPONS = [
  { id: 'pulse', name: '速射', color: '#7dd3fc', hint: '机关枪' },
  { id: 'scatter', name: '霰弹', color: '#fbbf24', hint: '近距打爆' },
  { id: 'beam', name: '激光', color: '#fb7185', hint: '贯穿灼烧' },
  { id: 'orbit', name: '环刃', color: '#c4b5fd', hint: '贴身旋斩' },
  { id: 'seek', name: '飞弹', color: '#86efac', hint: '自动追踪' },
  { id: 'mine', name: '地雷', color: '#f97316', hint: '脚下埋雷' },
  { id: 'chain', name: '雷链', color: '#67e8f9', hint: '弹跳电击' },
  { id: 'disc', name: '回旋', color: '#a3e635', hint: '去了还回来' },
  { id: 'well', name: '黑洞', color: '#818cf8', hint: '吸怪再炸' },
  { id: 'rocket', name: '火箭', color: '#fb923c', hint: '范围爆伤' },
  { id: 'frost', name: '冰锥', color: '#bae6fd', hint: '减速穿刺' },
  { id: 'breath', name: '龙息', color: '#f43f5e', hint: '锥形火海' },
] as const

export type WeaponId = (typeof WEAPONS)[number]['id']
