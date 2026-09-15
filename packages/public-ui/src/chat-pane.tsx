import { type ReactNode, type Ref } from 'react'

export const CHAT_STAGE_CENTER =
  'chat-stage flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-[64px] py-3 pb-72'
export const CHAT_STAGE_PANE =
  'chat-stage flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 py-1'
export const CHAT_DOCK_STACK = 'pointer-events-auto w-full space-y-2 bg-transparent'

export function ChatStage({
  variant = 'pane',
  children,
  className,
  stageRef,
}: {
  variant?: 'center' | 'pane'
  children?: ReactNode
  className?: string
  stageRef?: Ref<HTMLDivElement>
}) {
  const base = variant === 'center' ? CHAT_STAGE_CENTER : CHAT_STAGE_PANE
  return (
    <div ref={stageRef} className={className ? `${base} ${className}` : base}>
      {children}
    </div>
  )
}

export function ChatDockStack({ children }: { children?: ReactNode }) {
  return <div className={CHAT_DOCK_STACK}>{children}</div>
}

export function ChatPane({
  thread,
  dock,
  aside,
  embed,
}: {
  thread: ReactNode
  dock?: ReactNode
  aside?: ReactNode
  embed?: boolean
}) {
  return (
    <div
      className={`chat-pane${embed ? ' chat-pane-embed' : ''}`}
      data-testid={embed ? 'session-record-chat' : 'chat-pane'}
    >
      {aside}
      <div className="chat-overlay-thread">{thread}</div>
      {dock ? <div className="chat-composer-dock">{dock}</div> : null}
    </div>
  )
}
