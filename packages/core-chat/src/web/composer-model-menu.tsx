import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import {
  inferModelCapabilities,
  type ModelCapabilities,
  type ModelKnob,
  type ModelModeValues,
} from '../host/model-catalog.ts'
import { choiceKnob, knobValue, modelKnobs, modelModeSuffix, patchKnob } from './model-mode.tsx'

export type ComposerModelOption = {
  id: string
  label: string
  provider: string
  endpointId: string
  model: string
  note?: string
}

type Pane = 'root' | 'model' | string

function groupTitle(key: string, labels: Record<string, string>) {
  return (
    labels[key] ||
    (key === 'deepseek' ? 'DeepSeek' : key === 'anthropic' ? 'Claude' : key === 'openai' ? 'GPT' : key)
  )
}

function tagFor(
  option: ComposerModelOption,
  current: ComposerModelOption,
  mode: ModelModeValues,
  currentCaps: ModelCapabilities,
) {
  if (option.id === current.id) return modelModeSuffix(mode, currentCaps)
  const caps = inferModelCapabilities(option.model, option.provider as 'deepseek' | 'openai' | 'anthropic')
  return modelModeSuffix({ thinking: 'enabled', speed: 'slow', effort: 'high', context: '200k' }, caps)
}

function toggleOn(knob: Extract<ModelKnob, { kind: 'toggle' }>, mode: ModelModeValues) {
  return knobValue(knob, mode) === knob.on
}

export function ComposerModelMenu(props: {
  models: ComposerModelOption[]
  current: ComposerModelOption
  endpointLabels: Record<string, string>
  mode: ModelModeValues
  capabilities: ModelCapabilities
  disabled?: boolean
  onSelect: (option: ComposerModelOption) => void
  onMode: (next: Partial<ModelModeValues>) => void
  onAddModels: () => void
}) {
  const { models, current, endpointLabels, mode, capabilities, disabled, onSelect, onMode, onAddModels } = props
  const [pane, setPane] = useState<Pane>('root')
  const [query, setQuery] = useState('')
  const [flyBox, setFlyBox] = useState({ left: 0, bottom: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const knobs = modelKnobs(capabilities)
  const openChoice = choiceKnob(capabilities, pane)
  const flyoutOpen = pane === 'model' || Boolean(openChoice)

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = models.filter((m) => {
      if (!q) return true
      return m.label.toLowerCase().includes(q) || m.model.toLowerCase().includes(q) || (m.note || '').toLowerCase().includes(q)
    })
    const order = ['deepseek', 'anthropic', 'openai']
    const map = new Map<string, ComposerModelOption[]>()
    for (const m of visible) {
      const key = m.endpointId || m.provider
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    const keys = [...order.filter((k) => map.has(k)), ...[...map.keys()].filter((k) => !order.includes(k))]
    return keys.map((key) => ({ id: key, title: groupTitle(key, endpointLabels), items: map.get(key)! }))
  }, [models, query, endpointLabels])

  useLayoutEffect(() => {
    if (!flyoutOpen) return
    const place = () => {
      const el = panelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setFlyBox({ left: Math.round(rect.right + 6), bottom: Math.round(window.innerHeight - rect.bottom) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [flyoutOpen, pane])

  const flyout =
    pane === 'model' ? (
      <div
        className="composer-model-flyout"
        role="listbox"
        aria-label="选择模型"
        style={{ left: flyBox.left, bottom: flyBox.bottom }}
      >
        <div className="composer-model-search">
          <MagnifyingGlassIcon className="size-3.5 opacity-60" aria-hidden />
          <input
            type="search"
            value={query}
            placeholder="搜索模型"
            aria-label="搜索模型"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="composer-model-flyout-list">
          {models.length === 0 ? (
            <div className="composer-model-empty">尚未配置可用模型。点「添加模型」添加官方 Key 或第三方。</div>
          ) : grouped.every((g) => !g.items.length) ? (
            <div className="composer-model-empty">没有匹配的模型</div>
          ) : (
            grouped.map((group) => (
              <div key={group.id} className="composer-model-group">
                <div className="composer-model-group-label">{group.title}</div>
                {group.items.map((option) => {
                  const active = option.id === current.id
                  const tag = tagFor(option, current, mode, capabilities)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`composer-model-item${active ? ' is-active' : ''}`}
                      onClick={() => onSelect(option)}
                    >
                      <span className="composer-model-item-main">
                        <span className="composer-model-item-label">{option.label}</span>
                        {tag ? <span className="composer-model-item-tag">{tag}</span> : null}
                      </span>
                      {active ? <CheckIcon className="composer-model-check size-3.5" aria-hidden /> : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <button type="button" className="composer-model-add-models" data-testid="open-model-config" onClick={onAddModels}>
          添加模型
        </button>
      </div>
    ) : openChoice ? (
      <div
        className="composer-model-flyout is-compact"
        role="listbox"
        aria-label={openChoice.label}
        style={{ left: flyBox.left, bottom: flyBox.bottom }}
      >
        {openChoice.options.map((item) => {
          const active = knobValue(openChoice, mode) === item.value
          return (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={active}
              className={`composer-model-item${active ? ' is-active' : ''}`}
              data-testid={`${openChoice.id}-${item.value}`}
              disabled={disabled}
              onClick={() => onMode(patchKnob(openChoice, item.value))}
            >
              <span className="composer-model-item-label">{item.label}</span>
              {active ? <CheckIcon className="composer-model-check size-3.5" aria-hidden /> : null}
            </button>
          )
        })}
      </div>
    ) : null

  return (
    <div className="composer-model-pop" data-testid="composer-model-menu">
      {flyout && typeof document !== 'undefined' ? createPortal(flyout, document.body) : flyout}
      <div className="composer-model-panel" ref={panelRef} data-testid="composer-model-panel">
        {knobs.map((knob) => {
          if (knob.kind === 'toggle') {
            const on = toggleOn(knob, mode)
            return (
              <button
                key={knob.id}
                type="button"
                role="switch"
                aria-checked={on}
                className="composer-model-row"
                data-testid={`${knob.id}-toggle`}
                disabled={disabled}
                onClick={() => onMode(patchKnob(knob, on ? knob.off : knob.on))}
              >
                <span className="composer-model-row-label">{knob.label}</span>
                <span className={`composer-model-switch${on ? ' is-on' : ''}`} aria-hidden />
              </button>
            )
          }
          const valueLabel = knob.options.find((item) => item.value === knobValue(knob, mode))?.label ?? ''
          return (
            <button
              key={knob.id}
              type="button"
              className={`composer-model-row${pane === knob.id ? ' is-open' : ''}`}
              disabled={disabled}
              onClick={() => setPane((p) => (p === knob.id ? 'root' : knob.id))}
            >
              <span className="composer-model-row-label">{knob.label}</span>
              <span className="composer-model-row-val">{valueLabel}</span>
              <ChevronRightIcon className="size-3.5 opacity-50" aria-hidden />
            </button>
          )
        })}
        <button
          type="button"
          className={`composer-model-row${pane === 'model' ? ' is-open' : ''}`}
          onClick={() => setPane((p) => (p === 'model' ? 'root' : 'model'))}
        >
          <span className="composer-model-row-label">模型</span>
          <span className="composer-model-row-val">{current.label}</span>
          <ChevronRightIcon className="size-3.5 opacity-50" aria-hidden />
        </button>
      </div>
    </div>
  )
}
