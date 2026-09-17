import assert from 'node:assert/strict'
import { test } from 'vitest'
import { DEFAULT_AD_SCENE_SOURCE, DEFAULT_AD_TRANSITION_SOURCE } from './default-ad.ts'
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

test('named default export wins over helper components declared first', () => {
  const view = compileComponentSource(
    `function Atom() { return <span>helper</span> }
     export default function Composition() { return <div>composition</div> }`,
    React,
  )
  const node = view({} as never) as { type: string; children: string[] }
  assert.equal(node.type, 'div')
  assert.deepEqual(node.children, ['composition'])
})

test('component source can map arrays to nested JSX and keep comparisons', () => {
  const view = compileComponentSource(
    `export default function Fib({ content }) {
      const n = Number(content) || 0
      const cells = [0, 1, 2].filter((x) => x < 3)
      return (
        <div>
          {cells.map((x) => (
            <span key={x}>{x < 2 ? 'leaf' : 'node'}-{n}</span>
          ))}
        </div>
      )
    }`,
    React,
  )
  const node = view({ content: '8' } as never) as {
    type: string
    children: Array<Array<{ type: string; children: string[] }>>
  }
  assert.equal(node.type, 'div')
  const kids = node.children[0]
  assert.ok(Array.isArray(kids))
  assert.equal(kids.length, 3)
  assert.equal(kids[0]?.type, 'span')
  assert.deepEqual(kids[0]?.children, ['leaf', '-', 8])
  assert.deepEqual(kids[2]?.children, ['node', '-', 8])
})

test('built-in advertisement scenes and transitions render varied deterministic motion', () => {
  const sceneView = compileComponentSource(DEFAULT_AD_SCENE_SOURCE, React)
  const transitionView = compileComponentSource(DEFAULT_AD_TRANSITION_SOURCE, React)
  assert.match(DEFAULT_AD_SCENE_SOURCE, /const titleLines = lines\.map/)
  assert.match(DEFAULT_AD_SCENE_SOURCE, /flexDirection:"column"/)
  assert.doesNotMatch(DEFAULT_AD_SCENE_SOURCE, /React\.createElement\("br"/)
  for (const atom of ['Grid', 'Glow', 'Meta', 'KineticTitle', 'Note', 'Progress', 'SceneLayout']) {
    assert.match(DEFAULT_AD_SCENE_SOURCE, new RegExp(`function ${atom}\\(`))
  }
  for (const variant of ['hero', 'split', 'marquee', 'stagger', 'focus', 'code', 'stack', 'finale']) {
    assert.match(DEFAULT_AD_SCENE_SOURCE, new RegExp(`"${variant}"`))
  }
  for (const motion of ['type', 'slide', 'reveal', 'scale', 'tracking', 'blur', 'fade-up']) {
    assert.match(DEFAULT_AD_SCENE_SOURCE, new RegExp(`motion==="${motion}"`))
  }
  assert.doesNotMatch(DEFAULT_AD_SCENE_SOURCE, /springFn/)
  assert.doesNotMatch(DEFAULT_AD_SCENE_SOURCE, /spring\(\{/)
  for (const variant of ['iris', 'split', 'bars', 'flash', 'slide', 'shutter']) {
    assert.match(DEFAULT_AD_TRANSITION_SOURCE, new RegExp(`variant==="${variant}"`))
  }
  const renderScene = (time: number) =>
    sceneView({
      frame: Math.round(time * 30),
      time,
      progress: time / 2,
      durationInFrames: 60,
      fps: 30,
      width: 1920,
      height: 1080,
      interpolate,
      spring,
      AbsoluteFill: makeAbsoluteFill(React.createElement),
      content: '03 / TRANSITION|04 / 08|切换画面|不必打断情绪|连续运动',
      color: '#FACC15',
      variant: 'stagger',
      textMotion: 'reveal',
    }) as { props: { style?: { background?: string } }; children: unknown[] }
  const opening = renderScene(0)
  const settled = renderScene(1)
  assert.equal(opening.props.style?.background, '#191919')
  assert.ok(Array.isArray(opening.children[0]) && opening.children[0].length >= 5)
  assert.ok(Array.isArray(settled.children[0]) && settled.children[0].length >= 5)
  const wipe = transitionView({
    progress: 0.5,
    color: '#FACC15',
    variant: 'wipe',
    interpolate,
    AbsoluteFill: makeAbsoluteFill(React.createElement),
  } as never) as { props: { style?: { background?: string; left?: string } } }
  assert.equal(wipe.props.style?.background, '#FACC15')
  assert.equal(wipe.props.style?.left, '50%')
  const iris = transitionView({
    progress: 0.5,
    color: '#38BDF8',
    variant: 'iris',
    interpolate,
    AbsoluteFill: makeAbsoluteFill(React.createElement),
  } as never) as { props: { style?: { clipPath?: string } } }
  assert.equal(iris.props.style?.clipPath, 'circle(38% at 50% 50%)')
})
