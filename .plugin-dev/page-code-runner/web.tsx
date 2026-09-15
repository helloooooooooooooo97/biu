import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { EditorView, drawSelection, keymap, placeholder as cmPlaceholder } from '@codemirror/view'

const React = globalThis.React
const { useState, useCallback, useRef, useEffect } = React

export const name = 'page-code-runner'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

const LANGS = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'go', label: 'Go' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'swift', label: 'Swift' },
  { id: 'perl', label: 'Perl' },
  { id: 'bash', label: 'Bash' },
]

const SAMPLES: Record<string, string> = {
  python: `def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    return merge(merge_sort(arr[:mid]), merge_sort(arr[mid:]))

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i]); i += 1
        else:
            result.append(right[j]); j += 1
    return result + left[i:] + right[j:]

print(merge_sort([38, 27, 43, 3, 9, 82, 10]))`,
  javascript: `function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  return merge(mergeSort(arr.slice(0, mid)), mergeSort(arr.slice(mid)));
}
function merge(left, right) {
  const r = []; let i = 0, j = 0;
  while (i < left.length && j < right.length)
    r.push(left[i] <= right[j] ? left[i++] : right[j++]);
  return r.concat(left.slice(i), right.slice(j));
}
console.log(mergeSort([38, 27, 43, 3, 9, 82, 10]));`,
  typescript: `function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  return merge(mergeSort(arr.slice(0, mid)), mergeSort(arr.slice(mid)));
}
function merge(left: number[], right: number[]): number[] {
  const r: number[] = []; let i = 0, j = 0;
  while (i < left.length && j < right.length)
    r.push(left[i] <= right[j] ? left[i++] : right[j++]);
  return r.concat(left.slice(i), right.slice(j));
}
console.log(mergeSort([38, 27, 43, 3, 9, 82, 10]));`,
  java: `public class MergeSort {
    public static void main(String[] args) {
        int[] arr = {38, 27, 43, 3, 9, 82, 10};
        int[] sorted = mergeSort(arr);
        for (int i = 0; i < sorted.length; i++) {
            System.out.print(sorted[i]);
            if (i < sorted.length - 1) System.out.print(" ");
        }
        System.out.println();
    }
    static int[] mergeSort(int[] arr) {
        if (arr.length <= 1) return arr;
        int mid = arr.length / 2;
        int[] left = mergeSort(java.util.Arrays.copyOfRange(arr, 0, mid));
        int[] right = mergeSort(java.util.Arrays.copyOfRange(arr, mid, arr.length));
        return merge(left, right);
    }
    static int[] merge(int[] left, int[] right) {
        int[] r = new int[left.length + right.length];
        int i = 0, j = 0, k = 0;
        while (i < left.length && j < right.length)
            r[k++] = left[i] <= right[j] ? left[i++] : right[j++];
        while (i < left.length) r[k++] = left[i++];
        while (j < right.length) r[k++] = right[j++];
        return r;
    }
}`,
  c: `#include <stdio.h>
#include <stdlib.h>

int* merge_sort(int* arr, int n) {
    if (n <= 1) return arr;
    int mid = n / 2;
    int* left = merge_sort(arr, mid);
    int* right = merge_sort(arr + mid, n - mid);
    int* r = malloc(n * sizeof(int));
    int i = 0, j = 0, k = 0;
    while (i < mid && j < n - mid)
        r[k++] = left[i] <= right[j] ? left[i++] : right[j++];
    while (i < mid) r[k++] = left[i++];
    while (j < n - mid) r[k++] = right[j++];
    for (i = 0; i < n; i++) arr[i] = r[i];
    free(r);
    return arr;
}

int main() {
    int arr[] = {38, 27, 43, 3, 9, 82, 10};
    int n = sizeof(arr) / sizeof(arr[0]);
    merge_sort(arr, n);
    for (int i = 0; i < n; i++) printf("%d%s", arr[i], i < n - 1 ? " " : "\\n");
    return 0;
}`,
  cpp: `#include <iostream>
#include <vector>
using namespace std;

vector<int> mergeSort(vector<int> arr) {
    if (arr.size() <= 1) return arr;
    int mid = arr.size() / 2;
    vector<int> left(mergeSort(vector<int>(arr.begin(), arr.begin() + mid)));
    vector<int> right(mergeSort(vector<int>(arr.begin() + mid, arr.end())));
    vector<int> r;
    int i = 0, j = 0;
    while (i < (int)left.size() && j < (int)right.size())
        r.push_back(left[i] <= right[j] ? left[i++] : right[j++]);
    r.insert(r.end(), left.begin() + i, left.end());
    r.insert(r.end(), right.begin() + j, right.end());
    return r;
}

int main() {
    vector<int> arr = {38, 27, 43, 3, 9, 82, 10};
    auto sorted = mergeSort(arr);
    for (int i = 0; i < (int)sorted.size(); i++) cout << sorted[i] << (i < (int)sorted.size()-1 ? " " : "\\n");
    return 0;
}`,
  go: `package main

import "fmt"

func mergeSort(arr []int) []int {
    if len(arr) <= 1 { return arr }
    mid := len(arr) / 2
    return merge(mergeSort(arr[:mid]), mergeSort(arr[mid:]))
}

func merge(left, right []int) []int {
    r := []int{}
    i, j := 0, 0
    for i < len(left) && j < len(right) {
        if left[i] <= right[j] {
            r = append(r, left[i]); i++
        } else {
            r = append(r, right[j]); j++
        }
    }
    r = append(r, left[i:]...)
    r = append(r, right[j:]...)
    return r
}

func main() {
    fmt.Println(mergeSort([]int{38, 27, 43, 3, 9, 82, 10}))
}`,
  ruby: `def merge_sort(arr)
  return arr if arr.length <= 1
  mid = arr.length / 2
  merge(merge_sort(arr[0...mid]), merge_sort(arr[mid..-1]))
end

def merge(left, right)
  result = []
  i, j = 0, 0
  while i < left.length && j < right.length
    left[i] <= right[j] ? (result << left[i]; i += 1) : (result << right[j]; j += 1)
  end
  result + left[i..-1] + right[j..-1]
end

p merge_sort([38, 27, 43, 3, 9, 82, 10])`,
  swift: `func mergeSort<T: Comparable>(_ arr: [T]) -> [T] {
    guard arr.count > 1 else { return arr }
    let mid = arr.count / 2
    return merge(mergeSort(Array(arr[..<mid])), mergeSort(Array(arr[mid...])))
}
func merge<T: Comparable>(_ left: [T], _ right: [T]) -> [T] {
    var result: [T] = []
    var i = 0, j = 0
    while i < left.count && j < right.count {
        if left[i] <= right[j] { result.append(left[i]); i += 1 }
        else { result.append(right[j]); j += 1 }
    }
    result.append(contentsOf: left[i...])
    result.append(contentsOf: right[j...])
    return result
}
print(mergeSort([38, 27, 43, 3, 9, 82, 10]))`,
  perl: `sub merge_sort {
    my @arr = @_;
    return @arr if @arr <= 1;
    my $mid = int(@arr / 2);
    return merge([merge_sort(@arr[0..$mid-1])], [merge_sort(@arr[$mid..$#arr])]);
}
sub merge {
    my ($left, $right) = @_;
    my @r; my ($i, $j) = (0, 0);
    while ($i < @$left && $j < @$right) {
        if ($left->[$i] <= $right->[$j]) { push @r, $left->[$i++] }
        else { push @r, $right->[$j++] }
    }
    push @r, @$left[$i..$#$left], @$right[$j..$#$right];
    return @r;
}
print join(" ", merge_sort(38, 27, 43, 3, 9, 82, 10)), "\\n";`,
  bash: [
    '#!/bin/bash',
    '# Bubble sort',
    'arr=(38 27 43 3 9 82 10)',
    'n=${#arr[@]}',
    'for ((i=0; i<n-1; i++)); do',
    '  for ((j=0; j<n-i-1; j++)); do',
    '    if [ ${arr[j]} -gt ${arr[$((j+1))]} ]; then',
    '      tmp=${arr[j]}',
    '      arr[j]=${arr[$((j+1))]}',
    '      arr[$((j+1))]=$tmp',
    '    fi',
    '  done',
    'done',
    'echo ${arr[@]}',
  ].join('\n'),
}

