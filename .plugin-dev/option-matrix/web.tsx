const React = globalThis.React
const { useState, useMemo, useEffect, useRef } = React

export const name = 'option-matrix'
export const inject = ['pageEditor']

type Criterion = { name: string; weight: number; higherIsBetter: boolean }
type Scores = Record<string, Record<string, number>>
type Data = {
  title?: string
  scale?: number
  options?: string[]
  criteria?: Criterion[]
  scores?: Scores
}

type Cell = { name: string; raw: number; norm: number; weighted: number }

const SCALE = 5

const DEFAULTS: Data = {
  title: '登录方案选型',
  scale: SCALE,
  options: ['手机号+验证码', '微信一键登录', '账号密码'],
  criteria: [
    { name: '开发成本', weight: 3, higherIsBetter: false },
    { name: '安全性', weight: 5, higherIsBetter: true },
    { name: '转化率', weight: 5, higherIsBetter: true },
  ],
  scores: {
    '手机号+验证码': { 开发成本: 4, 安全性: 4, 转化率: 4 },
    '微信一键登录': { 开发成本: 3, 安全性: 4, 转化率: 5 },
    '账号密码': { 开发成本: 5, 安全性: 2, 转化率: 2 },
  },
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normScore(raw: number, higherIsBetter: boolean, scale: number): number {
  const v = Math.max(0, Math.min(scale, raw))
  // 关键：越低越好的维度反向计入 —— 高分代表成本高，这里换成 (scale+1-v)
  return higherIsBetter ? v : scale + 1 - v
}

type Row = { option: string; cells: (Cell & { best: boolean })[]; total: number; percent: number; rank: number }

function compute(data: Data) {
  const scale = Math.max(1, num(data.scale, SCALE))
  const options = data.options ?? []
  const criteria = data.criteria ?? []
  const scores = data.scores ?? {}
  const maxTotal = criteria.reduce((a, c) => a + Math.max(0, num(c.weight, 0)) * scale, 0)

  const rawRows: Row[] = options.map((option) => {
    const cells = criteria.map((c) => {
      const raw = Math.max(0, Math.min(scale, num(scores[option]?.[c.name], 0)))
      const higherIsBetter = c.higherIsBetter !== false
      const norm = normScore(raw, higherIsBetter, scale)
      const weighted = num(c.weight, 0) * norm
      return { name: c.name, raw, norm, weighted, best: false }
    })
    const total = cells.reduce((a, x) => a + x.weighted, 0)
    return { option, cells, total, percent: maxTotal ? total / maxTotal : 0, rank: 0 }
  })

  // 每个维度的最优格高亮（越高越好取最大，越低越好取最小 → 归一化后都是最大）
  criteria.forEach((_, ci) => {
    const bestNorm = Math.max(...rawRows.map((r) => (r.cells[ci] ? r.cells[ci].norm : -Infinity)), -Infinity)
    rawRows.forEach((r) => {
      if (r.cells[ci] && bestNorm > -Infinity && r.cells[ci].norm === bestNorm) r.cells[ci].best = true
    })
  })

  const ranked = [...rawRows].sort((a, b) => b.total - a.total || a.option.localeCompare(b.option))
  ranked.forEach((r, i) => {
    r.rank = i + 1
  })

  // 「为什么推荐它」：把各维度最优项拼起来
  const reasons = criteria.map((c) => {
    const higherIsBetter = c.higherIsBetter !== false
    const bestNorm = Math.max(...rawRows.map((r) => (r.cells.find((x) => x.name === c.name)?.norm ?? -Infinity)), -Infinity)
    const winners = rawRows.filter((r) => (r.cells.find((x) => x.name === c.name)?.norm ?? -Infinity) === bestNorm).map((r) => r.option)
    return { name: c.name, winners, higherIsBetter }
  })

  const winner = ranked[0] ?? null
  let rationale = ''
  if (winner) {
    const parts = reasons.map((r) => `「${r.name}」→ ${r.winners.join(' / ')}${r.higherIsBetter ? '' : '（越低越好）'}`)
    rationale = `推荐「${winner.option}」：加权总分 ${winner.total.toFixed(1)} / 满分 ${maxTotal.toFixed(1)}（${(winner.percent * 100).toFixed(1)}%）。各维度最优：${parts.join('；')}。`
  }

  return { scale, options, criteria, rows: rawRows, ranked, maxTotal, winner, rationale }
}

function toMarkdown(data: Data): string {
  const { scale, criteria, ranked } = compute(data)
  const arrow = (c: Criterion) => (c.higherIsBetter === false ? '↓越低越好' : '↑越高越好')
  const head = ['方案', ...criteria.map((c) => `${c.name} (权重${c.weight}, ${arrow(c)})`), '加权总分', '推荐']
  const sep = head.map(() => '---')
  const lines = [
    `### ${data.title || '方案对比'}（满分 ${criteria.reduce((a, c) => a + num(c.weight, 0) * scale, 0).toFixed(1)}）`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
  ]
  ranked.forEach((r) => {
    const cells = criteria.map((c) => {
      const cell = r.cells.find((x) => x.name === c.name)
      return cell ? (c.higherIsBetter === false ? `${cell.raw}（反向${cell.norm}）` : String(cell.raw)) : ''
    })
    lines.push(`| ${r.option} | ${cells.join(' | ')} | ${r.total.toFixed(1)} | ${r.rank === 1 ? '✅ 推荐' : `#${r.rank}`} |`)
  })
  lines.push('')
  lines.push('> 算法：总分 = Σ(权重 × 归一化分)；越低越好的维度归一化分 = scale+1 − 原分。')
  return lines.join('\n')
}

function ScoreInput({ value, max, onChange, readOnly }: { value: number; max: number; onChange: (v: number) => void; readOnly: boolean }) {
  if (readOnly) return React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, value)
  return React.createElement('input', {
    type: 'number',
    min: 0,
    max,
    value,
    onChange: (e: { target: { value: string } }) => onChange(Math.max(0, Math.min(max, num(e.target.value, 0)))),
    style: {
      width: 46,
      padding: '2px 4px',
      textAlign: 'center',
      font: 'inherit',
      fontVariantNumeric: 'tabular-nums',
      border: '1px solid rgba(127,127,127,.35)',
      borderRadius: 6,
      background: 'transparent',
      color: 'inherit',
    },
  })
}

function OptionMatrix({ data, update, writable }: { data: Data; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const [showMd, setShowMd] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draftTitle, setDraftTitle] = useState(data.title ?? '')
  const titleTouched = useRef(false)

  useEffect(() => {
    if (!titleTouched.current) setDraftTitle(data.title ?? '')
  }, [data.title])

  const key = JSON.stringify(data)
  const m = useMemo(() => compute(data), [key])
  const scale = m.scale
  const options = m.options
  const criteria = m.criteria
  const scores = data.scores ?? {}
  const readOnly = !writable

  const setCriteria = (next: Criterion[]) => update({ criteria: next })
  const setScores = (next: Scores) => update({ scores: next })
  const setCell = (opt: string, crit: string, v: number) => {
    setScores({ ...scores, [opt]: { ...(scores[opt] ?? {}), [crit]: v } })
  }
  const renameCriterion = (ci: number, name: string) => {
    const old = criteria[ci]?.name
    const next = criteria.map((c, i) => (i === ci ? { ...c, name } : c))
    const ns: Scores = {}
    options.forEach((o) => {
      const row = { ...(scores[o] ?? {}) }
      if (old && old !== name) {
        row[name] = row[old] ?? 0
        delete row[old]
      }
      ns[o] = row
    })
    update({ criteria: next, scores: ns })
  }
  const renameOption = (oi: number, option: string) => {
    const old = options[oi]
    const next = options.map((o, i) => (i === oi ? option : o))
    const ns: Scores = { ...scores }
    if (old && old !== option) {
      ns[option] = ns[old] ?? {}
      delete ns[old]
    }
    update({ options: next, scores: ns })
  }

  const cellStyle: Record<string, unknown> = {
    border: '1px solid rgba(127,127,127,.22)',
    padding: '6px 8px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  }
  const btn = (extra?: Record<string, unknown>): Record<string, unknown> => ({
    font: 'inherit',
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid rgba(127,127,127,.35)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    ...(extra ?? {}),
  })
  const field = (extra?: Record<string, unknown>): Record<string, unknown> => ({
    font: 'inherit',
    padding: '2px 4px',
    border: '1px solid rgba(127,127,127,.35)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    ...(extra ?? {}),
  })

  const md = useMemo(() => toMarkdown(data), [key])
  const h = React.createElement

  const headCells = [
    h('th', { key: 'corner', style: { ...cellStyle, textAlign: 'left', opacity: 0.7 } }, '方案 \\ 维度'),
    ...criteria.map((c, ci) =>
      h(
        'th',
        { key: `c${ci}`, style: { ...cellStyle, verticalAlign: 'top' } },
        readOnly
          ? h('div', null, h('div', { style: { fontWeight: 700 } }, c.name), h('div', { style: { fontSize: '0.78em', opacity: 0.6 } }, `权重 ${c.weight} · ${c.higherIsBetter === false ? '↓越低越好' : '↑越高越好'}`))
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' } },
              h('input', { value: c.name, onChange: (e: { target: { value: string } }) => renameCriterion(ci, e.target.value), style: field({ fontWeight: 700, textAlign: 'center', width: 96 }) }),
              h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                h('span', { style: { opacity: 0.6, fontSize: '0.8em' } }, '权重'),
                h('input', { type: 'number', min: 0, max: 9, value: c.weight, onChange: (e: { target: { value: string } }) => setCriteria(criteria.map((x, i) => (i === ci ? { ...x, weight: num(e.target.value, 0) } : x))), style: field({ width: 40, textAlign: 'center' }) }),
              ),
              h('button', { type: 'button', title: '点击切换维度方向', onClick: () => setCriteria(criteria.map((x, i) => (i === ci ? { ...x, higherIsBetter: x.higherIsBetter === false } : x))), style: field({ fontSize: '0.78em', padding: '1px 6px', borderRadius: 999 }) }, c.higherIsBetter === false ? '↓ 越低越好' : '↑ 越高越好'),
              h('button', { type: 'button', style: { font: 'inherit', fontSize: '0.75em', opacity: 0.6, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }, onClick: () => {
                const ns: Scores = { ...scores }
                options.forEach((o) => {
                  if (ns[o]) {
                    const row = { ...ns[o] }
                    delete row[c.name]
                    ns[o] = row
                  }
                })
                update({ criteria: criteria.filter((_, i) => i !== ci), scores: ns })
              } }, '删除'),
            ),
      ),
    ),
    h('th', { key: 'total', style: { ...cellStyle, background: 'rgba(127,127,127,.08)' } }, '加权总分'),
  ]

  const bodyRows = m.rows.map((row, ri) => {
    const isWinner = !!m.winner && m.winner.option === row.option
    return h(
      'tr',
      { key: `r${ri}`, style: isWinner ? { background: 'rgba(46,160,120,.10)' } : {} },
      h(
        'th',
        { style: { ...cellStyle, textAlign: 'left' } },
        readOnly
          ? h('span', { style: { fontWeight: isWinner ? 700 : 500 } }, `${isWinner ? '✅ ' : ''}${row.option}`)
          : h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
              h('input', { value: row.option, onChange: (e: { target: { value: string } }) => renameOption(ri, e.target.value), style: field({ width: 130 }) }),
              h('button', { type: 'button', style: { border: 'none', background: 'transparent', color: 'inherit', opacity: 0.5, cursor: 'pointer', font: 'inherit' }, onClick: () => {
                const ns: Scores = { ...scores }
                delete ns[row.option]
                update({ options: options.filter((_, i) => i !== ri), scores: ns })
              } }, '×'),
            ),
      ),
      ...criteria.map((c, ci) => {
        const cell = row.cells[ci]
        return h(
          'td',
          { key: `d${ci}`, style: { ...cellStyle, background: cell && cell.best ? 'rgba(255,196,0,.22)' : undefined, fontWeight: cell && cell.best ? 700 : 400 } },
          h(ScoreInput, { value: (cell && cell.raw) || 0, max: scale, readOnly, onChange: (v: number) => setCell(row.option, c.name, v) }),
          c.higherIsBetter === false ? h('span', { style: { opacity: 0.5, fontSize: '0.78em' } }, ` →${(cell && cell.norm) || 0}`) : null,
        )
      }),
      h('td', { key: 't', style: { ...cellStyle, background: 'rgba(127,127,127,.08)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
        row.total.toFixed(1),
        h('div', { style: { fontWeight: 400, fontSize: '0.78em', opacity: 0.65 } }, `${(row.percent * 100).toFixed(1)}%`),
      ),
    )
  })

  const toolbar = !readOnly
    ? h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
        h('button', { type: 'button', style: btn({ border: '1px dashed rgba(127,127,127,.5)', fontSize: '0.85em' }), onClick: () => {
          const nm = `方案 ${String.fromCharCode(65 + options.length)}`
          const ns: Scores = { ...scores, [nm]: {} }
          criteria.forEach((c) => { ns[nm][c.name] = 3 })
          update({ options: [...options, nm], scores: ns })
        } }, '+ 加方案'),
        h('button', { type: 'button', style: btn({ border: '1px dashed rgba(127,127,127,.5)', fontSize: '0.85em' }), onClick: () => {
          const nm = `维度 ${criteria.length + 1}`
          const ns: Scores = { ...scores }
          options.forEach((o) => { ns[o] = { ...(ns[o] ?? {}), [nm]: 3 } })
          update({ criteria: [...criteria, { name: nm, weight: 1, higherIsBetter: true }], scores: ns })
        } }, '+ 加维度'),
        h('button', { type: 'button', style: btn({ fontSize: '0.85em' }), onClick: () => update({ scale: scale >= 10 ? 5 : scale + 1 }) }, `满分制 ${scale} → ${scale >= 10 ? 5 : scale + 1}`),
      )
    : null

  const mdPanel = showMd
    ? h('div', { style: { marginTop: 10 } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 } },
          h('span', { style: { fontSize: '0.82em', opacity: 0.7 } }, 'Markdown（agent 可直接读）'),
          h('button', { type: 'button', style: btn({ fontSize: '0.82em', padding: '2px 8px' }), onClick: () => {
            const nav = globalThis.navigator
            if (nav && nav.clipboard && nav.clipboard.writeText) void nav.clipboard.writeText(md)
            setCopied(true)
          } }, copied ? '已复制' : '复制'),
        ),
        h('textarea', { readOnly: true, value: md, style: { width: '100%', minHeight: 130, font: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8em', padding: 8, borderRadius: 8, border: '1px solid rgba(127,127,127,.35)', background: 'rgba(127,127,127,.06)', color: 'inherit' } }),
      )
    : null

  return h(
    'div',
    { 'data-testid': 'option-matrix', style: { border: '1px solid rgba(127,127,127,.28)', borderRadius: 12, padding: 14, margin: '10px 0', font: 'inherit' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' } },
      readOnly
        ? h('strong', { style: { fontSize: '1.05em' } }, data.title || '方案对比')
        : h('input', {
            value: draftTitle,
            placeholder: '对比标题',
            onChange: (e: { target: { value: string } }) => { titleTouched.current = true; setDraftTitle(e.target.value) },
            onBlur: () => { titleTouched.current = false; update({ title: draftTitle }) },
            style: field({ fontWeight: 700, fontSize: '1.05em', minWidth: 180 }),
          }),
      h('span', { style: { opacity: 0.6, fontSize: '0.85em' } }, `${options.length} 方案 × ${criteria.length} 维度 · 满分 ${m.maxTotal.toFixed(1)}`),
      h('span', { style: { flex: 1 } }),
      h('button', { type: 'button', style: btn({ fontSize: '0.85em', padding: '2px 8px' }), onClick: () => setShowMd((v) => !v) }, showMd ? '隐藏 Markdown' : '导出 Markdown'),
    ),
    h('div', { style: { overflowX: 'auto' } },
      h('table', { 'data-testid': 'option-matrix-table', style: { borderCollapse: 'collapse', width: '100%', fontSize: '0.92em' } },
        h('thead', null, h('tr', null, ...headCells)),
        h('tbody', null, ...bodyRows),
      ),
    ),
    toolbar,
    m.rationale
      ? h('div', { 'data-testid': 'option-matrix-rationale', style: { marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(127,127,127,.08)', fontSize: '0.9em', lineHeight: 1.55 } }, `💡 ${m.rationale}`)
      : null,
    mdPanel,
  )
}

export function apply(ctx: {
  pageEditor: { registerBlock: (spec: Record<string, unknown>) => void }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'option-matrix',
    plugin: name,
    label: '方案对比块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '多方案 × 多维度加权对比矩阵：改权重/打分，总分与推荐实时变；越低越好的维度自动反向计入',
    aliases: ['matrix', 'option', 'compare', '对比', '矩阵', '选型', '方案对比'],
    defaults: () => DEFAULTS,
    View: ({ data, update, writable }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) =>
      React.createElement(OptionMatrix, { data: data as Data, update, writable }),
  })
}
