import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PhotoIcon, Square2StackIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessPopover } from '@biu/public-ui'
import { getPick } from '@biu/core-pick/web'
import {
  BANNER_STYLE_IDS,
  BANNER_STYLE_LABEL,
  findBannerPreset,
  presetsOf,
  type BannerStyleId,
} from '../banner-presets.ts'
import {
  bannerSrcDoc,
  parsePageBanner,
  type PageBanner as BannerValue,
  type PageBannerKind,
} from '../page-banner.ts'
import { readJson } from './db-client.ts'

type GalleryItem = {
  id: string
  kind: PageBannerKind
  style: string
  title: string
  html: string
}

function askNewBanner(opts: {
  path?: string
  title?: string
  kind: PageBannerKind
  style?: BannerStyleId
}) {
  const styleName = opts.style ? BANNER_STYLE_LABEL[opts.style] : ''
  const kindName = opts.kind === 'htmlframe' ? '动态' : '静态'
  const path = opts.path?.trim()
  const draft = path
    ? `请为「${opts.title || path}」创建一个新的${styleName}${kindName}顶部背景。用 db_update path=${path}，content 只含 banner:{kind:"${opts.kind}",html}。html 用纯 CSS${opts.kind === 'htmlframe' ? '和脚本' : ''}，不要图片，不要改 content 正文。`
    : `请创建一个新的${styleName}${kindName}顶部 HTML 背景，不要图片。`
  getPick()?.attach(
    path
      ? [
          {
            kind: 'html',
            id: `banner:${path}`,
            action: 'banner',
            path,
            label: `${styleName}${kindName}背景`.trim() || '背景',
            title: opts.title,
            route: typeof window === 'undefined' ? '' : window.location.pathname,
          },
        ]
      : [],
    { text: draft },
  )
}

function askRemixBanner(opts: {
  path?: string
  title?: string
  kind: PageBannerKind
  style?: string
  name: string
  html: string
}) {
  const styleName = opts.style && opts.style in BANNER_STYLE_LABEL ? BANNER_STYLE_LABEL[opts.style as BannerStyleId] : ''
  const kindName = opts.kind === 'htmlframe' ? '动态' : '静态'
  const path = opts.path?.trim()
  const draft = path
    ? `请以「${opts.name}」这个${styleName}${kindName}背景做二创，给「${opts.title || path}」设计自己的内容。保留构图、色彩关系和层次，替换文案与主题。用 db_update path=${path}，content 只含 banner:{kind:"${opts.kind}",html}。html 用纯 CSS${opts.kind === 'htmlframe' ? '和脚本' : ''}，不要图片，不要改 content 正文。参考版式已附在选取里。`
    : `请以「${opts.name}」这个${styleName}${kindName}背景做二创：用同一版式设计自己的内容，保留构图与层次，替换文案与主题，不要图片。参考版式已附在选取里。`
  getPick()?.attach(
    [
      {
        kind: 'html',
        id: `banner-remix:${opts.name}`,
        action: 'banner',
        ...(path ? { path } : {}),
        label: `${opts.name} · 二创`,
        title: opts.title || opts.name,
        text: opts.html,
        route: typeof window === 'undefined' ? '' : window.location.pathname,
      },
    ],
    { text: draft },
  )
}

function BannerRemixBtn({
  kind,
  html,
  name,
  style,
  path,
  title,
}: {
  kind: PageBannerKind
  html: string
  name: string
  style?: string
  path?: string
  title?: string
}) {
  return (
    <button
      type="button"
      className="fsdb-banner-remix"
      data-testid="fsdb-banner-remix"
      aria-label="二创"
      title="二创：用这个版式设计自己的内容"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        askRemixBanner({ path, title, kind, style, name, html })
      }}
    >
      <Square2StackIcon aria-hidden className="size-[12px]" />
      二创
    </button>
  )
}

