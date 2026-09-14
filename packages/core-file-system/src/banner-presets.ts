import type { PageBanner, PageBannerKind } from './page-banner.ts'

export const BANNER_STYLE_IDS = ['jp', 'us', 'eu', 'cn'] as const
export type BannerStyleId = (typeof BANNER_STYLE_IDS)[number]

export const BANNER_STYLE_LABEL: Record<BannerStyleId, string> = {
  jp: '日式',
  us: '美式',
  eu: '欧式',
  cn: '中式',
}

export type BannerPreset = {
  id: string
  kind: PageBannerKind
  style: BannerStyleId
  title: string
  note: string
  html: string
}

const box = (css: string, inner: string) =>
  `<div style="box-sizing:border-box;height:100%;max-height:100%;width:100%;overflow:hidden;position:relative;${css}">${inner}</div>`

type JpLayout = 'ma' | 'woodblock' | 'pattern' | 'craft' | 'symbol' | 'geometry' | 'cosmos' | 'collage' | 'vertical'

/** 日式不是一套“和风皮肤”：余白、木版、纹样、民艺、战后海报各用自己的构成。 */
function jpCopy(kicker: string, name: string, thought: string, extra = '', layout: JpLayout = 'ma') {
  const shell = 'position:relative;z-index:1;box-sizing:border-box;height:100%;max-height:100%;overflow:hidden;'
  if (layout === 'woodblock') return `<div style="${shell}${extra}"><div style="position:absolute;right:28px;top:18px;writing-mode:vertical-rl;background:#f2dfb8;color:#1a120e;padding:8px 6px;font:700 24px/1 'Yu Mincho','Songti SC',serif;letter-spacing:.16em">${name}</div><div style="position:absolute;left:26px;bottom:20px;max-width:38%;border-left:4px solid currentColor;padding-left:9px;font:700 10px/1.55 ui-sans-serif,sans-serif">${thought}</div><div style="position:absolute;left:26px;top:20px;font:800 9px/1 ui-sans-serif,sans-serif;letter-spacing:.28em">${kicker}</div></div>`
  if (layout === 'pattern') return `<div style="${shell}display:grid;place-items:center;${extra}"><div style="width:120px;height:120px;border-radius:50%;display:grid;place-items:center;background:rgba(8,20,24,.72);border:1px solid currentColor;text-align:center"><div><div style="font:600 25px/1 'Yu Mincho','Songti SC',serif;letter-spacing:.16em">${name}</div><div style="margin-top:8px;font:700 8px/1 ui-sans-serif,sans-serif;letter-spacing:.24em">${kicker}</div></div></div><div style="position:absolute;right:22px;bottom:18px;width:31%;font:500 9px/1.55 ui-sans-serif,sans-serif;text-align:right">${thought}</div></div>`
  if (layout === 'craft') return `<div style="${shell}display:flex;align-items:stretch;padding:18px 24px;${extra}"><div style="width:34%;border-right:1px solid currentColor;display:flex;align-items:flex-end;padding:0 18px 3px 0;font:600 28px/1 'Yu Mincho','Songti SC',serif">${name}</div><div style="display:flex;flex:1;flex-direction:column;justify-content:space-between;padding-left:18px"><div style="font:700 9px/1 ui-monospace,monospace;letter-spacing:.2em">${kicker}</div><div style="max-width:260px;font:500 11px/1.65 'Yu Mincho','Songti SC',serif">${thought}</div></div></div>`
  if (layout === 'symbol') return `<div style="${shell}${extra}"><div style="position:absolute;left:24px;top:18px;font:700 9px/1 Helvetica,Arial,sans-serif;letter-spacing:.3em">${kicker}</div><div style="position:absolute;right:25px;bottom:18px;text-align:right"><div style="font:800 31px/.9 Helvetica,Arial,sans-serif;letter-spacing:-.06em">${name}</div><div style="width:180px;margin-top:7px;font:500 9px/1.45 Helvetica,Arial,sans-serif">${thought}</div></div></div>`
  if (layout === 'geometry') return `<div style="${shell}display:grid;grid-template-columns:1fr 1fr;${extra}"><div style="align-self:end;padding:16px 20px;color:#fff;mix-blend-mode:difference"><div style="font:800 9px/1 Helvetica,Arial,sans-serif;letter-spacing:.24em">${kicker}</div><div style="margin-top:4px;font:700 27px/.95 'Yu Gothic',sans-serif">${name}</div></div><div style="align-self:start;padding:18px 20px;font:600 10px/1.5 'Yu Gothic',sans-serif">${thought}</div></div>`
  if (layout === 'cosmos') return `<div style="${shell}display:grid;place-items:center;${extra}"><div style="text-align:center;text-shadow:0 1px 14px #000"><div style="font:500 9px/1 ui-sans-serif,sans-serif;letter-spacing:.42em">${kicker}</div><div style="margin-top:7px;font:600 24px/1 'Yu Mincho','Songti SC',serif;letter-spacing:.2em">${name}</div><div style="max-width:270px;margin-top:9px;font:500 9px/1.6 ui-sans-serif,sans-serif">${thought}</div></div></div>`
  if (layout === 'collage') return `<div style="${shell}${extra}"><div style="position:absolute;left:6%;top:13%;font:900 clamp(38px,7vw,76px)/.8 Impact,sans-serif;transform:rotate(-7deg);text-shadow:4px 4px 0 #111">${name}</div><div style="position:absolute;right:6%;top:18px;background:#ffe48a;color:#2a0830;padding:4px 8px;font:900 9px/1 sans-serif;letter-spacing:.2em;transform:rotate(3deg)">${kicker}</div><div style="position:absolute;right:7%;bottom:16px;width:34%;background:#111;color:#fff;padding:7px 9px;font:700 9px/1.4 sans-serif;transform:rotate(-2deg)">${thought}</div></div>`
  if (layout === 'vertical') return `<div style="${shell}${extra}"><div style="position:absolute;right:42px;top:18px;bottom:18px;writing-mode:vertical-rl;font:600 28px/1 'Yu Mincho','Songti SC',serif;letter-spacing:.18em">${name}</div><div style="position:absolute;right:92px;top:20px;max-height:150px;writing-mode:vertical-rl;font:500 10px/1.7 'Yu Mincho','Songti SC',serif;letter-spacing:.08em">${thought}</div><div style="position:absolute;left:24px;bottom:18px;font:700 9px/1 sans-serif;letter-spacing:.3em">${kicker}</div></div>`
  return `<div style="${shell}padding:18px 26px;${extra}"><div style="font:700 9px/1.2 ui-sans-serif,sans-serif;letter-spacing:.34em;opacity:.65">${kicker}</div><div style="position:absolute;left:26px;bottom:18px;width:min(40%,26rem);border-top:1px solid currentColor;padding-top:8px"><div style="font:600 24px/1.05 'Yu Mincho','Songti SC',serif;letter-spacing:.12em">${name}</div><div style="margin-top:7px;font:500 10px/1.55 ui-sans-serif,sans-serif;opacity:.72">${thought}</div></div></div>`
}

type UsLayout = 'idea' | 'cut' | 'ligature' | 'system' | 'street' | 'digital' | 'deconstruct' | 'punk' | 'lab'

