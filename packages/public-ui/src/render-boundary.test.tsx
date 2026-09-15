import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RenderBoundary } from './render-boundary.tsx'

// React 接住错误后自己会往 console 打一遍，测试里不需要这些噪音。
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Boom({ msg }: { msg: string }): never {
  throw new Error(msg)
}

describe('RenderBoundary', () => {
  it('没有错误时原样渲染 children', () => {
    render(
      <RenderBoundary label="x">
        <span data-testid="ok">正常</span>
      </RenderBoundary>,
    )
    expect(screen.getByTestId('ok')).toBeTruthy()
    expect(screen.queryByTestId('render-boundary-fallback')).toBeNull()
  })

  it('圈住渲染错误，同级内容照常显示', () => {
    render(
      <div>
        <RenderBoundary label="page-code-runner">
          <Boom msg="can't access lexical declaration 'x' before initialization" />
        </RenderBoundary>
        <span data-testid="sibling">侧栏还在</span>
      </div>,
    )
    // 崩掉的那块换成降级提示，并且写明是谁崩的
    const fallback = screen.getByTestId('render-boundary-fallback')
    expect(fallback.getAttribute('data-render-boundary-label')).toBe('page-code-runner')
    expect(fallback.textContent).toContain('page-code-runner')
    expect(fallback.textContent).toContain('before initialization')
    // 这条才是关键：整棵树没有被卸载
    expect(screen.getByTestId('sibling')).toBeTruthy()
  })

  it('一个块崩掉不影响另一个块', () => {
    render(
      <div>
        <RenderBoundary label="bad-plugin">
          <Boom msg="炸了" />
        </RenderBoundary>
        <RenderBoundary label="good-plugin">
          <span data-testid="good">我好着呢</span>
        </RenderBoundary>
      </div>,
    )
    expect(screen.getAllByTestId('render-boundary-fallback')).toHaveLength(1)
    expect(screen.getByTestId('good')).toBeTruthy()
  })

  it('重试能让恢复过来的子树重新渲染', () => {
    let failing = true
    function Flaky() {
      if (failing) throw new Error('一次性故障')
      return <span data-testid="recovered">好了</span>
    }
    render(
      <RenderBoundary label="flaky">
        <Flaky />
      </RenderBoundary>,
    )
    expect(screen.getByTestId('render-boundary-fallback')).toBeTruthy()
    failing = false
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.getByTestId('recovered')).toBeTruthy()
    expect(screen.queryByTestId('render-boundary-fallback')).toBeNull()
  })

  it('支持自定义降级内容', () => {
    render(
      <RenderBoundary
        label="custom"
        fallback={(error, retry) => (
          <button type="button" data-testid="custom" onClick={retry}>
            {error.message}
          </button>
        )}
      >
        <Boom msg="我的错误" />
      </RenderBoundary>,
    )
    expect(screen.getByTestId('custom').textContent).toBe('我的错误')
    expect(screen.queryByTestId('render-boundary-fallback')).toBeNull()
  })

  it('把出错来源和组件栈报到 console，便于定位', () => {
    render(
      <RenderBoundary label="noisy">
        <Boom msg="记一笔" />
      </RenderBoundary>,
    )
    const calls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const ours = calls.find((args) => String(args[0]).includes('[render-boundary]'))
    expect(ours).toBeTruthy()
    expect(String(ours?.[0])).toContain('noisy')
  })
})
