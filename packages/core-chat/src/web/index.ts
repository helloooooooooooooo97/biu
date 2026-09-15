import { createElement } from 'react'
import type { Context } from 'cordis'
import { SignalIcon, MapIcon } from '@heroicons/react/16/solid'
import { bindSessionView, type SessionViewService } from '@biu/web-session-view'
import type { SlotProps } from '@biu/web-slots'
import { ApprovalsRail } from './approvals.tsx'
import { ChatComposer } from './composer.tsx'
import { ChatConfigBanner } from './config-banner.tsx'
import { ChatLiveHud } from './live-hud.tsx'
import { ChatSelectBubble } from './chat-select-bubble.tsx'
import { ChatThread } from './thread.tsx'
import { ChatMessageOutline } from './message-outline.tsx'
import { TrajectoryView } from './trajectory.tsx'
import { UsagePanel } from './usage-panel.tsx'
import { bindProjectView, type ProjectViewService } from '@biu/web-project-view'
import type { PickService } from '@biu/core-pick/web'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { sessionsChrome } from './sessions-chrome.tsx'

export const name = 'chat-ui'
export const inject = ['slots', 'sessionView', 'projectView']

function InspectorTrajectory(props: SlotProps) {
  return createElement(
    'div',
    { className: 'flex min-h-0 flex-1 flex-col overflow-hidden', 'data-testid': 'inspector-trajectory' },
    createElement(TrajectoryView, props),
  )
}

function InspectorUsage(props: SlotProps) {
  return createElement(
    'div',
    { className: 'min-h-0 flex-1 overflow-y-auto p-2.5', 'data-testid': 'inspector-usage' },
    createElement(UsagePanel, {
      useSessionView: props.useSessionView as ReturnType<typeof bindSessionView>,
      sessionView: props.sessionView as SessionViewService,
    }),
  )
}

export function apply(ctx: Context) {
  const view = ctx.sessionView as SessionViewService
  const project = ctx.projectView as ProjectViewService
  const slotProps = {
    useSessionView: bindSessionView(view),
    sessionView: view,
    useProjectView: bindProjectView(project),
    projectView: project,
  }
  const props = () => slotProps
  ctx.slots.place('root-overlays', ChatSelectBubble, { key: 'chat-select-bubble', order: 12 })
  ctx.slots.place('stage', ChatThread, { key: 'chat-thread', order: 1, props })
  ctx.slots.place('stage-aside', ChatMessageOutline, { key: 'chat-outline', order: 1, props })
  ctx.slots.place('trajectory', TrajectoryView, { key: 'trajectory', order: 1, props })
  ctx.slots.place('composer', ChatComposer, {
    key: 'chat',
    order: 10,
    props: () => ({ ...slotProps, pick: ctx.get('pick') as PickService | undefined }),
  })
  ctx.slots.place('dock', ChatConfigBanner, { key: 'chat-config-banner', order: 1 })
  ctx.slots.place('dock', ApprovalsRail, { key: 'approvals', order: 5, props })
  ctx.slots.place('dock', ChatLiveHud, { key: 'chat-live-hud', order: 0, props })
  ctx.slots.place('inspector-panels', InspectorTrajectory, {
    key: 'chat-traj',
    order: 1,
    props: () => ({
      ...slotProps,
      tabId: 'traj',
      tabLabel: '轨迹',
      tabIcon: MapIcon,
      ensureTrajectory: true,
      focusOnCall: true,
      requiresSession: true,
      centerKinds: ['session'],
    }),
  })
  ctx.slots.place('inspector-panels', InspectorUsage, {
    key: 'chat-usage',
    order: 2,
    props: () => ({
      ...slotProps,
      tabId: 'usage',
      tabLabel: '用量',
      tabIcon: SignalIcon,
      requiresSession: true,
      centerKinds: ['session'],
    }),
  })
  ctx.inject(['databaseUi'], (inner) => {
    const ui = inner.get('databaseUi') as DatabaseUi
    const sessions = ui.decorate('/sessions', sessionsChrome())
    return () => {
      sessions.dispose()
    }
  })
}
