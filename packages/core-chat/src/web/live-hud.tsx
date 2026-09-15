import { memo, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import {
  ClockIcon,
  HashtagIcon,
  Square3Stack3DIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/16/solid'
import type { SlotProps } from '@biu/web-slots'
import { bindSessionView } from '@biu/web-session-view'
import { UsageInline } from './usage-inline.tsx'
import { MarkdownBody } from './markdown.tsx'
import { splitReplyForDisplay } from './thread.tsx'
import {
  extractLiveHud,
  formatDuration,
  getHudReplyId,
  listReplyNodes,
  setHudReplyId,
  subscribeHudReplyId,
} from './live-hud.ts'

function MetaItem({ icon, value, title }: { icon: ReactNode; value: ReactNode; title: string }) {
  return (
    <span className="chat-reply-meta-item" title={title}>
      <span className="chat-reply-meta-icon" aria-hidden>
        {icon}
      </span>
      <span className="chat-reply-meta-value">{value}</span>
    </span>
  )
}

export function ChatLiveMetrics(props: { useSessionView: ReturnType<typeof bindSessionView> }) {
  const nodes = props.useSessionView((state) => state.nodes)
  const agentStep = props.useSessionView((state) => state.agentStep)
  const replyId = useSyncExternalStore(subscribeHudReplyId, getHudReplyId, () => null)
  const hud = extractLiveHud(nodes, agentStep, replyId)
  if (!hud.turn && !hud.step && !hud.toolIndex && !hud.usage) return null
  return (
    <div className="chat-live-hud-metrics" data-testid="chat-live-hud" aria-live="polite">
      <div className="chat-live-hud-metrics-body chat-reply-meta">
        {hud.turn ? (
          <MetaItem icon={<HashtagIcon className="size-3" />} value={hud.turn} title={`第 ${hud.turn} 轮`} />
        ) : null}
        {hud.step ? (
          <MetaItem
            icon={<Square3Stack3DIcon className="size-3" />}
            value={hud.step}
            title={`本回合 ${hud.step} 个 step`}
          />
        ) : null}
        <MetaItem
          icon={<WrenchScrewdriverIcon className="size-3" />}
          value={<span data-testid="chat-live-hud-tool">{hud.toolIndex}</span>}
          title={`本回合 ${hud.toolIndex} 次工具调用`}
        />
        {hud.durationMs != null ? (
          <MetaItem
            icon={<ClockIcon className="size-3" />}
            value={formatDuration(hud.durationMs)}
            title="本回合耗时"
          />
        ) : null}
        {hud.usage ? (
          <span className="chat-reply-meta-item" title="Token 用量">
            <UsageInline usage={hud.usage} />
          </span>
        ) : null}
      </div>
    </div>
  )
}

export const ChatLiveHud = memo(function ChatLiveHud(props: SlotProps) {
  const useSessionView = props.useSessionView as ReturnType<typeof bindSessionView>
  const nodes = useSessionView((state) => state.nodes)
  const agentStep = useSessionView((state) => state.agentStep)
  const replyId = useSyncExternalStore(subscribeHudReplyId, getHudReplyId, () => null)
  const hud = extractLiveHud(nodes, agentStep, replyId)
  const replies = listReplyNodes(nodes)
  const selected =
    (hud.replyId ? replies.find((row) => row.id === hud.replyId) : undefined) ?? replies.at(-1)

  useEffect(() => {
    const list = listReplyNodes(nodes)
    if (replyId && list.some((row) => row.id === replyId)) return
    if (!list.length) return
    setHudReplyId(null)
  }, [nodes, replyId])

  if (!selected) return null
  const { finalParts } = splitReplyForDisplay(selected)
  const text = finalParts
    .filter((part) => part.kind === 'assistant')
    .map((part) => part.text)
    .join('\n\n')
    .trim()
  if (!text) return null

  return (
    <div className="chat-live-hud" data-testid="chat-live-hud-flash-wrap" aria-live="polite">
      <div className="chat-live-hud-flash is-output" data-testid="chat-live-hud-flash">
        <MarkdownBody text={text} streaming={Boolean(selected.streaming)} />
      </div>
    </div>
  )
})