interface OutputLine {
  type: 'stdout' | 'stderr' | 'error' | 'success'
  text: string
}

type CodeViewHandle = {
  focus: (pos?: number) => void
  caret: () => number
  text: () => string
  posAt: (x: number, y: number) => number | null
  hasFocus: () => boolean
  contentHeight: () => number
}

const editorTheme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--dsw-label)',
    fontSize: '13px',
    height: '100%',
  },
  '&.cm-editor': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.6',
    overflowX: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--dsw-label)',
    padding: '10px 12px',
    minHeight: '100%',
    fontFamily: 'inherit',
  },
  '.cm-cursor': { borderLeftColor: 'var(--dsw-label)' },
  '.cm-content ::selection': {
    background: 'color-mix(in srgb, var(--dsw-pick) 40%, transparent)',
    color: 'inherit',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--dsw-pick) 40%, transparent)',
  },
})

function wideIndent(lang: string) {
  return lang === 'java' || lang === 'c' || lang === 'cpp'
}

function RunnerEditor({
  value,
  writable,
  height,
  overflow,
  lang,
  placeholder,
  onChange,
  onRun,
  editorRef,
}: {
  value: string
  writable: boolean
  height: number
  overflow: boolean
  lang: string
  placeholder: string
  onChange: (next: string) => void
  onRun: () => void
  editorRef: { current: CodeViewHandle | null }
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  onChangeRef.current = onChange
  onRunRef.current = onRun

  useEffect(() => {
    const el = host.current
    if (!el) return
    const indent = wideIndent(lang) ? '    ' : '  '
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          editorTheme,
          EditorState.tabSize.of(indent.length),
          indentUnit.of(indent),
          cmPlaceholder(placeholder),
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  onRunRef.current()
                  return true
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorState.readOnly.of(!writable),
          EditorView.editable.of(writable),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    editorRef.current = {
      focus(pos) {
        view.focus()
        const at = Math.max(0, Math.min(pos ?? view.state.selection.main.head, view.state.doc.length))
        view.dispatch({ selection: EditorSelection.cursor(at), scrollIntoView: true })
      },
      caret() {
        return view.state.selection.main.head
      },
      text() {
        return view.state.doc.toString()
      },
      posAt(x, y) {
        return view.posAtCoords({ x, y })
      },
      hasFocus() {
        return view.hasFocus
      },
      contentHeight() {
        return view.scrollDOM.scrollHeight
      },
    }
    return () => {
      view.destroy()
      viewRef.current = null
      editorRef.current = null
    }
    // writable / lang 变了重建，避免只读和缩进对不上。value 由下面那条 effect 同步。
  }, [writable, lang, placeholder])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === value) return
    if (view.hasFocus) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return (
    <div
      ref={host}
      data-testid="page-code-runner-editor"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        height,
        minHeight: MIN_CODE_H,
        maxHeight: MAX_DRAG_CODE_H,
        overflowY: overflow ? 'auto' : 'hidden',
        boxSizing: 'border-box',
      }}
    />
  )
}

