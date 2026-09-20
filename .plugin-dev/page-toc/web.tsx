import { headingElById, headingsFromPage, pageRootFrom, sameTocItems, type TocHeading } from './outline.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-toc'
export const inject = ['pageEditor']

const STYLE_ID = 'page-toc-style-v1'
const STYLE_CSS = `
.page-toc{
  border:1px solid var(--dsw-border);
  border-radius:12px;
  background:var(--dsw-bg);
  color:var(--dsw-label);
  font:13px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif;
  padding:12px 14px 10px;
}
.page-toc-kicker{
  margin:0 0 8px;
  font-size:11px;
  font-weight:650;
  letter-spacing:.06em;
  color:var(--dsw-label-3);
}
.page-toc-list{margin:0;padding:0;list-style:none}
.page-toc-empty{margin:0;color:var(--dsw-label-3);font-size:12px}
.page-toc-item{margin:0}
.page-toc-link{
  display:block;
  width:100%;
  box-sizing:border-box;
  border:0;
  border-radius:6px;
  padding:4px 8px;
  background:transparent;
  color:inherit;
  font:inherit;
  text-align:left;
  cursor:pointer;
}
.page-toc-link:hover{background:var(--dsw-hover)}
.page-toc-l2{padding-left:20px}
.page-toc-l3{padding-left:32px}
`

function useTocStyle() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = STYLE_CSS
    document.head.appendChild(el)
  }, [])
}

function TocCard(props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  useTocStyle()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [items, setItems] = useState<TocHeading[]>([])
  const title = typeof props.data.title === 'string' && props.data.title.trim() ? props.data.title.trim() : '目录'

  useEffect(() => {
    const host = hostRef.current
    const scan = () => {
      const root = pageRootFrom(host)
      const next = root ? headingsFromPage(root, host) : []
      setItems((prev) => (sameTocItems(prev, next) ? prev : next))
    }
    scan()
    const root = pageRootFrom(host)
    if (!root || typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(scan)
    mo.observe(root, { subtree: true, childList: true, characterData: true })
    return () => mo.disconnect()
  }, [])

  const jump = (id: string) => {
    const host = hostRef.current
    const root = pageRootFrom(host)
    const el = root ? headingElById(root, id, host) : null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div ref={hostRef} className="page-toc" data-testid="page-toc">
      <p className="page-toc-kicker">{title}</p>
      {items.length === 0 ? (
        <p className="page-toc-empty">暂无标题</p>
      ) : (
        <ul className="page-toc-list">
          {items.map((item) => (
            <li key={item.id} className="page-toc-item">
              <button
                type="button"
                className={`page-toc-link page-toc-l${item.level}`}
                onClick={() => jump(item.id)}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown>
      assets?: unknown[]
      View: (props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'toc',
    plugin: name,
    label: '目录',
    blockType: 'basic',
    hint: '当前页标题列表，点击跳转；建议放在文首',
    aliases: ['目录', '大纲', 'toc', 'outline'],
    assets: [],
    defaults: { title: '目录' },
    View: TocCard,
  })
}
