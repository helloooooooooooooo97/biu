import { CheckIcon } from '@heroicons/react/16/solid'
import { BoolBox } from '@biu/public-ui'
import { persistPagePrefs, type BodyScale, type PagePrefs } from './page-width.ts'

const BOOLS: { key: keyof Pick<PagePrefs, 'wide' | 'outlineExpand' | 'outlinePin' | 'navPin'>; label: string; testId: string }[] = [
  { key: 'wide', label: '宽屏', testId: 'fsdb-layout-wide' },
  { key: 'outlineExpand', label: '展开悬浮', testId: 'fsdb-layout-outline-expand' },
  { key: 'outlinePin', label: '悬浮目录常驻', testId: 'fsdb-layout-outline-pin' },
  { key: 'navPin', label: '翻页常驻', testId: 'fsdb-layout-nav-pin' },
]

const SCALES: { value: BodyScale; label: string }[] = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]

export function LayoutPrefsMenu({ prefs, testPrefix = 'fsdb-layout' }: { prefs: PagePrefs; testPrefix?: string }) {
  return (
    <div className="fsdb-layout-menu" role="menu" data-testid={`${testPrefix}-menu`}>
      {BOOLS.map((item) => {
        const on = prefs[item.key]
        return (
          <button
            key={item.key}
            type="button"
            role="menuitemcheckbox"
            className="fsdb-layout-row"
            aria-checked={on}
            data-testid={item.testId}
            onClick={() => persistPagePrefs({ [item.key]: !on })}
          >
            <span>{item.label}</span>
            <BoolBox on={on}>{on ? <CheckIcon aria-hidden className="size-3" /> : null}</BoolBox>
          </button>
        )
      })}
      <div className="fsdb-layout-scale">
        <span>文字</span>
        <div className="fsdb-layout-pills">
          {SCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              className={`fsdb-layout-opt${prefs.bodySize === item.value ? ' is-active' : ''}`}
              aria-checked={prefs.bodySize === item.value}
              data-testid={`${testPrefix}-size-${item.value}`}
              onClick={() => persistPagePrefs({ bodySize: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="fsdb-layout-scale">
        <span>间距</span>
        <div className="fsdb-layout-pills">
          {SCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              className={`fsdb-layout-opt${prefs.bodyGap === item.value ? ' is-active' : ''}`}
              aria-checked={prefs.bodyGap === item.value}
              data-testid={`${testPrefix}-gap-${item.value}`}
              onClick={() => persistPagePrefs({ bodyGap: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
