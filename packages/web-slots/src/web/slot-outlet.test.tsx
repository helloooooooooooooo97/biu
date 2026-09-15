import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Context } from 'cordis'
import * as slots from './index.ts'
import { SlotOutlet } from './slot-outlet.tsx'

// 注意这里用 @testing-library 的客户端渲染而不是 renderToStaticMarkup：
// error boundary 只在客户端渲染时捕获，SSR 下错误会直接往上抛。
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const Nothing = () => null

async function bootWithStage() {
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin({
    inject: ['slots'],
    apply: (c: Context) => c.slots.fill('root', Nothing, { children: { stage: { kind: 'list' } } }),
  })
  return ctx
}

test('一个缝里的组件崩掉，同缝其他组件照常渲染', async () => {
  const ctx = await bootWithStage()
  ctx.slots.place(
    'stage',
    () => {
      throw new Error('插件在渲染里炸了')
    },
    { key: 'bad', order: 1 },
  )
  ctx.slots.place('stage', () => <span data-testid="good">我好着呢</span>, { key: 'good', order: 2 })

  render(<SlotOutlet slots={ctx.slots} name="stage" />)

  const fallback = screen.getByTestId('render-boundary-fallback')
  expect(fallback.textContent).toContain('插件在渲染里炸了')
  expect(fallback.getAttribute('data-render-boundary-label')).toContain('stage')
  // 关键：另一个贡献者没被牵连，整棵树也没被卸载
  expect(screen.getByTestId('good')).toBeTruthy()
  expect(screen.getAllByTestId('render-boundary-fallback')).toHaveLength(1)
})

test('entry.props() 自己抛错也能被接住', async () => {
  const ctx = await bootWithStage()
  ctx.slots.place('stage', Nothing, {
    key: 'bad-props',
    order: 1,
    props: () => {
      throw new Error('props 求值就崩了')
    },
  })
  ctx.slots.place('stage', () => <span data-testid="good">我好着呢</span>, { key: 'good', order: 2 })

  render(<SlotOutlet slots={ctx.slots} name="stage" />)

  // props() 是在 SlotEntryView 的渲染里调的，所以 boundary 必须圈在它外面，
  // 圈在里面的话这个错误就漏出去了。
  expect(screen.getByTestId('render-boundary-fallback').textContent).toContain('props 求值就崩了')
  expect(screen.getByTestId('good')).toBeTruthy()
})

test('没有错误时不插入任何降级节点', async () => {
  const ctx = await bootWithStage()
  ctx.slots.place('stage', () => <span data-testid="plain">普通内容</span>, { key: 'plain' })

  render(<SlotOutlet slots={ctx.slots} name="stage" />)

  expect(screen.getByTestId('plain')).toBeTruthy()
  expect(screen.queryByTestId('render-boundary-fallback')).toBeNull()
})
