import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircleIcon } from '@heroicons/react/16/solid'
import { CellMulti } from '@biu/database-ui'

export { CellSelect } from '@biu/database-ui'

export function TokenMultiSelect({
  values,
  options,
  onChange,
  allowCreate = true,
  multiple = true,
  autoOpen = false,
}: {
  values: string[]
  options: string[]
  onChange: (next: string[]) => void
  allowCreate?: boolean
  multiple?: boolean
  autoOpen?: boolean
}) {
  return (
    <CellMulti
      values={values}
      options={options.map((item) => ({ value: item, label: item }))}
      onChange={onChange}
      allowCreate={allowCreate}
      multiple={multiple}
      autoOpen={autoOpen}
    />
  )
}

export function CheckRow({
  label,
  icon,
  on,
  onToggle,
  locked,
}: {
  label: ReactNode
  icon?: ReactNode
  on: boolean
  onToggle: () => void
  locked?: boolean
}) {
  return (
    <button
      type="button"
      className={`fsdb-checkrow${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
      role="menuitemcheckbox"
      aria-checked={on}
      disabled={locked}
      title={locked ? '始终显示' : undefined}
      onClick={onToggle}
    >
      <span className="fsdb-checkrow-label">
        {icon ? <span className="fsdb-checkrow-icon">{icon}</span> : null}
        {label}
      </span>
      {on ? <CheckCircleIcon aria-hidden className="size-[14px]" /> : <span className="fsdb-checkrow-gap" aria-hidden />}
    </button>
  )
}

export function AppDialog({
  title,
  body,
  confirm,
  danger,
  disabled,
  hideCancel,
  onCancel,
  onConfirm,
  input,
  error,
  onClearError,
}: {
  title: string
  body?: ReactNode
  confirm: string
  danger?: boolean
  disabled?: boolean
  hideCancel?: boolean
  onCancel: () => void
  onConfirm: (name?: string) => void
  input?: {
    defaultValue: string
    placeholder?: string
    maxLength?: number
  }
  error?: string
  onClearError?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const named = Boolean(input)

  useEffect(() => {
    if (!named) return
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [named])

  function submit() {
    onConfirm(input ? inputRef.current?.value : undefined)
  }

  const dialog = (
    <div
      className="fsdb-dlg-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="fsdb-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCancel()
          }
        }}
      >
        <div className="fsdb-dlg-title">{title}</div>
        <div className="fsdb-dlg-body">
          {input ? (
            <input
              ref={inputRef}
              className="fsdb-dlg-input"
              defaultValue={input.defaultValue}
              placeholder={input.placeholder}
              maxLength={input.maxLength}
              onInput={() => {
                if (error) onClearError?.()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          ) : null}
          {body}
          {error ? <div className="fsdb-dlg-error">{error}</div> : null}
        </div>
        <div className="fsdb-dlg-actions">
          {hideCancel ? null : (
            <button type="button" className="fsdb-dlg-cancel" onClick={onCancel}>
              取消
            </button>
          )}
          <button type="button" className={`fsdb-dlg-ok${danger ? ' is-danger' : ''}`} disabled={disabled} onClick={submit}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(dialog, document.body)
}

/** 详情正文/文本列：输入只更新自己，失焦才回传，避免整张表跟着每个按键重绘。 */
export function LocalText({
  as = 'input',
  className,
  value,
  rows,
  placeholder,
  title,
  onCommit,
  onKeyDown,
}: {
  as?: 'input' | 'textarea'
  className?: string
  value: string
  rows?: number
  placeholder?: string
  title?: string
  onCommit: (next: string) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void
}) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    setDraft(value)
  }, [value])
  const valueRef = useRef(value)
  valueRef.current = value
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const commit = () => {
    if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
  }
  useEffect(() => () => commit(), [])
  const shared = {
    className,
    value: draft,
    title,
    placeholder,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: commit,
    onKeyDown,
  }
  if (as === 'textarea') return <textarea {...shared} rows={rows} />
  return <input {...shared} />
}
