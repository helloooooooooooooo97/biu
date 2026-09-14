import type { HttpService } from '@biu/host-http'
import type { HubService } from '@biu/host-hub'
import type { ToolsService, ToolRequest } from '@biu/host-tools'
import type { LlmService } from '@biu/host-llm'
import type { AgentLoopService } from '@biu/host-agent-loop'
import type { PreStepReq } from '@biu/type-agent-loop'
import type { AgentsService } from '@biu/host-agents'
import type { ApprovalsService } from '@biu/host-approvals'
import type { SessionsService } from '@biu/host-sessions'
import type { SessionEvent } from '@biu/type-session'
import type { SessionStoreService } from '@biu/host-session-store'
import type { SystemPromptService } from '@biu/host-system-prompt'
import type { FsService } from '@biu/host-fs'
import type { SubprocessService } from '@biu/host-subprocess'
import type { SandboxService } from '@biu/host-sandbox'
import type { ShellService } from '@biu/host-shell'
import type { JobsService } from '@biu/host-jobs'
import type { McpService } from '@biu/host-mcp'
import type { SkillsService } from '@biu/host-skills'
import type { TerminalService } from '@biu/host-terminal'
import type { LspService } from '@biu/host-lsp'
import type { WebService } from '@biu/host-web'
import type { SubagentsService } from '@biu/host-subagents'
import type { SnapshotService } from '@biu/web-snapshot'
import type { SessionViewService } from '@biu/web-session-view'
import type { ProjectViewService } from '@biu/web-project-view'
import type { AppModulesService } from '@biu/web-app-modules'
import type { SlotsService } from '@biu/web-slots'

export type { Method, PageSpec, RouteContext, RouteHandler } from '@biu/type-http'

declare module 'cordis' {
  interface Context {
    http: HttpService
    hub: HubService
    tools: ToolsService
    llm: LlmService
    agentLoop: AgentLoopService
    agents: AgentsService
    approvals: ApprovalsService
    sessionStore: SessionStoreService
    sessions: SessionsService
    systemPrompt: SystemPromptService
    fs: FsService
    subprocess: SubprocessService
    sandbox: SandboxService
    shell: ShellService
    jobs: JobsService
    mcp: McpService
    skills: SkillsService
    terminals: TerminalService
    lsp: LspService
    web: WebService
    subagents: SubagentsService
    slots: SlotsService
    snapshot: SnapshotService
    sessionView: SessionViewService
    projectView: ProjectViewService
    appModules: AppModulesService
  }

  interface Events {
    'http/ready'(info: { port: number }): void
    'hub/change'(): void
    'agent/status'(payload: { sessionId: string; status: 'idle' | 'running'; step?: number }): void
    'agent/inbox'(payload: {
      sessionId: string
      inbox: Array<{ id: string; kind: 'wake' | 'inject'; text: string }>
    }): void
    'agent/pre-step'(req: PreStepReq, next: () => PreStepReq): PreStepReq
    'session/event'(payload: { sessionId: string; event: SessionEvent }): void
    'tools/pre-execute'(req: ToolRequest, next: () => ToolRequest): ToolRequest
    'tools/post-execute'(payload: { name: string; ok: boolean; detail: string }): void
    'llm/request'(payload: { model: string; provider?: string }): void
    'llm/stream'(payload: { text: string }): void
    'fs/read'(path: string): void
    'fs/write'(path: string): void
    'fs/list'(path: string): void
    'sandbox/wrap'(payload: { argv: string[]; cwd: string }): void
  }
}
