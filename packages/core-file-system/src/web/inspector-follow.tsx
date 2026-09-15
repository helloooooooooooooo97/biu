import { useSyncExternalStore } from 'react'
import { ViewfinderCircleIcon } from '@heroicons/react/16/solid'
import {
  isInspectorAgentFollow,
  setInspectorAgentFollow,
  subscribeInspectorAgentFollow,
} from './inspector-db-route.ts'

function readFollow() {
  return isInspectorAgentFollow()
}

export function InspectorFollowToggle() {
  const follow = useSyncExternalStore(subscribeInspectorAgentFollow, readFollow, () => false)
  return (
    <button
      type="button"
      className={`project-chip project-chip-icon-only project-chip-pick-toggle project-chip-follow-toggle relative${follow ? ' is-active' : ''}`}
      aria-pressed={follow}
      aria-label="跟随"
      data-dock-tip="跟随"
      data-testid="inspector-follow-toggle"
      onClick={() => setInspectorAgentFollow(!follow)}
    >
      <ViewfinderCircleIcon className="size-4" aria-hidden />
    </button>
  )
}
