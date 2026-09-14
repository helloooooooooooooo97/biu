import type { PageBanner, PageBannerKind } from './page-banner.ts'

export const BANNER_STYLE_IDS = ['jp', 'us', 'eu', 'cn'] as const
export type BannerStyleId = (typeof BANNER_STYLE_IDS)[number]

export const BANNER_STYLE_LABEL: Record<BannerStyleId, string> = {
  jp: '日式',
  us: '美式',
  eu: '欧式',
  cn: '新中式',
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
    'jp-sato',
    'jp',
    '超级识别',
    '佐藤可士和式品牌系统：一个强识别元素占领空间，色彩就是界面。',
    'background:#f4f4f1;color:#101010',
    `<div style="position:absolute;inset:0;display:grid;grid-template-columns:43% 19% 38%"><div style="background:#ff3b30"></div><div style="background:#1457ff"></div><div style="background:#f8df00"></div></div><div style="position:relative;height:100%;display:grid;grid-template-columns:43% 57%;mix-blend-mode:multiply"><div style="display:flex;align-items:flex-end;padding:14px 18px;color:#fff;font:900 clamp(38px,7vw,82px)/.72 Helvetica,Arial,sans-serif;letter-spacing:-.08em">K</div><div style="padding:14px 18px;display:flex;flex-direction:column;justify-content:space-between;color:#111"><div style="font:800 9px/1 Helvetica,Arial,sans-serif;letter-spacing:.24em">KASHIWA SATO / IDENTITY</div><div><div style="font:900 30px/.9 'Yu Gothic',sans-serif;letter-spacing:-.05em">超级识别</div><div style="max-width:260px;margin-top:7px;font:600 10px/1.45 'Yu Gothic',sans-serif">一个强识别元素占领空间，色彩就是界面。</div></div></div></div>`,
  ),
  html(
    'jp-hattori',
    'jp',
    '都市编辑',
    '服部一成：看似漫不经心的字距、比例和空白，制造当代杂志的生涩感。',
    'background:#f1ff55;color:#111',
    `<div style="position:absolute;left:7%;top:10%;font:400 clamp(50px,10vw,112px)/.72 'Times New Roman',serif;letter-spacing:-.09em">東 京</div><div style="position:absolute;left:51%;top:14px;width:18px;height:18px;background:#2357ff"></div><div style="position:absolute;left:14px;bottom:14px;font:700 9px/1 ui-monospace,monospace;letter-spacing:.2em">KAZUNARI HATTORI / EDITORIAL</div><div style="position:absolute;right:5%;bottom:14px;width:32%;font:500 10px/1.45 'Yu Gothic',sans-serif">看似漫不经心的字距、比例和空白，制造当代杂志的生涩感。</div>`,
  ),
  html(
    'jp-taku-satoh',
    'jp',
    '设计解剖',
    '佐藤卓：把日常包装拆成结构、材料、触觉与使用行为，安静但不空泛。',
    'background:#e8f7f2;color:#183f39;background-image:linear-gradient(rgba(24,63,57,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(24,63,57,.1) 1px,transparent 1px);background-size:24px 24px',
    `<div style="position:absolute;left:12%;top:19%;width:94px;height:94px;border:1px solid #183f39;border-radius:50%"><div style="position:absolute;left:46px;top:-18px;height:130px;border-left:1px solid #ff5a4f"></div><div style="position:absolute;left:-18px;top:46px;width:130px;border-top:1px solid #ff5a4f"></div></div><div style="position:absolute;left:24px;top:16px;font:700 9px/1 ui-monospace,monospace;letter-spacing:.2em">TAKU SATOH / ANATOMY</div><div style="position:absolute;right:6%;top:22%;width:38%"><div style="font:700 27px/1 'Yu Gothic',sans-serif">设计解剖</div><div style="margin-top:8px;font:500 10px/1.55 'Yu Gothic',sans-serif">STRUCTURE 01<br>MATERIAL 02<br>BEHAVIOR 03</div></div>`,
  ),
  html(
    'jp-yuni-yoshida',
    'jp',
    '现实幻想',
    '吉田ユニ：亲手切割、排列日常物，再用摄影把真实材料变成超现实瞬间。',
    'background:#f1efe8;color:#161616',
    `<div style="position:absolute;left:8%;top:15%;width:104px;height:104px;border-radius:50%;background:conic-gradient(#ff533d 0 25%,#ff9e89 25% 50%,#ff533d 50% 75%,#ff9e89 75%);box-shadow:20px 0 0 #f1efe8,40px 0 0 #ff533d"></div><div style="position:absolute;left:calc(8% + 18px);top:calc(15% + 18px);width:68px;height:68px;border-radius:50%;background:#f7d854"></div><div style="position:absolute;left:8%;top:15%;width:144px;height:104px;background:repeating-linear-gradient(90deg,transparent 0 17px,rgba(241,239,232,.88) 17px 21px);transform:rotate(-7deg)"></div><div style="position:absolute;right:5%;top:15%;text-align:right;font:900 clamp(32px,6vw,68px)/.76 'Yu Gothic',sans-serif;letter-spacing:-.08em">现实<br>幻想</div><div style="position:absolute;right:5%;bottom:14px;font:700 8px/1 ui-monospace,monospace;letter-spacing:.2em">YUNI YOSHIDA / HAND MADE</div>`,
  ),
  html(
    'jp-ohara-type',
    'jp',
    '文字装置',
    '大原大次郎：纸、铜线、影子和风都能托起文字，字体从印刷面走入空间。',
    'background:#f6f0d8;color:#181818',
    `<div style="position:absolute;left:5%;top:11%;width:56%;height:74%;filter:drop-shadow(12px 14px 0 rgba(24,24,24,.14))"><span style="position:absolute;left:3%;top:18%;font:900 clamp(52px,10vw,112px)/1 'Yu Gothic',sans-serif;transform:rotate(-13deg);color:#ee482f">文</span><span style="position:absolute;left:31%;top:-8%;font:900 clamp(58px,11vw,126px)/1 'Yu Gothic',sans-serif;transform:rotate(11deg);color:#1956c8">字</span><span style="position:absolute;left:68%;top:21%;font:900 clamp(48px,9vw,102px)/1 'Yu Gothic',sans-serif;transform:rotate(-5deg)">装</span></div><div style="position:absolute;left:7%;top:8%;width:52%;height:78%;border-top:1px solid;border-right:1px solid;transform:skewY(-8deg)"></div><div style="position:absolute;right:5%;bottom:14px;text-align:right;font:800 9px/1.4 ui-monospace,monospace;letter-spacing:.16em">DAIJIRO OHARA<br>TYPE / AIR / SHADOW</div>`,
  ),
  html(
    'jp-yoshirotten',
    'jp',
    '未来自然',
    'YOSHIROTTEN：把自然光、银色太阳、科幻与空间媒介合成可感知的色场。',
    'background:#101113;color:#f4f1e9',
    `<div style="position:absolute;left:10%;top:-42%;width:58%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 34% 27%,#fff 0 3%,#cfd3d4 17%,#62676d 42%,#f0f1ec 58%,#303339 72%);box-shadow:0 0 45px rgba(127,255,210,.28)"></div><div style="position:absolute;inset:0;background:linear-gradient(107deg,transparent 35%,rgba(102,255,208,.38) 50%,transparent 66%);mix-blend-mode:screen"></div><div style="position:absolute;left:18px;top:14px;font:800 8px/1 ui-monospace,monospace;letter-spacing:.22em">SUN / 214 — FUTURE NATURE</div><div style="position:absolute;right:4%;bottom:13px;text-align:right;font:900 clamp(34px,6vw,70px)/.76 'Yu Gothic',sans-serif;letter-spacing:-.08em">未来<br>自然</div>`,
  ),
  html(
    'jp-nakajima',
    'jp',
    '分层排印',
    '中岛英树：拆开字母笔画，以尺度、颜色与错位套印让文字游移于信息和图像之间。',
    'background:#ece9df;color:#111',
    `<div style="position:absolute;left:-5%;top:-25%;font:900 clamp(170px,30vw,340px)/1 Helvetica,sans-serif;letter-spacing:-.15em;transform:scaleX(.58);transform-origin:left;color:#00c7d7;mix-blend-mode:multiply">N</div><div style="position:absolute;left:3%;top:-16%;font:900 clamp(156px,28vw,320px)/1 Helvetica,sans-serif;letter-spacing:-.15em;transform:scaleX(.54) rotate(5deg);transform-origin:left;color:#ff3d6e;mix-blend-mode:multiply">N</div><div style="position:absolute;left:15%;top:-8%;font:900 clamp(140px,25vw,290px)/1 Helvetica,sans-serif;letter-spacing:-.15em;transform:scaleX(.48) rotate(-4deg);transform-origin:left;color:#f4db23;mix-blend-mode:multiply">N</div><div style="position:absolute;right:5%;top:12%;font:700 clamp(38px,7vw,78px)/.7 'Yu Gothic',sans-serif;letter-spacing:-.1em;text-align:right">分层<br>排印</div><div style="position:absolute;right:5%;bottom:13px;font:800 8px/1 ui-monospace,monospace;letter-spacing:.2em">HIDEKI NAKAJIMA / LAYER 03</div>`,
  ),
  html(
    'jp-kawamura',
    'jp',
    '切片拼贴',
    '河村康辅：将单一图像细密切片、错位再构，在模拟与数字之间制造新观看。',
    'background:#ff4b36;color:#111',
    `<div style="position:absolute;left:4%;top:8%;width:62%;height:84%;background:repeating-linear-gradient(90deg,#111 0 7px,#f3e8cd 7px 13px,#3258ff 13px 19px,#ff4b36 19px 24px);clip-path:polygon(0 8%,100% 0,93% 90%,5% 100%);transform:skewY(-5deg)"></div><div style="position:absolute;left:7%;top:9%;width:58%;height:82%;background:repeating-linear-gradient(90deg,transparent 0 10px,rgba(243,232,205,.88) 10px 12px);transform:translateX(14px) skewY(7deg)"></div><div style="position:absolute;right:4%;top:15%;font:900 clamp(37px,7vw,78px)/.72 'Yu Gothic',sans-serif;letter-spacing:-.11em;text-align:right">切片<br>拼贴</div><div style="position:absolute;right:4%;bottom:13px;font:800 8px/1 ui-monospace,monospace;letter-spacing:.17em">KOSUKE KAWAMURA / SLICE</div>`,
  ),
  html(
    'jp-mieno',
    'jp',
    '文字实验',
    '三重野龙：汉字不是说明文字，而是可拉伸、切割、越界的主图形。',
    'background:#ff6b55;color:#1b1b63',
    `<div style="position:absolute;left:-3%;top:-29%;font:900 clamp(150px,25vw,290px)/1 'Yu Gothic',sans-serif;letter-spacing:-.2em;transform:scaleX(.7);transform-origin:left center">字</div><div style="position:absolute;right:18px;top:16px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.25em;writing-mode:vertical-rl">RYU MIENO / TYPOGRAPHY</div><div style="position:absolute;right:17%;bottom:16px;width:30%;border-top:5px solid #1b1b63;padding-top:7px"><div style="font:800 25px/.9 'Yu Gothic',sans-serif">文字实验</div><div style="margin-top:6px;font:600 9px/1.45 'Yu Gothic',sans-serif">拉伸、切割、越界。字本身就是图像。</div></div>`,
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
    'us-actual-source',
    'us',
    '出版即现场',
    'Actual Source：以自定规则连接字体、出版、服装、展览与限量物件。',
    'background:#e8e5dc;color:#111',
    `<div style="position:absolute;left:0;top:0;width:57%;height:100%;background:#1829ff;color:#f4f0e7;padding:14px 18px"><div style="font:900 clamp(48px,9vw,104px)/.68 Helvetica,Arial,sans-serif;letter-spacing:-.1em">AS<br>026</div><div style="position:absolute;left:18px;bottom:14px;font:800 8px/1 ui-monospace,monospace;letter-spacing:.18em">BOOK / OBJECT / SPACE</div></div><div style="position:absolute;right:4%;top:12%;width:32%;font:900 clamp(22px,4vw,44px)/.82 Helvetica,Arial,sans-serif;letter-spacing:-.06em;text-align:right">出版<br>即现场</div><div style="position:absolute;right:4%;bottom:14px;width:31%;border-top:6px solid #ff4e2f;padding-top:7px;font:700 9px/1.35 ui-monospace,monospace">ACTUAL SOURCE<br>SELF-SET RULES</div>`,
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
    'eu-dumbar',
    'eu',
    '动态身份',
    'Studio Dumbar：字体、声音、创意编码与动作共同构成会变化的公共身份。',
    'background:#e6ff00;color:#111',
    `<div style="position:absolute;left:-4%;top:6%;font:900 clamp(78px,15vw,170px)/.68 Helvetica,Arial,sans-serif;letter-spacing:-.12em;transform:rotate(-8deg)">MOVE</div><div style="position:absolute;left:33%;top:42%;font:900 clamp(49px,9vw,105px)/.7 Helvetica,Arial,sans-serif;letter-spacing:-.09em;transform:rotate(11deg);color:#ec28a8">TYPE</div><div style="position:absolute;right:15px;top:14px;font:800 8px/1.4 ui-monospace,monospace;letter-spacing:.18em;text-align:right">STUDIO DUMBAR<br>CODE / SOUND / MOTION</div><div style="position:absolute;left:18px;bottom:13px;font:900 20px/.9 'Arial Narrow',sans-serif">动态身份 / IDENTITY BEHAVES</div>`,
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
    'eu-rudnick',
    'eu',
    '后数字排印',
    'David Rudnick：精密网格承载计算式重复、受控失真与电子音乐文化。',
    'background:#11131a;color:#d7ff42',
    `<div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 23px,rgba(215,255,66,.15) 23px 24px),repeating-linear-gradient(0deg,transparent 0 15px,rgba(215,255,66,.12) 15px 16px)"></div><div style="position:absolute;left:4%;top:4%;font:900 clamp(72px,14vw,158px)/.63 'Arial Narrow',Helvetica,sans-serif;letter-spacing:-.13em;transform:scaleX(.76);transform-origin:left">POST<br>DIGITAL</div><div style="position:absolute;left:44%;top:10%;height:78%;border-left:9px double #ff4f8b;transform:skewX(-13deg)"></div><div style="position:absolute;right:16px;bottom:13px;text-align:right;font:800 8px/1.4 ui-monospace,monospace;letter-spacing:.16em">DAVID RUDNICK<br>GRID / ERROR / REPEAT</div>`,
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
    'cn-shanghai-mode',
    'cn',
    '上海 MODE',
    '国际时装编辑网格里放进锐利汉字，不靠旗袍、月份牌或老上海符号。',
    'background:#d8ff36;color:#171717',
    `<div style="position:absolute;left:5%;top:8%;font:900 clamp(72px,14vw,160px)/.72 'Heiti SC','Microsoft YaHei',sans-serif;letter-spacing:-.13em">上<br>海</div><div style="position:absolute;left:42%;top:16px;font:300 clamp(48px,8vw,96px)/.8 Didot,'Times New Roman',serif;letter-spacing:-.08em">MODE</div><div style="position:absolute;right:18px;bottom:15px;width:28%;border-top:6px solid;padding-top:6px;font:700 9px/1.4 ui-monospace,monospace">SHANGHAI / 26SS<br>NEW CHINESE EDITORIAL</div>`,
  ),
  html(
    'cn-gba-tech',
    'cn',
    '湾区机能',
    '深圳速度、硬件界面与机能服装：冷银、状态绿、编号和模块接口。',
    'background:linear-gradient(120deg,#eef1f3,#8a96a2 52%,#dce2e7);color:#10151c',
    `<div style="position:absolute;inset:12px;border:1px solid rgba(10,20,30,.38)"></div><div style="position:absolute;left:22px;top:20px;font:800 8px/1 ui-monospace,monospace;letter-spacing:.2em">GBA_0755 / SYSTEM READY</div><div style="position:absolute;left:5%;bottom:12px;font:900 clamp(46px,8vw,96px)/.68 'Arial Narrow','Heiti SC',sans-serif;letter-spacing:-.09em">湾区机能</div><div style="position:absolute;right:20px;top:20px;width:12px;height:12px;border-radius:50%;background:#74ff39;box-shadow:0 0 18px #74ff39"></div><div style="position:absolute;right:20px;bottom:17px;font:700 9px/1 ui-monospace,monospace;writing-mode:vertical-rl;letter-spacing:.2em">HARDWARE / BODY / CITY</div>`,
  ),
  html(
    'cn-variable-hanzi',
    'cn',
    '可变汉字',
    '压缩、拉宽、切片和重叠，让中文标题拥有时装刊头的身体感。',
    'background:#ff477e;color:#351269',
    `<div style="position:absolute;left:-3%;top:-20%;font:900 clamp(150px,27vw,310px)/1 'Heiti SC',sans-serif;letter-spacing:-.22em;transform:scaleX(.62);transform-origin:left center">变</div><div style="position:absolute;left:39%;top:8%;font:900 clamp(76px,13vw,150px)/.72 'Heiti SC',sans-serif;letter-spacing:-.16em;transform:scaleX(1.35)">字</div><div style="position:absolute;right:18px;bottom:15px;background:#b9ff35;padding:5px 8px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.18em">VARIABLE HANZI / WIDTH 138</div>`,
  ),
  html(
    'cn-hanzi-lexicon',
    'cn',
    '汉字辞典',
    '取法韩家英以点、线、方、圆和汉字建立当代视觉辞典的方法。',
    'background:#ecebe5;color:#151515',
    `<div style="position:absolute;left:-2%;top:-30%;font:900 clamp(170px,30vw,340px)/1 'Heiti SC',sans-serif;letter-spacing:-.2em;color:#1357ff">字</div><div style="position:absolute;left:45%;top:0;width:1px;height:100%;background:#151515"></div><div style="position:absolute;left:45%;top:25%;width:46px;height:46px;border:9px solid #ff3b20;border-radius:50%"></div><div style="position:absolute;left:calc(45% + 27px);top:0;width:1px;height:100%;background:#151515"></div><div style="position:absolute;right:17px;top:14px;text-align:right;font:800 8px/1.45 ui-monospace,monospace;letter-spacing:.16em">点 01<br>线 02<br>方 03<br>圆 04</div><div style="position:absolute;right:17px;bottom:13px;font:900 clamp(22px,4vw,42px)/.8 'Heiti SC',sans-serif;letter-spacing:-.08em">汉字辞典</div>`,
  ),
  html(
    'cn-bilingual-editorial',
    'cn',
    '双语刊头',
    '参考广煜与Nod Young对中英文字体关系、比例和商业秩序的持续实验。',
    'background:#d9ff43;color:#111',
    `<div style="position:absolute;left:4%;top:10%;font:900 clamp(58px,11vw,126px)/.66 'Heiti SC',sans-serif;letter-spacing:-.13em">双语<br>刊头</div><div style="position:absolute;left:39%;top:0;width:22%;height:100%;background:#111;color:#d9ff43;display:flex;align-items:flex-end;padding:0 8px 14px;font:800 9px/1.15 Arial,sans-serif;letter-spacing:.08em;writing-mode:vertical-rl">BILINGUAL EDITORIAL SYSTEM</div><div style="position:absolute;right:4%;top:13%;width:31%;font:700 clamp(13px,2.2vw,25px)/.88 Arial,sans-serif;letter-spacing:-.05em;text-align:right">CHINESE<br>TYPE IN<br>CONTEXT</div><div style="position:absolute;right:4%;bottom:13px;font:800 8px/1 ui-monospace,monospace;letter-spacing:.18em">CN—EN / ISSUE 026</div>`,
  ),
  html(
    'cn-abstract-east',
    'cn',
    '抽象东方',
    '沿用刘治治拒绝堆砌传统符号、以抽象形式传达东方判断的方法。',
    'background:#f0ede4;color:#151515',
    `<div style="position:absolute;left:7%;top:-12%;width:19%;height:124%;background:#ff4e20;transform:skewX(-11deg)"></div><div style="position:absolute;left:33%;top:18%;width:39%;height:46%;border:2px solid #151515;transform:rotate(-7deg)"></div><div style="position:absolute;left:58%;top:33%;width:28%;height:13%;background:#151515;transform:rotate(18deg)"></div><div style="position:absolute;left:31%;bottom:12px;font:900 clamp(35px,6vw,72px)/.72 'Heiti SC',sans-serif;letter-spacing:-.11em">抽象<br>东方</div><div style="position:absolute;right:15px;top:14px;font:800 8px/1.5 ui-monospace,monospace;letter-spacing:.15em;text-align:right">NO SYMBOLS<br>FORM / SPIRIT<br>东方判断</div>`,
  ),
  html(
    'cn-street-type',
    'cn',
    '街头字库',
    '从滑板、独立音乐与城市贴纸提取中文粗体，不做仿古书法。',
    'background:#ff7139;color:#1233a8',
    `<div style="position:absolute;inset:8px;border:4px solid #1233a8"></div><div style="position:absolute;left:3%;top:6%;font:900 clamp(65px,12vw,138px)/.7 'Heiti SC','Arial Black',sans-serif;letter-spacing:-.14em;transform:rotate(-4deg)">街头<br>字库</div><div style="position:absolute;right:5%;top:16px;background:#caff38;padding:4px 8px;font:900 9px/1 ui-monospace,monospace;letter-spacing:.18em;transform:rotate(3deg)">LOCAL TYPE / 021</div><div style="position:absolute;right:5%;bottom:14px;font:800 10px/1.25 ui-monospace,monospace;text-align:right">SKATE / MUSIC<br>YOUTH / CITY</div>`,
  ),
  html(
    'cn-art-book',
    'cn',
    '当代艺术书',
    '克制的展览编号、巨大留白和突然出现的高纯度色块。',
    'background:#f7f7f5;color:#111',
    `<div style="position:absolute;left:8%;top:0;width:17%;height:66%;background:#224cff"></div><div style="position:absolute;left:8%;bottom:14px;font:700 8px/1 ui-monospace,monospace;letter-spacing:.2em">EXHIBITION 026<br>CHAPTER 04 / OBJECT 11</div><div style="position:absolute;left:42%;top:17%;font:300 clamp(40px,7vw,84px)/.82 'Songti SC',serif;letter-spacing:.06em">当代<br>艺术书</div><div style="position:absolute;right:18px;bottom:15px;width:22%;border-top:1px solid;padding-top:7px;font:500 9px/1.5 'Heiti SC',sans-serif">空间先于解释<br>编号先于装饰</div>`,
  ),
  html(
    'cn-poster-field',
    'cn',
    '海报现场',
    '借鉴何见平跨文化海报中的字体碰撞、尺度切换与强烈现场感。',
    'background:#ef3428;color:#101010',
    `<div style="position:absolute;left:-5%;top:-17%;font:900 clamp(150px,27vw,310px)/1 'Heiti SC',sans-serif;color:#f3dc42;transform:rotate(8deg)">现</div><div style="position:absolute;left:47%;top:-8%;font:900 clamp(105px,19vw,220px)/1 'Heiti SC',sans-serif;color:#151515;transform:rotate(-12deg)">场</div><div style="position:absolute;inset:0;border:clamp(9px,1.8vw,20px) solid #ef3428"></div><div style="position:absolute;left:17px;top:14px;color:#fff;font:800 8px/1.3 ui-monospace,monospace;letter-spacing:.2em">POSTER<br>AS EVENT</div><div style="position:absolute;right:16px;bottom:13px;background:#fff;padding:5px 7px;font:900 9px/1 'Heiti SC',sans-serif;letter-spacing:.12em">海报现场 / 026</div>`,
  ),
  html(
    'cn-beyond-page',
    'cn',
    '超越平面',
    '呼应王序从二维走向多维的主张，让书页、空间和文字形成纵深。',
    'background:#d8d4c9;color:#111',
    `<div style="position:absolute;left:8%;top:9%;width:52%;height:70%;background:#174cff;box-shadow:14px 13px 0 #ff5138,28px 26px 0 #f5f1e7;transform:perspective(260px) rotateY(24deg) rotateZ(-5deg)"></div><div style="position:absolute;left:14%;top:17%;font:900 clamp(46px,8vw,94px)/.7 'Heiti SC',sans-serif;color:#fff;letter-spacing:-.1em;transform:rotate(-5deg)">超越<br>平面</div><div style="position:absolute;right:16px;top:14px;font:800 8px/1.4 ui-monospace,monospace;letter-spacing:.18em;text-align:right">2D → 3D<br>PAGE → SPACE<br>01—05</div><div style="position:absolute;right:16px;bottom:13px;width:25%;border-top:2px solid;padding-top:6px;font:800 9px/1.2 'Heiti SC',sans-serif">书页不是边界<br>而是入口</div>`,
  ),

  live(
    'jp-live-type',
    'jp',
    '文字动势',
    '汉字持续改变字宽，文字本身成为动态图形。',
    `<div style="height:100%;overflow:hidden;background:#ff6b55;color:#1b1b63;position:relative"><div id="b" style="position:absolute;left:-3%;top:-24%;font:900 210px/1 'Yu Gothic',sans-serif;transform-origin:left center">字</div><div style="position:absolute;right:22px;bottom:18px;font:800 10px/1 ui-monospace,monospace;letter-spacing:.25em">TYPOGRAPHY / TOKYO</div></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.025;if(e)e.style.transform='scaleX('+(0.52+Math.sin(t)*0.2)+')';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-ohara',
    'jp',
    '风中文字',
    '纸片字在空气与影子之间缓慢寻找平衡。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#f6f0d8;color:#181818"><div id="a" style="position:absolute;left:18%;top:14%;font:900 94px/1 'Yu Gothic',sans-serif;color:#ee482f;filter:drop-shadow(15px 18px 0 rgba(0,0,0,.14))">文</div><div id="b" style="position:absolute;left:43%;top:8%;font:900 104px/1 'Yu Gothic',sans-serif;color:#1956c8;filter:drop-shadow(12px 16px 0 rgba(0,0,0,.13))">字</div><div style="position:absolute;right:22px;bottom:17px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.2em">TYPE / AIR / SHADOW</div></div><script>(function(){var a=document.getElementById('a'),b=document.getElementById('b'),t=0;function f(){t+=.018;if(a)a.style.transform='translateY('+Math.sin(t)*8+'px) rotate('+(-9+Math.sin(t)*5)+'deg)';if(b)b.style.transform='translateY('+Math.cos(t)*9+'px) rotate('+(8+Math.cos(t)*4)+'deg)';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'jp-live-yoshirotten',
    'jp',
    '银色太阳',
    '自然光与数字银面随时间缓慢改变相位。',
    `<div style="height:100%;background:#101113;color:#f4f1e9;position:relative;overflow:hidden"><div id="s" style="position:absolute;left:15%;top:-48%;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle at 34% 27%,#fff,#cfd3d4 17%,#62676d 42%,#f0f1ec 58%,#303339 72%);box-shadow:0 0 48px rgba(127,255,210,.3)"></div><div style="position:absolute;right:22px;bottom:17px;font:900 28px/.8 'Yu Gothic',sans-serif">FUTURE NATURE</div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=.01;if(e)e.style.transform='rotate('+t*12+'deg) scale('+(1+Math.sin(t)*.04)+')';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'jp-live-kawamura',
    'jp',
    '错位切片',
    '单一图像被持续切片、横移，再重构为新的整体。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#ff4b36"><div id="s" style="position:absolute;inset:8% 4%;background:repeating-linear-gradient(90deg,#111 0 7px,#f3e8cd 7px 13px,#3258ff 13px 19px,#ff4b36 19px 24px);clip-path:polygon(0 8%,100% 0,93% 90%,5% 100%)"></div><div style="position:absolute;right:22px;bottom:17px;background:#f3e8cd;padding:4px 7px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.2em">SLICE / SHIFT / REBUILD</div></div><script>(function(){var e=document.getElementById('s'),x=0;function f(){x=(x+.18)%24;if(e)e.style.backgroundPosition=x+'px '+(-x*.4)+'px';requestAnimationFrame(f)}f()})()</script>`,
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
    'us-live-dia',
    'us',
    '运动身份',
    'DIA 式字体系统把时间、节奏和响应写进身份行为。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#e8ff35;color:#111"><div id="b" style="position:absolute;left:4%;top:8%;font:900 108px/.72 Helvetica,Arial,sans-serif;letter-spacing:-.12em;transform-origin:left center">BEHAVE</div><div style="position:absolute;right:22px;bottom:17px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.2em">DIA / TIME IS FORM</div></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=.025;if(e)e.style.transform='scaleX('+(0.58+Math.sin(t)*.26)+') skewX('+(Math.cos(t)*8)+'deg)';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'eu-live-swiss',
    'eu',
    '瑞士网格',
    '格子自己眨眼。',
    `<div id="b" style="height:100%;background:#efefef;background-image:linear-gradient(#bbb 1px,transparent 1px),linear-gradient(90deg,#bbb 1px,transparent 1px);background-size:32px 32px;color:#111;display:flex;align-items:flex-end;padding:24px 32px;font:800 22px Helvetica,Arial,sans-serif">网格</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.15;if(e)e.style.backgroundSize=32+Math.sin(t)*4+'px '+ (32+Math.cos(t)*4)+'px';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'eu-live-dumbar',
    'eu',
    '字体行为',
    '编码、动作与声音感共同驱动字体身份。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#e6ff00;color:#111"><div id="a" style="position:absolute;left:-4%;top:8%;font:900 116px/.68 Helvetica,Arial,sans-serif;letter-spacing:-.12em">MOVE</div><div id="b" style="position:absolute;left:43%;top:38%;font:900 82px/.7 Helvetica,Arial,sans-serif;letter-spacing:-.1em;color:#ec28a8">TYPE</div><div style="position:absolute;right:20px;bottom:16px;font:800 9px/1 ui-monospace,monospace">IDENTITY BEHAVES</div></div><script>(function(){var a=document.getElementById('a'),b=document.getElementById('b'),t=0;function f(){t+=.025;if(a)a.style.transform='translateX('+Math.sin(t)*20+'px) rotate('+(-7+Math.sin(t)*5)+'deg)';if(b)b.style.transform='translateY('+Math.cos(t)*15+'px) rotate('+(8+Math.cos(t)*6)+'deg)';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'eu-live-rudnick',
    'eu',
    '网格误差',
    '受控失真在精密网格中持续累积。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#11131a;color:#d7ff42;background-image:linear-gradient(rgba(215,255,66,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(215,255,66,.12) 1px,transparent 1px);background-size:24px 16px"><div id="b" style="position:absolute;left:4%;top:6%;font:900 112px/.65 'Arial Narrow',Helvetica,sans-serif;letter-spacing:-.13em;transform-origin:left center">ERROR</div><div style="position:absolute;right:20px;bottom:16px;color:#ff4f8b;font:800 9px/1 ui-monospace,monospace">GRID / REPEAT / 026</div></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=.03;if(e){var x=Math.round(Math.sin(t)*5);e.style.transform='translateX('+x+'px) skewX('+(Math.cos(t)*-12)+'deg)';e.style.textShadow=(-x)+'px 0 #ff4f8b';}requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'eu-live-weingart',
    'eu',
    '新浪潮',
    '字距在呼吸。',
    `<div id="b" style="height:100%;background:#2357ff;color:#f8ff4f;display:flex;align-items:flex-end;padding:24px 32px;font:800 20px Helvetica,Arial,sans-serif;letter-spacing:.4em">WEINGART</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.03;if(e)e.style.letterSpacing=(.2+Math.sin(t)*.35)+'em';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-variable',
    'cn',
    '可变汉字',
    '字宽在压缩与扩张之间持续变形。',
    `<div style="height:100%;background:#ff477e;color:#351269;overflow:hidden;position:relative"><div id="b" style="position:absolute;left:-3%;top:-25%;font:900 225px/1 'Heiti SC',sans-serif;transform-origin:left center">变</div><div style="position:absolute;right:22px;bottom:18px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.22em">VARIABLE HANZI</div></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=.025;if(e)e.style.transform='scaleX('+(0.48+Math.sin(t)*.28)+')';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'cn-live-lexicon',
    'cn',
    '辞典变奏',
    '点、线、方、圆围绕汉字重新组织语法。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#ecebe5;color:#151515"><div style="position:absolute;left:-2%;top:-34%;font:900 230px/1 'Heiti SC',sans-serif;color:#1357ff">字</div><div id="c" style="position:absolute;left:49%;top:24%;width:52px;height:52px;border:10px solid #ff3b20;border-radius:50%"></div><div id="l" style="position:absolute;left:50%;top:0;width:1px;height:100%;background:#151515"></div><div style="position:absolute;right:20px;bottom:16px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.18em">点 / 线 / 方 / 圆</div></div><script>(function(){var c=document.getElementById('c'),l=document.getElementById('l'),t=0;function f(){t+=.02;if(c)c.style.transform='translate('+(Math.sin(t)*28)+'px,'+(Math.cos(t)*12)+'px)';if(l)l.style.transform='rotate('+(Math.sin(t)*8)+'deg)';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'cn-live-bilingual',
    'cn',
    '双语伸缩',
    '中英文比例在同一刊头系统中持续协商。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#d9ff43;color:#111"><div id="c" style="position:absolute;left:4%;top:9%;font:900 108px/.67 'Heiti SC',sans-serif;letter-spacing:-.13em;transform-origin:left center">双语</div><div id="e" style="position:absolute;left:43%;top:42%;font:900 58px/.7 Helvetica,Arial,sans-serif;letter-spacing:-.08em;transform-origin:left center">TYPE</div><div style="position:absolute;right:20px;bottom:16px;font:800 9px/1 ui-monospace,monospace">CN—EN / SYSTEM</div></div><script>(function(){var c=document.getElementById('c'),e=document.getElementById('e'),t=0;function f(){t+=.024;if(c)c.style.transform='scaleX('+(0.62+Math.sin(t)*.22)+')';if(e)e.style.transform='scaleX('+(1.12-Math.sin(t)*.3)+')';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'cn-live-page',
    'cn',
    '书页入场',
    '二维书页持续翻入空间，文字成为入口。',
    `<div style="height:100%;position:relative;overflow:hidden;background:#d8d4c9;color:#111;perspective:320px"><div id="a" style="position:absolute;left:10%;top:11%;width:46%;height:72%;background:#174cff;box-shadow:14px 13px 0 #ff5138,28px 26px 0 #f5f1e7;transform-style:preserve-3d"></div><div style="position:absolute;left:15%;top:19%;font:900 58px/.72 'Heiti SC',sans-serif;color:#fff">超越<br>平面</div><div style="position:absolute;right:20px;bottom:16px;font:800 9px/1 ui-monospace,monospace">PAGE → SPACE</div></div><script>(function(){var e=document.getElementById('a'),t=0;function f(){t+=.018;if(e)e.style.transform='rotateY('+(20+Math.sin(t)*17)+'deg) rotateZ('+(-5+Math.cos(t)*3)+'deg)';requestAnimationFrame(f)}f()})()</script>`,
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
