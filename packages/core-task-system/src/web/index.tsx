import type { Context } from 'cordis'
import { ShareIcon } from '@heroicons/react/24/outline'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { tasksChrome } from './chrome.tsx'
import { TaskDepGraph } from './graph-view.tsx'

export const name = 'core-task-system-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/tasks', tasksChrome).dispose)
  ctx.effect(() =>
    ui
      .registerView('/tasks', {
        id: 'graph',
        label: '依赖图',
        plugin: name,
        Icon: ShareIcon,
        View: TaskDepGraph,
      })
      .dispose,
  )
}

if (typeof document !== 'undefined') {
  const id = 'biu-task-system-ui-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.tasks2-title{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}
.tasks2-title.is-done{text-decoration:line-through;color:var(--dsw-label-3)}
.tasks-queue-chain{color:var(--dsw-label-3);font-weight:500}
.tasks-queue-lock{flex:none;display:inline-flex;color:#9a6700}
.tasks-queue-pill{flex:none;display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:1px 6px;font-size:14px;font-weight:700;white-space:nowrap}
.tasks-queue-pill.is-p-high{color:var(--dsw-danger);background:color-mix(in srgb,var(--dsw-danger) 12%,transparent)}
.tasks-queue-pill.is-p-med{color:var(--dsw-business);background:color-mix(in srgb,var(--dsw-business) 12%,transparent)}
.tasks-queue-pill.is-p-low{color:var(--dsw-label-3);background:color-mix(in srgb,var(--dsw-label-3) 12%,transparent)}
.tasks-queue-overdue{flex:none;display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:1px 6px;font-size:14px;font-weight:700;white-space:nowrap;color:var(--dsw-danger);background:color-mix(in srgb,var(--dsw-danger) 12%,transparent)}
.tasks-queue-assignee{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;color:var(--dsw-label-2)}
.tasks-graph-status{font-size:14px;font-weight:650;color:var(--dsw-label-3)}
.tasks-graph-status.is-todo{color:var(--dsw-label-3)}
.tasks-graph-status.is-doing{color:var(--dsw-business)}
.tasks-graph-status.is-done{color:#2f7d4c}
.tasks-graph-status.is-failed{color:var(--dsw-danger)}
.tasks-proj-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:14px;font-weight:600;color:var(--dsw-label-2);background:color-mix(in srgb,var(--dsw-border) 55%,transparent);white-space:nowrap}
.tasks-queue-assignee{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;color:var(--dsw-label-2)}
.tasks-field-input, .tasks-field-textarea { width:100%; border:1px solid color-mix(in srgb, var(--dsw-border) 85%, transparent); border-radius:7px; padding:7px 10px; background:var(--dsw-input); color:var(--dsw-label); font:inherit; font-size:14px; outline:none; resize:vertical; transition:border-color .12s, box-shadow .12s; }
.tasks-field-input:focus, .tasks-field-textarea:focus { border-color:color-mix(in srgb, var(--dsw-business) 55%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-business) 12%, transparent); }
.tasks-detail-pane { flex:1; min-height:0; overflow:auto; padding:16px 18px 20px; }
.tasks-detail-pane .tasks-automation { border:0; background:transparent; padding:0; }
.tasks-prop { display:grid; grid-template-columns:108px minmax(0,1fr); align-items:center; gap:8px; min-height:32px; font-size:14px; color:var(--dsw-label-3); }
.tasks-prop > span { font-size:14px; font-weight:600; color:var(--dsw-label-3); display:inline-flex; align-items:center; gap:6px; min-width:0; }
.tasks-prop > span svg { flex:none; opacity:.85; }
.tasks-prop.is-stack { align-items:start; padding-top:8px; }
.tasks-prop .tasks-field-input { padding:4px 0; font-size:14px; background:transparent; border:0; border-radius:0; box-shadow:none; }
.tasks-prop .tasks-field-input:focus { border:0; box-shadow:none; }
.tasks-detail-title-input { width:100%; border:0; background:transparent; color:var(--dsw-label); font:inherit; font-size:22px; font-weight:700; line-height:1.35; outline:none; padding:0; resize:none; }
.tasks-detail-id { font-size:14px; font-weight:400; color:var(--dsw-label-2); font-family:var(--font-mono); letter-spacing:.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tasks-detail-doc { width:100%; flex:none; min-height:180px; field-sizing:content; border:0; background:transparent; color:var(--dsw-label); font:inherit; font-size:16px; line-height:1.65; outline:none; resize:none; overflow:hidden; padding:8px 0 0; }
@media (max-width: 720px) {
  .tasks-detail-modal { width:min(94vw, 880px); height:min(90vh, 720px); }
}
.tasks-field { display:flex; flex-direction:column; gap:5px; font-size:11px; color:var(--dsw-label-3); }
.tasks-field > span { display:inline-flex; align-items:center; gap:5px; font-weight:600; font-size:10.5px; letter-spacing:.02em; }
.tasks-field-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.tasks-field-input, .tasks-field-textarea { width:100%; border:1px solid color-mix(in srgb, var(--dsw-border) 85%, transparent); border-radius:7px; padding:7px 10px; background:var(--dsw-input); color:var(--dsw-label); font:inherit; font-size:14px; outline:none; resize:vertical; transition:border-color .12s, box-shadow .12s; }
.tasks-field-input:focus, .tasks-field-textarea:focus { border-color:color-mix(in srgb, var(--dsw-business) 55%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-business) 12%, transparent); }
.tasks-field-textarea { min-height:80px; line-height:1.55; }
.tasks-detail-actor { display:flex; flex-direction:column; gap:6px; }
.tasks-detail-meta { display:flex; flex-direction:column; gap:14px; }
/* 键值 stat 列表 */
.tasks-exec-stats { display:flex; flex-direction:column; gap:8px; }
.tasks-exec-stat { display:flex; align-items:flex-start; gap:12px; font-size:14px; color:var(--dsw-label-2); }
.tasks-exec-stat-label { flex:none; width:88px; display:inline-flex; align-items:center; gap:5px; color:var(--dsw-label-3); font-size:14px; font-weight:600; padding-top:1px; }
.tasks-exec-stat-value { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; font-size:14px; }
.tasks-exec-stat .tasks-time { display:inline-flex; align-items:center; gap:4px; font-size:14px; color:var(--dsw-label-2); }
.tasks-exec-stat .traj-usage { font-size:14px; }
.tasks-detail-usage-total-capsule { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:2px 10px; background:color-mix(in srgb, var(--dsw-business) 12%, transparent); color:var(--dsw-label); font-weight:650; white-space:nowrap; width:fit-content; }
.tasks-detail-usage-total-capsule svg { color:var(--dsw-business); }
.tasks-detail-usage-breakdown { color:var(--dsw-label-3); font-weight:500; }
.tasks-blocked-head { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:650; color:#9a6700; }
.tasks-blocked-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:5px; border:1px solid color-mix(in srgb, #9a6700 26%, transparent); border-radius:8px; padding:8px 10px; background:color-mix(in srgb, #9a6700 5%, transparent); }
.tasks-blocked-item { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--dsw-label-2); line-height:1.4; }
.tasks-blocked-dot { flex:none; width:6px; height:6px; border-radius:50%; background:#9a6700; }
/* 报告 timeline */
.tasks-exec-timeline-head { display:flex; align-items:center; gap:6px; margin-top:2px; padding-top:12px; border-top:1px solid var(--dsw-border); font-size:10.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--dsw-label-3); }
.tasks-report-timeline { margin:8px 0 0; padding:0; list-style:none; display:flex; flex-direction:column; }
.tasks-report-item { position:relative; display:flex; gap:12px; padding-bottom:16px; }
.tasks-report-item:last-child { padding-bottom:0; }
.tasks-report-node { flex:none; position:relative; z-index:1; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
.tasks-report-item.is-done .tasks-report-node { color:#2f7d4c; background:color-mix(in srgb, #2f7d4c 18%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, #2f7d4c 32%, transparent); }
.tasks-report-item.is-doing .tasks-report-node { color:var(--dsw-business); background:color-mix(in srgb, var(--dsw-business) 16%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-business) 30%, transparent); }
.tasks-report-rail { position:absolute; left:9px; top:22px; bottom:-2px; width:2px; background:var(--dsw-border); }
.tasks-report-item:last-child .tasks-report-rail { display:none; }
.tasks-report-content { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
.tasks-report-head { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.tasks-report-status { display:inline-flex; align-items:center; gap:4px; font-weight:650; font-size:11px; color:var(--dsw-label); }
.tasks-report-item.is-done .tasks-report-status { color:#2f7d4c; }
.tasks-report-item.is-doing .tasks-report-status { color:var(--dsw-business); }
.tasks-report-turn { color:var(--dsw-label-2); font-weight:600; font-size:10.5px; }
.tasks-report-stats { color:var(--dsw-label-3); font-size:10.5px; }
.tasks-report-time { color:var(--dsw-label-3); font-size:12px; white-space:nowrap; font-variant-numeric:tabular-nums; }
.tasks-report-note { color:var(--dsw-label-2); font-size:11px; line-height:1.5; white-space:normal; word-break:break-word; padding:8px 10px; border:1px solid var(--dsw-border); border-radius:8px; background:color-mix(in srgb, var(--dsw-muted-fill) 50%, transparent); }
.tasks-report-usage { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--dsw-label-3); font-size:12px; font-variant-numeric:tabular-nums; }
.tasks-report-usage .traj-usage, .tasks-report-usage .traj-usage-empty { font-size:12px; }

.tasks-dep-graph{flex:1;min-width:0;min-height:0;width:100%;height:100%;border-radius:10px;overflow:hidden}
.tasks-dep-graph .react-flow{background:transparent}
.tasks-dep-graph .react-flow__node{border:1px solid var(--dsw-border);border-radius:10px;padding:8px 10px;background:var(--dsw-sidebar);color:var(--dsw-label);font-size:13px;font-weight:650;box-shadow:none}
.tasks-dep-graph .react-flow__node.tasks-graph-node.is-doing{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-business) 45%,transparent)}
.tasks-dep-graph .react-flow__node.tasks-graph-node.is-done{opacity:.8}
.tasks-dep-graph .react-flow__controls{box-shadow:none;border:1px solid var(--dsw-border);overflow:hidden;border-radius:8px}
.tasks-dep-graph .react-flow__controls-button{background:var(--dsw-sidebar);border-color:var(--dsw-border);fill:var(--dsw-label)}
.tasks-dep-graph .react-flow__minimap{background:color-mix(in srgb,var(--dsw-sidebar) 80%,transparent)}

/* ---- 依赖（DAG）视图 ---- */
/* ---- DAG 依赖图（自绘 SVG + 缩放）---- */

/* ---- 队列视图（清单风格：只展示叶节点，按状态分组）---- */
.tasks-queue { display:flex; flex-direction:column; gap:14px; margin-top:10px; overflow:auto; flex:1; min-width:0; width:100%; max-width:100%; min-height:0; padding-bottom:4px; }
.tasks-queue.is-compact { gap:10px; margin-top:6px; }
.tasks-queue-group { display:flex; flex-direction:column; gap:6px; }
.tasks-queue-ghead { display:flex; align-items:center; gap:6px; padding:4px 6px; color:var(--dsw-label-2); font-size:14px; font-weight:650; letter-spacing:.01em; }
.tasks-queue-ghead.is-overdue { color:var(--dsw-danger); font-weight:700; }
.tasks-queue-ghead.is-doing { color:var(--dsw-business); }
.tasks-queue-ghead.is-blocked { color:#9a6700; }
.tasks-queue-ghead.is-done { color:#2f7d4c; }
.tasks-queue-glabel { font-weight:650; }
.tasks-queue-count { margin-left:auto; color:var(--dsw-label-3); font-size:14px; font-weight:600; background:var(--dsw-muted-fill); border-radius:8px; padding:1px 7px; }
.tasks-queue-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
.tasks-queue-item { display:flex; min-width:0; border:0; border-radius:0; }
.tasks-queue-item-main { display:flex; align-items:center; gap:8px; width:100%; min-width:0; box-sizing:border-box; overflow:hidden; text-align:left; border:0; border-radius:6px; padding:7px 8px; background:transparent; color:var(--dsw-label); font:inherit; cursor:pointer; box-shadow:none; }
.tasks-queue-item-main:hover { background:var(--dsw-hover); }
.tasks-queue-item.is-active .tasks-queue-item-main { background:color-mix(in srgb, var(--dsw-hover) 85%, transparent); }
.tasks-queue-item-title { flex:1; min-width:0; font-size:14px; font-weight:600; line-height:1.4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tasks-queue-chain { color:var(--dsw-label-3); font-weight:500; }
.tasks-queue-item.is-done .tasks-queue-item-title { text-decoration:line-through; color:var(--dsw-label-3); }
.tasks-queue-pill { flex:none; display:inline-flex; align-items:center; gap:3px; border-radius:999px; padding:1px 6px; font-size:14px; font-weight:700; white-space:nowrap; }
.tasks-queue-pill.is-p-high { color:var(--dsw-danger); background:color-mix(in srgb, var(--dsw-danger) 12%, transparent); }
.tasks-queue-pill.is-p-med { color:var(--dsw-business); background:color-mix(in srgb, var(--dsw-business) 12%, transparent); }
.tasks-queue-pill.is-p-low { color:var(--dsw-label-3); background:color-mix(in srgb, var(--dsw-label-3) 12%, transparent); }
.tasks-queue-lock { flex:none; display:inline-flex; color:#9a6700; }
.tasks-queue-overdue { flex:none; display:inline-flex; align-items:center; gap:3px; border-radius:999px; padding:1px 6px; font-size:14px; font-weight:700; white-space:nowrap; color:var(--dsw-danger); background:color-mix(in srgb, var(--dsw-danger) 12%, transparent); }
.tasks-queue-meta { flex:none; display:flex; align-items:center; gap:8px; color:var(--dsw-label-3); font-size:14px; min-width:0; overflow:hidden; }
.tasks-queue-assignee { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; color:var(--dsw-label-2); }
.tasks-queue-meta .tasks-time { font-size:14px; }
.tasks-queue-item-main .traj-usage { font-size:14px; }
/* ---- Trigger 自动触发 ---- */
.tasks-status-cell { display:flex; align-items:center; gap:5px; min-width:0; }
.tasks-trigger-mark { flex:none; display:inline-flex; align-items:center; gap:3px; border-radius:999px; padding:1px 6px; font-size:14px; font-weight:700; white-space:nowrap; color:var(--dsw-business); background:color-mix(in srgb, var(--dsw-business) 12%, transparent); }
.tasks-trigger-mark.is-pending { color:#d9822b; background:color-mix(in srgb, #d9822b 14%, transparent); }
.tasks-trigger-mark.is-delivered { color:#2f7d4c; background:color-mix(in srgb, #2f7d4c 14%, transparent); }
.tasks-trigger-mark.is-done { color:#3d9a5f; background:color-mix(in srgb, #3d9a5f 12%, transparent); }
.tasks-trigger-mark.is-cancelled { color:var(--dsw-label-3); background:var(--dsw-muted-fill); }
/* 未启用但有配置 → 弱化灰 */
.tasks-trigger-mark.is-off { color:var(--dsw-label-3); background:var(--dsw-muted-fill); border:1px dashed color-mix(in srgb, var(--dsw-border) 70%, transparent); }
.tasks-trigger-mark-state { line-height:1; }
.tasks-trigger-count { display:inline-flex; align-items:center; justify-content:center; min-width:13px; height:13px; padding:0 3px; border-radius:999px; font-size:8.5px; font-weight:800; line-height:1; color:#fff; background:color-mix(in srgb, #9a6700 78%, transparent); }
.tasks-trigger-mark.is-off .tasks-trigger-count { background:var(--dsw-label-3); }
/* ---- 自动触发开关（紧凑 Notion 风格，icon + 触发源数量）---- */
.tasks-trigger-toggle { flex:none; display:inline-flex; align-items:center; gap:2px; border-radius:999px; padding:2px 6px; border:0; cursor:pointer; white-space:nowrap; line-height:1.3; font-family:inherit; color:var(--dsw-label-3); background:var(--dsw-muted-fill); box-shadow:inset 0 0 0 1px var(--dsw-border); transition:background .15s ease, color .15s ease; }
.tasks-trigger-toggle:hover { background:var(--dsw-hover); }
.tasks-trigger-toggle.is-on { color:var(--dsw-ok); background:color-mix(in srgb, var(--dsw-ok) 18%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsw-ok) 30%, transparent); }
.tasks-trigger-toggle.is-on:hover { background:color-mix(in srgb, var(--dsw-ok) 28%, transparent); }
.tasks-trigger-toggle .tasks-trigger-count { min-width:15px; height:14px; padding:0 4px; font-size:9.5px; background:transparent; color:var(--dsw-label-3); }
.tasks-trigger-toggle.is-on .tasks-trigger-count { color:var(--dsw-ok); }
.tasks-status-cell .tasks-trigger-toggle { margin-left:4px; }
.tasks-trigger-field { display:flex; flex-direction:column; gap:4px; font-size:10.5px; color:var(--dsw-label-3); font-weight:600; }
.tasks-trigger-field > span { color:var(--dsw-label-3); letter-spacing:.02em; }
.tasks-trigger-status { display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--dsw-border); padding-top:10px; }
.tasks-trigger-state-pill { align-self:flex-start; display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:3px 10px; font-size:10.5px; font-weight:650; background:var(--dsw-muted-fill); color:var(--dsw-label-2); box-shadow:inset 0 0 0 1px var(--dsw-border); }
.tasks-trigger-state-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-label-3); }
.tasks-trigger-state-pill.is-pending .tasks-trigger-state-dot { background:#d9822b; }
.tasks-trigger-state-pill.is-delivered .tasks-trigger-state-dot { background:#2f7d4c; }
.tasks-trigger-state-pill.is-done .tasks-trigger-state-dot { background:#3d9a5f; }
.tasks-trigger-state-pill.is-pending { color:#d9822b; }
.tasks-trigger-state-pill.is-delivered { color:#2f7d4c; }
.tasks-trigger-state-pill.is-done { color:#3d9a5f; }
.tasks-trigger-times { display:flex; flex-direction:column; gap:4px; }
.tasks-trigger-next, .tasks-trigger-last { display:flex; align-items:baseline; gap:8px; font-size:10.5px; color:var(--dsw-label-2); }
.tasks-trigger-tk { flex:none; width:48px; color:var(--dsw-label-3); font-weight:600; }
.tasks-trigger-tv { font-variant-numeric:tabular-nums; font-weight:650; color:var(--dsw-label); }
.tasks-trigger-ts { color:var(--dsw-label-3); font-variant-numeric:tabular-nums; font-weight:400; margin-left:auto; }

/* ---- Notion Automation 风格规则卡片 ---- */
.tasks-automation { flex:none; width:100%; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--dsw-border); border-radius:10px; background:var(--dsw-surface); }
.tasks-auto-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.tasks-auto-title { display:inline-flex; align-items:center; gap:6px; font-weight:650; font-size:11.5px; color:var(--dsw-label); letter-spacing:.01em; }
.tasks-auto-switch { flex:none; position:relative; display:inline-flex; align-items:center; height:22px; cursor:pointer; }
.tasks-auto-switch input { position:absolute; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; }
.tasks-auto-switch-track { position:relative; width:34px; height:20px; border-radius:999px; background:color-mix(in srgb, var(--dsw-label-3) 24%, transparent); box-shadow:inset 0 0 0 1px var(--dsw-border); transition:background .2s ease; pointer-events:none; }
.tasks-auto-switch-knob { position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:var(--dsw-shadow); transition:left .2s cubic-bezier(.4,0,.2,1); }
.tasks-auto-switch.is-on .tasks-auto-switch-track { background:var(--dsw-ok); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsw-ok) 30%, transparent); }
.tasks-auto-switch.is-on .tasks-auto-switch-knob { left:17px; }
.tasks-auto-summary { display:flex; align-items:flex-start; gap:7px; padding:8px 10px; border-radius:8px; background:color-mix(in srgb, var(--dsw-muted-fill) 60%, transparent); border:1px solid var(--dsw-border); font-size:11.5px; line-height:1.5; color:var(--dsw-label); font-weight:500; }
.tasks-auto-summary-dot { flex:none; margin-top:5px; width:6px; height:6px; border-radius:50%; background:var(--dsw-business); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-business) 22%, transparent); }
.tasks-auto-sec-head { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--dsw-label-3); margin-top:2px; }
.tasks-auto-sec { display:flex; flex-direction:column; gap:9px; padding:10px 11px; border:1px solid var(--dsw-border); border-radius:8px; background:color-mix(in srgb, var(--dsw-muted-fill) 35%, transparent); }
.tasks-auto-seg { display:inline-flex; gap:2px; padding:2px; border-radius:8px; background:color-mix(in srgb, var(--dsw-muted-fill) 70%, transparent); box-shadow:inset 0 0 0 1px var(--dsw-border); }
.tasks-auto-seg button { border:0; background:transparent; color:var(--dsw-label-3); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; font-family:inherit; transition:background .15s ease, color .15s ease; }
.tasks-auto-seg button:hover { color:var(--dsw-label); }
.tasks-auto-seg button.is-active { background:var(--dsw-surface); color:var(--dsw-label); box-shadow:var(--dsw-shadow); }
.tasks-auto-preset { flex-wrap:wrap; }
.tasks-auto-then { flex-direction:row; align-items:center; gap:8px; }
.tasks-auto-then-arrow { display:inline-flex; color:var(--dsw-ok); }
.tasks-auto-then-text { font-size:11.5px; color:var(--dsw-label-2); font-weight:500; }

/* ---- 触发条件列表（每条件一行，可删除）---- */
.tasks-auto-cond-list { display:flex; flex-direction:column; gap:8px; }
.tasks-auto-cond { border:1px solid var(--dsw-border); border-radius:8px; background:color-mix(in srgb, var(--dsw-muted-fill) 45%, transparent); overflow:hidden; }
.tasks-auto-cond-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; background:color-mix(in srgb, var(--dsw-muted-fill) 60%, transparent); }
.tasks-auto-cond-type { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:650; color:var(--dsw-label); }
.tasks-auto-cond-del { flex:none; display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:6px; border:0; cursor:pointer; color:var(--dsw-label-3); background:transparent; transition:background .12s ease, color .12s ease; }
.tasks-auto-cond-del:hover { background:color-mix(in srgb, var(--dsw-danger) 16%, transparent); color:var(--dsw-danger); }
.tasks-auto-cond-body { display:flex; flex-direction:column; gap:8px; padding:8px 10px; }
.tasks-auto-add { margin-top:2px; }
.tasks-auto-add-btn { display:inline-flex; align-items:center; gap:5px; border:1px dashed var(--dsw-border); border-radius:8px; padding:5px 10px; background:transparent; color:var(--dsw-label-3); font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:background .12s ease, color .12s ease, border-color .12s ease; }
.tasks-auto-add-btn:hover { color:var(--dsw-label); border-color:color-mix(in srgb, var(--dsw-border) 160%, transparent); background:var(--dsw-hover); }



/* ---- Notion 风格 trigger 友好配置 ---- */
.tasks-trigger-mode, .tasks-cron-week { appearance:none; -webkit-appearance:none; border:1px solid var(--dsw-border); border-radius:6px; padding:4px 8px; font-size:12px; color:var(--dsw-label); background:var(--dsw-muted-fill); cursor:pointer; width:auto; max-width:100%; font-family:inherit; }
.tasks-trigger-mode:hover, .tasks-cron-week:hover { background:var(--dsw-hover); }
.tasks-cron-num { width:72px; }
.tasks-trigger-time { display:flex; align-items:center; gap:4px; }
.tasks-trigger-time .tasks-cron-num { width:56px; }
.tasks-trigger-time-sep { color:var(--dsw-label-3); font-weight:700; font-size:13px; }
.tasks-trigger-preview-wrap { gap:6px; }
.tasks-trigger-preview { color:var(--dsw-label-2); font-size:11.5px; font-weight:650; font-variant-numeric:tabular-nums; padding:3px 8px; border-radius:6px; background:color-mix(in srgb, var(--dsw-business) 8%, transparent); border:1px solid color-mix(in srgb, var(--dsw-border) 60%, transparent); display:inline-flex; align-items:center; gap:4px; }
.tasks-trigger-cronfield { display:flex; gap:6px; flex-wrap:wrap; }
.tasks-cron-field { display:flex; flex-direction:column; gap:3px; }
.tasks-cron-field > span { font-size:10px; color:var(--dsw-label-3); font-weight:600; }
.tasks-cron-field .tasks-field-input { width:44px; padding:3px 5px; text-align:center; font-size:11.5px; font-variant-numeric:tabular-nums; }
.tasks-cron-field:hover .tasks-field-input { border-color:var(--dsw-business); }
.tasks-cron-field.is-invalid .tasks-field-input { border-color:var(--dsw-danger); box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-danger) 30%, transparent); }
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
