import type { ReactNode } from 'react'

const STYLE_ID = 'biu-public-ui-tag-chip'
const CSS = `
.biu-tag-wrap{border:0;background:transparent;padding:0;cursor:pointer;font:inherit}
.biu-tags{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0;max-width:100%}
.biu-tag{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:4px;font-size:13px;font-weight:400;line-height:20px;background:color-mix(in srgb,var(--biu-tag,#5b9fd6) 38%,transparent);color:var(--dsw-tag-ink,#2c2c2b);max-width:160px}
.biu-tag.is-btn{cursor:pointer}
.biu-tag.is-on{background:color-mix(in srgb,var(--biu-tag,#5b9fd6) 34%,transparent)}
.biu-tag-icon{display:inline-flex;width:12px;height:12px;flex:none;align-items:center;justify-content:center}
.biu-tag-icon svg{width:12px;height:12px;display:block}
.biu-tag-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.biu-tag-x{border:0;background:transparent;padding:0;margin:0;color:inherit;opacity:.55;cursor:pointer;display:inline-flex;line-height:0}
.biu-tag-x:hover{opacity:1}
`

export const TAG_TONES = ['#5b9fd6', '#9a6dd7', '#d9730d', '#448361', '#c4554d', '#e255a1', '#c2920a', '#787774'] as const
/** 日间叠在近黑墨上，夜间叠在纯白上；少掺色相。 */
export const TAG_INK_BASE = 'var(--dsw-tag-ink, #2c2c2b)'

export function tagTextColor(tone: string, strength = 8) {
  return `color-mix(in srgb, ${tone} ${strength}%, ${TAG_INK_BASE})`
}

/** 浅底仍叠在透明上，不改成白色色块。 */
export function tagWashColor(tone: string, strength = 22) {
  return `color-mix(in srgb, ${tone} ${strength}%, transparent)`
}

/** 分面色板里的玫红。 */
export const TAG_TONE_ROSE = '#e255a1' as const
export const TAG_TONE_BLUE = '#5b9fd6' as const
export const TAG_TONE_ORANGE = '#d9730d' as const
export const TAG_TONE_GREEN = '#448361' as const
export const TAG_TONE_RED = '#c4554d' as const

export function tagTone(id: string) {
  let hash = 0
  const key = String(id ?? '')
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  return TAG_TONES[hash % TAG_TONES.length]!
}

export function ensureTagChipStyle() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== CSS) style.textContent = CSS
}

export function TagChipCloseMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
    </svg>
  )
}

export function TagChip({
  id,
  label,
  onRemove,
  onClick,
  active,
  icon,
}: {
  id: string
  label: string
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
  icon?: ReactNode
}) {
  ensureTagChipStyle()
  const chip = (
    <span
      className={`biu-tag${active ? ' is-on' : ''}${onClick ? ' is-btn' : ''}`}
      style={{ ['--biu-tag' as string]: tagTone(id) }}
      title={label}
    >
      {icon ? <span className="biu-tag-icon">{icon}</span> : null}
      <span className="biu-tag-label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="biu-tag-x"
          aria-label={`移除 ${label}`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <TagChipCloseMark />
        </button>
      ) : null}
    </span>
  )
  if (!onClick) return chip
  return (
    <button type="button" className="biu-tag-wrap" onClick={onClick}>
      {chip}
    </button>
  )
}

export function TagChips({ children }: { children: ReactNode }) {
  ensureTagChipStyle()
  return <span className="biu-tags">{children}</span>
}