/** 美式从企业现代主义到街头、数字新浪潮、朋克，每一支的尺度与阅读秩序都不同。 */
function usCopy(kicker: string, name: string, thought: string, extra = '', layout: UsLayout = 'idea') {
  const shell = 'position:relative;z-index:1;box-sizing:border-box;height:100%;max-height:100%;overflow:hidden;font-family:Helvetica,Arial,sans-serif;'
  if (layout === 'cut') return `<div style="${shell}${extra}"><div style="position:absolute;right:18px;top:14px;font:900 9px/1 sans-serif;letter-spacing:.25em">${kicker}</div><div style="position:absolute;left:30%;bottom:12px;font:900 clamp(38px,6vw,72px)/.72 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;transform:rotate(-7deg)">${name}</div><div style="position:absolute;right:18px;bottom:16px;width:24%;font:700 9px/1.35 sans-serif">${thought}</div></div>`
  if (layout === 'ligature') return `<div style="${shell}display:grid;place-items:center;${extra}"><div style="font:900 clamp(42px,8vw,94px)/.68 'Arial Narrow',Helvetica,sans-serif;letter-spacing:-.105em;text-align:center">${name}</div><div style="position:absolute;left:18px;top:14px;font:800 9px/1 sans-serif;letter-spacing:.18em">${kicker}</div><div style="position:absolute;left:18px;bottom:14px;max-width:270px;font:600 10px/1.35 sans-serif">${thought}</div></div>`
  if (layout === 'system') return `<div style="${shell}display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(4,1fr);padding:14px 18px;gap:7px;${extra}"><div style="grid-column:1/3;font:800 8px/1 sans-serif;letter-spacing:.15em">${kicker}</div><div style="grid-column:5/9;grid-row:2/4;font:800 29px/.9 sans-serif;letter-spacing:-.05em">${name}</div><div style="grid-column:5/8;grid-row:4;font:600 9px/1.45 sans-serif">${thought}</div></div>`
  if (layout === 'street') return `<div style="${shell}${extra}"><div style="position:absolute;left:12px;top:15px;font:900 clamp(42px,8vw,92px)/.62 Impact,'Arial Narrow',sans-serif;letter-spacing:-.03em;text-transform:uppercase;transform:scaleX(.72);transform-origin:left top">${name}<br>${name}</div><div style="position:absolute;right:14px;top:14px;writing-mode:vertical-rl;font:900 9px/1 sans-serif;letter-spacing:.18em">${kicker}</div><div style="position:absolute;right:20px;bottom:15px;width:30%;font:800 10px/1.25 sans-serif;text-align:right">${thought}</div></div>`
  if (layout === 'digital') return `<div style="${shell}${extra}"><div style="position:absolute;left:7%;top:13%;font:300 clamp(36px,7vw,80px)/.82 Helvetica,sans-serif;letter-spacing:-.08em;transform:rotate(-5deg)">${name}</div><div style="position:absolute;right:5%;top:18%;font:700 9px/1 ui-monospace,monospace;letter-spacing:.26em;color:#ff5ccb">${kicker}</div><div style="position:absolute;left:44%;bottom:16px;width:40%;border:1px solid currentColor;padding:8px;font:500 9px/1.5 ui-monospace,monospace">${thought}</div></div>`
  if (layout === 'deconstruct') return `<div style="${shell}${extra}"><div style="position:absolute;left:8%;top:18%;font:900 31px/.85 sans-serif;letter-spacing:.2em;transform:rotate(-10deg)">${name}</div><div style="position:absolute;right:9%;top:19%;font:700 9px/1 sans-serif;letter-spacing:.5em;transform:rotate(90deg)">${kicker}</div><div style="position:absolute;left:37%;bottom:16px;width:42%;font:600 10px/1.25 serif;transform:rotate(3deg)">${thought}</div></div>`
  if (layout === 'punk') return `<div style="${shell}${extra}"><div style="position:absolute;left:-1%;top:13%;font:900 clamp(48px,9vw,104px)/.65 Impact,sans-serif;letter-spacing:-.09em;transform:skewX(-18deg) rotate(-4deg);text-transform:uppercase">${name}</div><div style="position:absolute;left:5%;bottom:15px;background:#eee;color:#111;padding:3px 7px;font:800 9px/1 ui-monospace,monospace;transform:rotate(2deg)">${kicker}</div><div style="position:absolute;right:5%;bottom:14px;width:26%;font:700 9px/1.25 sans-serif">${thought}</div></div>`
  if (layout === 'lab') return `<div style="${shell}display:grid;grid-template-columns:1fr 2fr;${extra}"><div style="border-right:9px solid currentColor;padding:16px 10px;writing-mode:vertical-rl;font:900 9px/1 ui-monospace,monospace;letter-spacing:.22em">${kicker}</div><div style="display:flex;flex-direction:column;justify-content:space-between;padding:14px 18px"><div style="font:900 clamp(34px,6vw,68px)/.78 ui-monospace,monospace;letter-spacing:-.08em">${name}</div><div style="max-width:280px;font:600 10px/1.4 ui-monospace,monospace">${thought}</div></div></div>`
  return `<div style="${shell}display:grid;grid-template-columns:1.25fr .75fr;grid-template-rows:auto 1fr auto;padding:14px 18px;${extra}"><div style="grid-column:1/-1;border-top:5px solid currentColor;padding-top:5px;font:900 9px/1 sans-serif;letter-spacing:.16em">${kicker}</div><div style="align-self:end;font:900 clamp(32px,6vw,70px)/.74 Impact,'Arial Narrow',sans-serif;letter-spacing:-.05em;text-transform:uppercase">${name}</div><div style="grid-column:2;align-self:end;border-left:2px solid currentColor;padding-left:10px;font:700 10px/1.35 sans-serif">${thought}</div></div>`
}

type EuLayout = 'newtype' | 'swiss' | 'construct' | 'deco' | 'newwave' | 'memphis' | 'futurism' | 'editorial'

