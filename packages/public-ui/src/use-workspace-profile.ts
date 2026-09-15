import { useSyncExternalStore } from 'react'
import { readWorkspaceProfile, subscribeWorkspaceProfile, type WorkspaceProfile } from './workspace-profile.ts'

export function useWorkspaceProfile(): WorkspaceProfile {
  return useSyncExternalStore(subscribeWorkspaceProfile, readWorkspaceProfile, readWorkspaceProfile)
}