export function PageBanner({
  value,
  writable,
  path,
  title,
  onChange,
}: {
  value: unknown
  writable?: boolean
  path?: string
  title?: string
  onChange?: (next: BannerValue | null) => void
}) {
  const banner = parsePageBanner(value)
  const story = banner ? findBannerPreset(banner) : null
  if (!banner && !writable) return null
  return (
    <div
      className={`fsdb-page-banner${banner ? '' : ' is-empty'}`}
      data-testid="fsdb-page-banner"
      data-kind={banner?.kind ?? 'empty'}
    >
      {banner ? (
        <iframe
          title="页面背景"
          srcDoc={bannerSrcDoc(banner.html)}
          sandbox={banner.kind === 'htmlframe' ? 'allow-scripts' : ''}
          tabIndex={-1}
        />
      ) : null}
      {story ? (
        <div className="fsdb-banner-story" data-testid="fsdb-banner-story">
          <div className="fsdb-banner-story-head">
            <div className="fsdb-banner-story-title">{story.title}</div>
            {writable && banner ? (
              <BannerRemixBtn
                kind={banner.kind}
                html={banner.html}
                name={story.title}
                style={story.style}
                path={path}
                title={title}
              />
            ) : null}
          </div>
          <div className="fsdb-banner-story-note">{story.note}</div>
        </div>
      ) : null}
      {writable && onChange ? (
        <BannerTitleActions
          value={value}
          writable
          path={path}
          title={title}
          onChange={onChange}
        />
      ) : null}
    </div>
  )
}

export function BannerTitleActions({
  value,
  writable,
  path,
  title,
  onChange,
}: {
  value: unknown
  writable?: boolean
  path?: string
  title?: string
  onChange: (next: BannerValue | null) => void
}) {
  const banner = parsePageBanner(value)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PageBannerKind>(banner?.kind ?? 'html')
  if (!writable) return null
  return (
    <div className="fsdb-banner-title-actions" data-testid="fsdb-banner-title-actions">
      <HeadlessPopover
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        align="start"
        sideOffset={6}
        trigger={
          <button
            type="button"
            className="fsdb-banner-ico"
            data-testid="fsdb-banner-open"
            aria-label="添加背景"
            title="添加背景"
          >
            <PhotoIcon aria-hidden className="size-[14px]" />
            添加背景
          </button>
        }
      >
        <div className="fsdb-banner-pop" role="dialog" aria-label="选择背景" data-testid="fsdb-banner-gallery">
          <BannerGallery
            tab={tab}
            onTab={setTab}
            hasBanner={Boolean(banner)}
            path={path}
            title={title}
            onPick={(next) => {
              onChange(next)
              setOpen(false)
            }}
            onRemove={() => {
              onChange(null)
              setOpen(false)
            }}
          />
        </div>
      </HeadlessPopover>
    </div>
  )
}