/** 欧式各运动不是“统一瑞士网格”：秩序、力场、装饰、反网格分别建模。 */
function euCopy(kicker: string, name: string, thought: string, extra = '', layout: EuLayout = 'newtype') {
  const shell = 'position:relative;z-index:1;box-sizing:border-box;height:100%;max-height:100%;overflow:hidden;font-family:Helvetica,Arial,sans-serif;'
  if (layout === 'swiss') return `<div style="${shell}display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:repeat(5,1fr);gap:8px;padding:15px 20px;${extra}"><div style="grid-column:1/4;border-top:2px solid;padding-top:4px;font:700 8px/1 sans-serif">01—04</div><div style="grid-column:5/12;border-top:2px solid;padding-top:4px;font:700 9px/1 sans-serif;letter-spacing:.14em">${kicker}</div><div style="grid-column:5/13;grid-row:3/5;font:700 clamp(30px,5vw,58px)/.82 sans-serif;letter-spacing:-.055em">${name}</div><div style="grid-column:5/9;grid-row:5;font:500 9px/1.45 sans-serif">${thought}</div></div>`
  if (layout === 'construct') return `<div style="${shell}${extra}"><div style="position:absolute;left:26%;top:7%;font:900 clamp(35px,6vw,70px)/.8 sans-serif;text-transform:uppercase;transform:rotate(-18deg);transform-origin:left center">${name}</div><div style="position:absolute;right:10%;bottom:12px;width:36%;border-top:5px solid;padding-top:5px;font:700 10px/1.25 sans-serif;transform:rotate(-3deg)">${thought}</div><div style="position:absolute;left:18px;bottom:14px;font:800 9px/1 sans-serif;letter-spacing:.22em">${kicker}</div></div>`
  if (layout === 'deco') return `<div style="${shell}display:grid;place-items:center;text-align:center;${extra}"><div style="border:1px solid currentColor;padding:12px 30px;clip-path:polygon(8% 0,92% 0,100% 50%,92% 100%,8% 100%,0 50%)"><div style="font:500 9px/1 Georgia,serif;letter-spacing:.38em">${kicker}</div><div style="margin-top:5px;font:500 30px/.95 'Times New Roman',serif;letter-spacing:.14em;text-transform:uppercase">${name}</div><div style="max-width:260px;margin-top:8px;font:500 9px/1.35 Georgia,serif">${thought}</div></div></div>`
  if (layout === 'newwave') return `<div style="${shell}${extra}"><div style="position:absolute;left:7%;top:24%;font:800 clamp(30px,5vw,58px)/.8 sans-serif;letter-spacing:.34em;transform:rotate(-11deg) scaleY(1.4)">${name}</div><div style="position:absolute;right:5%;top:15px;font:700 8px/1 ui-monospace,monospace;letter-spacing:.6em">${kicker}</div><div style="position:absolute;left:48%;bottom:14px;width:38%;font:500 9px/1.5 ui-monospace,monospace;transform:rotate(4deg)">${thought}</div></div>`
  if (layout === 'memphis') return `<div style="${shell}${extra}"><div style="position:absolute;left:7%;top:18%;font:900 clamp(33px,6vw,66px)/.8 sans-serif;letter-spacing:-.06em;transform:rotate(-5deg)">${name}</div><div style="position:absolute;right:7%;top:15px;border:3px solid;padding:4px 7px;font:900 8px/1 sans-serif;letter-spacing:.2em;transform:rotate(7deg)">${kicker}</div><div style="position:absolute;right:7%;bottom:15px;width:31%;font:700 10px/1.3 sans-serif">${thought}</div></div>`
  if (layout === 'futurism') return `<div style="${shell}${extra}"><div style="position:absolute;left:5%;top:12%;font:900 clamp(42px,8vw,90px)/.65 Impact,sans-serif;letter-spacing:-.04em;transform:skewX(-23deg);text-transform:uppercase">${name}!</div><div style="position:absolute;left:42%;top:18px;font:900 9px/1 sans-serif;letter-spacing:.3em;transform:rotate(-8deg)">${kicker}</div><div style="position:absolute;right:5%;bottom:12px;width:36%;font:700 10px/1.15 sans-serif;transform:rotate(-6deg)">${thought}</div></div>`
  if (layout === 'editorial') return `<div style="${shell}display:grid;grid-template-columns:2fr 1fr;grid-template-rows:auto 1fr;${extra}"><div style="grid-row:1/3;background:#ff3d8d;padding:14px 18px;display:flex;flex-direction:column;justify-content:space-between"><div style="font:800 9px/1 sans-serif;letter-spacing:.2em">${kicker}</div><div style="font:900 clamp(35px,6vw,70px)/.72 'Arial Narrow',sans-serif;text-transform:uppercase">${name}</div></div><div style="padding:16px;font:700 10px/1.4 sans-serif">${thought}</div></div>`
  return `<div style="${shell}display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:auto 1fr auto;gap:8px;padding:16px 22px;${extra}"><div style="grid-column:1/4;border-top:2px solid;padding-top:5px;font:700 8px/1 sans-serif">1928</div><div style="grid-column:5/13;border-top:2px solid;padding-top:5px;font:700 9px/1 sans-serif;letter-spacing:.16em">${kicker}</div><div style="grid-column:5/13;align-self:end;font:700 clamp(26px,4vw,50px)/.9 sans-serif;letter-spacing:-.04em">${name}</div><div style="grid-column:5/9;font:500 10px/1.45 sans-serif">${thought}</div></div>`
}

type CnLayout = 'book' | 'void' | 'calendar' | 'propaganda' | 'seal' | 'ink' | 'retail' | 'lattice'

/** 中式依据印本、月份牌、宣传画、文人水墨和香港现代设计分别构成。 */
function cnCopy(kicker: string, name: string, thought: string, extra = '', layout: CnLayout = 'book') {
  const shell = `position:relative;z-index:1;box-sizing:border-box;height:100%;max-height:100%;overflow:hidden;font-family:'Songti SC','STSong','Noto Serif CJK SC',serif;`
  if (layout === 'void') return `<div style="${shell}${extra}"><div style="position:absolute;left:11%;top:18%;writing-mode:vertical-rl;font:600 28px/1 serif;letter-spacing:.2em">${name}</div><div style="position:absolute;left:calc(11% + 48px);top:20%;max-height:120px;writing-mode:vertical-rl;font:500 10px/1.8 serif;letter-spacing:.08em">${thought}</div><div style="position:absolute;right:24px;bottom:18px;font:600 9px/1 serif;letter-spacing:.3em">${kicker}</div></div>`
  if (layout === 'calendar') return `<div style="${shell}display:grid;grid-template-columns:1fr 1.6fr 1fr;grid-template-rows:auto 1fr auto;padding:22px 32px;${extra}"><div style="grid-column:1/-1;text-align:center;font:700 9px/1 serif;letter-spacing:.36em">${kicker}</div><div style="grid-column:2;align-self:end;text-align:center;font:700 30px/1 serif;letter-spacing:.2em">${name}</div><div style="grid-column:1/-1;border-top:3px double currentColor;padding-top:5px;text-align:center;font:500 10px/1.35 serif">${thought}</div></div>`
  if (layout === 'propaganda') return `<div style="${shell}${extra}"><div style="position:absolute;left:4%;top:10%;font:900 clamp(46px,9vw,100px)/.68 'Heiti SC','Microsoft YaHei',sans-serif;letter-spacing:-.08em;transform:skewX(-9deg)">${name}</div><div style="position:absolute;right:5%;top:18px;font:900 10px/1 sans-serif;letter-spacing:.2em">${kicker}</div><div style="position:absolute;right:5%;bottom:12px;width:38%;font:800 11px/1.3 'Heiti SC',sans-serif;text-align:right">${thought}</div></div>`
  if (layout === 'seal') return `<div style="${shell}display:grid;grid-template-columns:1fr 1fr;${extra}"><div style="display:grid;place-items:center"><div style="width:96px;height:96px;border:4px double currentColor;display:grid;place-items:center;font:800 35px/1 serif">${name}</div></div><div style="display:flex;flex-direction:row-reverse;justify-content:center;gap:15px;padding:20px"><div style="writing-mode:vertical-rl;font:700 10px/1.6 serif;letter-spacing:.15em">${kicker}</div><div style="writing-mode:vertical-rl;font:500 10px/1.7 serif;letter-spacing:.08em">${thought}</div></div></div>`
  if (layout === 'ink') return `<div style="${shell}${extra}"><div style="position:absolute;right:8%;top:17%;writing-mode:vertical-rl;font:500 31px/1 'STKaiti','KaiTi',serif;letter-spacing:.2em">${name}</div><div style="position:absolute;right:calc(8% + 54px);top:19%;max-height:122px;writing-mode:vertical-rl;font:500 10px/1.8 serif">${thought}</div><div style="position:absolute;left:24px;bottom:17px;font:600 8px/1 Helvetica,sans-serif;letter-spacing:.28em">${kicker}</div></div>`
  if (layout === 'retail') return `<div style="${shell}display:grid;grid-template-columns:1.3fr .7fr;${extra}"><div style="padding:16px 22px;display:flex;flex-direction:column;justify-content:space-between"><div style="font:800 9px/1 Helvetica,sans-serif;letter-spacing:.25em">${kicker}</div><div style="font:700 clamp(34px,6vw,70px)/.8 serif;letter-spacing:.12em">${name}</div></div><div style="padding:16px;display:flex;align-items:flex-end;font:600 10px/1.5 serif">${thought}</div></div>`
  if (layout === 'lattice') return `<div style="${shell}display:grid;place-items:center;${extra}"><div style="width:46%;background:rgba(20,10,7,.72);border:1px solid currentColor;padding:12px 18px;text-align:center"><div style="font:600 9px/1 serif;letter-spacing:.32em">${kicker}</div><div style="margin-top:7px;font:700 27px/1 serif;letter-spacing:.18em">${name}</div><div style="margin-top:8px;font:500 9px/1.55 serif">${thought}</div></div></div>`
  return `<div style="${shell}${extra}"><div style="position:absolute;right:26px;top:18px;bottom:18px;border-right:1px solid;padding-right:9px;writing-mode:vertical-rl;font-size:9px;font-weight:600;letter-spacing:.22em">${kicker}</div><div style="position:absolute;left:28px;top:20px;bottom:20px;display:flex;flex-direction:row-reverse;gap:13px"><div style="writing-mode:vertical-rl;font-size:27px;font-weight:700;letter-spacing:.14em">${name}</div><div style="max-height:138px;writing-mode:vertical-rl;font-size:10px;line-height:1.7;letter-spacing:.08em">${thought}</div></div><div style="position:absolute;left:16px;bottom:14px;width:17px;height:17px;display:grid;place-items:center;background:#a52218;color:#f6ead3;font:700 9px/1 serif">印</div></div>`
}

