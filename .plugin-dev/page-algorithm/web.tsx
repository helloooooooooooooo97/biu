const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-algorithm'
export const inject = ['pageEditor']

const DEFAULTS = {
  title: '1. Two Sum',
  difficulty: 'Easy',
  prompt:
    '给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值的那两个整数，并返回它们的数组下标。\n\n你可以假设每种输入只会对应一个答案。数组中同一个元素在答案里不能重复出现。',
  lang: 'python',
  code: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`,
}

const DIFF_COLOR: Record<string, string> = {
  Easy: '#00b8a3',
  Medium: '#ffc01e',
  Hard: '#ff375f',
}

/** 草稿在本地；失焦/点到外部才写回，避免每次按键 update 把光标甩到末尾。 */
const STYLE_ID = 'pa-card-style-v1'
const STYLE_CSS = `
.pa-card{
  display:grid;
  grid-template-columns:minmax(220px,1fr) minmax(240px,1.12fr);
  min-height:280px;
  overflow:hidden;
  border:1px solid var(--dsw-border);
  border-radius:12px;
  background:var(--dsw-bg);
  color:var(--dsw-label);
  font:13px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif;
  box-shadow:0 1px 2px rgba(15,15,15,.04);
}
@media (max-width:640px){
  .pa-card{grid-template-columns:1fr}
  .pa-prompt{border-right:0;border-bottom:1px solid var(--dsw-border)}
}
.pa-prompt{min-width:0;padding:16px 18px 18px;background:color-mix(in srgb,var(--dsw-hover) 70%,var(--dsw-bg))}
.pa-prompt-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.pa-kicker{font-size:11px;font-weight:650;letter-spacing:.06em;color:var(--dsw-label-3)}
.pa-diff{
  margin-left:auto;border:0;border-radius:999px;padding:2px 9px;
  background:color-mix(in srgb,var(--pa-diff,#0f7b6c) 14%,transparent);
  color:var(--pa-diff,#0f7b6c);font:700 11px/1.4 inherit;cursor:pointer;outline:none;
}
.pa-diff:disabled{cursor:default;opacity:.85}
.pa-title,.pa-body,.pa-code{
  width:100%;box-sizing:border-box;border:0;outline:none;background:transparent;color:inherit;font:inherit;resize:vertical;
}
.pa-title{display:block;margin:0 0 10px;padding:0;font-size:20px;font-weight:700;letter-spacing:-.02em;line-height:1.25}
.pa-body{min-height:160px;color:var(--dsw-label-2)}
.pa-code-col{min-width:0;display:flex;flex-direction:column;background:var(--dsw-chat-code-bg,var(--dsw-sidebar))}
.pa-code-head{
  display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;
  border-bottom:1px solid var(--dsw-border);font-size:12px;
}
.pa-lang{
  margin-left:auto;border:1px solid var(--dsw-border);border-radius:6px;padding:2px 8px;
  background:var(--dsw-input,transparent);color:var(--dsw-label);font:600 12px inherit;cursor:pointer;outline:none;
}
.pa-code{
  flex:1;min-height:200px;padding:12px 14px;resize:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;
  color:var(--dsw-label);
}
`

function useAlgoStyle() {
  useEffect(() => {
    for (const stale of document.querySelectorAll('style[id^="pa-card-style"]')) {
      if (stale.id !== STYLE_ID) stale.remove()
    }
    const existing = document.getElementById(STYLE_ID)
    const el = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
    el.id = STYLE_ID
    el.textContent = STYLE_CSS
    if (el.parentNode !== document.head) document.head.appendChild(el)
  }, [])
}

function DraftField({
  as: Tag,
  value,
  onCommit,
  readOnly,
  testId,
  className,
}: {
  as: 'input' | 'textarea'
  value: string
  onCommit: (next: string) => void
  readOnly?: boolean
  testId: string
  className: string
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const draftRef = useRef(draft)
  const valueRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  draftRef.current = draft
  valueRef.current = value
  onCommitRef.current = onCommit
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  useEffect(
    () => () => {
      if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
    },
    [],
  )
  const flush = () => {
    if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
  }
  return (
    <Tag
      data-testid={testId}
      data-page-block-capture=""
      readOnly={readOnly}
      spellCheck={Tag === 'textarea' ? false : undefined}
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        flush()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      className={className}
    />
  )
}

function AlgorithmCard({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  const title = String(data.title ?? '')
  const difficulty = String(data.difficulty ?? 'Easy')
  const prompt = String(data.prompt ?? '')
  const lang = String(data.lang ?? 'python')
  const code = String(data.code ?? '')
  const accent = DIFF_COLOR[difficulty] ?? '#00b8a3'
  const ro = !writable
  useAlgoStyle()

  return (
    <div data-testid="page-algorithm-card" className="pa-card" style={{ ['--pa-diff' as string]: accent }}>
      <section className="pa-prompt">
        <div className="pa-prompt-head">
          <span className="pa-kicker">题目</span>
          <select
            data-testid="page-algorithm-diff"
            className="pa-diff"
            disabled={ro}
            value={difficulty}
            onChange={(event) => update({ difficulty: event.target.value })}
          >
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </div>
        <DraftField
          as="input"
          testId="page-algorithm-title"
          readOnly={ro}
          value={title}
          onCommit={(next) => update({ title: next })}
          className="pa-title"
        />
        <DraftField
          as="textarea"
          testId="page-algorithm-prompt"
          readOnly={ro}
          value={prompt}
          onCommit={(next) => update({ prompt: next })}
          className="pa-body"
        />
      </section>
      <section className="pa-code-col">
        <div className="pa-code-head">
          <span className="pa-kicker">代码</span>
          <select
            data-testid="page-algorithm-lang"
            className="pa-lang"
            disabled={ro}
            value={lang}
            onChange={(event) => update({ lang: event.target.value })}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
        </div>
        <DraftField
          as="textarea"
          testId="page-algorithm-code"
          readOnly={ro}
          value={code}
          onCommit={(next) => update({ code: next })}
          className="pa-code"
        />
      </section>
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
      View: (props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'algorithm',
    plugin: name,
    label: '算法题',
    blockType: 'algorithm',
    blockTypeLabel: '算法题',
    hint: '左右分栏：题面 + 代码，跟随页面主题',
    aliases: ['leetcode', 'algo', '算法', 'lc'],
    assets: [],
    defaults: DEFAULTS,
    View: AlgorithmCard,
  })
}
