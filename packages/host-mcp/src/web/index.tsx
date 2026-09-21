import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { mcpChrome } from './chrome.tsx'

export const name = 'host-mcp-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/mcp', mcpChrome).dispose)
}

if (typeof document !== 'undefined') {
  const id = 'biu-mcp-ui-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.mcp-tools{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mcp-tool{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid var(--dsw-border);border-radius:8px;background:color-mix(in srgb,var(--dsw-muted-fill) 40%,transparent)}
.mcp-tool.is-blocked{opacity:.78}
.mcp-tool-copy{min-width:0;display:flex;flex-direction:column;gap:4px}
.mcp-tool-name{font-family:var(--font-mono);font-size:13px;font-weight:650;color:var(--dsw-label)}
.mcp-tool-desc{font-size:12px;line-height:1.45;color:var(--dsw-label-2)}
.mcp-tool-flags{flex:none;display:flex;align-items:center;gap:6px}
.mcp-tool-state{font-size:11px;font-weight:700;color:var(--dsw-label-3)}
.mcp-tool-state.is-on{color:var(--dsw-ok,#22c55e)}
.mcp-tool-toggle{border:1px solid var(--dsw-border);background:transparent;color:var(--dsw-label-2);border-radius:999px;padding:3px 8px;font:inherit;font-size:11px;font-weight:650;cursor:pointer}
.mcp-tool-toggle.is-on{color:var(--dsw-ok,#22c55e);border-color:color-mix(in srgb,var(--dsw-ok,#22c55e) 40%,transparent);background:color-mix(in srgb,var(--dsw-ok,#22c55e) 12%,transparent)}
.mcp-tool-toggle.is-deny.is-on{color:var(--dsw-danger);border-color:color-mix(in srgb,var(--dsw-danger) 40%,transparent);background:color-mix(in srgb,var(--dsw-danger) 12%,transparent)}
.mcp-tools-empty{margin:0;font-size:13px;color:var(--dsw-label-3)}
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