function BannerGallery({
  tab,
  onTab,
  hasBanner,
  path,
  title,
  onPick,
  onRemove,
}: {
  tab: PageBannerKind
  onTab: (next: PageBannerKind) => void
  hasBanner: boolean
  path?: string
  title?: string
  onPick: (next: BannerValue) => void
  onRemove: () => void
}) {
  const [mine, setMine] = useState<GalleryItem[]>([])
  const [mineTick, setMineTick] = useState(0)
  const hideTip = useRef(0)
  const [tip, setTip] = useState<{
    title: string
    note: string
    x: number
    y: number
    kind: PageBannerKind
    html: string
    style?: string
  } | null>(null)
  const keepTip = () => {
    window.clearTimeout(hideTip.current)
  }
  const scheduleHideTip = () => {
    window.clearTimeout(hideTip.current)
    hideTip.current = window.setTimeout(() => setTip(null), 180)
  }
  useEffect(() => {
    let cancelled = false
    void readJson<{ items?: GalleryItem[] }>('/api/db/banner-gallery')
      .then((data) => {
        if (!cancelled) setMine(Array.isArray(data.items) ? data.items : [])
      })
      .catch(() => {
        if (!cancelled) setMine([])
      })
    return () => {
      cancelled = true
    }
  }, [tab, mineTick])
  useEffect(() => () => window.clearTimeout(hideTip.current), [])
  const mineOfTab = mine.filter((item) => item.kind === tab)
  return (
    <>
      <div className="fsdb-banner-pop-bar">
        <div className="fsdb-banner-pop-tabs">
          <button type="button" aria-pressed={tab === 'html'} onClick={() => onTab('html')}>
            静态
          </button>
          <button type="button" aria-pressed={tab === 'htmlframe'} onClick={() => onTab('htmlframe')}>
            动态
          </button>
        </div>
        {hasBanner ? (
          <button type="button" className="fsdb-banner-pop-remove" onClick={onRemove}>
            移除
          </button>
        ) : null}
      </div>
      <div className="fsdb-banner-pop-body">
        {BANNER_STYLE_IDS.map((style) => {
          const items = presetsOf(tab).filter((item) => item.style === style)
          return (
            <section key={style} className="fsdb-banner-pop-sec">
              <h3>{BANNER_STYLE_LABEL[style]}</h3>
              <div className="fsdb-banner-pop-grid">
                {items.map((item) => (
                  <BannerThumb
                    key={item.id}
                    kind={item.kind}
                    html={item.html}
                    label={item.title}
                    note={item.note}
                    style={item.style}
                    onHover={setTip}
                    onKeep={keepTip}
                    onLeave={scheduleHideTip}
                    onClick={() => onPick({ kind: item.kind, html: item.html })}
                  />
                ))}
                <button
                  type="button"
                  className="fsdb-banner-create"
                  onClick={() => askNewBanner({ path, title, kind: tab, style })}
                >
                  创建新背景
                </button>
              </div>
            </section>
          )
        })}
        <section className="fsdb-banner-pop-sec">
          <h3>我的</h3>
          <div className="fsdb-banner-pop-grid">
            {mineOfTab.map((item) => (
              <div key={item.id} className="fsdb-banner-mine">
                <BannerThumb
                  kind={item.kind}
                  html={item.html}
                  label={item.title}
                  style={item.style}
                  onHover={setTip}
                  onKeep={keepTip}
                  onLeave={scheduleHideTip}
                  onClick={() => onPick({ kind: item.kind, html: item.html })}
                />
                <button
                  type="button"
                  className="fsdb-banner-mine-del"
                  data-testid="fsdb-banner-mine-del"
                  aria-label="删除背景"
                  title="删除"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void readJson<{ ok?: boolean }>('/api/db/banner-gallery', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ id: item.id }),
                    }).then(() => {
                      setMine((prev) => prev.filter((entry) => entry.id !== item.id))
                      setMineTick((n) => n + 1)
                    })
                  }}
                >
                  <XMarkIcon aria-hidden className="size-[12px]" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="fsdb-banner-create"
              onClick={() => askNewBanner({ path, title, kind: tab })}
            >
              创建新背景
            </button>
          </div>
        </section>
      </div>
        {tip
          ? createPortal(
              <div
                className="fsdb-banner-fly"
                style={{ left: tip.x, top: tip.y }}
                role="tooltip"
                onMouseEnter={keepTip}
                onMouseLeave={scheduleHideTip}
              >
                <div className="fsdb-banner-fly-head">
                  <div className="fsdb-banner-fly-title">{tip.title}</div>
                  <BannerRemixBtn
                    kind={tip.kind}
                    html={tip.html}
                    name={tip.title}
                    style={tip.style}
                    path={path}
                    title={title}
                  />
                </div>
                {tip.note ? <div className="fsdb-banner-fly-note">{tip.note}</div> : null}
              </div>,
              document.body,
            )
          : null}
    </>
  )
}

function BannerThumb({
  kind,
  html,
  label,
  note,
  style,
  onHover,
  onKeep,
  onLeave,
  onClick,
}: {
  kind: PageBannerKind
  html: string
  label: string
  note?: string
  style?: string
  onHover?: (next: {
    title: string
    note: string
    x: number
    y: number
    kind: PageBannerKind
    html: string
    style?: string
  }) => void
  onKeep?: () => void
  onLeave?: () => void
  onClick: () => void
}) {
  const src = useMemo(() => bannerSrcDoc(html), [html])
  const show = (el: HTMLElement) => {
    const box = el.getBoundingClientRect()
    onKeep?.()
    onHover?.({
      title: label,
      note: note ?? '',
      x: box.left + box.width / 2,
      y: box.top,
      kind,
      html,
      style,
    })
  }
  return (
    <button
      type="button"
      className="fsdb-banner-card"
      onClick={onClick}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => onLeave?.()}
    >
      <span className="fsdb-banner-thumb">
        <iframe title={label} srcDoc={src} sandbox={kind === 'htmlframe' ? 'allow-scripts' : ''} tabIndex={-1} />
      </span>
      <span className="fsdb-banner-caption">{label}</span>
    </button>
  )
}
