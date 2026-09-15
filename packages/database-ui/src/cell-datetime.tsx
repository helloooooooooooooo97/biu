import { useEffect, useState } from 'react'
import { DatePicker, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { ensureDbSearchStyle } from './search-menu.tsx'

dayjs.locale('zh-cn')

function asStamp(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function formatDateTimeLabel(value: unknown) {
  const n = asStamp(value)
  if (!n) return ''
  const d = new Date(n)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PICKER_CHROME = {
  DatePicker: {
    cellHeight: 28,
    cellWidth: 32,
    timeColumnWidth: 48,
  },
} as const

const NOTION_LIGHT = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorBgBase: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#ffffff',
    colorBorder: '#f0efed',
    colorBorderSecondary: '#f0efed',
    colorText: '#2c2c2b',
    colorTextSecondary: '#8d8b87',
    colorTextTertiary: '#8d8b87',
    colorTextPlaceholder: '#8d8b87',
    colorPrimary: '#2b7de6',
    colorPrimaryHover: '#4b90ea',
    colorFillSecondary: '#f0efed',
    colorFillTertiary: '#f0efed',
    controlOutline: 'transparent',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit',
    boxShadowSecondary: '0 0 0 1px #f0efed, 0 8px 24px rgba(0, 0, 0, 0.12)',
  },
  components: PICKER_CHROME,
}

const NOTION_DARK = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorBgBase: '#191919',
    colorBgContainer: '#202020',
    colorBgElevated: '#202020',
    colorBgLayout: '#191919',
    colorBorder: 'rgba(242, 241, 237, 0.1)',
    colorBorderSecondary: 'rgba(242, 241, 237, 0.08)',
    colorText: '#F0EFED',
    colorTextSecondary: '#bcbab6',
    colorTextTertiary: 'rgba(242, 241, 237, 0.45)',
    colorTextPlaceholder: '#5F5F5A',
    colorPrimary: '#5b9fd6',
    colorPrimaryHover: '#7eb3e0',
    colorFillSecondary: '#2c2c2c',
    colorFillTertiary: '#2c2c2c',
    controlOutline: 'transparent',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit',
    boxShadowSecondary: '0 0 0 1px rgba(242, 241, 237, 0.06), 0 8px 24px rgba(0, 0, 0, 0.35)',
  },
  components: PICKER_CHROME,
}

function useDarkChrome() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains('dark'))
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

export function CellDateTime({
  value,
  onChange,
  empty = '',
  overdue = false,
  writable = true,
}: {
  value: unknown
  onChange: (next: number | null) => void
  empty?: string
  overdue?: boolean
  writable?: boolean
}) {
  ensureDbSearchStyle()
  const dark = useDarkChrome()
  const stamp = asStamp(value)
  return (
    <div
      className={`db-datetime${overdue ? ' is-overdue' : ''}${writable ? '' : ' is-ro'}`}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ConfigProvider locale={zhCN} theme={dark ? NOTION_DARK : NOTION_LIGHT} wave={{ disabled: true }}>
        <DatePicker
          showTime={{ format: 'HH:mm' }}
          needConfirm={false}
          allowClear={writable}
          inputReadOnly={!writable}
          open={writable ? undefined : false}
          size="small"
          variant="borderless"
          placeholder={empty}
          format="YYYY/MM/DD HH:mm"
          suffixIcon={null}
          value={stamp ? dayjs(stamp) : null}
          onChange={(next) => {
            if (!writable) return
            onChange(next ? next.valueOf() : null)
          }}
          getPopupContainer={() => document.body}
        />
      </ConfigProvider>
    </div>
  )
}
