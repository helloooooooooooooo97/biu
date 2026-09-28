import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ChatNode } from '@biu/web-session-view'
import {
  bumpRevealStart,
  captureChatScroll,
  CHAT_FIRST_PAINT_TURNS,
  didRevealOlderTurns,
  firstPaintStartIndex,
  groupNodesIntoTurns,
  isChatStuckToLatest,
  isChatPinnedToBottom,
  nextStickToLatest,
  pinChatToLatest,
  recalledChatScroll,
  rememberChatScroll,
  resetChatScrollMemoryForTests,
  restoreChatScroll,
  revealStartForMemory,
  shouldRevealFast,
  sliceTurnsFrom,
  turnIndexContaining,
} from './thread-reveal.ts'

afterEach(() => {
  resetChatScrollMemoryForTests()
})

function user(id: string): ChatNode {
  return { id, kind: 'user', text: id }
}

function reply(id: string): ChatNode {
  return {
    id,
    kind: 'reply',
    parts: [{ id: `${id}-a`, kind: 'assistant', text: id }],
    copyText: id,
  }
}

function longThread(): ChatNode[] {
  const nodes: ChatNode[] = []
  for (let i = 0; i < 10; i += 1) {
    nodes.push(user(`u-${i}`), reply(`r-${i}`))
  }
  return nodes
}

describe('thread reveal (visible first, then older)', () => {
  it('first paint starts at the tail, not turn 0', () => {
    expect(firstPaintStartIndex(10)).toBe(10 - CHAT_FIRST_PAINT_TURNS)
    expect(firstPaintStartIndex(1)).toBe(0)
    expect(firstPaintStartIndex(0)).toBe(0)
  })

  it('sliceTurnsFrom keeps later turns mounted when start decreases', () => {
    const nodes = longThread()
    const tail = sliceTurnsFrom(nodes, 8)
    expect(tail.map((n) => n.id)).toEqual(['u-8', 'r-8', 'u-9', 'r-9'])
    const more = sliceTurnsFrom(nodes, bumpRevealStart(8, 2))
    expect(more.map((n) => n.id).slice(-4)).toEqual(['u-8', 'r-8', 'u-9', 'r-9'])
    expect(more[0]?.id).toBe('u-6')
  })

  it('new message at the end stays in the mounted slice without remounting earlier tail', () => {
    const nodes = [...longThread(), user('u-10'), reply('r-10')]
    const start = firstPaintStartIndex(10)
    const shown = sliceTurnsFrom(nodes, start)
    expect(shown.at(-2)?.id).toBe('u-10')
    expect(shown.some((n) => n.id === 'u-8')).toBe(true)
  })

  it('groupNodesIntoTurns still splits on user', () => {
    expect(groupNodesIntoTurns(longThread())).toHaveLength(10)
  })

  it('reveals fast when the tail does not fill the viewport', () => {
    expect(
      shouldRevealFast({ scrollTop: 2000, scrollHeight: 400, clientHeight: 800 }),
    ).toBe(true)
    expect(
      shouldRevealFast({ scrollTop: 2000, scrollHeight: 4000, clientHeight: 800 }),
    ).toBe(false)
    expect(
      shouldRevealFast({ scrollTop: 40, scrollHeight: 4000, clientHeight: 800 }),
    ).toBe(true)
  })

  it('distinguishes prepended history from streaming growth at the tail', () => {
    expect(didRevealOlderTurns(8, 4)).toBe(true)
    expect(didRevealOlderTurns(4, 4)).toBe(false)
    expect(didRevealOlderTurns(4, 5)).toBe(false)
  })
})

function box(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 400,
    width: 400,
    height,
    toJSON() {
      return {}
    },
  }
}

