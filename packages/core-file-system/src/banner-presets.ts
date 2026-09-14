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
    'jp-groovisions',
    'jp',
    '东京流行',
    'Groovisions：扁平角色、音乐、动态图形与商品系统，轻快而精准。',
    'background:#53d7ff;color:#112342',
    `<div style="position:absolute;inset:0;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:1fr 1fr;gap:5px;padding:5px"><i style="background:#ffef45"></i><i style="background:#ff5ca8"></i><i style="background:#fff"></i><i style="background:#7557ff"></i><i style="background:#ff784f"></i><i style="background:#112342"></i><i style="background:#fff"></i><i style="background:#ffef45"></i><i style="background:#ff5ca8"></i><i style="background:#fff"></i></div><div style="position:relative;height:100%;display:grid;place-items:center"><div style="width:112px;height:112px;border-radius:56px;background:#fff;display:grid;place-items:center;box-shadow:8px 8px 0 #112342"><div style="font:900 37px/.8 Helvetica,sans-serif;letter-spacing:-.08em">GV<br>01</div></div><div style="position:absolute;left:16px;bottom:13px;background:#112342;color:#fff;padding:4px 7px;font:800 9px/1 sans-serif;letter-spacing:.2em">GROOVISIONS / TOKYO POP</div></div>`,
  ),
  html(
    'jp-tokyo-chrome',
    'jp',
    '东京银幕',
    '银色液态材质、极窄字与酸性绿，来自东京机能时装和数码秀场。',
    'background:linear-gradient(112deg,#eef1f4 0%,#8f99a8 34%,#fafafa 52%,#67717d 76%,#d8dde2 100%);color:#10131a',
    `<div style="position:absolute;left:8%;top:12%;width:84%;height:76%;border:1px solid rgba(0,0,0,.24);clip-path:polygon(0 0,92% 0,100% 38%,88% 100%,7% 88%);background:linear-gradient(135deg,rgba(255,255,255,.72),rgba(85,255,54,.28),rgba(255,255,255,.08));backdrop-filter:blur(8px)"></div><div style="position:relative;height:100%;padding:15px 20px;display:flex;flex-direction:column;justify-content:space-between"><div style="display:flex;justify-content:space-between;font:800 8px/1 ui-monospace,monospace;letter-spacing:.28em"><span>TOKYO / CHROME</span><span>26SS</span></div><div style="font:900 clamp(38px,7vw,82px)/.72 'Arial Narrow',Helvetica,sans-serif;letter-spacing:-.07em;transform:scaleX(.72);transform-origin:left bottom">东京银幕</div><div style="position:absolute;right:19px;bottom:15px;background:#7dff36;padding:4px 7px;font:800 9px/1 ui-monospace,monospace">LIQUID / UTILITY</div></div>`,
  ),
  html(
    'jp-harajuku-soft',
    'jp',
    '原宿软塑',
    '透明果冻、软体字和糖果撞色，轻盈但不幼稚。',
    'background:#ffc9e8;color:#3a2070',
    `<div style="position:absolute;left:7%;top:10%;width:130px;height:130px;border-radius:48% 52% 62% 38%/42% 34% 66% 58%;background:linear-gradient(145deg,rgba(255,255,255,.8),#8c7bff 48%,#54f0d1);box-shadow:inset 12px 12px 28px rgba(255,255,255,.65),12px 18px 30px rgba(67,34,117,.18);transform:rotate(-14deg)"></div><div style="position:absolute;right:6%;top:16%;font:900 clamp(38px,7vw,78px)/.74 'Arial Rounded MT Bold','Yu Gothic',sans-serif;letter-spacing:-.08em;text-align:right">SOFT<br>MODE</div><div style="position:absolute;right:7%;bottom:15px;font:700 9px/1 ui-monospace,monospace;letter-spacing:.22em">HARAJUKU / NEW MATERIAL</div>`,
  ),
  html(
    'jp-data-stage',
    'jp',
    '数据舞台',
    '实时视觉、坐标、扫描线与高纯度光色，把信息变成秀场。',
    'background:#090d24;color:#d8ff00;background-image:linear-gradient(rgba(72,118,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(72,118,255,.16) 1px,transparent 1px);background-size:20px 20px',
    `<div style="position:absolute;left:10%;top:17%;width:150px;height:92px;border:1px solid #4c76ff;transform:perspective(220px) rotateY(22deg)"><div style="position:absolute;inset:12px;background:linear-gradient(90deg,#ff32c7,#6847ff 52%,#00e5ff);filter:blur(1px)"></div></div><div style="position:absolute;right:5%;top:16px;font:700 8px/1 ui-monospace,monospace;letter-spacing:.22em">LIVE DATA / TOKYO 35.6762°N</div><div style="position:absolute;left:19px;bottom:14px;font:800 clamp(28px,5vw,56px)/.8 'Yu Gothic',sans-serif;letter-spacing:-.06em">数据舞台</div><div style="position:absolute;right:5%;bottom:15px;width:22%;font:600 9px/1.35 ui-monospace,monospace">SCAN / SIGNAL<br>BODY / SPACE</div>`,
  ),
  html(
    'jp-numero',
    'jp',
    '东京时装编辑',
    'Numéro TOKYO 式知性与玩心：巨型刊头、细字信息和不对称色场。',
    'background:#ff5f3d;color:#161245',
    `<div style="position:absolute;right:0;top:0;width:36%;height:100%;background:#a7f0dd"></div><div style="position:absolute;left:4%;top:-10%;font:300 clamp(110px,19vw,220px)/1 Didot,'Times New Roman',serif;letter-spacing:-.09em">N°</div><div style="position:absolute;left:18px;bottom:13px;font:900 29px/.9 'Arial Narrow',sans-serif;letter-spacing:-.04em">TOKYO<br>MODE</div><div style="position:absolute;right:18px;top:16px;width:27%;font:700 8px/1.45 ui-monospace,monospace;letter-spacing:.16em">NEW SILHOUETTE<br>NEW ATTITUDE<br>ISSUE 026</div>`,
  ),
  html(
    'jp-hybrid-tailoring',
    'jp',
    '混合剪裁',
    '像 sacai 的服装逻辑：经典结构被切开、错层，再缝成新的轮廓。',
    'background:#e8e7ff;color:#161616',
    `<div style="position:absolute;left:0;top:0;width:58%;height:100%;background:#202020;clip-path:polygon(0 0,82% 0,100% 46%,72% 100%,0 100%)"></div><div style="position:absolute;left:31%;top:0;width:37%;height:100%;background:#ff6b45;clip-path:polygon(20% 0,100% 0,72% 100%,0 100%)"></div><div style="position:relative;height:100%;padding:15px 20px;color:#fff;mix-blend-mode:difference"><div style="font:800 9px/1 ui-monospace,monospace;letter-spacing:.24em">HYBRID / TAILORING</div><div style="position:absolute;left:20px;bottom:13px;font:900 clamp(34px,6vw,72px)/.72 Helvetica,sans-serif;letter-spacing:-.07em">混合剪裁</div><div style="position:absolute;right:18px;bottom:15px;writing-mode:vertical-rl;font:700 9px/1 'Yu Gothic',sans-serif;letter-spacing:.22em">解构经典　重组轮廓</div></div>`,
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
    'jp-live-chrome',
    'jp',
    '流动银幕',
    '镜面高光缓慢掠过机能切面。',
    `<div id="b" style="height:100%;position:relative;overflow:hidden;background:linear-gradient(112deg,#eef1f4,#7d8794 42%,#fafafa 52%,#67717d);color:#10131a"><div style="position:absolute;left:22px;bottom:18px;font:900 34px/.8 'Arial Narrow',sans-serif;letter-spacing:-.06em">TOKYO CHROME</div><div id="s" style="position:absolute;inset:-40% auto -40% -20%;width:25%;background:rgba(125,255,54,.55);filter:blur(18px);transform:skewX(-18deg)"></div></div><script>(function(){var e=document.getElementById('s'),x=-20;function f(){x+=.22;if(x>120)x=-25;if(e)e.style.left=x+'%';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'jp-live-soft',
    'jp',
    '软塑变形',
    '果冻材质像面料一样缓慢改变轮廓。',
    `<div style="height:100%;background:#ffc9e8;color:#3a2070;position:relative;overflow:hidden"><div id="s" style="position:absolute;left:16%;top:12%;width:145px;height:120px;background:linear-gradient(145deg,#fff,#8c7bff 48%,#54f0d1);box-shadow:inset 12px 12px 28px rgba(255,255,255,.7),12px 18px 30px rgba(67,34,117,.18)"></div><div style="position:absolute;right:22px;bottom:17px;font:900 29px/.8 'Arial Rounded MT Bold',sans-serif">SOFT MODE</div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=.018;if(e)e.style.borderRadius=(46+Math.sin(t)*16)+'% '+(54-Math.sin(t)*16)+'% '+(42+Math.cos(t)*13)+'% '+(58-Math.cos(t)*13)+'%';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'jp-live-runway',
    'jp',
    '东京跑马灯',
    '秀场标题在不对称色场上持续穿行。',
    `<div style="height:100%;overflow:hidden;background:linear-gradient(90deg,#ff5f3d 0 64%,#a7f0dd 64%);color:#161245;display:flex;align-items:center"><div style="display:inline-block;white-space:nowrap;font:900 62px/.8 'Arial Narrow',sans-serif;letter-spacing:-.06em;animation:m 10s linear infinite">TOKYO MODE · NEW SILHOUETTE · 東京モード · </div></div><style>html,body{margin:0;height:100%;overflow:hidden}@keyframes m{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>`,
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
    'cn-live-variable',
    'cn',
    '可变汉字',
    '字宽在压缩与扩张之间持续变形。',
    `<div style="height:100%;background:#ff477e;color:#351269;overflow:hidden;position:relative"><div id="b" style="position:absolute;left:-3%;top:-25%;font:900 225px/1 'Heiti SC',sans-serif;transform-origin:left center">变</div><div style="position:absolute;right:22px;bottom:18px;font:800 9px/1 ui-monospace,monospace;letter-spacing:.22em">VARIABLE HANZI</div></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=.025;if(e)e.style.transform='scaleX('+(0.48+Math.sin(t)*.28)+')';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'cn-live-stage',
    'cn',
    '华流光场',
    '镭射色场围绕舞台中心持续旋转。',
    `<div id="b" style="height:100%;background:conic-gradient(from 0deg at 68% 44%,#7a38ff,#ff39ad,#35d7ff,#7a38ff);color:#fff;display:flex;align-items:flex-end;padding:24px 32px;font:900 30px 'Heiti SC',sans-serif">华流舞台</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=.25;if(e)e.style.background='conic-gradient(from '+t+'deg at 68% 44%,#7a38ff,#ff39ad,#35d7ff,#7a38ff)';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'cn-live-jade',
    'cn',
    '数码玉',
    '透明材质在青绿与冰蓝之间流动。',
    `<div id="b" style="height:100%;background:linear-gradient(135deg,#83f5d0,#d7fff2 46%,#7cc7ff);color:#123b4d;position:relative"><div id="s" style="position:absolute;left:18%;top:17%;width:150px;height:108px;border-radius:58% 42% 48% 52%;background:rgba(255,255,255,.3);box-shadow:inset 18px 14px 30px rgba(255,255,255,.8),inset -16px -12px 28px rgba(24,120,116,.22)"></div><div style="position:absolute;right:22px;bottom:18px;font:800 25px 'Heiti SC',sans-serif">数码玉</div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=.02;if(e)e.style.transform='rotate('+Math.sin(t)*8+'deg) scale('+(1+Math.cos(t)*.05)+')';requestAnimationFrame(f)}f()})()</script>`,
  ),
  live(
    'cn-live-night',
    'cn',
    '午夜光轨',
    '电子蓝与粉红光轨扫过城市夜场。',
    `<div style="height:100%;background:#080817;color:#fff;position:relative;overflow:hidden"><div id="b" style="position:absolute;inset:-30%;background:conic-gradient(from 30deg,transparent 0 32%,#2057ff 33% 34%,transparent 35% 58%,#ff3f9d 59% 61%,transparent 62%);filter:blur(4px)"></div><div style="position:absolute;left:22px;bottom:17px;font:900 32px/.8 'Arial Narrow','Heiti SC',sans-serif">午夜上海</div></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=.18;if(e)e.style.transform='rotate('+t+'deg)';requestAnimationFrame(f)}f()})()</script>`,
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
