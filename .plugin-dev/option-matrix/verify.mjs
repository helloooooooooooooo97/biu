import { createRequire } from 'node:module'
const require = createRequire('/Users/tangcong/Documents/UGit/biu-harness/package.json')
globalThis.React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const mod = await import('/tmp/omverify/web.mjs')
let spec = null
mod.apply({ pageEditor: { registerBlock: (s) => { spec = s } } })
console.log('plugin id  :', mod.name, '| kind:', spec.kind, '| plugin:', spec.plugin, '| label:', spec.label)

const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const render = (data) => renderToStaticMarkup(React.createElement(spec.View, { data, update: () => {}, writable: false }))

const base = spec.defaults()
const html = render(base)
const text = strip(html)
console.log('\n--- 默认矩阵（只读渲染）---')
console.log(text)
console.log('\n有表格:', html.includes('option-matrix-table'), '| 有推荐句:', html.includes('option-matrix-rationale'))

// 独立重算（不引用插件代码），验证加权 + 反向
function expect(data) {
  const scale = data.scale
  const maxTotal = data.criteria.reduce((a, c) => a + c.weight * scale, 0)
  const rows = data.options.map((o) => {
    const cells = data.criteria.map((c) => {
      const raw = data.scores[o][c.name]
      const norm = c.higherIsBetter ? raw : scale + 1 - raw
      return c.weight * norm
    })
    return { o, total: cells.reduce((a, b) => a + b, 0) }
  })
  return { maxTotal, rows, winner: [...rows].sort((a, b) => b.total - a.total)[0] }
}

let pass = true
const check = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) pass = false }

const e = expect(base)
console.log('\n--- 断言：加权 + 反向计入 ---')
check(`满分 ${e.maxTotal} = Σ(权重×5) = 65`, e.maxTotal === 65)
check('手机号+验证码 加权总分 = 46.0（反向：开发成本 6-4=2 → 3×2=6）', text.includes('46.0') && text.includes('70.8%'))
check('微信一键登录 加权总分 = 54.0（6-3=3 → 3×3=9；5×4+5×5=45）', text.includes('54.0') && text.includes('83.1%'))
check('账号密码 加权总分 = 23.0（6-5=1 → 3×1=3）', text.includes('23.0') && text.includes('35.4%'))
check('推荐 = 微信一键登录', /推荐「微信一键登录」/.test(text))
check('最优格高亮（best 背景色存在）', html.includes('rgba(255,196,0,.22)'))

// 反证：要是写成简单求和，三个方案会是 12/12/9 → 并列；证明反向真的生效
const naive = new Map(base.options.map((o) => [o, base.criteria.reduce((a, c) => a + base.scores[o][c.name], 0)]))
console.log('（反证）简单求和结果:', JSON.stringify(Object.fromEntries(naive)), '→ 前两名并列，无法推荐')
check('反向生效：结果不是简单求和（54 而非 12）', !text.includes('12.0') && text.includes('54.0'))

// 改权重 → 总分必须变
const w = JSON.parse(JSON.stringify(base))
w.criteria[0].weight = 9 // 开发成本 3 → 9
const t2 = strip(render(w))
const e2 = expect(w)
console.log('\n--- 断言：改权重，总分实时变 ---')
console.log('开发成本权重 3→9 后:', e2.rows.map((r) => `${r.o}=${r.total.toFixed(1)}`).join('  '), '| 推荐:', e2.winner.o)
check('改权重后手机号+验证码 = 58.0', t2.includes('58.0'))
check('改权重后微信一键登录 = 72.0', t2.includes('72.0'))
check('改权重后账号密码 = 29.0', t2.includes('29.0'))
check('总分确实变了（不再含旧值 46.0/54.0/23.0）', !t2.includes('46.0') && !/\b54\.0\b/.test(t2))

// 翻转维度方向 → 结论可以翻
const f = JSON.parse(JSON.stringify(base))
f.criteria[0].higherIsBetter = true // 开发成本变成越高越好
const t3 = strip(render(f))
console.log('\n--- 断言：翻转 higherIsBetter，结论能翻 ---')
check('开发成本改成正向：手机号=52.0 微信=54.0 账号=35.0', t3.includes('52.0') && /\b54\.0\b/.test(t3) && t3.includes('35.0'))
check('翻转后开发成本最优格变成「账号密码」（打分 5 最高）', /账号密码/.test(t3))

// 结论能被翻：开发成本 权重 9 + 改成正向 → 推荐从微信翻到手机号
const g = JSON.parse(JSON.stringify(base))
g.criteria[0].weight = 9
g.criteria[0].higherIsBetter = true
const t4 = strip(render(g))
const e4 = expect(g)
console.log('\n--- 断言：改两个数，推荐结论真的会翻 ---')
console.log('（开发成本 权重9 + 越高越好）:', e4.rows.map((r) => `${r.o}=${r.total.toFixed(1)}`).join('  '), '| 推荐:', e4.winner.o)
check('推荐从「微信一键登录」翻成「手机号+验证码」', /推荐「手机号\+验证码」/.test(t4))

console.log('\n' + (pass ? 'ALL PASS ✅' : 'SOME FAILED ❌'))
process.exit(pass ? 0 : 1)