describe('chat scroll memory per session', () => {
  it('keeps an independent reading position for each session', () => {
    rememberChatScroll('s-a', { kind: 'pin', nodeId: 'u-3' })
    rememberChatScroll('s-b', { kind: 'bottom' })
    expect(recalledChatScroll('s-a')).toEqual({ kind: 'pin', nodeId: 'u-3' })
    expect(recalledChatScroll('s-b')).toEqual({ kind: 'bottom' })
  })

  it('mounts from the pinned turn instead of only the tail', () => {
    const nodes = longThread()
    expect(turnIndexContaining(nodes, 'u-3')).toBe(3)
    expect(revealStartForMemory(nodes, { kind: 'pin', nodeId: 'u-3' }, 10)).toBe(0)
    expect(revealStartForMemory(nodes, { kind: 'bottom' }, 10)).toBe(10 - CHAT_FIRST_PAINT_TURNS)
  })

  it('captures the user message currently stuck to the top', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { value: 4000, configurable: true })
    Object.defineProperty(parent, 'scrollTop', { value: 1200, writable: true, configurable: true })
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true })
    parent.getBoundingClientRect = () => box(0, 800)
    const passed = document.createElement('div')
    passed.dataset.nodeId = 'u-2'
    passed.dataset.chatKind = 'user'
    passed.getBoundingClientRect = () => box(-80, 40)
    const sticky = document.createElement('div')
    sticky.dataset.nodeId = 'u-3'
    sticky.dataset.chatKind = 'user'
    sticky.getBoundingClientRect = () => box(0, 40)
    const later = document.createElement('div')
    later.dataset.nodeId = 'u-4'
    later.dataset.chatKind = 'user'
    later.getBoundingClientRect = () => box(200, 40)
    parent.append(passed, sticky, later)
    expect(captureChatScroll(parent)).toEqual({ kind: 'pin', nodeId: 'u-3' })
  })

  it('captures bottom when close to the latest messages', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(parent, 'scrollTop', { value: 1180, writable: true, configurable: true })
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true })
    expect(captureChatScroll(parent)).toEqual({ kind: 'bottom' })
  })

  it('still counts as latest inside the composer padding slack', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(parent, 'scrollTop', { value: 920, writable: true, configurable: true })
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true })
    expect(captureChatScroll(parent)).toEqual({ kind: 'bottom' })
  })

  it('restores by scrolling the turn box to the top, ignoring sticky visual offset', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollTop', { value: 1800, writable: true, configurable: true })
    parent.getBoundingClientRect = () => box(0, 800)
    const turn = document.createElement('div')
    turn.dataset.turnAnchor = 'u-3'
    turn.className = 'chat-turn'
    turn.getBoundingClientRect = () => box(-80, 200)
    const sticky = document.createElement('div')
    sticky.dataset.nodeId = 'u-3'
    sticky.dataset.chatKind = 'user'
    sticky.getBoundingClientRect = () => box(0, 40)
    turn.append(sticky)
    parent.append(turn)
    expect(restoreChatScroll(parent, { kind: 'pin', nodeId: 'u-3' })).toBe(true)
    expect(parent.scrollTop).toBe(1720)
  })

  it('pins the scroller onto the latest edge', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { value: 2400, configurable: true })
    Object.defineProperty(parent, 'scrollTop', { value: 100, writable: true, configurable: true })
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true })
    pinChatToLatest(parent)
    expect(parent.scrollTop).toBe(2400)
    parent.scrollTop = 2100
    expect(isChatStuckToLatest(parent)).toBe(true)
  })

  it('does not treat the top of a short thread as stuck-to-latest', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true })
    Object.defineProperty(parent, 'scrollTop', { value: 0, writable: true, configurable: true })
    expect(isChatStuckToLatest(parent)).toBe(false)
    parent.scrollTop = 200
    expect(isChatStuckToLatest(parent)).toBe(true)
  })

  it('does not keep pin-follow when the user has already scrolled up a little', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { value: 2400, configurable: true })
    Object.defineProperty(parent, 'clientHeight', { value: 800, configurable: true })
    Object.defineProperty(parent, 'scrollTop', { value: 1480, writable: true, configurable: true })
    expect(isChatStuckToLatest(parent)).toBe(true)
    expect(isChatPinnedToBottom(parent)).toBe(false)
    expect(
      nextStickToLatest({ stuck: true, distanceFromBottom: 120, scrollTop: 1480, scrollingUp: true }),
    ).toBe(false)
    expect(
      nextStickToLatest({ stuck: true, distanceFromBottom: 120, scrollTop: 1480, scrollingUp: false }),
    ).toBe(false)
    expect(
      nextStickToLatest({ stuck: false, distanceFromBottom: 20, scrollTop: 1580, scrollingUp: false }),
    ).toBe(true)
    expect(
      nextStickToLatest({ stuck: true, distanceFromBottom: 600, scrollTop: 1000, scrollingUp: false }),
    ).toBe(false)
  })
})

describe('thread follows the latest message', () => {
  it('pins a sent user turn to the top and only follows while stuck to the bottom', () => {
    const src = readFileSync(resolve(import.meta.dirname, './thread.tsx'), 'utf8')
    expect(src).toContain("restoreChatScroll(parent, { kind: 'pin', nodeId: latestUserId })")
    expect(src).toContain('followedUserRef.current === latestUserId')
    expect(src).toContain('ResizeObserver')
    expect(src).toContain('pinChatToLatest')
    expect(src).toContain('liveTurnId')
    expect(src).toContain('event.deltaY < 0')
    expect(src).toContain('nextY > lastTouchY + 0.5')
    expect(src).toContain('nextStickToLatest')
    expect(src).toContain('revealedOlder && prependHeightRef.current')
  })
})
