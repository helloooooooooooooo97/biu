import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  CircleStackIcon,
  Square2StackIcon,
  ShareIcon,
  HashtagIcon,
  Square3Stack3DIcon,
  LanguageIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/react/16/solid'
import { ImageThumbs } from './image-thumbs.tsx'
import { bindSessionView, type SessionListItem, type SessionViewService } from '@biu/web-session-view'
import { nodeIdFromOutlineEvent } from '@biu/web-session-view'
import {
  formatTokens,
  type ChatNode,
  type ChatReplyPart,
  type ChatStepStat,
  type TrajectoryUsage,
} from '@biu/web-session-view'
import { SidebarMascot } from '@biu/public-mascot'
import { StaticMascotMark } from '@biu/public-mascot'
import { resolveSessionMascot } from '@biu/public-mascot'
import type { SlotProps } from '@biu/type-slots'
import { parsePicks, pickDomAttrs, pickPreview } from '@biu/core-pick/web'
import { MarkdownBody } from './markdown.tsx'
import { UserBubbleEditor } from './user-bubble-editor.tsx'
import { ToolCard } from './tool-card.tsx'
import { LiveDispatchTable } from './live-dispatch-table.tsx'
import { ContentEditsTable } from './content-edits-table.tsx'
import { UsageInline } from './usage-inline.tsx'
import {
  bumpRevealStart,
  captureChatScroll,
  firstPaintStartIndex,
  groupNodesIntoTurns,
  distanceFromChatBottom,
  nextStickToLatest,
  pinChatToLatest,
  PIN_TOP_SLACK_PX,
  recalledChatScroll,
  rememberChatScroll,
  restoreChatScroll,
  revealStartForMemory,
  shouldRevealFast,
  sliceTurnsFrom,
  turnIndexContaining,
} from './thread-reveal.ts'

export { groupNodesIntoTurns } from './thread-reveal.ts'