function html(
  id: string,
  style: BannerStyleId,
  title: string,
  note: string,
  css: string,
  inner: string,
): BannerPreset {
  return { id, kind: 'html', style, title, note, html: box(css, inner) }
}

function live(id: string, style: BannerStyleId, title: string, note: string, source: string): BannerPreset {
  return { id, kind: 'htmlframe', style, title, note, html: source }
}

export const BANNER_PRESETS: BannerPreset[] = [
  html(
    'jp-rimpa',
    'jp',
    '琳派',
    '金银地、没骨与非对称。光琳之后，平面把花卉当成纹样，把空当成水。',
    'background:linear-gradient(105deg,#eadbaf 0 62%,#c9aa55 62%);color:#18374a',
    `<div style="position:absolute;right:-4%;bottom:-18%;width:42%;height:90%;background:radial-gradient(circle at 40% 30%,#f4cf4e 0 18%,transparent 19%),radial-gradient(circle at 62% 48%,#285a76 0 22%,transparent 23%),radial-gradient(circle at 48% 62%,#d84a32 0 14%,transparent 15%);opacity:.95"></div>${jpCopy('RIMPA · 尾形光琳', '琳派', '金银地、没骨与非对称。光琳之后，平面把花卉当成纹样，把空当成水。', '', 'ma')}`,
  ),
  html(
    'jp-ukiyo',
    'jp',
    '浮世绘',
    '平涂、墨线、大色面。画面是舞台，不是透视窗口。',
    'background:#2d5b87;color:#fff0cf',
    `<div style="position:absolute;inset:18px 22px;border:2px solid #f2c94c"></div><div style="position:absolute;top:18px;right:22px;width:88px;height:calc(100% - 36px);background:#ef6a4c"></div>${jpCopy('UKIYO-E', '浮世绘', '平涂、墨线、大色面。画面是舞台，不是透视窗口。', 'color:#fff0cf', 'woodblock')}`,
  ),
  html(
    'jp-seigaiha',
    'jp',
    '青海波',
    '同一弧线无穷反复。秩序来自纹样，平静来自重复。',
    'background:#dcecf1;color:#174a65;background-image:radial-gradient(circle at 50% 120%,transparent 22px,#76b8cf 23px 25px,transparent 26px);background-size:48px 28px',
    jpCopy('SEIGAIHA', '青海波', '同一弧线无穷反复。秩序来自纹样，平静来自重复。', '', 'pattern'),
  ),
  html(
    'jp-mingei',
    'jp',
    '民艺',
    '柳宗悦：无名工匠的用之美。手感重于签名，朴素重于装饰。',
    'background:#cbb79a;color:#2a2218',
    `<div style="position:absolute;left:0;top:0;bottom:0;width:18px;background:#6a3a28"></div>${jpCopy('MINGEI · 柳宗悦', '民艺', '无名工匠的用之美。手感重于签名，朴素重于装饰。', '', 'craft')}`,
  ),
  html(
    'jp-kamekura',
    'jp',
    '龟仓红日',
    '1964：把国旗收成一个圆。现代主义最硬的一刀，也是最日本的一刀。',
    'background:#f7f7f4;color:#111827',
    `<div style="position:absolute;right:12%;top:18%;width:120px;height:120px;border-radius:50%;background:#e6002d"></div>${jpCopy('KAMEKURA · 1964', '红日', '把国旗收成一个圆。现代主义最硬的一刀，也是最日本的一刀。', '', 'symbol')}`,
  ),
  html(
    'jp-ikko',
    'jp',
    '田中一光',
    '能乐脸谱切成色块。传统不是临摹，是几何以后的再认。',
    'background:#f3efe4;color:#171717',
    `<div style="position:absolute;inset:0;display:grid;grid-template-columns:1.6fr 1fr 1fr;grid-template-rows:1fr 1fr"><div style="background:#171717"></div><div style="background:#c43c1c"></div><div style="background:#e8c84a"></div><div style="background:#f3efe4"></div><div style="background:#2a5a9e"></div><div style="background:#171717"></div></div>${jpCopy('IKKO TANAKA', '色面能乐', '能乐脸谱切成色块。传统不是临摹，是几何以后的再认。', '', 'geometry')}`,
  ),
  html(
    'jp-sugiura',
    'jp',
    '杉浦康平',
    '《银花》式密铺：亚洲书籍把信息当成曼荼罗，阅读是进入结构。',
    'background:#342a68;color:#fff5c7;background-image:repeating-conic-gradient(from 0deg at 78% 50%,#eb5b83 0 8deg,#342a68 8deg 16deg)',
    jpCopy('SUGIURA · 银花', '曼荼罗编辑', '亚洲书籍把信息当成曼荼罗，阅读是进入结构。', '', 'cosmos'),
  ),
  html(
    'jp-yokoo',
    'jp',
    '横尾忠则',
    '浮世绘撞上波普。拼贴、荧光、剧场：现代不是干净，是冲突。',
    'background:#ff7a00;color:#fff36d',
    `<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,#f5007a 0 16px,#ff7a00 16px 32px,#00a8ff 32px 36px);opacity:.72"></div>${jpCopy('YOKOO', '横尾', '浮世绘撞上波普。拼贴、荧光、剧场：现代不是干净，是冲突。', '', 'collage')}`,
  ),
  html(
    'jp-hara',
    'jp',
    '白',
    '原研哉《白》：空不是没有，是感受力被打开以后的场。',
    'background:#f6f4ef;color:#2a2a28',
    jpCopy('HARA · WHITE', '白', '空不是没有，是感受力被打开以后的场。', 'padding:40px 48px'),
  ),
  html(
    'jp-tate',
    'jp',
    '和本',
    '纵组、界线、版心。书写方向本身就是世界观。',
    'background:#efe6d4;color:#1c1610',
    `<div style="position:absolute;right:18px;top:16px;bottom:16px;writing-mode:vertical-rl;letter-spacing:.2em;font:700 22px/1.4 'Songti SC',serif">和本</div>${jpCopy('和本', '纵组', '纵组、界线、版心。书写方向本身就是世界观。', '', 'vertical')}`,
  ),

  html(
    'us-rand',
    'us',
    'Paul Rand',
    'Thoughts on Design：观念先于装饰。标志是一个想法，被画成最简的形。',
    'background:#f5f1e8;color:#13213c',
    `<div style="position:absolute;left:8%;top:22%;width:90px;height:90px;background:#ffcb05;box-shadow:52px -18px 0 #2f65b0"></div>${usCopy('THOUGHTS ON DESIGN', 'Paul Rand', '观念先于装饰。标志是一个想法，被画成最简的形。', '', 'idea')}`,
  ),
  html(
    'us-bass',
    'us',
    'Saul Bass',
    '电影海报的一刀切。象征物被剪到只剩力量，标题成为剪影。',
    'background:#f4d35e;color:#171717',
    `<div style="position:absolute;left:0;top:0;width:38%;height:100%;background:#ee4b2b;clip-path:polygon(0 0,100% 0,62% 100%,0 100%)"></div>${usCopy('SAUL BASS', '一刀', '象征物被剪到只剩力量，标题成为剪影。', '', 'cut')}`,
  ),
  html(
    'us-lubalin',
    'us',
    'Lubalin',
    '字母拥抱字母。Herb Lubalin 让刊头成为雕塑，亲密替代间距。',
    'background:#f3efe6;color:#111',
    `<div style="position:absolute;right:6%;top:18%;font:900 72px/0.85 Helvetica,Arial,sans-serif;letter-spacing:-.12em;opacity:.12">AV</div>${usCopy('AVANT GARDE', 'Lubalin', '字母拥抱字母。刊头成为雕塑，亲密替代间距。', '', 'ligature')}`,
  ),
  html(
    'us-vignelli',
    'us',
    'Unigrid',
    'Vignelli：信息必须可被网格收留。美国国家公园地图的冷静，是对混乱的礼貌。',
    'background:#f2efe8;color:#111;background-image:linear-gradient(#c8c4ba 1px,transparent 1px),linear-gradient(90deg,#c8c4ba 1px,transparent 1px);background-size:40px 40px',
    usCopy('VIGNELLI · UNIGRID', '网格即国家', '信息必须可被网格收留。地图的冷静，是对混乱的礼貌。', '', 'system'),
  ),
  html(
    'us-scher',
    'us',
    'Public Theater',
    'Paula Scher：字体铺满城市。字不是说明，是街道上的噪音与节奏。',
    'background:#ff4f00;color:#111',
    `<div style="position:absolute;inset:0;font:900 42px/0.9 Helvetica,Arial,sans-serif;letter-spacing:-.04em;padding:8px 10px;opacity:.22">NEW YORK NEW YORK NEW YORK NEW YORK</div>${usCopy('PAULA SCHER', '公共剧场', '字体铺满城市。字不是说明，是街道上的噪音与节奏。', 'color:#fff', 'street')}`,
  ),
  html(
    'us-warhol',
    'us',
    '波普',
    '重复使神性脱落。同一张脸印四次，消费成为圣像。',
    'background:#7be7ff;display:grid;grid-template-columns:1fr 1fr 1fr 1fr',
    `<div style="background:#fff000"></div><div style="background:#ff5ebc"></div><div style="background:#54e88b"></div><div style="background:#7f4dff;color:#fff;padding:18px 16px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em;font-weight:700">WARHOL</div><div style="margin-top:6px;font-size:22px;font-weight:800">波普</div><div style="margin-top:8px;font-size:12px;line-height:1.45">重复使神性脱落。同一张脸印四次。</div></div>`,
  ),
  html(
    'us-greiman',
    'us',
    '新浪潮加州',
    'April Greiman：屏幕刚出现时，层就是空间。数字不是工具，是新的空气。',
    'background:linear-gradient(118deg,#8ff5ff,#7755ff 56%,#ff70c6);color:#10213b',
    `<div style="position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.38),transparent 70%),repeating-linear-gradient(0deg,transparent 0 7px,rgba(19,8,70,.09) 7px 8px)"></div>${usCopy('GREIMAN · NEW WAVE', '加州新浪潮', '屏幕刚出现时，层就是空间。数字不是工具，是新的空气。', '', 'digital')}`,
  ),
  html(
    'us-cranbrook',
    'us',
    '解构',
    'Cranbrook / McCoy：意义在读者与版面之间生成。拆开网格，是为了看见权力。',
    'background:#ece7dc;color:#111',
    `<div style="position:absolute;left:8%;top:18%;font:800 54px Helvetica,Arial,sans-serif;transform:rotate(-12deg);opacity:.22">TEXT</div><div style="position:absolute;right:10%;bottom:22%;font:800 40px Helvetica,Arial,sans-serif;transform:rotate(8deg);letter-spacing:.4em;opacity:.35">IMAGE</div>${usCopy('CRANBROOK', '解构主义', '意义在读者与版面之间生成。拆开网格，是为了看见权力。', '', 'deconstruct')}`,
  ),
  html(
    'us-carson',
    'us',
    'Ray Gun',
    'David Carson：可读性不是唯一伦理。感觉先到，字可以迟到。',
    'background:#151515;color:#f0efed',
    `<div style="position:absolute;left:2%;top:18%;font:900 72px/0.85 Helvetica,Arial,sans-serif;letter-spacing:-.08em;opacity:.14;transform:skewX(-18deg)">RAY</div>${usCopy('CARSON · RAY GUN', '直觉排版', '可读性不是唯一伦理。感觉先到，字可以迟到。', '', 'punk')}`,
  ),
  html(
    'us-emigre',
    'us',
    'Emigre',
    'Rudy VanderLans / Zuzana Licko：字体是文化软件。杂志是实验室。',
    'background:#f4f0e6;color:#111;border-top:14px solid #111',
    usCopy('EMIGRE', '实验室', '字体是文化软件。杂志是实验室。', '', 'lab'),
  ),

  html(
    'eu-bauhaus',
    'eu',
    '包豪斯',
    '形式追随功能，课堂追随车间。红黄蓝与圆方三角，是工业时代的字母。',
    'background:#f7f4e8;display:grid;grid-template-columns:1.5fr .9fr .7fr',
    `<div style="background:#f7f4e8;color:#151515;padding:20px 22px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em">BAUHAUS</div><div style="margin-top:6px;font-size:24px;font-weight:800">包豪斯</div><div style="margin-top:8px;font-size:12px;line-height:1.5">形式追随功能。红黄蓝与圆方三角，是工业时代的字母。</div></div><div style="background:#e13227"></div><div style="background:#1454a3;border-top:70px solid #f1c40f"></div>`,
  ),
  html(
    'eu-tschichold',
    'eu',
    '新字体排印',
    'Tschichold《Die neue Typographie》：不对称、无衬线、摄影。书籍要像机器一样清醒。',
    'background:#f2efe8;color:#111',
    `<div style="position:absolute;left:0;top:0;bottom:0;width:10px;background:#c4122e"></div>${euCopy('TSCHICHOLD · 1928', '新字体排印', '不对称、无衬线、摄影。书籍要像机器一样清醒。', '', 'newtype')}`,
  ),
  html(
    'eu-swiss',
    'eu',
    '瑞士国际主义',
    'Hollis / Müller-Brockmann：网格是伦理。客观、摄影、Helvetica——少，是为了所有人都能读。',
    'background:#efefef;color:#111;background-image:linear-gradient(#bbb 1px,transparent 1px),linear-gradient(90deg,#bbb 1px,transparent 1px);background-size:32px 32px',
    euCopy('INTERNATIONAL STYLE', '瑞士网格', '网格是伦理。客观、摄影、无衬线——少，是为了所有人都能读。', '', 'swiss'),
  ),
  html(
    'eu-destijl',
    'eu',
    '风格派',
    'Mondrian / van Doesburg：世界可被正交。原色与非色，是宇宙的家具。',
    'background:#f4f1ea;display:grid;grid-template-columns:2fr 18px 1fr 18px .8fr;grid-template-rows:1fr 18px .7fr',
    `<div style="background:#111"></div><div style="background:#111"></div><div style="background:#c4122e"></div><div style="background:#111"></div><div style="background:#1c4a9e"></div><div style="grid-column:1/-1;background:#111"></div><div style="background:#e8c84a;color:#111;padding:12px 16px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.28em;font-weight:700">DE STIJL</div><div style="font-size:20px;font-weight:800">风格派</div></div><div style="background:#111"></div><div style="background:#f4f1ea"></div><div style="background:#111"></div><div style="background:#111"></div>`,
  ),
  html(
    'eu-lissitzky',
    'eu',
    '构成主义',
    'El Lissitzky：版面是力场。斜线前进，文字是构件，不是装饰。',
    'background:#f3ead1;color:#161616',
    `<div style="position:absolute;left:12%;top:10%;width:54%;height:8px;background:#c4122e;transform:rotate(-18deg)"></div><div style="position:absolute;left:18%;top:38%;width:40%;height:8px;background:#111;transform:rotate(-18deg)"></div>${euCopy('LISSITZKY', '构成', '版面是力场。斜线前进，文字是构件，不是装饰。', '', 'construct')}`,
  ),
  html(
    'eu-deco',
    'eu',
    '装饰艺术',
    'Cassandre 式阳光放射。奢侈被几何化，速度被镀金。',
    'background:#1a1420;color:#f0d9a0;background-image:repeating-conic-gradient(from 0deg at 100% 0%,#c4a24a 0 6deg,#1a1420 6deg 12deg)',
    euCopy('ART DECO', '装饰艺术', '阳光放射、阶梯与金属。奢侈被几何化，速度被镀金。', '', 'deco'),
  ),
  html(
    'eu-weingart',
    'eu',
    'Weingart',
    '从巴塞尔内部拆瑞士。字距拉断、网屏叠印：规则存在，是为了被加热。',
    'background:#2357ff;color:#f8ff4f',
    `<div style="position:absolute;inset:0;font:800 18px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.6em;opacity:.18;padding:16px">TYPOGRAPHY TYPOGRAPHY TYPOGRAPHY</div>${euCopy('WEINGART · NEW WAVE', '新浪潮', '从巴塞尔内部拆瑞士。字距拉断、网屏叠印：规则存在，是为了被加热。', '', 'newwave')}`,
  ),
  html(
    'eu-memphis',
    'eu',
    '孟菲斯',
    'Sottsass：后现代把趣味当武器。几何可以俏皮，严肃可以戴耳环。',
    'background:#b9f3dc;color:#1d2552;background-image:radial-gradient(#ff5f9e 2px,transparent 2px);background-size:18px 18px',
    `<div style="position:absolute;right:8%;top:16%;width:70px;height:70px;border-radius:50%;background:#ff7657"></div><div style="position:absolute;right:22%;bottom:12%;width:90px;height:18px;background:#7048e8;transform:rotate(-12deg)"></div>${euCopy('MEMPHIS MILANO', '孟菲斯', '后现代把趣味当武器。几何可以俏皮，严肃可以戴耳环。', '', 'memphis')}`,
  ),
  html(
    'eu-futurism',
    'eu',
    '未来主义',
    'Marinetti：文字要在纸上奔跑。诗歌炸开中轴线，速度就是语法。',
    'background:#f7f0d5;color:#e22c20',
    `<div style="position:absolute;left:6%;top:20%;font:900 64px Helvetica,Arial,sans-serif;transform:skewX(-24deg);opacity:.2">PAROLE</div>${euCopy('FUTURISMO', '未来主义', '文字要在纸上奔跑。诗歌炸开中轴线，速度就是语法。', '', 'futurism')}`,
  ),
  html(
    'eu-brody',
    'eu',
    'The Face',
    'Neville Brody：杂志是亚文化的建筑。字体有态度，栏宽有立场。',
    'background:#1512c9;color:#fff',
    `<div style="position:absolute;left:0;bottom:0;height:46%;width:100%;background:#ff3d8d"></div>${euCopy('THE FACE · BRODY', '面孔', '杂志是亚文化的建筑。字体有态度，栏宽有立场。', '', 'editorial')}`,
  ),

  html(
    'cn-song',
    'cn',
    '宋版',
    '版心、鱼尾、界栏。印本把阅读收进格子，敬字如敬人。',
    'background:#f0e2c4;color:#2a1c12;background-image:linear-gradient(#c4a070 1px,transparent 1px);background-size:100% 28px;background-position:0 18px',
    `<div style="position:absolute;left:50%;top:12px;bottom:12px;width:2px;background:#8a5a32;transform:translateX(-1px)"></div>${cnCopy('宋刻本', '版心', '版心、鱼尾、界栏。印本把阅读收进格子，敬字如敬人。', '', 'book')}`,
  ),
  html(
    'cn-bai',
    'cn',
    '计白当黑',
    '书法与印章：白不是底，是笔。留白的密度，就是精神的密度。',
    'background:#f7f1e4;color:#1a120e',
    `<div style="position:absolute;right:10%;top:16%;width:54px;height:54px;border:3px solid #c4122e"></div>${cnCopy('计白当黑', '白即笔', '白不是底，是笔。留白的密度，就是精神的密度。', '', 'void')}`,
  ),
  html(
    'cn-yue',
    'cn',
    '月份牌',
    '上海摩登：擦笔水彩、年历边框、商品与仕女同框。商业第一次成为大众美术。',
    'background:linear-gradient(135deg,#ffd7df,#d8f1e1);color:#6a2444',
    `<div style="position:absolute;inset:14px;border:8px solid #ed7d9b;outline:1px solid #fff9e8;outline-offset:6px"></div>${cnCopy('YUEFENPAI', '月份牌', '擦笔水彩、年历边框。商业第一次成为大众美术。', '', 'calendar')}`,
  ),
  html(
    'cn-liangyou',
    'cn',
    '良友',
    '画报网格：摄影、摩登、栏目。民国杂志用铜版把城市印成可翻的速度。',
    'background:#f6e9cd;color:#173c46;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:6px;padding:10px',
    `<div style="background:#2f8795;color:#fff8dd;padding:16px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em">1926</div><div style="font-size:24px;font-weight:800">良友</div><div style="margin-top:8px;font-size:12px;line-height:1.45">画报网格：摄影、摩登、栏目。城市被印成可翻的速度。</div></div><div style="background:#f18c72"></div><div style="background:#f5cf68"></div>`,
  ),
  html(
    'cn-xuan',
    'cn',
    '宣传画',
    '平涂、口号、前进。政治要求可读，色彩要求必胜。',
    'background:#c4122e;color:#f6e27a',
    `<div style="position:absolute;left:0;bottom:0;width:100%;height:22%;background:#f6e27a"></div>${cnCopy('宣传画', '前进', '平涂、口号、前进。政治要求可读，色彩要求必胜。', '', 'propaganda')}`,
  ),
  html(
    'cn-seal',
    'cn',
    '印学',
    '朱文白文：方寸里的建筑。一枚印，是身份被压进朱红。',
    'background:#f7ecd6;color:#a52218',
    `<div style="position:absolute;right:12%;top:18%;width:86px;height:86px;background:#c52b20;display:grid;place-items:center;font:800 28px/1 'Songti SC',serif;color:#fff2da">印</div>${cnCopy('篆刻', '朱砂', '朱文白文：方寸里的建筑。一枚印，是身份被压进朱红。', '', 'seal')}`,
  ),
  html(
    'cn-steiner',
    'cn',
    '跨文化',
    'Henry Steiner《Cross-Cultural Design》：并置，不是搅拌。变色龙保有形体，只反射当地的光。',
    'background:#f7f2df;color:#132c4a;display:grid;grid-template-columns:1fr 1fr',
    `<div style="background:#18a7a0;color:#fff5d8;padding:20px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:44px;font-weight:800">東</div></div><div style="padding:20px;border-top:14px solid #f4b942;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.28em;color:#e43d30">STEINER</div><div style="margin-top:6px;font-size:22px;font-weight:800">跨文化</div><div style="margin-top:8px;font-size:12px;line-height:1.5">并置，不是搅拌。变色龙保有形体，只反射当地的光。</div></div>`,
  ),
  html(
    'cn-kan',
    'cn',
    '靳埭强',
    '水墨入现代。红点、宣纸、包豪斯骨架——东方的笔落在国际网格上。',
    'background:#f6f1e6;color:#1a120e',
    `<div style="position:absolute;left:12%;top:28%;width:72px;height:18px;background:#111;transform:rotate(-28deg);border-radius:40px"></div><div style="position:absolute;left:22%;top:22%;width:18px;height:18px;border-radius:50%;background:#c4122e"></div>${cnCopy('KAN TAI-KEUNG', '水墨现代', '红点、宣纸、包豪斯骨架。东方的笔落在国际网格上。', '', 'ink')}`,
  ),
  html(
    'cn-chan',
    'cn',
    '陈幼坚',
    '东方情、西方理。传统纹样被抽成标志，茶与都市共用一条中线。',
    'background:#dff4ea;color:#173d32',
    `<div style="position:absolute;right:0;top:0;bottom:0;width:28%;background:#3d63d8"></div>${cnCopy('ALAN CHAN', '新中式', '东方情、西方理。传统纹样被抽成标志，茶与都市共用一条中线。', '', 'retail')}`,
  ),
  html(
    'cn-window',
    'cn',
    '冰裂纹',
    '园林漏窗：景被框，框也是景。破裂的秩序，比完整更像自然。',
    'background:#cde5d8;color:#24574b;background-image:linear-gradient(28deg,#6aa795 1px,transparent 1px),linear-gradient(-18deg,#6aa795 1px,transparent 1px),linear-gradient(72deg,#6aa795 1px,transparent 1px);background-size:46px 46px,52px 52px,38px 38px',
    cnCopy('漏窗', '冰裂纹', '景被框，框也是景。破裂的秩序，比完整更像自然。', '', 'lattice'),
  ),

  live(
    'jp-live-seigaiha',
    'jp',
    '青海波',
    '纹样自己呼吸。',
    `<div id="b" style="height:100%;background:#dcecf1;color:#174a65;font:700 22px/1.2 ui-sans-serif,sans-serif;display:flex;align-items:flex-end;padding:24px 32px">青海波</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.012;if(e)e.style.backgroundSize=48+Math.sin(t)*6+'px '+ (28+Math.cos(t)*4)+'px';e.style.backgroundImage='radial-gradient(circle at 50% 120%,transparent 22px,#76b8cf 23px 25px,transparent 26px)';e.style.backgroundColor='#dcecf1';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-sun',
    'jp',
    '红日',
    '圆在呼吸，仍然是圆。',
    `<div style="height:100%;background:#f7f7f4;position:relative;color:#111827;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px ui-sans-serif,sans-serif">红日<div id="s" style="position:absolute;right:12%;top:18%;width:120px;height:120px;border-radius:50%;background:#e6002d"></div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=0.02;if(e)e.style.transform='scale('+(1+Math.sin(t)*0.06)+')';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-white',
    'jp',
    '白',
    '空也在微微发热。',
    `<div id="b" style="height:100%;background:#f6f4ef;color:#2a2a28;display:flex;align-items:flex-end;padding:36px 44px;font:800 28px ui-sans-serif,sans-serif">白</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.01;if(e)e.style.background='hsl(40 20% '+(95+Math.sin(t)*1.6)+'%)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-yokoo',
    'jp',
    '横尾',
    '冲突自己换场。',
    `<div id="b" style="height:100%;background:#ff7a00;color:#fff36d;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px ui-sans-serif,sans-serif">横尾</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.4;if(e)e.style.background='repeating-linear-gradient('+(45+t)+'deg,#f5007a 0 16px,#ff7a00 16px 32px,#00a8ff 32px 36px)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'us-live-bass',
    'us',
    '一刀',
    '切面在移动。',
    `<div style="height:100%;background:#f4d35e;position:relative;color:#171717;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px Helvetica,Arial,sans-serif">Bass<div id="c" style="position:absolute;left:0;top:0;width:38%;height:100%;background:#ee4b2b"></div></div><script>(function(){var e=document.getElementById('c'),t=0;function f(){t+=0.02;if(e)e.style.clipPath='polygon(0 0,100% 0,'+(58+Math.sin(t)*8)+'% 100%,0 100%)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'us-live-scher',
    'us',
    '公共剧场',
    '字在街上走。',
    `<div style="height:100%;overflow:hidden;background:#ff4f00;color:#fff;font:800 22px/240px Helvetica,Arial,sans-serif;letter-spacing:.12em;white-space:nowrap"><div style="display:inline-block;animation:m 14s linear infinite">PAULA SCHER · PUBLIC THEATER · NEW YORK · </div></div><style>html,body{margin:0;height:100%;overflow:hidden}@keyframes m{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>`,
  ),
  live(
    'us-live-decon',
    'us',
    '解构',
    '两层意义错开。',
    `<div id="a" style="height:100%;background:#dcd5ff;color:#24165f;display:flex;align-items:flex-end;padding:24px 32px;font:800 26px Helvetica,Arial,sans-serif">解构</div><script>(function(){var e=document.getElementById('a'),t=0;function f(){t+=0.03;if(e){e.style.letterSpacing=(.04+Math.sin(t)*.2)+'em';e.style.transform='rotate('+Math.sin(t)*1.4+'deg)';}requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'us-live-pop',
    'us',
    '波普',
    '色版轮换。',
    `<div id="b" style="height:100%;display:grid;grid-template-columns:1fr 1fr 1fr 1fr"><i></i><i></i><i></i><i></i></div><style>#b i{display:block}</style><script>(function(){var c=['#f2d64a','#e23b8a','#3aa0e8','#111'],n=0,els=document.querySelectorAll('#b i');function f(){n++;els.forEach(function(el,i){el.style.background=c[(i+n)%4]});}f();setInterval(f,700);})()</script>`,
  ),
  live(
    'eu-live-swiss',
    'eu',
    '瑞士网格',
    '格子自己眨眼。',
    `<div id="b" style="height:100%;background:#efefef;background-image:linear-gradient(#bbb 1px,transparent 1px),linear-gradient(90deg,#bbb 1px,transparent 1px);background-size:32px 32px;color:#111;display:flex;align-items:flex-end;padding:24px 32px;font:800 22px Helvetica,Arial,sans-serif">网格</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.15;if(e)e.style.backgroundSize=32+Math.sin(t)*4+'px '+ (32+Math.cos(t)*4)+'px';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'eu-live-stijl',
    'eu',
    '风格派',
    '原色换班。',
    `<div id="b" style="height:100%;display:grid;grid-template-columns:2fr 18px 1fr 18px .8fr"><i></i><i></i><i></i><i></i><i></i></div><style>#b i{display:block;background:#111}#b i:nth-child(3){background:#c4122e}#b i:nth-child(5){background:#1c4a9e}</style><script>(function(){var n=0,els=document.querySelectorAll('#b i');setInterval(function(){n=(n+1)%3;var c=['#c4122e','#e8c84a','#1c4a9e'];els[2].style.background=c[n];els[4].style.background=c[(n+1)%3];},800);})()</script>`,
  ),
  live(
    'eu-live-memphis',
    'eu',
    '孟菲斯',
    '几何在跳舞。',
    `<div style="height:100%;background:#b9f3dc;position:relative;background-image:radial-gradient(#ff5f9e 2px,transparent 2px);background-size:18px 18px"><div id="d" style="position:absolute;right:12%;top:22%;width:70px;height:70px;border-radius:50%;background:#ff7657"></div></div><script>(function(){var e=document.getElementById('d'),t=0;function f(){t+=0.04;if(e)e.style.transform='translateY('+Math.sin(t)*10+'px)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'eu-live-weingart',
    'eu',
    '新浪潮',
    '字距在呼吸。',
    `<div id="b" style="height:100%;background:#2357ff;color:#f8ff4f;display:flex;align-items:flex-end;padding:24px 32px;font:800 20px Helvetica,Arial,sans-serif;letter-spacing:.4em">WEINGART</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.03;if(e)e.style.letterSpacing=(.2+Math.sin(t)*.35)+'em';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-seal',
    'cn',
    '朱砂',
    '印色在沁。',
    `<div id="b" style="height:100%;background:#f7ecd6;color:#a52218;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px 'Songti SC',serif">朱砂</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.015;if(e)e.style.background='radial-gradient(circle at '+(50+Math.sin(t)*16)+'% 40%, #d94a3a 0 12%, #f7ecd6 46%)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-xuan',
    'cn',
    '前进',
    '色带上推。',
    `<div style="height:100%;background:#c4122e;color:#f6e27a;position:relative;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px ui-sans-serif,sans-serif">前进<div id="y" style="position:absolute;left:0;bottom:0;width:100%;height:22%;background:#f6e27a"></div></div><script>(function(){var e=document.getElementById('y'),t=0;function f(){t+=0.03;if(e)e.style.height=(18+Math.sin(t)*6)+'%';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-bai',
    'cn',
    '白即笔',
    '红印微震。',
    `<div style="height:100%;background:#f7f1e4;position:relative;color:#1a120e;display:flex;align-items:flex-end;padding:28px 36px;font:800 24px 'Songti SC',serif">计白当黑<div id="s" style="position:absolute;right:10%;top:16%;width:54px;height:54px;border:3px solid #c4122e"></div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=0.04;if(e)e.style.transform='rotate('+Math.sin(t)*3+'deg)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-window',
    'cn',
    '冰裂纹',
    '窗格在错位。',
    `<div id="b" style="height:100%;background:#cde5d8;color:#24574b;display:flex;align-items:flex-end;padding:24px 32px;font:700 20px ui-sans-serif,sans-serif">漏窗</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.2;if(e)e.style.backgroundPosition=t+'px '+(t*0.4)+'px';e.style.backgroundImage='linear-gradient(28deg,#6aa795 1px,transparent 1px),linear-gradient(-18deg,#6aa795 1px,transparent 1px)';e.style.backgroundSize='46px 46px,52px 52px';requestAnimationFrame(f);}f();})()</script>`,
  ),
]

export function bannerGalleryId(kind: string, html: string) {
  let hash = 2166136261
  const key = `${kind}\n${html}`
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `g-${(hash >>> 0).toString(16)}`
}

export function findBannerPreset(banner: Pick<PageBanner, 'kind' | 'html'> | null | undefined) {
  if (!banner) return null
  const html = banner.html.trim()
  return BANNER_PRESETS.find((item) => item.kind === banner.kind && item.html.trim() === html) ?? null
}

export function isBannerPreset(banner: PageBanner) {
  return Boolean(findBannerPreset(banner))
}

export function presetsOf(kind: PageBannerKind) {
  return BANNER_PRESETS.filter((item) => item.kind === kind)
}
