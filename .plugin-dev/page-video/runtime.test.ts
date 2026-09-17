import assert from 'node:assert/strict'
import { test } from 'vitest'
import { compileComponentSource, interpolate, makeAbsoluteFill, spring } from './runtime.ts'

const React = {
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => {
    if (typeof type === 'function') {
      return (type as (props: Record<string, unknown>) => unknown)({
        ...(props && typeof props === 'object' ? props : {}),
        children: children.length <= 1 ? children[0] : children,
      })
    }
    return { type, props, children }
  },
}

test('interpolate maps and clamps like Remotion', () => {
  assert.equal(interpolate(0.5, [0, 1], [0, 10]), 5)
  assert.equal(interpolate(-1, [0, 1], [0, 10], { extrapolateLeft: 'clamp' }), 0)
  assert.equal(interpolate(2, [0, 1], [0, 10], { extrapolateRight: 'clamp' }), 10)
})

test('spring settles toward the target', () => {
  const start = spring({ frame: 0, fps: 30, from: 0, to: 1 })
  const mid = spring({ frame: 12, fps: 30, from: 0, to: 1 })
  const end = spring({ frame: 30, fps: 30, from: 0, to: 1 })
  assert.ok(start < 0.2)
  assert.ok(mid > start)
  assert.ok(end > 0.85)
})

test('component source can layout with AbsoluteFill', () => {
  const view = compileComponentSource(
    `export default function Hero({ progress }) {
      return (
        <AbsoluteFill>
          <div>{String(progress)}</div>
        </AbsoluteFill>
      )
    }`,
    React,
  )
  const node = view({
    frame: 10,
    time: 0.3,
    progress: 0.3,
    durationInFrames: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    interpolate,
    spring,
    AbsoluteFill: makeAbsoluteFill(React.createElement),
  }) as { type: unknown; props: { style?: { position?: string }; 'data-pv-fill'?: string }; children: unknown[] }
  assert.equal(node.props['data-pv-fill'], '')
  assert.equal(node.props.style?.position, 'absolute')
})