/** 提早预取更早消息，避免滑到顶才开始请求 */
const PREFETCH_OLDER_PX = 720

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
    node = node.parentElement
  }
  return null
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) {
    const sec = ms / 1000
    return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`
  }
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function formatTok(n: number) {
  return formatTokens(n)
}

function stepLabel(step: number) {
  return `Step ${step + 1}`
}

function MetaItem({
  icon,
  value,
  title,
}: {
  icon: ReactNode
  value: ReactNode
  title: string
}) {
  return (
    <span className="chat-reply-meta-item" title={title}>
      <span className="chat-reply-meta-icon" aria-hidden>
        {icon}
      </span>
      <span className="chat-reply-meta-value">{value}</span>
    </span>
  )
}

function StepBar({ stat, replyId }: { stat: ChatStepStat; replyId: string }) {
  const usage: TrajectoryUsage = {
    inputTokens: stat.inputTokens,
    outputTokens: stat.outputTokens,
    totalTokens: stat.inputTokens + stat.outputTokens,
    ...(stat.cacheReadTokens ? { cacheReadTokens: stat.cacheReadTokens } : {}),
    ...(stat.histPct !== undefined ? { histPct: stat.histPct } : {}),
  }
  return (
    <div
      className="chat-step-bar"
      role="group"
      aria-label={stepLabel(stat.step)}
      {...pickDomAttrs('step', `${replyId}:${stat.step}`, stepLabel(stat.step))}
    >
      <div className="chat-reply-meta">
        <MetaItem icon={<Square3Stack3DIcon className="size-3" />} value={stat.step + 1} title={stepLabel(stat.step)} />
        <MetaItem
          icon={<CircleStackIcon className="size-3" />}
          value={<UsageInline usage={usage} />}
          title="本步 Token 用量"
        />
        <MetaItem icon={<WrenchScrewdriverIcon className="size-3" />} value={stat.toolCount} title={`本步 ${stat.toolCount} 个工具`} />
        <MetaItem
          icon={<LanguageIcon className="size-3" />}
          value={formatTok(stat.messageChars)}
          title={`本步 Message ${formatTok(stat.messageChars)} 字`}
        />
        {stat.durationMs != null ? (
          <MetaItem
            icon={<ClockIcon className="size-3" />}
            value={formatDuration(stat.durationMs)}
            title="本步耗时"
          />
        ) : null}
      </div>
    </div>
  )
}

function renderReplyPartList({
  parts,
  stepMap,
  onInspect,
  showSteps,
  replyId,
  streaming,
}: {
  parts: ChatReplyPart[]
  stepMap: Map<number, ChatStepStat>
  onInspect: (callId: string) => void
  showSteps: boolean
  replyId: string
  streaming: boolean
}) {
  const elements: ReactNode[] = []
  let lastStep: number | undefined

  for (const part of parts) {
    const step = part.step
    if (showSteps && step != null && step !== lastStep) {
      const stat = stepMap.get(step) ?? {
        step,
        inputTokens: 0,
        outputTokens: 0,
        toolCount: 0,
        messageChars: 0,
      }
      elements.push(<StepBar key={`step-${step}`} stat={stat} replyId={replyId} />)
      lastStep = step
    }

    if (part.kind === 'think') {
      const partStreaming = Boolean(part.streaming)
      elements.push(
        <div
          key={part.id}
          className="chat-think-body text-[13px] leading-5 text-(--dsw-label-3)"
          data-testid="chat-think"
          {...pickDomAttrs('message', part.id, pickPreview(part.text) || 'think')}
        >
          <div className="mb-1 text-[12px] font-medium tracking-wide">思考</div>
          {part.text ? (
            <div className="whitespace-pre-wrap">{part.text}</div>
          ) : partStreaming ? (
            '…'
          ) : null}
          {partStreaming ? (
            <span className="ml-1 inline-block animate-pulse">▍</span>
          ) : null}
        </div>,
      )
    } else if (part.kind === 'assistant') {
      const partStreaming = Boolean(part.streaming)
      elements.push(
        <div
          key={part.id}
          className="chat-assistant-body"
          {...pickDomAttrs('message', part.id, pickPreview(part.text) || 'assistant')}
        >
          {part.text ? (
            <MarkdownBody text={part.text} streaming={partStreaming} />
          ) : partStreaming ? (
            '…'
          ) : null}
          {partStreaming ? (
            <span className="ml-1 inline-block animate-pulse text-(--dsw-label-3)">▍</span>
          ) : null}
        </div>,
      )
    } else {
      elements.push(<ToolCard key={part.id} node={part} onInspect={onInspect} live={streaming} />)
    }
  }

  return elements
}

function ReplyParts({
  node,
  onInspect,
  expanded,
}: {
  node: Extract<ChatNode, { kind: 'reply' }>
  onInspect: (callId: string) => void
  /** true：展示 Details；false：Details 仍挂载但 hidden，避免展开时重建 DOM */
  expanded: boolean
}) {
  const stepMap = new Map((node.steps ?? []).map((item) => [item.step, item]))
  const streaming = Boolean(node.streaming)

  // 流式中结构还在变，整段展开渲染
  if (streaming) {
    return <>{renderReplyPartList({ parts: node.parts, stepMap, onInspect, showSteps: true, replyId: node.id, streaming })}</>
  }

  const { detailParts, finalParts, hasDetails } = splitReplyForDisplay(node)

  return (
    <>
      {hasDetails ? (
        <div
          className="chat-reply-details"
          data-testid="reply-details"
          hidden={!expanded}
          aria-hidden={!expanded}
        >
          {renderReplyPartList({
            parts: detailParts,
            stepMap,
            onInspect,
            showSteps: true,
            replyId: node.id,
            streaming,
          })}
        </div>
      ) : null}
      {/* 展开 Details 时也要带上最终 Message 所在 step 的统计条 */}
      {renderReplyPartList({
        parts: finalParts,
        stepMap,
        onInspect,
        showSteps: expanded,
        replyId: node.id,
        streaming,
      })}
    </>
  )
}

/**
 * Agent loop：最后一条有正文的 assistant 是最终 Message；
 * 之前的 step / 工具 / 中间草稿都算 Details。
 */
export function splitReplyForDisplay(node: Extract<ChatNode, { kind: 'reply' }>): {
  detailParts: ChatReplyPart[]
  finalParts: ChatReplyPart[]
  hasDetails: boolean
} {
  const parts = node.parts
  let finalIndex = -1
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]!
    if (part.kind === 'assistant' && part.text.trim()) {
      finalIndex = i
      break
    }
  }
  if (finalIndex < 0) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (parts[i]!.kind === 'assistant') {
        finalIndex = i
        break
      }
    }
  }
  if (finalIndex <= 0) {
    return { detailParts: [], finalParts: parts, hasDetails: false }
  }
  return {
    detailParts: parts.slice(0, finalIndex),
    finalParts: parts.slice(finalIndex),
    hasDetails: true,
  }
}

function ReplyActions({
  text,
  onFork,
}: {
  text: string
  onFork: () => void | Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [forkBusy, setForkBusy] = useState(false)

  async function copy() {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be denied */
    }
  }

  async function fork() {
    if (forkBusy) return
    setForkBusy(true)
    try {
      await onFork()
    } finally {
      setForkBusy(false)
    }
  }

  return (
    <>
      <div className="chat-reply-actions" role="group" aria-label="回合操作">
        {text.trim() ? (
          <>
            <button
              type="button"
              className={`chat-assistant-action${copied ? ' is-done' : ''}`}
              title={copied ? '已复制' : '复制'}
              aria-label={copied ? '已复制' : '复制本回合回复'}
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon className="size-3.5" /> : <Square2StackIcon className="size-3.5" />}
            </button>
            <button
              type="button"
              className="chat-assistant-action"
              title="Fork 会话"
              aria-label="Fork 会话"
              disabled={forkBusy}
              onClick={() => void fork()}
            >
              <ShareIcon className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </>
  )
}

function formatSentAt(ts: number) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return time
  const day = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  return `${day} ${time}`
}

/** 挂在发起本回合的用户消息下：Details + 统计；右侧为发送时间 */
function replyToolCount(reply: Extract<ChatNode, { kind: 'reply' }>) {
  const fromParts = reply.parts.reduce((count, part) => count + (part.kind === 'tool' ? 1 : 0), 0)
  if (fromParts > 0) return fromParts
  return (reply.steps ?? []).reduce((count, step) => count + step.toolCount, 0)
}

function UserTurnBar({
  user,
  reply,
  detailsOpen,
  onToggleDetails,
  canExpand,
  expanded,
  onToggleExpand,
  sessions,
}: {
  user: Extract<ChatNode, { kind: 'user' }>
  reply?: Extract<ChatNode, { kind: 'reply' }>
  detailsOpen: boolean
  onToggleDetails: (replyId: string) => void
  canExpand?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  sessions: SessionListItem[]
}) {
  const streaming = Boolean(reply?.streaming)
  const { hasDetails } = reply && !streaming ? splitReplyForDisplay(reply) : { hasDetails: false }
  const toolCount = reply ? replyToolCount(reply) : 0
  const hasMeta =
    reply != null &&
    (reply.turn != null ||
      reply.stepCount != null ||
      (!streaming && reply.durationMs != null) ||
      Boolean(reply.usage) ||
      toolCount > 0)
  const sentLabel = user.ts != null ? formatSentAt(user.ts) : ''

  return (
    <div
      className="box-border flex h-[30px] min-h-[30px] w-full items-center justify-between gap-3 border-0 border-t border-(--dsw-bubble) bg-transparent px-(--dsw-chat-pad-x) text-(length:--dsw-chat-ui-font-size) leading-none text-(--dsw-sidebar-fg)"
      aria-label="回合摘要"
      data-testid="user-turn-bar"
    >
      <div className="flex min-h-full min-w-0 flex-1 items-center gap-2.5">
        {hasDetails && reply ? (
          <button
            type="button"
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-transparent bg-transparent py-0.5 pr-2 pl-1 text-(length:--dsw-chat-ui-font-size) leading-none text-(--dsw-sidebar-fg) hover:bg-(--dsw-hover) hover:text-(--dsw-sidebar-fg-active)${detailsOpen ? ' bg-(--dsw-hover) text-(--dsw-sidebar-fg-active)' : ''}`}
            aria-expanded={detailsOpen}
            aria-controls={`reply-details-${reply.id}`}
            data-testid="details-toggle"
            onClick={() => onToggleDetails(reply.id)}
          >
            {detailsOpen ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
            <span>Details</span>
          </button>
        ) : null}
        {hasMeta && reply ? (
          <div className="chat-reply-meta">
            {reply.turn != null ? (
              <MetaItem icon={<HashtagIcon className="size-3" />} value={reply.turn} title={`第 ${reply.turn} 轮`} />
            ) : null}
            {reply.stepCount != null ? (
              <MetaItem
                icon={<Square3Stack3DIcon className="size-3" />}
                value={reply.stepCount}
                title={`本回合 ${reply.stepCount} 个 step`}
              />
            ) : null}
            <MetaItem
              icon={<WrenchScrewdriverIcon className="size-3" />}
              value={<span data-testid="user-tool-count">{toolCount}</span>}
              title={`本回合 ${toolCount} 次工具调用`}
            />
            {reply.durationMs != null ? (
              <MetaItem
                icon={<ClockIcon className="size-3" />}
                value={formatDuration(reply.durationMs)}
                title="本回合耗时"
              />
            ) : null}
            {reply.usage ? (
              <MetaItem icon={<CircleStackIcon className="size-3" />} value={<UsageInline usage={reply.usage} />} title="Token 用量" />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="inline-flex shrink-0 items-center gap-1.5" data-testid="user-turn-bar-end">
        {canExpand && onToggleExpand ? (
          <button
            type="button"
            className="inline-grid size-[22px] cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-(--dsw-sidebar-fg) hover:bg-(--dsw-hover) hover:text-(--dsw-sidebar-fg-active)"
            aria-expanded={Boolean(expanded)}
            aria-label={expanded ? '收起请求全文' : '展开请求全文'}
            data-testid="user-expand-toggle"
            onClick={onToggleExpand}
          >
            {expanded ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
          </button>
        ) : null}
        <UserSenderAvatar sender={user.sender} sessions={sessions} />
        {sentLabel ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-(length:--dsw-chat-ui-font-size) leading-none text-(--dsw-sidebar-fg) tabular-nums"
            title="发送时间"
            data-testid="user-sent-at"
          >
            <ClockIcon className="size-3" aria-hidden />
            <span>{sentLabel}</span>
          </span>
        ) : null}
        {reply && !streaming ? (
          reply.endReason && reply.endReason !== 'complete' ? (
            <span
              className="chat-reply-end-status tool-call-status is-fail"
              title="回合已取消"
              aria-label="回合已取消"
              data-testid="user-turn-end-status"
            >
              <XCircleIcon className="size-3" aria-hidden />
            </span>
          ) : (
            <span
              className="chat-reply-end-status tool-call-status is-ok"
              title="回合完成"
              aria-label="回合完成"
              data-testid="user-turn-end-status"
            >
              <CheckCircleIcon className="size-3" aria-hidden />
            </span>
          )
        ) : null}
      </div>
    </div>
  )
}

function UserSenderAvatar({
  sender,
  sessions,
}: {
  sender?: Extract<ChatNode, { kind: 'user' }>['sender']
  sessions: SessionListItem[]
}) {
  if (sender?.type === 'session') {
    const hit = sessions.find((item) => item.id === sender.sessionId)
    const identity = resolveSessionMascot(sender.sessionId, hit?.mascot)
    return (
      <span
        className="grid size-[18px] shrink-0 place-items-center text-(--dsw-label-3)"
        title={hit?.title || '会话'}
        data-testid="user-sender-mascot"
      >
        <StaticMascotMark identity={identity} size={16} title={hit?.title || identity.shape} />
      </span>
    )
  }
  return (
    <span
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-(color-mix(in_srgb,var(--dsw-label-3)_14%,transparent)) text-(--dsw-label-3)"
      title="你"
      data-testid="user-sender-human"
      aria-hidden
    >
      <UserIcon className="size-3" />
    </span>
  )
}

function findReplyForUser(nodes: ChatNode[], userIndex: number): Extract<ChatNode, { kind: 'reply' }> | undefined {
  for (let i = userIndex + 1; i < nodes.length; i += 1) {
    const next = nodes[i]!
    if (next.kind === 'user') return undefined
    if (next.kind === 'reply') return next
  }
  return undefined
}

const noopToggleDetails = (_replyId: string) => undefined

function NodeView({
  node,
  replyForUser,
  detailsOpen,
  onToggleDetails = noopToggleDetails,
  onInspect,
  onFork,
  sessions = [],
  dispatchTasks,
  sessionId,
}: {
  node: ChatNode
  /** 用户消息发起的本回合回复（统计挂在用户气泡下） */
  replyForUser?: Extract<ChatNode, { kind: 'reply' }>
  detailsOpen?: boolean
  onToggleDetails?: (replyId: string) => void
  onInspect: (callId: string) => void
  onFork: () => void | Promise<void>
  sessions?: SessionListItem[]
  dispatchTasks?: import('@biu/web-session-view').DispatchedTaskRow[]
  sessionId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  // 避免每条用户消息 useLayoutEffect 读 layout（滚动时强制同步布局会卡）
  const textLen = node.kind === 'user' ? node.text.length : 0
  const lineHints = node.kind === 'user' ? node.text.split('\n').length : 0
  // 限高约 80px：长文/多行才出展开按钮（避免每条都量 DOM）
  const overflows = textLen > 140 || lineHints > 3

  if (node.kind === 'user') {
    const picked = parsePicks(node.text)
    const canExpand = overflows || expanded
    return (
      <div
        className="chat-user-card"
        {...pickDomAttrs('message', node.id, pickPreview(picked.rest || node.text) || 'user')}
      >
        <div className="chat-user-card-body text-(--dsw-label)">
          <div
            className={`w-full max-w-full border-0 bg-transparent p-0 text-(--dsw-label) outline-none${canExpand && !expanded ? ' max-h-[80px] overflow-hidden' : ''}${expanded ? ' max-h-none overflow-visible' : ''}`}
            data-testid="user-bubble"
            {...pickDomAttrs('message', node.id, pickPreview(picked.rest || node.text) || 'user')}
          >
            {node.kindTag === 'inject' ? (
              <div className="mb-1 text-(length:--dsw-chat-ui-font-size) text-(--dsw-label-3)">inject</div>
            ) : null}
            <UserBubbleEditor text={node.text} />
          </div>
          {node.images?.length ? <ImageThumbs images={node.images} /> : null}
        </div>
        <UserTurnBar
          user={node}
          reply={replyForUser}
          detailsOpen={Boolean(detailsOpen)}
          onToggleDetails={onToggleDetails}
          canExpand={canExpand}
          expanded={expanded}
          onToggleExpand={() => setExpanded((value) => !value)}
          sessions={sessions}
        />
      </div>
    )
  }

  if (node.kind === 'reply') {
    const streaming = Boolean(node.streaming)
    const expanded = streaming || Boolean(detailsOpen)
    return (
      <div
        className={`chat-reply-block${streaming ? ' is-streaming' : ''}${expanded ? ' is-details-open' : ''}`}
        id={`reply-details-${node.id}`}
        {...pickDomAttrs('reply', node.id, pickPreview(node.copyText) || 'reply')}
      >
        <div className="chat-reply-body">
          <ReplyParts node={node} onInspect={onInspect} expanded={expanded} />
          {!streaming && dispatchTasks && dispatchTasks.length > 0 ? (
            <LiveDispatchTable tasks={dispatchTasks} />
          ) : null}
          {sessionId && node.turn != null && node.contentEdits?.length ? (
            <ContentEditsTable files={node.contentEdits} sessionId={sessionId} turn={node.turn} />
          ) : null}
        </div>
        {!streaming ? (
          <div className="chat-reply-actions-row">
            <ReplyActions text={node.copyText} onFork={onFork} />
          </div>
        ) : null}
      </div>
    )
  }

  return <div className="self-center text-xs text-(--dsw-label-3)">{node.text}</div>
}

const NodeViewMemo = memo(NodeView)

/**
 * 消息列表：已交给本组件的节点常驻 DOM（不虚表卸行）。
 * 更早回合由 ChatThread 分帧从上往下补挂；屏外绘制交给 content-visibility。
 */
export const ChatNodeList = memo(function ChatNodeList({
  nodes,
  onInspect,
  onFork,
  sessions = [],
  dispatchedTasksByTurn = {},
  sessionId,
}: {
  nodes: ChatNode[]
  onInspect: (callId: string) => void
  onFork: () => void | Promise<void>
  sessions?: SessionListItem[]
  dispatchedTasksByTurn?: Record<
    string,
    import('@biu/web-session-view').DispatchedTaskRow[]
  >
  sessionId?: string
}) {
  const [detailsOpenByReply, setDetailsOpenByReply] = useState<Record<string, boolean>>({})

  const onToggleDetails = useCallback((replyId: string) => {
    setDetailsOpenByReply((prev) => ({ ...prev, [replyId]: !prev[replyId] }))
  }, [])

  const turns = useMemo(() => groupNodesIntoTurns(nodes), [nodes])
  const liveTurnId = turns.at(-1)?.[0]?.id

  return (
    <div className="chat-node-list">
      {turns.map((turn) => {
        const anchor = turn[0]!
        const startIndex = nodes.indexOf(anchor)
        return (
          <div key={anchor.id} className="chat-turn" data-testid="chat-turn" data-turn-anchor={anchor.id} {...pickDomAttrs('turn', anchor.id, pickPreview(anchor.kind === 'user' ? anchor.text : anchor.id) || 'turn')}>
            {turn.map((node, offset) => {
              const index = startIndex + offset
              const replyForUser = node.kind === 'user' ? findReplyForUser(nodes, index) : undefined
              const replyIdForDetails = node.kind === 'reply' ? node.id : replyForUser?.id
              const detailsOpen = replyIdForDetails ? Boolean(detailsOpenByReply[replyIdForDetails]) : false
              const replyNode = node.kind === 'reply' ? node : replyForUser
              const dispatchTasks =
                replyNode?.turn != null ? dispatchedTasksByTurn[String(replyNode.turn)] : undefined
              const stickyUser =
                node.kind === 'user'
                  ? 'sticky top-0 z-1 bg-transparent'
                  : ''
              const skipPaint =
                (node.kind === 'reply' || node.kind === 'turn') && anchor.id !== liveTurnId
                  ? '[content-visibility:auto] [contain-intrinsic-size:auto_160px]'
                  : ''
              return (
                <div
                  key={node.id}
                  className={[stickyUser, skipPaint].filter(Boolean).join(' ')}
                  data-node-id={node.id}
                  data-chat-kind={node.kind}
                  {...(node.kind === 'user'
                    ? pickDomAttrs('message', node.id, pickPreview(node.text) || 'user')
                    : node.kind === 'reply'
                      ? pickDomAttrs('reply', node.id, pickPreview(node.copyText) || 'reply')
                      : pickDomAttrs('turn', node.id, node.text))}
                >
                  <NodeViewMemo
                    node={node}
                    replyForUser={replyForUser}
                    detailsOpen={detailsOpen}
                    onToggleDetails={onToggleDetails}
                    onInspect={onInspect}
                    onFork={onFork}
                    sessions={sessions}
                    dispatchTasks={dispatchTasks}
                    sessionId={sessionId}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
})

export const ChatThread = memo(function ChatThread(props: SlotProps) {
  const useSessionView = props.useSessionView as ReturnType<typeof bindSessionView>
  const sessionView = props.sessionView as SessionViewService
  const navigate = useNavigate()
  const nodes = useSessionView((state) => state.nodes)
  const sessionId = useSessionView((state) => state.sessionId)
  const turns = useMemo(() => groupNodesIntoTurns(nodes), [nodes])
  const totalTurns = turns.length
  const [revealStart, setRevealStart] = useState(() => firstPaintStartIndex(totalTurns))
  const sessionKeyRef = useRef(sessionId)
  const prevTotalRef = useRef(totalTurns)
  if (sessionId !== sessionKeyRef.current) {
    sessionKeyRef.current = sessionId
    prevTotalRef.current = totalTurns
    const next = revealStartForMemory(nodes, recalledChatScroll(sessionId), totalTurns)
    if (next !== revealStart) setRevealStart(next)
  } else if (prevTotalRef.current === 0 && totalTurns > 0) {
    prevTotalRef.current = totalTurns
    const next = revealStartForMemory(nodes, recalledChatScroll(sessionId), totalTurns)
    if (next !== revealStart) setRevealStart(next)
  } else {
    prevTotalRef.current = totalTurns
  }
  const mountedNodes = useMemo(() => sliceTurnsFrom(nodes, revealStart), [nodes, revealStart])
  const pending = useSessionView((state) => state.pending)
  const sessions = useSessionView((state) => state.sessions)
  const error = useSessionView((state) => state.error)
  const switchingSession = useSessionView((state) => state.switchingSession)
  const hasMoreOlder = useSessionView((state) => state.hasMoreOlder)
  const loadingOlder = useSessionView((state) => state.loadingOlder)
  const dispatchedTasksByTurn = useSessionView((state) => state.dispatchedTasksByTurn)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement | null>(null)
  const stickToBottomRef = useRef(true)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const restoredForRef = useRef<string | null>(null)
  const holdOlderRef = useRef(false)
  const maxScrollRef = useRef(0)
  const prependHeightRef = useRef(0)
  const prefetchingRef = useRef(false)
  const [scrollEpoch, setScrollEpoch] = useState(0)

  const onInspect = useCallback(
    (callId: string) => {
      sessionView.inspectCall(callId)
    },
    [sessionView],
  )

  const onFork = useCallback(() => {
    return sessionView.forkCurrent().then((id) => {
      navigate(`/s/${id}`)
    })
  }, [sessionView, navigate])

  const [outlineJump, setOutlineJump] = useState(0)
  const outlineTargetRef = useRef<string | null>(null)
  useEffect(() => {
    const onGo = (event: Event) => {
      const id = nodeIdFromOutlineEvent(event)
      if (!id) return
      const idx = turnIndexContaining(nodes, id)
      if (idx < 0) return
      outlineTargetRef.current = id
      setRevealStart((start) => Math.min(start, idx))
      setOutlineJump((value) => value + 1)
    }
    window.addEventListener('biu:chat-outline-go', onGo)
    return () => window.removeEventListener('biu:chat-outline-go', onGo)
  }, [nodes])

  useLayoutEffect(() => {
    const id = outlineTargetRef.current
    if (!id) return
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
    const scrollTo = () => {
      const el = document.querySelector<HTMLElement>(`[data-node-id="${escaped}"]`)
      if (!el) return false
      outlineTargetRef.current = null
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return true
    }
    if (scrollTo()) return
    const frame = requestAnimationFrame(() => {
      scrollTo()
    })
    return () => cancelAnimationFrame(frame)
  }, [mountedNodes, revealStart, outlineJump])

  useLayoutEffect(() => {
    const parent = findScrollParent(rootRef.current)
    if (parent && parent !== scrollRef.current) {
      scrollRef.current = parent
      setScrollEpoch((value) => value + 1)
    }
  })

  useLayoutEffect(() => {
    const mem = recalledChatScroll(sessionId)
    stickToBottomRef.current = !mem || mem.kind === 'bottom'
    restoredForRef.current = null
    prependHeightRef.current = 0
    holdOlderRef.current = mem?.kind === 'pin'
    maxScrollRef.current = 0
  }, [sessionId])

  useEffect(() => {
    return () => {
      const parent = scrollRef.current
      const id = sessionIdRef.current
      if (id && parent) rememberChatScroll(id, captureChatScroll(parent))
    }
  }, [])

  useLayoutEffect(() => {
    if (pending) stickToBottomRef.current = true
  }, [pending])

  useEffect(() => {
    const parent = scrollRef.current
    if (!parent) return

    const maybePrefetchOlder = () => {
      if (!hasMoreOlder || loadingOlder || prefetchingRef.current) return
      if (parent.scrollTop > PREFETCH_OLDER_PX) return
      const beforeHeight = parent.scrollHeight
      const beforeTop = parent.scrollTop
      prefetchingRef.current = true
      void sessionView
        .loadOlder()
        .then((loaded) => {
          if (!loaded) return
          requestAnimationFrame(() => {
            if (beforeTop <= PIN_TOP_SLACK_PX) return
            parent.scrollTop = beforeTop + (parent.scrollHeight - beforeHeight)
          })
        })
        .finally(() => {
          prefetchingRef.current = false
        })
    }

    let lastTop = parent.scrollTop
    const applyStick = (scrollingUp: boolean) => {
      stickToBottomRef.current = nextStickToLatest({
        stuck: stickToBottomRef.current,
        distanceFromBottom: distanceFromChatBottom(parent),
        scrollTop: parent.scrollTop,
        scrollingUp,
      })
    }
    const onScroll = () => {
      applyStick(parent.scrollTop < lastTop - 0.5)
      lastTop = parent.scrollTop
      maybePrefetchOlder()
    }
    const onWheel = (event: WheelEvent) => {
      // 滚轮先于 scroll；必须立刻松钉，否则 ResizeObserver / 贴底 layout 会把位移拽回去。
      if (event.deltaY < 0) stickToBottomRef.current = false
    }
    const onUserScroll = () => {
      onScroll()
      maxScrollRef.current = Math.max(maxScrollRef.current, parent.scrollTop)
      if (holdOlderRef.current && maxScrollRef.current > PREFETCH_OLDER_PX && parent.scrollTop <= PREFETCH_OLDER_PX) {
        holdOlderRef.current = false
      }
      const id = sessionIdRef.current
      if (id && restoredForRef.current === id) rememberChatScroll(id, captureChatScroll(parent))
    }
    onScroll()
    parent.addEventListener('scroll', onUserScroll, { passive: true })
    parent.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      parent.removeEventListener('scroll', onUserScroll)
      parent.removeEventListener('wheel', onWheel)
    }
  }, [sessionId, scrollEpoch, hasMoreOlder, loadingOlder, sessionView])

  useEffect(() => {
    const root = rootRef.current
    const parent = scrollRef.current
    if (!root || !parent) return
    const pin = () => {
      if (!stickToBottomRef.current) return
      pinChatToLatest(parent)
    }
    const ro = new ResizeObserver(pin)
    ro.observe(root)
    return () => ro.disconnect()
  }, [sessionId, scrollEpoch])

  useEffect(() => {
    if (revealStart <= 0) return
    if (holdOlderRef.current) return
    const parent = scrollRef.current
    const fast = parent
      ? shouldRevealFast({
          scrollTop: parent.scrollTop,
          scrollHeight: parent.scrollHeight,
          clientHeight: parent.clientHeight,
        })
      : true
    const bump = () => setRevealStart((start) => bumpRevealStart(start))
    if (fast) {
      const id = requestAnimationFrame(bump)
      return () => cancelAnimationFrame(id)
    }
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(bump, { timeout: 90 })
      return () => cancelIdleCallback(id)
    }
    const t = window.setTimeout(bump, 40)
    return () => clearTimeout(t)
  }, [revealStart, totalTurns, sessionId, scrollEpoch])

  const lastNode = mountedNodes.at(-1)
  const stickKey =
    lastNode?.kind === 'reply' && lastNode.streaming
      ? `${lastNode.id}:${Math.floor(lastNode.copyText.length / 96)}:1`
      : `${mountedNodes.length}:${pending ? 1 : 0}:${error ?? ''}`

  useLayoutEffect(() => {
    const parent = scrollRef.current
    if (!parent) return
    const mem = recalledChatScroll(sessionId)
    if (sessionId && restoredForRef.current !== sessionId && mem?.kind === 'pin') {
      if (restoreChatScroll(parent, mem)) {
        restoredForRef.current = sessionId
        stickToBottomRef.current = false
        prependHeightRef.current = parent.scrollHeight
        return
      }
      return
    }
    if (sessionId) restoredForRef.current = sessionId
    if (stickToBottomRef.current) {
      if (mountedNodes.length > 0) pinChatToLatest(parent)
    } else if (prependHeightRef.current) {
      const delta = parent.scrollHeight - prependHeightRef.current
      // 钉在顶上看更早内容时不要把 scrollTop 往下拽，否则会和上滑抢位置、抖死。
      if (delta && parent.scrollTop > PIN_TOP_SLACK_PX) parent.scrollTop += delta
    }
    prependHeightRef.current = parent.scrollHeight
  }, [stickKey, mountedNodes.length, revealStart, sessionId])

  if (nodes.length === 0 && !pending && !error && !switchingSession) {
    return <div className="w-full" data-testid="chat-empty" />
  }

  return (
    <div
      ref={rootRef}
      className="w-full"
      data-chat-virtual="0"
      data-chat-reveal-start={revealStart}
      data-switching={switchingSession ? '1' : undefined}
      style={switchingSession ? { opacity: 0.72, transition: 'opacity 120ms ease' } : undefined}
    >
      {loadingOlder ? (
        <div className="mb-3 text-center text-(length:--dsw-chat-ui-font-size) text-(--dsw-label-3)">加载更早消息…</div>
      ) : null}
      <ChatNodeList
        nodes={mountedNodes}
        onInspect={onInspect}
        onFork={onFork}
        sessions={sessions}
        dispatchedTasksByTurn={dispatchedTasksByTurn}
        sessionId={sessionId}
      />
      {error ? (
        <div className="mt-4 rounded-xl bg-(--dsw-danger-soft) px-3 py-2 text-sm text-(--dsw-danger)">{error}</div>
      ) : null}
    </div>
  )
})
