import { memo, useEffect, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, CircleStackIcon } from '@heroicons/react/16/solid'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import { lineDiff, type DiffLine } from './tool-format.ts'

export type ContentEditRow = {
  path: string
  title: string
  added: number
  removed: number
  jump_line: number
  reverted?: boolean
  kind?: 'content' | 'create' | 'update' | 'delete'
}

export const INSPECTOR_REVEAL_EVENT = 'biu:inspector-reveal'

export function recordParts(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { collection: `/${parts[0]}`, recordId: parts.slice(1).join('/') }
}

export function contentEditLabel(file: ContentEditRow, files: ContentEditRow[]) {
  const title = file.title.trim() || file.path
  const dup = files.filter((row) => (row.title.trim() || row.path) === title).length > 1
  if (!dup) return title
  const id = recordParts(file.path)?.recordId
  return id ? `${title} · ${id}` : title
}

function lineAtOffset(text: string, offset: number) {
  if (offset <= 0) return 1
  return text.slice(0, offset).split('\n').length
}

export function addedJumpFromSnapshot(before: string, after: string) {
  let i = 0
  const min = Math.min(before.length, after.length)
  while (i < min && before[i] === after[i]) i += 1
  let j = 0
  while (j < min - i && before[before.length - 1 - j] === after[after.length - 1 - j]) j += 1
  const slice = after.slice(i, after.length - j)
  const end = Math.max(i, after.length - j)
  return {
    start_line: lineAtOffset(after, i),
    end_line: lineAtOffset(after, end > i ? end - 1 : i),
    ...(slice.trim() ? { text: slice } : {}),
  }
}

/** 右侧检查器打开记录并跳到改动行；不改中间主界面、不关聊天。 */
export function revealContentEdit(
  path: string,
  jumpLine: number,
  scope?: { sessionId?: string; turn?: number },
) {
  const parts = recordParts(path)
  if (parts) {
    window.dispatchEvent(
      new CustomEvent(INSPECTOR_REVEAL_EVENT, {
        detail: { collection: parts.collection, recordId: parts.recordId, unique: true },
      }),
    )
  }
  const fire = (extra?: { start_line?: number; end_line?: number; text?: string }) => {
    window.dispatchEvent(
      new CustomEvent(CONTENT_JUMP_EVENT, {
        detail: {
          path,
          start_line: extra?.start_line ?? jumpLine,
          end_line: extra?.end_line ?? extra?.start_line ?? jumpLine,
          navigate: true,
          ...(extra?.text ? { text: extra.text } : {}),
        },
      }),
    )
  }
  const sessionId = scope?.sessionId?.trim()
  const turn = scope?.turn
  if (!sessionId || turn == null) {
    fire()
    return
  }
  const qs = new URLSearchParams({ session: sessionId, turn: String(turn), path })
  void fetch(`/api/content-turns/file?${qs}`)
    .then(async (res) => {
      if (!res.ok) {
        fire()
        return
      }
      const body = (await res.json()) as { before?: string; after?: string }
      fire(addedJumpFromSnapshot(body.before ?? '', body.after ?? ''))
    })
    .catch(() => fire())
}

export type NumberedDiffLine = DiffLine & { oldLine?: number; newLine?: number }
export type CompactDiffRow = NumberedDiffLine | { type: 'skip'; count: number; oldFrom?: number; oldTo?: number; newFrom?: number; newTo?: number }

export function numberDiffLines(lines: DiffLine[]): NumberedDiffLine[] {
  let oldLine = 1
  let newLine = 1
  return lines.map((line) => {
    if (line.type === 'equal') {
      const row = { ...line, oldLine, newLine }
      oldLine += 1
      newLine += 1
      return row
    }
    if (line.type === 'remove') {
      const row = { ...line, oldLine }
      oldLine += 1
      return row
    }
    const row = { ...line, newLine }
    newLine += 1
    return row
  })
}

/** 改动附近留两行上下文，中间未改的行收成「未改 N 行」。 */
export function compactEqualLines(lines: NumberedDiffLine[], context = 2, minSkip = 4): CompactDiffRow[] {
  const keep = new Array(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.type !== 'equal') {
      for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
    }
  }
  if (!keep.some(Boolean)) return lines
  const out: CompactDiffRow[] = []
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      out.push(lines[i]!)
      i += 1
      continue
    }
    let n = 0
    const start = i
    while (i < lines.length && !keep[i]) {
      n += 1
      i += 1
    }
    if (n >= minSkip) {
      const first = lines[start]
      const last = lines[i - 1]
      out.push({
        type: 'skip',
        count: n,
        oldFrom: first?.oldLine,
        oldTo: last?.oldLine,
        newFrom: first?.newLine,
        newTo: last?.newLine,
      })
    } else {
      for (let k = start; k < i; k++) out.push(lines[k]!)
    }
  }
  return out
}