const MIN_CODE_H = 120
const MAX_CODE_H = 360
const MIN_OUT_H = 56
const MAX_OUT_H = 280
const MAX_DRAG_CODE_H = 900
const MAX_DRAG_OUT_H = 600

function CodeRunnerBlock({ data, update, writable }: BlockProps) {
  const ro = !writable
  const lang = String(data.lang ?? 'python')
  const code = String(data.code ?? SAMPLES[lang] ?? '')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [running, setRunning] = useState(false)
  // local state to avoid ProseMirror re-render on every keystroke
  const [localCode, setLocalCode] = useState(code)
  const [collapsed, setCollapsed] = useState(Boolean(data.collapsed))
  const editorRef = useRef<CodeViewHandle | null>(null)
  const outRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef(0)
  const wantFocus = useRef(false)
  // 未手动拖动时的高度：随内容自适应，超过上限则内部滚动
  const [autoCodeH, setAutoCodeH] = useState(MIN_CODE_H)
  const [autoOutH, setAutoOutH] = useState(0)
  const [codeOverflow, setCodeOverflow] = useState(false)
  const [outOverflow, setOutOverflow] = useState(false)
  // 拖动过程中的临时高度（只在松手时写回文档，避免每帧改文档）
  const [dragCodeH, setDragCodeH] = useState<number | null>(null)
  const [dragOutH, setDragOutH] = useState<number | null>(null)

  const pickNum = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null)
  const userCodeH = pickNum(data.codeH)
  const userOutH = pickNum(data.outputH)
  const codeH = dragCodeH ?? userCodeH ?? autoCodeH
  const outH = dragOutH ?? userOutH ?? autoOutH

  // sync from outside (e.g. language switch)
  useEffect(() => {
    setLocalCode(code)
  }, [code])

  useEffect(() => {
    setCollapsed(Boolean(data.collapsed))
  }, [data.collapsed])

  useEffect(() => {
    if (collapsed) return
    if (dragCodeH != null || userCodeH != null) return
    const id = requestAnimationFrame(() => {
      const raw = editorRef.current?.contentHeight() ?? 0
      if (!raw) return
      setCodeOverflow(raw > MAX_CODE_H + 2)
      setAutoCodeH(Math.min(Math.max(raw, MIN_CODE_H), MAX_CODE_H))
    })
    return () => cancelAnimationFrame(id)
  }, [localCode, lang, collapsed, userCodeH, dragCodeH])

  // 输出区同理
  useEffect(() => {
    if (collapsed) return
    const el = outRef.current
    if (!el) return
    if (dragOutH != null || userOutH != null) return
    const raw = el.scrollHeight
    setOutOverflow(raw > MAX_OUT_H + 2)
    setAutoOutH(Math.min(Math.max(raw, MIN_OUT_H), MAX_OUT_H))
  }, [output, collapsed, userOutH, dragOutH])

  const langInfo = LANGS.find((l) => l.id === lang) ?? LANGS[0]

  // 点工具条（运行 / 清空 / 收起 / 换语言 / 拖高度）后把焦点还给代码区，
  // 光标停在原处，接着就能继续打字
  const focusCode = useCallback(() => {
    editorRef.current?.focus(caretRef.current)
  }, [])

  useEffect(() => {
    if (collapsed || !wantFocus.current) return
    wantFocus.current = false
    focusCode()
  }, [collapsed, focusCode])


  const run = useCallback(async () => {
    const source = editorRef.current?.text() ?? localCode
    if (source !== localCode) setLocalCode(source)
    caretRef.current = editorRef.current?.caret() ?? caretRef.current
    setRunning(true)
    setOutput([])
    try {
      const res = await fetch('/api/code-runner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: source, lang }),
      })
      const result = await res.json()
      const lines: OutputLine[] = []
      if (result.compileError) {
        result.compileError.split('\n').forEach((l: string) => {
          if (l.trim()) lines.push({ type: 'stderr', text: l })
        })
        lines.push({ type: 'error', text: '\u2717 \u7f16\u8bd1\u5931\u8d25' })
      } else {
        if (result.stdout) {
          result.stdout.split('\n').forEach((l: string) => {
            if (l.length > 0) lines.push({ type: 'stdout', text: l })
          })
        }
        if (result.stderr) {
          result.stderr.split('\n').forEach((l: string) => {
            if (l.trim()) lines.push({ type: 'stderr', text: l })
          })
        }
        if (result.ok) {
          lines.push({ type: 'success', text: '\u2713 \u6267\u884c\u5b8c\u6210' })
        } else {
          lines.push({ type: 'error', text: '\u2717 \u8fd0\u884c\u51fa\u9519 (exit ' + result.exitCode + ')' })
        }
      }
      setOutput(lines)
    } catch (e) {
      setOutput([{ type: 'error', text: '\u2717 \u8bf7\u6c42\u5931\u8d25: ' + String(e) }])
    } finally {
      setRunning(false)
    }
  }, [localCode, lang])

  const clear = useCallback(() => setOutput([]), [])

  const persist = useCallback(() => {
    const next = editorRef.current?.text() ?? localCode
    caretRef.current = editorRef.current?.caret() ?? caretRef.current
    if (next !== String(data.code ?? '')) update({ code: next })
  }, [data.code, localCode, update])

  const onLangChange = useCallback((newLang: string) => {
    persist()
    update({ lang: newLang, code: SAMPLES[newLang] ?? '', codeH: null, outputH: null })
    setOutput([])
    requestAnimationFrame(focusCode)
  }, [update, focusCode, persist])

  const onRootMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    if (target?.closest?.('input, select, button, a, .cm-editor')) return
    e.stopPropagation()
    if (collapsed) return
    const editor = editorRef.current
    if (!editor) return
    const pos = editor.posAt(e.clientX, e.clientY)
    if (pos == null) return
    e.preventDefault()
    caretRef.current = pos
    editor.focus(pos)
  }, [collapsed])

  const startDrag = useCallback((e: React.MouseEvent, kind: 'code' | 'out') => {
    e.preventDefault()
    e.stopPropagation()
    const editor = editorRef.current
    const caret = editor?.hasFocus() ? editor.caret() : null
    if (caret != null) caretRef.current = caret
    const startY = e.clientY
    const startH = kind === 'code' ? codeH : outH
    const min = kind === 'code' ? MIN_CODE_H : MIN_OUT_H
    const max = kind === 'code' ? MAX_DRAG_CODE_H : MAX_DRAG_OUT_H
    let last = startH
    const move = (ev: MouseEvent) => {
      const next = Math.max(min, Math.min(startH + (ev.clientY - startY), max))
      last = Math.round(next)
      if (kind === 'code') setDragCodeH(last)
      else setDragOutH(last)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      if (kind === 'code') {
        setDragCodeH(null)
        update({ codeH: last })
      } else {
        setDragOutH(null)
        update({ outputH: last })
      }
      // 拖动不该动光标：把拖动前的落点还回去
      if (caret != null) focusCode()
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [codeH, outH, update, focusCode])

  const resetDrag = useCallback((kind: 'code' | 'out') => {
    if (kind === 'code') update({ codeH: null })
    else update({ outputH: null })
  }, [update])

  const dragBar = (kind: 'code' | 'out') => (
    <div
      title="\u62d6\u52a8\u8c03\u6574\u9ad8\u5ea6\uff0c\u53cc\u51fb\u6062\u590d\u81ea\u9002\u5e94"
      onMouseDown={(e) => startDrag(e, kind)}
      onDoubleClick={(e) => { e.stopPropagation(); resetDrag(kind) }}
      style={{
        height: 9,
        cursor: 'ns-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '1px solid var(--dsw-border)',
        background: 'var(--dsw-hover)',
      }}
    >
      <span style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--dsw-label-3)', opacity: 0.45 }} />
    </div>
  )

  const colorMap: Record<string, string> = {
    stdout: 'var(--dsw-label)',
    stderr: 'var(--dsw-label-3)',
    error: '#f38ba8',
    success: 'var(--dsw-label-2)',
  }

  const preview = (localCode.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 60)
  const lineCount = localCode.split('\n').length
  const canCollapse = localCode.trim().length > 0

  return (
    <div
      data-testid="page-code-runner"
      onMouseDown={onRootMouseDown}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        persist()
      }}
      style={{
        margin: '8px 0',
        border: '1px solid var(--dsw-border)',
        borderRadius: 10,
        background: 'var(--dsw-chat-code-bg, var(--dsw-sidebar))',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        width: '100%',
      }}
    >
      {/* toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '6px 10px',
          borderBottom: collapsed ? 'none' : '1px solid var(--dsw-border)',
          alignItems: 'center',
        }}
      >
        {canCollapse && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              persist()
              const next = !collapsed
              if (!next) wantFocus.current = true
              update({ collapsed: next })
            }}
            title={collapsed ? '\u5c55\u5f00' : '\u6536\u8d77'}
            style={{
              width: 20,
              height: 20,
              lineHeight: 1,
              padding: 0,
              borderRadius: 5,
              border: '1px solid var(--dsw-border)',
              background: 'var(--dsw-hover)',
              color: 'var(--dsw-label)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {collapsed ? '\u25b8' : '\u25be'}
          </button>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--dsw-label-3)', textTransform: 'uppercase' as const }}>
          {langInfo.label}
        </span>
        {!ro && (
          <select
            value={lang}
            onChange={(e) => onLangChange(e.target.value)}
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              border: '1px solid var(--dsw-border)',
              background: 'var(--dsw-input, transparent)',
              color: 'var(--dsw-label)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        )}
        {!ro && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void run()
              focusCode()
            }}
            disabled={running || !localCode.trim()}
            style={{
              padding: '3px 12px',
              borderRadius: 6,
              border: '1px solid var(--dsw-border)',
              background: 'var(--dsw-hover)',
              color: 'var(--dsw-label)',
              fontWeight: 600,
              fontSize: 12,
              cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.5 : 1,
            }}
          >
            {running ? '\u23d3 \u8fd0\u884c\u4e2d' : '\u25b6 \u8fd0\u884c'}
          </button>
        )}
        {output.length > 0 && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clear()
              focusCode()
            }}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: '1px solid var(--dsw-border)',
              background: 'var(--dsw-hover)',
              color: 'var(--dsw-label)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            清空
          </button>
        )}
        {collapsed && (
          <span style={{ color: 'var(--dsw-label-3)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {`${lineCount} \u884c\u00b7 ${preview}`}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--dsw-label-3)', fontSize: 11, whiteSpace: 'nowrap' }}>
          {!collapsed && (codeOverflow ? '\u5185\u5bb9\u8f83\u957f\uff0c\u53ef\u62d6\u52a8\u6216\u6536\u8d77  ' : '')}
          Ctrl+Enter
        </span>
      </div>

      {collapsed ? null : (
        <>
          {/* code editor */}
          <RunnerEditor
            value={localCode}
            writable={!ro}
            height={codeH}
            overflow={codeOverflow}
            lang={lang}
            placeholder={'\u5728\u6b64\u8f93\u5165 ' + langInfo.label + ' \u4ee3\u7801\u2026'}
            onChange={setLocalCode}
            onRun={() => {
              persist()
              void run()
            }}
            editorRef={editorRef}
          />
          {dragBar('code')}

          {/* output */}
          {output.length > 0 && (
            <>
              <div
                ref={outRef}
                style={{
                  borderTop: '1px solid var(--dsw-border)',
                  padding: '10px 12px',
                  height: outH,
                  maxHeight: MAX_DRAG_OUT_H,
                  boxSizing: 'border-box',
                  overflowY: outOverflow ? 'auto' : 'hidden',
                  userSelect: 'text',
                  cursor: 'text',
                }}
              >
                {output.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: colorMap[line.type] || 'var(--dsw-label)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                      wordBreak: 'break-word',
                    }}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
              {dragBar('out')}
            </>
          )}
        </>
      )}
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
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: BlockProps) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'code-run',
    plugin: name,
    label: '代码运行块',
    blockType: 'code',
    blockTypeLabel: '代码',
    hint: '在文档中运行多语言代码（Python/Java/C++/Go 等），编译执行并显示输出；高度随内容自适应，可拖动底部条调整、双击恢复，也可收起',
    aliases: ['code', 'run', 'runcode', '代码运行', 'java', 'python', 'js'],
    defaults: { lang: 'python', code: SAMPLES.python },
    View: CodeRunnerBlock,
  })
}