function FileDiffView({ sessionId, turn, path }: { sessionId: string; turn: number; path: string }) {
  const [state, setState] = useState<'load' | 'gone' | 'ok'>('load')
  const [rows, setRows] = useState<CompactDiffRow[]>([])

  useEffect(() => {
    const ac = new AbortController()
    setState('load')
    const qs = new URLSearchParams({ session: sessionId, turn: String(turn), path })
    void fetch(`/api/content-turns/file?${qs}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          setState('gone')
          return
        }
        const body = (await res.json()) as { before?: string; after?: string }
        setRows(compactEqualLines(numberDiffLines(lineDiff(body.before ?? '', body.after ?? ''))))
        setState('ok')
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return
        setState('gone')
      })
    return () => ac.abort()
  }, [sessionId, turn, path])

  if (state === 'load') {
    return <div className="px-3 py-2 text-[12px] text-(--dsw-label-3)">载入 diff…</div>
  }
  if (state === 'gone') {
    return <div className="px-3 py-2 text-[12px] text-(--dsw-label-3)">这份正文已过期，点标题仍可跳到当前文件。</div>
  }
  return (
    <pre
      className="max-h-80 overflow-auto border-t border-(--dsw-border) py-1 font-mono text-[12px] leading-5"
      data-testid="content-edit-diff"
    >
      {rows.map((line, index) => {
        if (line.type === 'skip') {
          return (
            <div key={`skip-${index}`} className="flex px-3 py-0.5 text-[#7B7B79]">
              <span className="w-7 shrink-0" />
              <span className="min-w-0 flex-1 px-2 text-center">··· 未改 {line.count} 行</span>
            </div>
          )
        }
        const lineNo = line.type === 'remove' ? line.oldLine : line.newLine
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '
        const rowClass =
          line.type === 'add'
            ? 'bg-[color-mix(in_srgb,#448361_22%,transparent)] text-[#448361]'
            : line.type === 'remove'
              ? 'bg-[color-mix(in_srgb,#c4554d_22%,transparent)] text-[#c4554d]'
              : 'text-(--dsw-label)'
        return (
          <div
            key={`${index}-${line.type}`}
            className={`flex whitespace-pre-wrap break-all px-3 ${rowClass}`}
            data-old-line={line.oldLine ?? ''}
            data-new-line={line.newLine ?? ''}
          >
            <span className="w-7 shrink-0 select-none text-right tabular-nums text-[#7B7B79]">{lineNo ?? ''}</span>
            <span className="w-4 shrink-0 select-none px-1 opacity-70">{prefix}</span>
            <span className="min-w-0 flex-1">{line.text || ' '}</span>
          </div>
        )
      })}
    </pre>
  )
}

export const ContentEditsTable = memo(function ContentEditsTable({
  files,
  sessionId,
  turn,
}: {
  files: ContentEditRow[]
  sessionId?: string
  turn?: number
}) {
  const visible = files.filter((file) => (file.kind === 'content' || !file.kind) && (file.added || file.removed))
  const [diffPath, setDiffPath] = useState<string | null>(null)
  if (!visible.length) return null
  const added = visible.reduce((n, file) => n + file.added, 0)
  const removed = visible.reduce((n, file) => n + file.removed, 0)

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-(--dsw-border) bg-(color-mix(in_srgb,var(--dsw-sidebar)_65%,transparent))"
      data-testid="content-edits-table"
    >
      <div className="flex items-center justify-between gap-2 border-b border-(--dsw-border) px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-(--dsw-label-2)">
          <CircleStackIcon className="size-3.5 shrink-0" aria-hidden />
          数据改动
        </div>
        <div className="flex items-center gap-2 text-[12px] font-semibold tabular-nums">
          <span className="text-[#448361]">+{added}</span>
          <span className="text-[#c4554d]">−{removed}</span>
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {visible.map((file) => {
          const shown = diffPath === file.path
          return (
            <li key={file.path} className="border-t border-(--dsw-border) first:border-t-0">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <button
                  type="button"
                  className="shrink-0 text-(--dsw-label-3)"
                  aria-expanded={shown}
                  aria-label={shown ? `收起 ${contentEditLabel(file, visible)} 的 diff` : `查看 ${contentEditLabel(file, visible)} 的 diff`}
                  onClick={() => setDiffPath(shown ? null : file.path)}
                >
                  {shown ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-(--dsw-label) hover:underline"
                  title={file.path}
                  onClick={() => revealContentEdit(file.path, file.jump_line, { sessionId, turn })}
                >
                  {contentEditLabel(file, visible)}
                </button>
                <button
                  type="button"
                  className="text-[12px] font-semibold tabular-nums text-[#448361] hover:underline"
                  onClick={() => revealContentEdit(file.path, file.jump_line, { sessionId, turn })}
                >
                  +{file.added}
                </button>
                <button
                  type="button"
                  className="text-[12px] font-semibold tabular-nums text-[#c4554d] hover:underline"
                  onClick={() => revealContentEdit(file.path, file.jump_line, { sessionId, turn })}
                >
                  −{file.removed}
                </button>
              </div>
              {shown && sessionId && turn != null ? <FileDiffView sessionId={sessionId} turn={turn} path={file.path} /> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
})
