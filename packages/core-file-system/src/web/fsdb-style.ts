/** File System 页面样式：主界面挂载时注入一次。 */
const STYLE_ID = 'biu-core-file-system-ui-style'

const CSS = `

.fsdb-page{display:flex;min-width:0;min-height:0;flex:1;flex-direction:row;overflow:hidden;background:var(--dsw-bg);color:var(--dsw-label);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:14px;letter-spacing:-.011em}
.fsdb-right{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
.fsdb-right .chat-view-header{flex:none}
.fsdb-crumbs{display:flex;min-width:0;align-items:center;gap:0}
.fsdb-crumbs.is-leaf-only .fsdb-crumb:not(:last-child){display:none}
.fsdb-crumb{display:inline-flex;min-width:0;align-items:center;gap:0}
.fsdb-crumb-sep{flex:none;padding:0 8px;color:var(--dsw-sidebar-fg);opacity:.5;font-size:14px;font-weight:500}
.fsdb-crumb-btn{display:inline-flex;min-width:0;max-width:180px;align-items:center;gap:6px;height:26px;border:0;border-radius:6px;background:transparent;padding:0 4px;color:var(--dsw-sidebar-fg);font-size:14px;font-weight:500;cursor:pointer}
.fsdb-crumb-btn:hover,.fsdb-crumb-btn.is-open{background:var(--dsw-hover);color:var(--dsw-sidebar-fg)}
.fsdb-crumb:last-child .fsdb-crumb-btn,.fsdb-crumb:last-child .fsdb-crumb-btn:hover,.fsdb-crumb:last-child .fsdb-crumb-btn.is-open{color:var(--dsw-sidebar-fg-active)}
.fsdb-crumb-btn.is-open{anchor-name:--fsdb-crumb}
.fsdb-crumb svg,.fsdb-crumb-btn svg,.fsdb-crumb .chat-view-project-icon,.fsdb-crumb .fsdb-record-mark{color:var(--dsw-icon)}
.chat-view-header .fsdb-crumb svg,.chat-view-header .fsdb-crumb-btn svg,.chat-view-header .fsdb-crumb .chat-view-project-icon,.chat-view-header .fsdb-crumb .fsdb-record-mark{color:var(--dsw-icon-active)}
.inspector-crumb-tab.is-active .fsdb-crumb svg,.inspector-crumb-tab.is-active .fsdb-crumb-btn svg,.inspector-crumb-tab.is-active .fsdb-crumb .chat-view-project-icon,.inspector-crumb-tab.is-active .fsdb-crumb .fsdb-record-mark{color:var(--dsw-icon-active)}
.fsdb-crumb-btn .chat-view-project-name,.fsdb-crumb-option .chat-view-project-name{font-size:14px;font-weight:500;color:inherit}
.fsdb-crumb-pick{position:relative;flex:none}
.fsdb-crumb-menu{position:absolute;left:0;top:calc(100% + 4px);z-index:80;display:flex;flex-direction:column;min-width:220px;max-width:280px;max-height:280px;overflow:hidden;border:1px solid var(--dsw-border);border-radius:8px;background:var(--dsw-surface);padding:4px;box-shadow:var(--dsw-shadow)}
.fsdb-crumb-menu.is-fixed{position:fixed;z-index:140;left:anchor(--fsdb-crumb left);top:calc(anchor(--fsdb-crumb bottom) + 4px)}
.fsdb-crumb-search{display:flex;flex:none;align-items:center;gap:6px;margin:2px 2px 4px;border:1px solid var(--dsw-border);border-radius:6px;padding:4px 8px;color:var(--dsw-label-3);background:var(--dsw-input)}
.fsdb-crumb-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;outline:none}
.fsdb-crumb-menu-list{min-height:0;flex:1;overflow:auto}
.fsdb-crumb-empty{padding:8px;color:var(--dsw-label-3);font-size:13px}
.fsdb-crumb-menu-foot{flex:none;border-top:1px solid var(--dsw-border);margin-top:4px;padding-top:4px}
.fsdb-crumb-create{display:flex;width:100%;min-width:0;align-items:center;gap:6px;border:0;border-radius:6px;background:transparent;padding:6px 8px;color:var(--dsw-sidebar-fg);font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}
.fsdb-crumb-create:hover{background:var(--dsw-hover);color:var(--dsw-sidebar-fg-active)}
.fsdb-crumb-option{display:flex;width:100%;min-width:0;align-items:center;gap:6px;border:0;border-radius:6px;background:transparent;padding:6px 8px;color:var(--dsw-sidebar-fg);font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}
.fsdb-crumb-option:hover,.fsdb-crumb-option.is-active{background:var(--dsw-hover);color:var(--dsw-sidebar-fg-active)}
.fsdb-right-body{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:auto}
.fsdb-right-body .app-pane-in{display:flex;flex-direction:column;min-width:0;min-height:0;flex:1}
.fsdb-right-body:has(.fsdb-detail-stage) .app-pane-in{flex:none;width:100%;align-self:stretch;min-height:min-content;height:auto;overflow:visible}
.fsdb-right-body:has(> * > .fsdb-workspace > .fsdb-pager){overflow:hidden}
.fsdb-right-body:has(> * > .fsdb-workspace > .fsdb-pager)>*,.fsdb-right-body:has(> * > .fsdb-workspace > .fsdb-pager) .fsdb-main{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}
.inspector-database-page .fsdb-right-body{overflow:hidden}
.inspector-database-page .fsdb-right-body>*,.inspector-database-page .fsdb-main{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}
.fsdb-right-body:has(.fsdb-detail-stage){overflow:auto}
.fsdb-views{display:flex;width:100%;max-width:none;min-width:0;flex:1;flex-direction:column;min-height:0;overflow:hidden;box-sizing:border-box}
.fsdb-page>.fsdb-views{width:var(--sidebar-col,var(--dsw-sidebar-min,160px));max-width:var(--dsw-sidebar-max,360px);flex:none}
.fsdb-views .chat-session-row-main{border:0;background:transparent;color:inherit;cursor:default}
.fsdb-views .chat-session-row-main button{cursor:default}
.fsdb-views .chat-session-row-delete,.fsdb-views .chat-session-row-star{cursor:pointer}
.fsdb-main{box-sizing:border-box;width:100%;max-width:none;margin-inline:0;display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;gap:10px;padding:0 0 16px;overflow:hidden}
.fsdb-main > :not(.fsdb-page-banner){box-sizing:border-box;width:100%;max-width:var(--dsw-chat-max-width);margin-inline:auto;padding-right:80px;padding-left:calc(80px - var(--fsdb-check-gutter))}
.fsdb-main:not(:has(> .fsdb-page-banner)){padding-top:80px}
.fsdb-page.is-full-width .fsdb-main > :not(.fsdb-page-banner),.fsdb-page.is-full-width .fsdb-detail-main > :not(.fsdb-page-banner){max-width:none}
.fsdb-page{--fsdb-pager-lift:calc(1rem + 44px + 25px + 25px - 30px);--fsdb-check-gutter:26px;--fsdb-row-tools-w:72px}
.fsdb-page:not(.inspector-database-page) .fsdb-main{padding-bottom:var(--fsdb-pager-lift)}
.inspector-database-page .fsdb-main{padding-bottom:0}
.fsdb-agent-follow{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
.fsdb-agent-follow.is-working{box-shadow:inset 0 2px 0 var(--dsw-pick)}
.fsdb-main > .fsdb-detail-title-row,.fsdb-main > .fsdb-detail-icon-slot{flex:none}
.fsdb-page:not(.is-sheet) .fsdb-main > .fsdb-detail-title-row,.fsdb-page:not(.is-sheet) .fsdb-main > .fsdb-detail-icon-slot,.fsdb-page:not(.is-sheet) .fsdb-main > .tasks-toolbar{padding-left:80px;box-sizing:border-box}
.fsdb-page .tasks-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;min-width:0;flex:none}
.fsdb-page .tasks-toolbar-left{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0}
.fsdb-locked-filter{display:inline-flex;align-items:center;height:26px;padding:0 8px;border-radius:8px;background:color-mix(in srgb,var(--dsw-business) 12%,transparent);color:var(--dsw-business);font-size:13px;font-weight:650;cursor:default}
.fsdb-page .tasks-toolbar-right{display:flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.fsdb-bulk{position:absolute;top:4px;left:var(--fsdb-check-gutter);z-index:22;display:inline-flex;align-items:center;gap:2px;height:26px;margin:0;padding:0 4px 0 8px;border-radius:8px;background:var(--dsw-sidebar);box-shadow:var(--dsw-shadow);color:var(--dsw-label)}
.fsdb-bulk-count{min-width:1.25em;padding:0 6px 0 0;color:var(--dsw-pick,#2383e2);font-size:13px;font-weight:650;white-space:nowrap;cursor:pointer}
.fsdb-bulk .tasks-icon-btn{color:var(--dsw-icon)}
.fsdb-bulk-more{position:relative;display:inline-flex}
.fsdb-bulk-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:40;min-width:180px;padding:8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow);display:flex;flex-direction:column;gap:4px;font-weight:600}
.fsdb-bulk-form{display:flex;flex-direction:column;gap:8px}
.fsdb-bulk-label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:650;color:var(--dsw-label-2)}
.fsdb-layout-wrap{position:relative;display:inline-flex}
.fsdb-layout-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:40;display:flex;flex-direction:column;gap:2px;min-width:220px;padding:8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow)}
.fsdb-layout-row{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin:0;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-align:left}
.fsdb-layout-row:hover{background:var(--dsw-hover)}
.fsdb-layout-scale{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px}
.fsdb-layout-scale>span{color:var(--dsw-label-2);font-size:12px;font-weight:650}
.fsdb-layout-pills{display:flex;gap:2px}
.fsdb-layout-opt{display:grid;place-items:center;min-width:28px;height:24px;padding:0 8px;border:0;border-radius:7px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.fsdb-layout-opt:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-layout-opt.is-active{color:var(--dsw-business);background:color-mix(in srgb,var(--dsw-business) 10%,var(--dsw-input))}
.fsdb-create-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:26px;margin-left:8px;padding:0 10px;border:0;border-radius:4px;background:var(--dsw-pick,#2383e2);color:#fff;cursor:pointer;font:inherit;font-size:14px;font-weight:600;white-space:nowrap}
.fsdb-create-btn:hover{background:var(--dsw-pick,#2383e2);filter:brightness(.92)}
.fsdb-page .tasks-search-wrap{display:inline-flex;align-items:center;gap:0;flex:none;min-width:0;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-icon)}
.fsdb-page .tasks-search-wrap.is-open{flex:0 1 168px;gap:2px;color:var(--dsw-icon-active)}
.fsdb-page .tasks-search-wrap.is-open .tasks-sort-btn,.fsdb-page .tasks-search-wrap:hover .tasks-sort-btn{color:var(--dsw-icon-active)}
.fsdb-page .tasks-search{flex:1;border:0;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;outline:none;min-width:0;padding:4px 4px 4px 0}
.fsdb-page .tasks-refresh,.fsdb-page .tasks-sort-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-icon);cursor:pointer;font:inherit;font-size:14px;font-weight:600}
.fsdb-page .tasks-refresh:hover,.fsdb-page .tasks-sort-btn:hover{background:var(--dsw-hover);color:var(--dsw-icon-active)}
.fsdb-page .tasks-refresh:disabled{cursor:default;opacity:1}
.fsdb-refresh-wrap{position:relative;display:inline-flex}
.fsdb-spin{animation:fsdb-spin .7s linear infinite}
@keyframes fsdb-spin{to{transform:rotate(360deg)}}
.fsdb-refresh-toast{position:absolute;top:calc(100% + 8px);right:0;z-index:50;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:8px;padding:7px 10px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);box-shadow:var(--dsw-shadow);color:var(--dsw-label);font-size:14px;font-weight:600}
.fsdb-refresh-toast svg{color:var(--dsw-ok,#2f7d4c)}
.fsdb-page .tasks-sort-btn.is-active,.fsdb-page .tasks-refresh.is-active{color:var(--dsw-icon-active)}
.fsdb-page .tasks-sort-btn.is-custom{color:var(--dsw-icon-active)}
.fsdb-page .tasks-sort-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--dsw-business)}
.fsdb-page .tasks-viewdd-wrap,.fsdb-page .tasks-sort-wrap,.fsdb-page .tasks-filter-btn-wrap{position:relative;display:inline-flex}
.fsdb-page .tasks-viewdd-wrap{flex:1;min-width:0;align-items:center;gap:2px}
.fsdb-page .tasks-viewtabs{display:flex;align-items:center;gap:2px;min-width:0;flex:1;overflow:hidden}
.fsdb-page .tasks-viewtabs-measure{position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;display:flex;align-items:center;gap:2px;white-space:nowrap}
.fsdb-page .tasks-viewdd-btn{display:inline-flex;box-sizing:border-box;align-items:center;gap:6px;height:26px;border:0;border-radius:6px;padding:0 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;cursor:pointer;flex:none}
.fsdb-page .tasks-viewdd-btn svg{color:var(--dsw-icon)}
.fsdb-page .tasks-viewtab.is-active svg,.fsdb-page .tasks-viewdd-btn.is-active svg{color:var(--dsw-icon-active)}
.fsdb-page .tasks-viewtab.is-active{background:var(--dsw-hover)}
.fsdb-page .tasks-viewdd-btn:hover,.fsdb-page .tasks-viewdd-btn.is-active{background:var(--dsw-hover)}
.fsdb-page .tasks-viewdd-name{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-viewdd-menu,.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-query-menu{position:absolute;top:calc(100% + 6px);z-index:40;min-width:180px;padding:8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow);display:flex;flex-direction:column;gap:4px;font-weight:600}
.fsdb-page .tasks-viewdd-menu{left:0;min-width:320px;overflow:hidden}
.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-query-menu{right:0}
.fsdb-page .fsdb-query-menu{box-sizing:border-box;overflow-x:hidden;overflow-y:auto;width:min(92vw,560px);min-width:min(92vw,360px);max-width:min(92vw,calc(100vw - 24px));max-height:min(70vh,520px)}
.fsdb-page .fsdb-query-menu.is-filter{min-width:min(92vw,360px)}
.fsdb-page .fsdb-query-row,.fsdb-page .fsdb-query-rule{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:4px;min-width:0;max-width:100%;width:100%}
.fsdb-page .fsdb-query-row.is-drag{opacity:0}
.fsdb-page .fsdb-query-grip{display:inline-flex;align-items:center;justify-content:center;width:18px;height:22px;flex:none;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-label-2);cursor:grab;touch-action:none}
.fsdb-page .fsdb-query-grip:active{cursor:grabbing}
.fsdb-query-drag-overlay{min-width:320px;padding:4px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:var(--dsw-shadow-lv2);pointer-events:none}
.fsdb-page .fsdb-query-row .fsdb-cellselect,.fsdb-page .fsdb-query-rule .fsdb-cellselect{flex:0 1 108px;min-width:0;max-width:32%}
.fsdb-page .fsdb-query-rule > .fsdb-cellselect:nth-last-child(2),.fsdb-page .fsdb-query-rule > .fsdb-query-input{flex:1 1 140px;min-width:0;max-width:none}
.fsdb-page .fsdb-query-rule .fsdb-cellselect.is-field .fsdb-cellselect-trigger{min-width:0;max-width:100%;overflow:hidden}
.fsdb-page .fsdb-query-stack,.fsdb-page .fsdb-query-group{display:flex;flex-direction:column;gap:6px;min-width:0;max-width:100%}
.fsdb-page .fsdb-query-group{padding:8px;border-radius:8px;background:color-mix(in srgb,var(--dsw-hover) 70%,transparent)}
.fsdb-page .fsdb-query-line{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:flex-start;gap:4px;min-width:0;max-width:100%;width:100%}
.fsdb-page .fsdb-query-line>.fsdb-query-rule{flex:1;min-width:0}
.fsdb-page .fsdb-query-join{flex:none;width:36px;padding:4px 0;color:var(--dsw-label-3);font-size:13px;font-weight:600}
.fsdb-page .fsdb-query-join.is-btn{border:0;border-radius:6px;background:transparent;color:var(--dsw-business);cursor:pointer}
.fsdb-page .fsdb-query-join.is-btn:hover{background:var(--dsw-hover)}
.fsdb-page .fsdb-query-nested{flex:1;min-width:0;display:flex;flex-direction:row;gap:4px;align-items:flex-start}
.fsdb-page .fsdb-query-nested>.fsdb-query-group{flex:1}
.fsdb-page .fsdb-query-x{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;border:0;border-radius:6px;padding:0;background:transparent;color:var(--dsw-label-3);cursor:pointer}
.fsdb-page .fsdb-query-x:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-page .fsdb-query-add,.fsdb-page .fsdb-query-clear{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
.fsdb-page .fsdb-query-add:hover,.fsdb-page .fsdb-query-clear:hover{background:var(--dsw-hover)}
.fsdb-page .fsdb-query-clear{color:var(--dsw-danger)}
.fsdb-page .fsdb-query-input{flex:1;min-width:0;height:26px;border:0;border-radius:6px;padding:0 8px;background:var(--dsw-input);color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;outline:none}
.fsdb-page .fsdb-query-spacer{flex:1;min-width:0}
.fsdb-page .fsdb-col-drag-row{display:flex;align-items:center;gap:0;min-width:0}
.fsdb-page .fsdb-col-drag-row .fsdb-checkrow{flex:1;min-width:0}
.fsdb-page .fsdb-col-drag-row.is-drag{opacity:0}
.fsdb-page .fsdb-col-menu .fsdb-checkrow:hover,.fsdb-page .fsdb-col-menu .fsdb-checkrow.is-on{background:transparent}
.fsdb-page .fsdb-query-grip.is-locked{cursor:default}
.fsdb-page .fsdb-col-menu{max-height:min(60vh,360px);overflow:hidden}
.fsdb-page .fsdb-col-menu-list{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px}
.fsdb-page .tasks-viewdd-head,.fsdb-page .tasks-sort-head{font-size:14px;font-weight:600;color:var(--dsw-label-3)}
.fsdb-page .tasks-viewdd-item{display:flex;align-items:center;gap:2px;min-width:0;width:100%}
.fsdb-page .tasks-viewdd-item-main,.fsdb-page .tasks-sort-item,.fsdb-page .tasks-viewdd-saveas{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:4px;width:100%;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
.fsdb-page .tasks-sort-item-label{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;min-width:0}
.fsdb-page .tasks-viewdd-saveas{justify-content:flex-start}
.fsdb-page .tasks-sort-item-label svg,.fsdb-page .tasks-mode-item-ico,.fsdb-page .fsdb-checkrow-icon svg{flex:none;display:block}
.fsdb-page .tasks-viewdd-item-main{width:auto;flex:1;min-width:0;justify-content:flex-start;padding:4px 6px}
.fsdb-page .tasks-viewdd-item-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-sort-item.is-active,.fsdb-page .tasks-viewdd-item.is-active .tasks-viewdd-item-main{color:var(--dsw-business);font-weight:600}
.fsdb-page .tasks-viewdd-item-actions{display:inline-flex;align-items:center;gap:0;flex:none;margin-left:auto}
.fsdb-page .tasks-viewdd-check{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;color:var(--dsw-business)}
.fsdb-page .tasks-viewdd-act{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-label-2);cursor:pointer}
.fsdb-page .tasks-viewdd-act:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-page .tasks-viewdd-act.is-danger:hover{background:color-mix(in srgb,var(--dsw-danger) 16%,transparent);color:var(--dsw-danger)}
.fsdb-page .tasks-viewdd-foot{border-top:1px solid var(--dsw-border);margin-top:4px;padding-top:4px}
.fsdb-page .tasks-filter-menu-label,.fsdb-page .fsdb-filter-row{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:8px;width:100%;font-size:14px;font-weight:600;color:var(--dsw-label-3)}
.fsdb-page .tasks-filter-menu-label>span,.fsdb-page .fsdb-filter-row-key{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;flex:1;min-width:0}
.fsdb-page .fsdb-filter-row-key svg{flex:none;display:block}
.fsdb-page .fsdb-filter-row .fsdb-cellselect,.fsdb-page .tasks-filter-menu-label .fsdb-cellselect,.fsdb-page .fsdb-filter-row .fsdb-cellselect.is-field{display:inline-flex;width:auto;flex:none;max-width:42%}
.fsdb-page .fsdb-filter-row .fsdb-cellselect-trigger,.fsdb-page .fsdb-filter-row .fsdb-cellselect.is-field .fsdb-cellselect-trigger{border:0;width:auto;max-width:120px;min-height:22px;height:22px;padding:0 6px;background:transparent;box-shadow:none;justify-content:flex-end}
.fsdb-page .fsdb-filter-row .fsdb-cellselect-trigger.is-empty{background:transparent;color:var(--dsw-label-3)}
.fsdb-page .fsdb-filter-row .fsdb-cellselect-trigger:hover,.fsdb-page .fsdb-filter-row .fsdb-cellselect-trigger[data-open]{background:var(--dsw-hover);box-shadow:var(--dsw-shadow)}
.fsdb-page .tasks-filter-menu-label .fsdb-cellselect{flex:none}
.fsdb-page .tasks-filter{width:100%;border:1px solid var(--dsw-border);border-radius:7px;padding:5px 7px;background:var(--dsw-input);color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600}
.fsdb-page .tasks-filter-clear{border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-danger);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.fsdb-page .tasks-viewdd-empty{padding:6px 8px;font-size:14px;font-weight:600;color:var(--dsw-label-3)}
.fsdb-page .fsdb-col-facet-name{font-weight:600}
.fsdb-page .fsdb-col-facet-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-label-3);flex:none}
.fsdb-page .fsdb-col-facet-dot.is-on{background:var(--dsw-business)}
.fsdb-col-facet-flyout{z-index:50;min-width:200px;max-height:min(60vh,360px);overflow:auto;padding:8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow);display:flex;flex-direction:column;gap:4px;font-weight:600}
.fsdb-page .tasks-filter-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--dsw-business)}
.fsdb-page .tasks-error{margin:0;color:var(--dsw-danger);font-size:14px}
.fsdb-page .tasks-table-wrap{box-sizing:border-box;position:relative;min-width:0;min-height:0;flex:1;overflow:auto;width:100%;margin-left:0;padding-left:0;border:0;border-radius:0;background:transparent}
.fsdb-page .tasks-table-stage{display:flex;flex-direction:row;align-items:stretch;width:max-content;min-width:100%}
.fsdb-page .fsdb-check-rail{flex:none;width:var(--fsdb-check-gutter);min-width:var(--fsdb-check-gutter);position:sticky;left:0;z-index:8;align-self:stretch;overflow:visible;pointer-events:none;background:var(--dsw-bg)}
.fsdb-page .fsdb-check-stack{position:absolute;top:0;left:0;display:flex;flex-direction:column;width:var(--fsdb-check-gutter);transform:none;pointer-events:none}
.fsdb-page .fsdb-check-slot{display:flex;flex:none;align-items:center;justify-content:center;width:var(--fsdb-check-gutter);pointer-events:none}
.fsdb-page .fsdb-check-slot:has(.fsdb-row-check){pointer-events:auto}
.fsdb-page .tasks-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;table-layout:auto;font-size:14px;font-weight:600;color:var(--dsw-label);white-space:nowrap;border:0;border-top:1px solid var(--dsw-border);border-bottom:1px solid var(--dsw-border);background:var(--dsw-surface)}
.fsdb-page .tasks-table th,.fsdb-page .tasks-table td{padding:4px 6px;border-bottom:1px solid color-mix(in srgb,var(--dsw-border) 80%,transparent);border-right:1px solid color-mix(in srgb,var(--dsw-border) 80%,transparent);text-align:left;vertical-align:middle;color:var(--dsw-label);font-weight:600}
.fsdb-page .tasks-table th:last-child,.fsdb-page .tasks-table td:last-child{border-right:0}
.fsdb-page .tasks-table:not(.is-wrap) td{white-space:nowrap}
.fsdb-page .tasks-table.is-wrap{width:100%;max-width:100%;white-space:normal}
.fsdb-page .tasks-table.is-wrap td{white-space:normal;vertical-align:top;max-width:28rem}
.fsdb-page .tasks-table th,.fsdb-page .tasks-table.is-wrap th{white-space:nowrap}
.fsdb-page .tasks-table td .fsdb-cell{width:100%;box-sizing:border-box}
.fsdb-cell{display:flex;align-items:center;min-width:0;max-width:100%;min-height:18px;overflow:hidden;font-weight:600}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-cell > span:not(.fsdb-ref-chips):not(.biu-tags):not(.fsdb-person-list){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-table .biu-tag,.fsdb-page .fsdb-cell .biu-tag,.fsdb-page .fsdb-proprow-v .biu-tag,.fsdb-page .fsdb-proprow-v .fsdb-token,.fsdb-page .tasks-table .fsdb-token{font-weight:400}
.fsdb-page .fsdb-cell .traj-usage,.fsdb-page .fsdb-cell .traj-usage-empty,.fsdb-page .tasks-table .traj-usage,.fsdb-page .tasks-table .traj-usage-empty{font-size:14px;line-height:inherit}
.fsdb-page .chat-pane .traj-usage,.fsdb-page .chat-pane .traj-usage-empty{font-size:var(--dsw-chat-ui-font-size);line-height:1;font-weight:400;color:var(--dsw-sidebar-fg)}
.fsdb-link{color:inherit;text-underline-offset:2px;overflow-wrap:anywhere}
.fsdb-link:hover{text-decoration:underline}
.fsdb-thumb-btn{display:inline-flex;align-items:center;justify-content:center;line-height:0;border:0;padding:0;background:transparent;cursor:zoom-in;vertical-align:middle}
.fsdb-thumb-btn .ant-image{display:inline-flex;line-height:0}
.fsdb-thumb{display:block;width:28px;height:18px;object-fit:cover;border-radius:3px;background:var(--dsw-hover);flex:none;box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsw-border) 70%, transparent)}
.fsdb-thumb-btn .ant-image-img{display:block;width:28px;height:18px;object-fit:cover;border-radius:3px}
.fsdb-file{display:inline-flex;align-items:center;gap:6px;min-width:0;width:100%;color:inherit;text-underline-offset:2px}
.fsdb-file:hover{text-decoration:none}
.fsdb-file-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis}
.fsdb-file-tools{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.fsdb-file-tools .tasks-icon-btn{border:0;border-radius:5px;padding:3px;background:transparent;color:var(--dsw-icon);cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center;flex:none}
.fsdb-file-tools .tasks-icon-btn:hover,.fsdb-file-tools .tasks-icon-btn.is-active{background:var(--dsw-hover);color:var(--dsw-icon-active)}
.fsdb-file-tools .tasks-icon-btn.is-danger:hover{background:var(--dsw-danger-soft);color:var(--dsw-danger)}
.fsdb-files{display:flex;flex-direction:column;gap:2px;min-width:0;width:100%;flex:1}
.fsdb-fileview{min-width:0;flex:none;height:auto;min-height:0;max-height:none;overflow:visible}
.fsdb-fileview-pre{margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-input);color:var(--dsw-label);font:inherit;font-size:14px;font-family:var(--font-mono);white-space:pre-wrap;overflow:visible;height:auto;min-height:0;max-height:none}
.fsdb-fileview-img{display:block;width:auto;max-width:100%;height:auto;max-height:none;object-fit:contain;border-radius:8px;background:var(--dsw-hover)}
.fsdb-fileview-img .ant-image-img{display:block;width:auto;max-width:100%;height:auto;max-height:none;object-fit:contain;border-radius:8px}
.fsdb-page .tasks-table td:has(.fsdb-title-host){position:relative}
.fsdb-page .tasks-tree-toggle{width:20px;height:20px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--dsw-label-3);border-radius:4px;cursor:pointer;padding:0}
.fsdb-page .tasks-tree-toggle:hover{background:var(--dsw-hover)}
.fsdb-page .tasks-tree-toggle.is-empty{cursor:default;pointer-events:none}
.fsdb-page .tasks-tree-toggle.is-empty:hover{background:transparent}
.fsdb-page .fsdb-title-text{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.fsdb-page .fsdb-title-host{position:relative;display:inline-flex;align-items:center;gap:6px;min-width:0;width:100%;max-width:100%;flex:1;overflow:hidden}
.fsdb-page .fsdb-table-record-icon{position:relative;flex:none;display:inline-flex;align-items:center}
.fsdb-page .fsdb-record-mark,.fsdb-page .fsdb-record-mark svg,.fsdb-page .fsdb-title-host>svg,.fsdb-page .fsdb-table-record-icon svg{color:var(--dsw-icon)}
.fsdb-page .fsdb-table-emoji-btn{display:inline-flex;align-items:center;justify-content:center;margin:0;border:0;padding:0;background:transparent;color:var(--dsw-icon);font:inherit;line-height:1;cursor:pointer}
.fsdb-page .tasks-table.is-wrap .fsdb-title-text{white-space:normal}
.fsdb-page .tasks-title-aside{position:relative;display:inline-flex;align-items:center;gap:2px;pointer-events:none}
.fsdb-page .tasks-title-zoom{position:relative;display:grid;place-items:center}
.fsdb-page .tasks-title-zoom .tasks-tree-count,.fsdb-page .tasks-title-zoom .tasks-title-open{grid-area:1/1}
.fsdb-page .tasks-title-open{flex:none;color:var(--dsw-icon);opacity:0;z-index:1;pointer-events:none}
.fsdb-page .tasks-row-tools-slot{position:absolute;top:50%;right:8px;z-index:2;display:inline-flex;align-items:center;gap:2px;width:auto;transform:translateY(-50%);overflow:visible;pointer-events:none}
.fsdb-page .tasks-table td:has(.fsdb-title-host) .tasks-row-tools,.fsdb-page .tasks-table td:has(.fsdb-title-host) .tasks-row-actions{opacity:0;pointer-events:none}
.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-title-open,.fsdb-page .tasks-title-open:focus-visible,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-actions,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-tools{opacity:1;pointer-events:auto}
.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-title-open,.fsdb-page .tasks-title-open:focus-visible,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-tools .tasks-icon-btn,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-actions .tasks-icon-btn{background:var(--dsw-hover)}
.fsdb-page .tasks-row-tools{display:inline-flex;align-items:center;gap:2px;flex:none}
.fsdb-page .tasks-row-tools-slot .tasks-row-tools{position:static;background:transparent}
.fsdb-page .tasks-table td:has(.fsdb-title-host:focus-within) .tasks-row-tools-slot,.fsdb-page .tasks-table td:has(.fsdb-plain-input:focus) .tasks-row-tools-slot,.fsdb-page .tasks-queue-item:has(.fsdb-title-host:focus-within) .tasks-row-tools,.fsdb-page .tasks-minicard:has(.fsdb-title-host:focus-within) .tasks-row-tools{opacity:0;pointer-events:none}
.fsdb-page .tasks-table tr:hover .tasks-tree-count,.fsdb-page .tasks-title-zoom:has(.tasks-title-open:focus-visible) .tasks-tree-count{opacity:0}
.fsdb-page .tasks-title-open:hover{opacity:1;color:var(--dsw-icon-active);background:var(--dsw-hover)}
.fsdb-page .tasks-tree-count{pointer-events:none}
.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-table.is-truncate:not(.is-wrap) td:has(.biu-tags) .fsdb-cell,.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table.is-truncate:not(.is-wrap) td:has(.fsdb-person-list) .fsdb-cell,.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell:has(.fsdb-person-list){max-width:100%;white-space:normal;overflow:visible}
.fsdb-page .tasks-table .fsdb-cell:has(.tasks-tags),.fsdb-page .tasks-table .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-cellselect),.fsdb-page .tasks-table .fsdb-cell:has(.db-cell-select),.fsdb-page .tasks-table .fsdb-cell:has(.db-datetime),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-tokens),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-ref-chips),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-person-list),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-boolbtn),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-plain-input),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-thumb-btn),.fsdb-page .fsdb-proprow-v:has(.fsdb-cellselect),.fsdb-page .fsdb-proprow-v:has(.fsdb-tokens),.fsdb-page .fsdb-proprow-v:has(.fsdb-boolbtn){overflow:visible;max-height:none}
.fsdb-page .tasks-table.is-wrap .fsdb-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%;align-items:flex-start}
.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-ref-chips),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-person-list),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-tokens-box),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.db-cell-multi-box){display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;overflow-wrap:normal;word-break:normal;white-space:normal}
.fsdb-page .tasks-table.is-wrap.is-truncate .fsdb-cell{overflow:hidden;max-width:100%;max-height:2.8em}
.fsdb-page .tasks-table.is-wrap.is-truncate .fsdb-title-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal}
.fsdb-page .tasks-table td{overflow:visible}
.fsdb-page .tasks-table td:has(.fsdb-title-host),.fsdb-page .tasks-table th{overflow:visible}
.fsdb-page .tasks-table tbody tr:hover{position:relative;z-index:6}
.fsdb-page .tasks-table [data-dock-tip]::after{z-index:80}
.fsdb-page .tasks-table th{padding:6px 6px;color:var(--dsw-label-2);font-size:14px;font-weight:600;position:sticky;top:0;background:var(--dsw-surface);z-index:5;white-space:nowrap}
.fsdb-page .tasks-table th.is-facet-col{color:var(--dsw-tag-ink,#2c2c2b);background:color-mix(in srgb,var(--biu-tag) 38%,var(--dsw-surface))}
.fsdb-page .tasks-table.is-cols-fixed{table-layout:fixed;width:max-content;min-width:0;max-width:none}
.fsdb-page .tasks-table.is-cols-fixed.is-wrap{width:max-content;max-width:none;min-width:0}
.fsdb-page .tasks-table.is-cols-fixed col,.fsdb-page .tasks-table.is-cols-fixed th,.fsdb-page .tasks-table.is-cols-fixed td{box-sizing:border-box}
.fsdb-page .tasks-table.is-cols-fixed th,.fsdb-page .tasks-table.is-cols-fixed td{max-width:none}
.fsdb-page .tasks-table.is-cols-fixed td .fsdb-cell{max-width:100%}
.fsdb-page .tasks-table .fsdb-col-resizer{position:absolute;top:0;bottom:0;right:-5px;z-index:9;width:9px;height:auto;cursor:col-resize;user-select:none;touch-action:none;pointer-events:auto}
.fsdb-page .tasks-table .fsdb-col-resizer::after{content:"";position:absolute;top:0;bottom:0;left:50%;width:4px;transform:translateX(-50%);background:transparent;pointer-events:none}
.fsdb-page .tasks-table .fsdb-col-resizer:hover::after,.fsdb-page .tasks-table .fsdb-col-resizer.is-active::after{background:var(--dsw-pick,#5b9fd6)}
.fsdb-page .tasks-table.is-col-resize{cursor:col-resize;user-select:none}
.fsdb-row-check{position:relative;top:auto;left:auto;z-index:12;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:0;transform:none;opacity:0;pointer-events:auto;transition:none}
.fsdb-check-slot.is-hover .fsdb-row-check,.fsdb-check-slot:hover .fsdb-row-check,.fsdb-row-check.is-on,.fsdb-row-check:hover,.fsdb-row-check:focus-visible{opacity:1}
.fsdb-page .tasks-th{display:inline-flex;align-items:center;gap:5px;font-weight:600;white-space:nowrap;flex-wrap:nowrap}
.fsdb-page .tasks-th svg{color:var(--dsw-icon)}
.fsdb-page .tasks-th.is-on svg{color:var(--dsw-icon-active)}
.fsdb-page .tasks-table tr{cursor:default}
.fsdb-page .tasks-table tr:hover td{background:color-mix(in srgb,var(--dsw-hover) 55%,transparent)}
.fsdb-page .tasks-table tr.is-active td{background:color-mix(in srgb,var(--dsw-business) 8%,transparent)}
.fsdb-page .tasks-table tr.fsdb-group-row td{padding:10px 4px 4px;background:transparent;cursor:default}
.fsdb-page .tasks-table tr.fsdb-group-row:hover td{background:transparent}
.fsdb-page .tasks-table tr.fsdb-group-row .tasks-queue-ghead{padding:2px 4px}
.fsdb-page .tasks-minicard{display:flex;flex-direction:column;gap:8px;position:relative;width:100%;min-width:0;height:auto;min-height:min-content;margin:0;overflow:visible;text-align:left;border:0;border-radius:8px;padding:10px 11px;background:var(--dsw-sidebar);color:var(--dsw-label);font:inherit;box-shadow:none;transition:background .12s ease}
.fsdb-page .tasks-minicard-open{display:flex;min-width:0;flex:1;overflow:hidden;border:0;padding:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:default}
.fsdb-page .tasks-minicard:hover{background:var(--dsw-hover)}
.fsdb-page .tasks-minicard.is-active{background:var(--dsw-hover)}
.fsdb-page .tasks-minicard-title{position:relative;display:flex;align-items:center;gap:6px;min-width:0;width:100%;font-size:14px;font-weight:600;line-height:1.25}
.fsdb-page .tasks-minicard-title .fsdb-title-text,.fsdb-page .tasks-minicard-title .fsdb-plain-input{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.fsdb-page .tasks-minicard-title .fsdb-plain-input{width:100%;padding:0}
.fsdb-page .tasks-minicard .tasks-row-tools,.fsdb-page .tasks-minicard .tasks-title-open,.fsdb-page .tasks-minicard .tasks-row-actions{opacity:0;pointer-events:none}
.fsdb-page .tasks-minicard:hover .tasks-title-open,.fsdb-page .tasks-minicard:hover .tasks-row-actions,.fsdb-page .tasks-minicard:hover .tasks-row-tools,.fsdb-page .tasks-minicard:focus-within .tasks-title-open,.fsdb-page .tasks-minicard:focus-within .tasks-row-tools{opacity:1;pointer-events:auto}
.fsdb-page .tasks-queue-item-tools{position:absolute;right:4px;top:50%;z-index:2;display:inline-flex;align-items:center;gap:2px;flex:none;transform:translateY(-50%)}
.fsdb-page .tasks-queue-item .tasks-row-tools,.fsdb-page .tasks-queue-item .tasks-title-open,.fsdb-page .tasks-queue-item .tasks-row-actions{opacity:0;pointer-events:none}
.fsdb-page .tasks-queue-item:hover .tasks-row-tools,.fsdb-page .tasks-queue-item:hover .tasks-title-open,.fsdb-page .tasks-queue-item:hover .tasks-row-actions,.fsdb-page .tasks-queue-item:focus-within .tasks-row-tools,.fsdb-page .tasks-queue-item:focus-within .tasks-title-open{opacity:1;pointer-events:auto}
.fsdb-page .tasks-minicard-foot{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px;min-width:0;width:100%;overflow:hidden}
.fsdb-page .tasks-minicard-foot > .fsdb-proplist{flex:1;flex-direction:row;flex-wrap:wrap;width:100%;min-width:0;align-items:center;align-content:flex-start;justify-content:flex-start;gap:6px 10px;overflow:hidden;height:auto}
.fsdb-page .tasks-row-actions{display:inline-flex;align-items:center;gap:2px;flex:none}
.fsdb-page .tasks-icon-btn{border:0;border-radius:5px;padding:3px;background:transparent;color:var(--dsw-icon);cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center}
.fsdb-page .tasks-row-tools .tasks-icon-btn,.fsdb-page .tasks-row-actions .tasks-icon-btn{color:var(--dsw-icon)}
.fsdb-page .tasks-icon-btn:hover:not(:disabled),.fsdb-page .tasks-icon-btn.is-active{background:var(--dsw-hover);color:var(--dsw-icon-active)}
.fsdb-page .tasks-row-tools .tasks-icon-btn:hover,.fsdb-page .tasks-row-tools .tasks-icon-btn.is-active,.fsdb-page .tasks-row-actions .tasks-icon-btn:hover,.fsdb-page .tasks-row-actions .tasks-icon-btn.is-active{color:var(--dsw-icon-active)}
.fsdb-page .tasks-icon-btn.is-danger:hover{background:var(--dsw-danger-soft);color:var(--dsw-danger)}
.fsdb-page .tasks-icon-btn:disabled{opacity:.4;cursor:default}
.fsdb-page .tasks-icon-btn.tasks-title-open{color:var(--dsw-icon)}
.fsdb-page .tasks-icon-btn.tasks-title-open:hover,.fsdb-page .tasks-icon-btn.tasks-title-open.is-active{color:var(--dsw-icon-active)}
.fsdb-page .tasks-queue{display:flex;flex-direction:column;gap:18px;overflow:auto;box-sizing:border-box;width:100%;margin-left:0;padding:2px 0 12px var(--fsdb-check-gutter);flex:1;min-width:0;min-height:0}
.fsdb-page .tasks-queue-group{display:flex;flex-direction:column;gap:2px}
.fsdb-page .tasks-queue-ghead{display:flex;align-items:center;gap:6px;padding:4px 8px;color:var(--dsw-label-2);font-size:14px;font-weight:650;letter-spacing:.01em;cursor:default}
.fsdb-page .tasks-group-fold{display:grid;width:auto;min-width:22px;height:22px;flex:none;place-items:center;border:0;border-radius:6px;padding:0;background:transparent;color:inherit;cursor:pointer}
.fsdb-page .tasks-group-fold .sidebar-group-fold{display:inline-flex;align-items:center;gap:2px;width:auto;height:auto}
.fsdb-page .tasks-group-fold .sidebar-group-fold-face,.fsdb-page .tasks-group-fold:hover .sidebar-group-fold-face,.fsdb-page .tasks-group-fold:focus-within .sidebar-group-fold-face{display:grid}
.fsdb-page .tasks-group-fold .sidebar-group-fold-chevron,.fsdb-page .tasks-group-fold:hover .sidebar-group-fold-chevron,.fsdb-page .tasks-group-fold:focus-within .sidebar-group-fold-chevron{display:grid}
.fsdb-page .tasks-queue-glabel{font-weight:650;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-queue-count{margin-left:auto;color:var(--dsw-label-3);font-size:14px;font-weight:600;background:var(--dsw-muted-fill);border-radius:8px;padding:1px 7px}
.fsdb-page .tasks-queue-list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;gap:6px}
.fsdb-page .tasks-queue-item{display:block;min-width:0;width:100%}
.fsdb-page .tasks-queue-item-body{position:relative;display:flex;flex-wrap:nowrap;align-items:center;gap:6px;min-width:0;width:100%;box-sizing:border-box;border-radius:6px;padding:6px var(--fsdb-row-tools-w) 6px 0}
.fsdb-page .tasks-queue-item-lead{position:relative;display:inline-flex;align-items:center;gap:4px;flex:none;width:auto;min-width:0;max-width:min(48%,28rem)}
.fsdb-page .tasks-queue-item-main{display:flex;align-items:center;gap:10px;flex:none;width:auto;min-width:0;box-sizing:border-box;overflow:visible;text-align:left;border:0;border-radius:6px;padding:2px 8px;background:transparent;color:var(--dsw-label);font:inherit;cursor:default;box-shadow:none}
.fsdb-page .tasks-queue-item:hover .tasks-queue-item-body{background:var(--dsw-hover)}
.fsdb-page .tasks-queue-item.is-active .tasks-queue-item-body{background:color-mix(in srgb,var(--dsw-hover) 85%,transparent)}
.fsdb-page .tasks-queue-item .tasks-row-actions{flex:none;padding:2px}
.fsdb-page .tasks-queue-item-title{position:relative;flex:1;min-width:0;font-size:14px;font-weight:600;line-height:1.4;overflow:hidden}
.fsdb-page .tasks-queue-item-body > .fsdb-proplist{flex:1 1 12rem;width:auto;min-width:0;max-width:none;margin-left:0;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:4px 10px;padding:2px 0;overflow:visible;white-space:normal}
.fsdb-page .tasks-queue-item-body .fsdb-proprow{width:auto;max-width:100%;min-width:0;min-height:18px;white-space:nowrap}
.fsdb-page .tasks-queue-item-body .fsdb-proprow-v{line-height:18px;white-space:nowrap;overflow:hidden;min-width:0}
.fsdb-page .tasks-board{display:grid;gap:12px;overflow:auto;align-items:start;box-sizing:border-box;width:100%;margin-left:0;padding:0 0 8px var(--fsdb-check-gutter);flex:1;min-width:0;min-height:0}
.fsdb-page .tasks-board-col{min-height:180px;background:transparent;padding:10px}
.fsdb-page .tasks-board-colhead{display:flex;align-items:center;gap:6px;padding:4px 6px 10px;color:var(--dsw-label-2);font-weight:600;font-size:14px}
.fsdb-page .tasks-board-coltitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-board-count{margin-left:auto;color:var(--dsw-label-3);font-size:14px;font-weight:600;background:var(--dsw-muted-fill);border-radius:8px;padding:1px 6px}
.fsdb-page .tasks-board-list{display:flex;flex-direction:column;gap:8px}
.fsdb-page .tasks-board-col .tasks-minicard{background:var(--dsw-sidebar)}
.fsdb-page .fsdb-proplist{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0;max-width:100%;overflow:visible;height:auto}
.fsdb-page .fsdb-proplist .fsdb-proprow{display:inline-flex;width:auto;max-width:100%;min-width:0;min-height:20px;align-items:center;gap:4px;grid-template-columns:none}
.fsdb-page .tasks-minicard .fsdb-proplist .fsdb-proprow{min-height:18px}
.fsdb-page .fsdb-proplist .fsdb-proprow-v{min-width:0;overflow:hidden}
.fsdb-page .fsdb-proplist .fsdb-proprow-v:has(.fsdb-boolbox){overflow:visible;flex:none}
.fsdb-workspace{display:flex;flex-direction:column;min-width:0;min-height:0;flex:1;overflow:hidden}
.fsdb-pager{display:flex;align-items:center;gap:8px;flex:none;margin-top:auto;min-height:28px;padding:4px 0 0;color:var(--dsw-label-3);font-size:13px;font-weight:500}
.fsdb-page:not(.is-sheet) .fsdb-pager{padding-left:var(--fsdb-check-gutter)}
/* 检查器分页与中间页、输入胶囊对齐。胶囊距底 = dock pb + 行高 44；检查器已有 --brand-corner-clearance */
.inspector-database-page .fsdb-pager{margin-bottom:calc(var(--fsdb-pager-lift) - var(--brand-corner-clearance,1.25rem))}
.fsdb-pager-meta{display:inline-flex;align-items:center;gap:4px;min-width:0;flex:1;overflow:hidden;white-space:nowrap;color:var(--dsw-label-3)}
.fsdb-pager-meta svg{flex:none}
.fsdb-pager-nav{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.fsdb-pager-size{position:relative;display:inline-flex;align-items:center}
.fsdb-pager-size-btn{gap:4px;width:auto;min-width:0;height:26px;padding:0 6px;border-radius:6px;font-variant-numeric:tabular-nums}
.fsdb-pager-size-menu{z-index:130;min-width:96px;padding:6px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow);display:flex;flex-direction:column;gap:2px}
.fsdb-pager-size-option{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
.fsdb-pager-size-option:hover{background:var(--dsw-hover)}
.fsdb-pager-size-option.is-active{color:var(--dsw-business);font-weight:600}
.fsdb-pager .tasks-icon-btn{color:var(--dsw-icon);width:26px;height:26px}
.fsdb-pager .tasks-icon-btn:disabled{opacity:.4;cursor:default;color:var(--dsw-icon)}
.fsdb-pager .fsdb-pager-size-btn{width:auto}
.fsdb-stage{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
.fsdb-plugin-surface{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.fsdb-rows-view{display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1;min-width:0;min-height:0;padding:8px 12px 24px}
.fsdb-rows-view-item{min-width:0}
.fsdb-row-card{display:flex;flex-direction:column;gap:6px;width:100%;margin:0;border:1px solid var(--dsw-border);border-radius:10px;padding:10px 12px;background:var(--dsw-surface);color:inherit;font:inherit;text-align:left;cursor:pointer}
.fsdb-row-card:hover{background:var(--dsw-hover)}
.fsdb-row-card-field{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0}
.fsdb-row-card-k{flex:none;color:var(--dsw-label-3);font-size:12px;font-weight:650}
.fsdb-row-card-v{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}
.fsdb-mode-plus{display:flex;align-items:center;justify-content:flex-start;gap:6px;width:100%;margin:0;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-label-3);font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
.fsdb-mode-plus:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));grid-auto-flow:row;grid-auto-rows:max-content;gap:10px;align-content:start;align-items:stretch;justify-items:stretch;overflow:auto;flex:1;min-width:0;min-height:0;position:relative;box-sizing:border-box;width:100%;margin-left:0;padding-left:var(--fsdb-check-gutter)}
.fsdb-cards > .tasks-minicard{position:relative;grid-row:auto;grid-column:auto;inset:auto;height:auto}
.fsdb-cards-stack{display:flex;flex-direction:column;gap:16px;overflow:auto;flex:1;min-width:0;min-height:0;padding:2px 0 12px;box-sizing:border-box;width:100%;margin-left:0;padding-left:var(--fsdb-check-gutter)}
.fsdb-cards-stack .fsdb-cards{width:100%;margin-left:0;padding-left:0}
.fsdb-cards-stack .fsdb-cards{overflow:visible;flex:none;min-height:0}
.fsdb-bool{display:inline-flex;align-items:center;flex:none;line-height:0;vertical-align:middle}
.fsdb-boolbtn{border:0;background:transparent;padding:0;cursor:pointer;display:inline-flex;align-items:center;flex:none;line-height:0;vertical-align:middle}
.fsdb-boolbox{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--dsw-border);display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--dsw-bg);box-sizing:border-box}
.fsdb-field-bool-glyph{display:inline-flex;flex:none;align-items:center;line-height:0}
.fsdb-field-bool-glyph .fsdb-boolbox{width:14px;height:14px}
.fsdb-boolbox.is-on{background:var(--dsw-pick,#2383e2);border-color:transparent;color:var(--dsw-bg)}
.fsdb-boolbox.is-locked{cursor:default;opacity:.9}
.fsdb-boolbox.is-locked.is-on{background:var(--dsw-pick,#2383e2);border-color:transparent;color:var(--dsw-bg)}
.fsdb-boolbtn:hover .fsdb-boolbox:not(.is-on){border-color:var(--dsw-label-2)}
.fsdb-detail-stage{position:relative;display:flex;min-width:0;width:100%;min-height:min-content;flex:1 0 auto;flex-direction:row;overflow:visible;background:var(--dsw-bg)}
.heading-outline-host{position:absolute;inset:0 auto 0 0;width:64px;z-index:20;pointer-events:none;overflow:visible}
.fsdb-right:has(.heading-outline-host),.fsdb-right-body:has(.heading-outline-host),.fsdb-detail-stage:has(.heading-outline-host){position:relative}
.heading-outline-host .chat-outline{left:8px;top:50%}
.heading-outline-host .chat-outline::before{inset:-16px auto -16px -8px;width:64px}
.fsdb-detail-screen{display:flex;min-width:0;width:100%;min-height:min-content;flex:1;flex-direction:column;overflow:visible}
.fsdb-detail-screen .fsdb-detail-split,.fsdb-detail-screen > :not(header){flex:none;width:100%;min-height:min-content;overflow:visible}
.fsdb-detail-screen > .fsdb-detail-actionbar{height:0;min-height:0}
.fsdb-detail-float-nav{position:sticky;top:50%;align-self:flex-start;flex:none;z-index:24;display:flex;flex-direction:column;gap:4px;width:24px;min-width:24px;margin:0 0 0 -24px;padding:4px 0;border:0;border-radius:8px;background:var(--dsw-sidebar);box-shadow:var(--dsw-shadow);overflow:visible;transform:translate(-28px,-50%);opacity:0;transition:opacity .16s ease;pointer-events:auto}
.fsdb-detail-float-nav::before{content:'';position:absolute;z-index:0;top:-120px;bottom:-120px;left:0;right:-8px;pointer-events:auto}
.fsdb-detail-float-nav:hover,.fsdb-detail-float-nav:focus-within,.fsdb-detail-float-nav:has([aria-expanded=true]),html[data-nav-pin="1"] .fsdb-detail-float-nav{opacity:1}
.fsdb-detail-float-btn{position:relative;z-index:1;display:flex;width:24px;height:24px;align-items:center;justify-content:center;margin:0;border:0;border-radius:6px;padding:0;background:transparent;color:var(--dsw-icon);cursor:pointer;pointer-events:auto}
.fsdb-detail-float-btn svg{width:16px;height:16px}
.fsdb-detail-float-btn:hover:not(:disabled){background:var(--dsw-hover);color:var(--dsw-icon-active)}
.fsdb-detail-float-btn:disabled{opacity:.35;cursor:default;color:var(--dsw-icon)}
.fsdb-detail-more-menu{min-width:168px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow)}
.fsdb-detail-more-item{display:flex;align-items:center;gap:8px;width:100%;margin:0;border:0;border-radius:6px;padding:7px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:600;text-align:left;cursor:pointer}
.fsdb-detail-more-item:hover,.fsdb-detail-more-item[aria-pressed=true]{background:var(--dsw-hover)}
.fsdb-detail-more-item.is-danger{color:var(--dsw-danger)}
.fsdb-detail-more-item.is-danger:hover{background:color-mix(in srgb,var(--dsw-danger) 16%,transparent)}
.fsdb-detail-more-item svg{flex:none;width:16px;height:16px;color:var(--dsw-icon)}
.fsdb-detail-more-item.is-danger svg{color:var(--dsw-danger)}
.fsdb-detail-split{display:flex;flex-direction:column;flex:none;width:100%;min-height:min-content;overflow:visible}
.fsdb-detail-main{box-sizing:border-box;width:100%;max-width:none;margin-inline:0;display:flex;flex-direction:column;gap:8px;padding:0 0 24px;min-width:0}
.fsdb-detail-main > :not(.fsdb-page-banner){box-sizing:border-box;width:100%;max-width:var(--dsw-chat-max-width);margin-inline:auto;padding-left:80px;padding-right:80px}
.fsdb-detail-main > .fsdb-tag-collect{max-width:none;margin-inline:0;padding-left:0;padding-right:0}
.fsdb-detail-main:not(:has(> .fsdb-page-banner)){padding-top:80px}
.fsdb-page-banner{position:relative;flex:none;box-sizing:border-box;width:100%;margin:0;height:240px;overflow:visible;background:var(--dsw-bubble);border-radius:0;z-index:2}
.fsdb-page-banner.is-empty{height:80px;margin-bottom:0;background:transparent}
.fsdb-page-banner iframe{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;pointer-events:none;background:transparent}
.fsdb-banner-right{position:absolute;left:auto;right:80px;top:16px;z-index:4;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(36rem,calc(100% - 160px));pointer-events:none}
.fsdb-banner-story{position:relative;left:auto;right:auto;top:auto;bottom:auto;z-index:3;max-width:100%;padding:10px 12px;border-radius:8px;background:rgba(12,12,12,.72);color:#F0EFED;opacity:0;transform:translateY(6px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.fsdb-page-banner:hover .fsdb-banner-story,.fsdb-page-banner:focus-within .fsdb-banner-story{opacity:1;transform:none;pointer-events:auto}
.fsdb-banner-story-head,.fsdb-banner-fly-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.fsdb-banner-story-title{font-size:12px;font-weight:700;letter-spacing:.04em}
.fsdb-banner-story-note{margin-top:4px;font-size:12px;font-weight:500;line-height:1.5;color:#D8D5D0}
.fsdb-banner-title-actions{position:relative;left:auto;right:auto;top:auto;z-index:4;display:flex;align-items:center;margin:0;height:auto;opacity:0;pointer-events:none}
.fsdb-page-banner:hover .fsdb-banner-title-actions,.fsdb-page-banner:focus-within .fsdb-banner-title-actions,.fsdb-banner-title-actions:has([data-state=open]){opacity:1;pointer-events:auto}
.fsdb-banner-ico{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;margin:0;border:0;border-radius:6px;padding:0 8px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.fsdb-banner-ico:hover,.fsdb-banner-ico[data-state=open]{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico{background:rgba(0,0,0,.45);color:#F0EFED}
/* 有封面图时按钮压在图片上，保持固定浅色；这条也补回 hover——上游漏了它，
   而上面那条 :not(.is-empty) 的特异性更高，会把 :hover 的样式盖掉。 */
.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico:hover,.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico[data-state=open]{background:rgba(0,0,0,.62);color:#F0EFED}
.fsdb-banner-pop{width:min(520px,calc(100vw - 32px));max-height:min(560px,76vh);display:flex;flex-direction:column;background:var(--dsw-float);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow-lv2);overflow:hidden;z-index:80}
.fsdb-banner-pop-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-border)}
.fsdb-banner-pop-tabs{display:flex;gap:2px}
.fsdb-banner-pop-tabs button,.fsdb-banner-pop-remove,.fsdb-banner-create{margin:0;border:0;border-radius:6px;padding:4px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.fsdb-banner-pop-tabs button[aria-pressed=true]{background:var(--dsw-hover-strong)}
.fsdb-banner-pop-remove{color:var(--dsw-label-2)}
.fsdb-banner-pop-remove:hover,.fsdb-banner-pop-tabs button:hover,.fsdb-banner-create:hover{background:var(--dsw-hover)}
.fsdb-banner-pop-body{flex:1;min-height:0;overflow:auto;padding:10px 12px 14px;display:flex;flex-direction:column;gap:14px}
.fsdb-banner-pop-sec h3{margin:0 0 8px;color:var(--dsw-label-2);font-size:11px;font-weight:650;letter-spacing:.04em}
.fsdb-banner-pop-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.fsdb-banner-card{display:flex;flex-direction:column;gap:5px;margin:0;border:0;padding:0;background:transparent;color:var(--dsw-label);text-align:left;cursor:pointer;width:100%;min-width:0}
.fsdb-banner-thumb{position:relative;display:block;height:64px;margin:0;border:0;border-radius:6px;padding:0;overflow:hidden;background:var(--dsw-bubble);width:100%}
.fsdb-banner-thumb iframe{display:block;width:200%;height:200%;border:0;pointer-events:none;transform:scale(.5);transform-origin:top left}
.fsdb-banner-caption{font-size:11px;font-weight:700;line-height:1.25;color:var(--dsw-label);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-banner-fly{position:fixed;z-index:120;width:min(280px,calc(100vw - 24px));transform:translate(-50%,calc(-100% - 10px));padding:10px 12px;border-radius:8px;background:var(--dsw-float);border:1px solid var(--dsw-border);box-shadow:var(--dsw-shadow-lv2);pointer-events:auto;color:var(--dsw-label)}
.fsdb-banner-fly-title{font-size:12px;font-weight:700;min-width:0;flex:1}
.fsdb-banner-fly-note{margin-top:5px;font-size:12px;font-weight:500;line-height:1.5;color:var(--dsw-label-2)}
.fsdb-banner-remix{display:inline-flex;align-items:center;gap:4px;flex:none;margin:0;border:0;border-radius:6px;padding:2px 6px;background:var(--dsw-hover);color:var(--dsw-label);font:inherit;font-size:11px;font-weight:650;cursor:pointer;pointer-events:auto}
.fsdb-banner-remix:hover{background:var(--dsw-hover-strong)}
.fsdb-banner-mine{position:relative;min-width:0}
.fsdb-banner-mine-del{position:absolute;top:4px;right:4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:0;border:0;border-radius:6px;padding:0;background:rgba(0,0,0,.55);color:#F0EFED;opacity:0;cursor:pointer}
.fsdb-banner-mine:hover .fsdb-banner-mine-del,.fsdb-banner-mine:focus-within .fsdb-banner-mine-del{opacity:1}
.fsdb-banner-mine-del:hover{background:rgba(0,0,0,.78)}
.fsdb-banner-create{display:flex;align-items:center;justify-content:center;height:56px;border:1px dashed var(--dsw-border)!important;color:var(--dsw-label-2)!important;text-align:center;line-height:1.3}
.fsdb-tag-collect{display:flex;flex:none;min-width:0;width:100%;min-height:320px}
.fsdb-tag-collect>.fsdb-page{flex:1;min-width:0;min-height:320px;background:transparent}
.fsdb-page.is-sheet .tasks-main{padding:0;gap:8px;max-width:none}
.fsdb-page.is-sheet .fsdb-right-body{overflow:hidden}
.fsdb-page.is-sheet .tasks-table-wrap{width:100%;margin-left:0;padding-left:0}
.fsdb-detail-aside{display:flex;flex-direction:column;gap:2px;padding:0 0 12px}
.fsdb-detail-aside .fsdb-proprow-k,.fsdb-detail-aside .fsdb-prop>span:first-child,.fsdb-detail-aside .fsdb-proprow-label{color:var(--dsw-label-2)}
.fsdb-detail-aside .fsdb-proprow-k svg,.fsdb-detail-aside .fsdb-prop>span:first-child svg{color:var(--dsw-icon);opacity:1}
.fsdb-detail-aside .fsdb-field-bool-glyph .fsdb-boolbox{border-color:var(--dsw-label-2)}
.fsdb-detail-aside .fsdb-proprow-v,.fsdb-detail-aside .fsdb-prop-val,.fsdb-detail-aside .fsdb-detail-id,.fsdb-detail-aside .fsdb-plain-input{color:var(--dsw-label)}
.fsdb-proprow,.fsdb-prop{display:grid;grid-template-columns:108px minmax(0,1fr);align-items:center;gap:8px;min-height:32px;font-size:14px;color:var(--dsw-label-3)}
.fsdb-proprow-k,.fsdb-prop>span:first-child{font-size:14px;font-weight:600;color:var(--dsw-label-3);display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-proprow-k svg,.fsdb-prop>span:first-child svg,.fsdb-schema-prop-k svg{color:var(--dsw-icon);opacity:1}
.fsdb-proprow-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-label-3)}
.fsdb-proprow-v,.fsdb-prop-val,.fsdb-detail-id{min-width:0;font-weight:600;color:var(--dsw-label)}
.fsdb-proprow.is-stack,.fsdb-prop.is-stack{align-items:flex-start;flex-wrap:wrap}
.fsdb-proprow.is-stack .fsdb-proprow-k,.fsdb-prop.is-stack>span:first-child{padding-top:6px}
.fsdb-proprow-fold{position:relative;display:inline-grid;place-items:center;width:14px;height:14px;flex:none;margin:0;border:0;padding:0;background:transparent;color:inherit;cursor:pointer}
.fsdb-proprow-glyph,.fsdb-proprow-chevron{display:grid;place-items:center;width:14px;height:14px}
.fsdb-proprow-chevron{position:absolute;inset:0;opacity:0;pointer-events:none}
.fsdb-proprow.is-facet-fold:hover .fsdb-proprow-glyph,.fsdb-proprow.is-facet-fold:focus-within .fsdb-proprow-glyph{opacity:0}
.fsdb-proprow.is-facet-fold:hover .fsdb-proprow-chevron,.fsdb-proprow.is-facet-fold:focus-within .fsdb-proprow-chevron{opacity:1}
.fsdb-proprow.is-facet-fold{align-items:start}
.fsdb-proprow.is-facet-fold:not(:has(.fsdb-schema)){align-items:center}
.fsdb-proprow.is-facet-fold .fsdb-proprow-k{min-height:32px;padding-top:0}
.fsdb-proprow.is-facet-fold .fsdb-proprow-v,.fsdb-proprow.is-facet-fold .fsdb-prop-val.is-schema{min-height:32px;display:flex;align-items:center}
.fsdb-proprow.is-facet-fold.is-open .fsdb-proprow-v,.fsdb-proprow.is-facet-fold.is-open .fsdb-prop-val.is-schema{align-items:stretch}
.fsdb-proprow.is-facet-fold .fsdb-prop-val.is-schema>.fsdb-pop-host{min-height:32px;align-items:center;align-content:center}
.fsdb-proprow.is-facet-fold .fsdb-schema>:first-child{min-height:32px;display:flex;align-items:center}
.fsdb-proprow.is-facet-fold:not(.is-open) .fsdb-schema-pack{display:none}
.fsdb-prop-val.is-schema{overflow:visible;white-space:normal;max-width:none}
.fsdb-schema{display:flex;flex-direction:column;gap:2px;min-width:0;width:100%}
.fsdb-schema-pack{display:flex;flex-direction:column;gap:0;min-width:0;padding:4px 0 8px}
.fsdb-schema-pack-head{display:flex;align-items:center;min-height:24px;padding:0 4px 4px}
.fsdb-schema-prop{display:grid;grid-template-columns:108px minmax(0,1fr);align-items:center;gap:8px;min-height:32px;border-radius:6px;padding:0 4px}
.fsdb-schema-prop:hover{background:var(--dsw-hover)}
.fsdb-schema-prop-k{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;color:var(--dsw-label-3)}
.fsdb-schema-prop-v{display:flex;align-items:center;gap:4px;min-width:0;color:var(--dsw-label-3)}
.fsdb-schema-prop-v .fsdb-plain-input,.fsdb-schema-prop-v .fsdb-cellselect{flex:1;min-width:0}
.fsdb-schema-prop-del{opacity:0;display:grid;place-items:center;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-label-3);cursor:pointer}
.fsdb-schema-prop:hover .fsdb-schema-prop-del{opacity:1}
.fsdb-schema-prop-del:hover{color:var(--dsw-danger);background:color-mix(in srgb,var(--dsw-danger) 12%,transparent)}
.fsdb-schema-prop.is-orphan .fsdb-schema-prop-k{color:var(--dsw-label-3);font-weight:600}
.fsdb-schema-prop.is-orphan .fsdb-schema-prop-k svg{opacity:.45}
.fsdb-schema-prop.is-orphan .fsdb-schema-prop-v > :first-child{flex:1;min-width:0}
.fsdb-schema-prop-restore{opacity:1;display:grid;place-items:center;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-label-3);cursor:pointer}
.fsdb-schema-prop-restore:hover{color:var(--dsw-label);background:var(--dsw-hover)}
.fsdb-schema-addprop{display:inline-flex;align-items:center;gap:4px;margin:2px 4px 0;height:28px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-label-3);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.fsdb-schema-addprop:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-schema-addprop-form{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:2px 4px 0;min-width:0}
.fsdb-schema-addprop-err{flex:1 1 100%;font-size:12px;color:var(--dsw-danger)}
.fsdb-schema-addprop-input{flex:1;min-width:0;border:0;border-radius:6px;padding:4px 6px;background:var(--dsw-hover);color:var(--dsw-label);font:inherit;font-size:14px;outline:none}
.fsdb-schema-addprop-ok{border:0;border-radius:6px;padding:4px 8px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.fsdb-schema-type{position:relative;flex:none}
.fsdb-schema-type-btn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:13px;cursor:pointer}
.fsdb-schema-type-btn:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-schema-type-caret{opacity:.55}
.fsdb-schema-type-menu{z-index:70;display:flex;flex-direction:column;min-width:160px;max-height:240px;overflow:auto;padding:4px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:var(--dsw-shadow)}
.fsdb-schema-type-option{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;text-align:left;cursor:pointer}
.fsdb-schema-type-option:hover,.fsdb-schema-type-option.is-on{background:var(--dsw-hover)}
.fsdb-prop-val{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-label-3)}
.fsdb-prop-val .fsdb-plain-input,.fsdb-prop-val .fsdb-link,.fsdb-prop-val .fsdb-meta,.fsdb-prop-val .fsdb-file,.fsdb-prop-val .fsdb-file-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-prop-val .fsdb-plain-input{text-overflow:ellipsis}
.fsdb-prop-val .fsdb-plain-input:focus{text-overflow:clip}
.fsdb-prop-val .fsdb-link{display:block;overflow-wrap:normal}
.fsdb-detail-title-row{display:flex;align-items:flex-start;gap:12px;min-width:0;padding-bottom:16px}
.fsdb-detail-title-block{position:relative;display:flex;flex:1;min-width:0;flex-direction:column;gap:6px}
.fsdb-detail-actionbar{position:sticky;top:calc(100% - 35px);z-index:26;display:flex;justify-content:center;width:100%;height:0;min-height:0;overflow:visible;pointer-events:none}
.fsdb-page.is-plugins .fsdb-detail-actionbar{top:calc(100% - 55px)}
.fsdb-detail-actions{pointer-events:auto;display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;margin:0;padding:0;background:transparent;transform:translateY(-100%)}
.fsdb-page .fsdb-detail-actions .dock-icon-btn,.fsdb-page .fsdb-detail-actions .tasks-icon-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:1px solid var(--dsw-border);border-radius:50%;background:var(--dsw-hover-strong);color:var(--dsw-icon);cursor:pointer;box-shadow:none}
.fsdb-page .fsdb-detail-actions .dock-icon-btn:hover:not(:disabled),.fsdb-page .fsdb-detail-actions .tasks-icon-btn:hover:not(:disabled){color:var(--dsw-icon-active);background:var(--dsw-hover-strong)}
.fsdb-page .fsdb-detail-actions .dock-icon-btn:disabled,.fsdb-page .fsdb-detail-actions .tasks-icon-btn:disabled{opacity:1;cursor:default}
.fsdb-page .fsdb-detail-actions .dock-icon-btn svg,.fsdb-page .fsdb-detail-actions .tasks-icon-btn svg{width:16px;height:16px}
.fsdb-detail-title-icon-wrap{position:relative;flex:none}
.fsdb-detail-icon-slot{position:relative;z-index:24;width:100%;margin:-42px 0 8px;pointer-events:none}
.fsdb-detail-icon-slot > *{pointer-events:auto}
.fsdb-detail-title-icon{display:inline-flex;align-items:center;justify-content:center;width:78px;height:78px;margin:0;border:0;border-radius:18px;padding:0;background:transparent;color:var(--dsw-icon);font-size:64px;line-height:1;overflow:visible}
.fsdb-detail-title-icon svg{width:64px;height:64px;color:var(--dsw-icon)}
button.fsdb-detail-title-icon{cursor:pointer}
button.fsdb-detail-title-icon:hover{background:color-mix(in srgb,var(--dsw-hover) 80%,transparent);color:var(--dsw-icon-active)}
.fsdb-detail-title-icon .fsdb-record-emoji{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:64px;line-height:1}
.fsdb-detail-title-icon .fsdb-record-mark.is-lg{width:78px;height:78px;display:inline-flex;align-items:center;justify-content:center}
.fsdb-detail-title-icon .sidebar-mascot,
.fsdb-detail-title-icon .sidebar-mascot svg{width:64px!important;height:64px!important}
.fsdb-record-mark{display:inline-grid;place-items:center;flex:none;overflow:hidden;line-height:0}
.fsdb-record-mark.is-sm{width:16px;height:16px}
.fsdb-record-mark.is-lg{width:32px;height:32px}
.fsdb-crumbs .fsdb-record-mark.is-sm,.fsdb-crumb-option .fsdb-record-mark.is-sm{width:14px;height:14px}
.fsdb-record-mark .sidebar-mascot{display:block}
.fsdb-detail-title{min-width:0;height:auto;max-height:none;overflow:visible;overflow-wrap:anywhere;word-break:break-word;margin:0;color:var(--dsw-label);font-size:32px;font-weight:700;line-height:1.2}
.fsdb-detail-title-input{display:block;box-sizing:border-box;width:100%;height:auto;max-height:none;margin:0;border:0;background:transparent;color:inherit;font:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;outline:none;padding:0;resize:none;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;field-sizing:content}
.fsdb-detail-title-row .fsdb-detail-title-input{flex:none}
.fsdb-page .tasks-icon-btn.is-danger:hover{background:color-mix(in srgb,var(--dsw-danger) 16%,transparent);color:var(--dsw-danger)}
.fsdb-detail-id{font-size:14px;font-weight:600;font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-detail-doc{width:100%;min-height:180px;border:0;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;line-height:1.65;outline:none;resize:none;padding:8px 0 0;margin:0}
.fsdb-detail-extras{display:flex;flex-direction:column;gap:20px;margin-top:8px;padding-top:16px;border-top:1px solid var(--dsw-border)}
.fsdb-detail-extra-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;font-weight:700;color:var(--dsw-label)}
.fsdb-detail-extra-count{font-size:11px;font-weight:700;color:var(--dsw-label-3)}
.fsdb-plain-input{width:100%;border:0;border-radius:6px;padding:4px 6px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;outline:none}
.fsdb-plain-input::placeholder{color:var(--dsw-placeholder)}
.fsdb-plain-input:hover,.fsdb-plain-input:focus{background:var(--dsw-hover)}
.fsdb-cellselect{display:inline-flex;position:relative;min-width:0;max-width:100%;box-sizing:border-box;vertical-align:middle}
.fsdb-cellselect-trigger{display:inline-flex;align-items:center;max-width:none;height:22px;border:0;border-radius:4px;padding:0 6px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;line-height:22px;cursor:pointer;text-align:left}
.fsdb-cellselect-trigger:hover,.fsdb-cellselect-trigger[data-open]{background:transparent}
.fsdb-cellselect-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-cellselect-caret{flex:none;opacity:.55;color:var(--dsw-label-2)}
.fsdb-cellselect-trigger.is-empty{max-width:none;color:var(--dsw-label-3);background:transparent;font-weight:600}
.fsdb-cellselect.is-field{display:block;width:100%}
.fsdb-cellselect.is-field .fsdb-cellselect-trigger{display:flex;justify-content:space-between;gap:6px;width:100%;max-width:none;min-height:28px;border:1px solid var(--dsw-border);border-radius:7px;padding:5px 8px;background:var(--dsw-input);color:var(--dsw-label)}
.fsdb-page .fsdb-query-menu .fsdb-cellselect.is-field .fsdb-cellselect-trigger{max-width:100%;overflow:hidden}
.fsdb-page .fsdb-query-menu .fsdb-cellselect-trigger .biu-tag{max-width:100%;min-width:0}
.fsdb-cellselect.is-field .fsdb-cellselect-trigger:hover,.fsdb-cellselect.is-field .fsdb-cellselect-trigger[data-open]{background:var(--dsw-hover);filter:none}
.fsdb-cellselect.is-field .fsdb-cellselect-trigger.is-empty{color:var(--dsw-label-3)}
.fsdb-cellselect-menu{box-sizing:border-box;padding:6px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow);display:flex;flex-direction:column;gap:4px}
.fsdb-cellselect-search{display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-border);border-radius:8px;padding:4px 8px;color:var(--dsw-label-3);background:var(--dsw-input)}
.fsdb-cellselect-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;outline:none}
.fsdb-cellselect-options{display:flex;flex-direction:column;gap:1px;max-height:220px;overflow:auto}
.fsdb-cellselect-option{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:6px;padding:5px 6px;background:transparent;color:var(--dsw-label);font:inherit;cursor:pointer;text-align:left}
.fsdb-cellselect-option:hover,.fsdb-cellselect-option.is-selected{background:color-mix(in srgb,var(--dsw-business) 12%,transparent)}
.fsdb-cellselect-empty{padding:8px;color:var(--dsw-label-3);font-size:14px}
.fsdb-tokens{position:relative;display:flex;min-width:0;width:100%;max-width:100%;vertical-align:middle}
.fsdb-tokens.is-empty{display:flex;width:100%;min-width:0;align-self:stretch}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty),.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty){position:relative}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty) .fsdb-cell{display:flex;width:100%;min-height:100%;align-self:stretch}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty) .db-cell-multi.is-empty,.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty) .fsdb-tokens.is-empty{position:absolute;inset:0;width:auto;height:auto;max-width:none}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty) .db-cell-multi-box,.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty) .fsdb-tokens-box{width:100%;height:100%;min-height:100%;box-sizing:border-box}
.fsdb-tokens-box{display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;min-height:20px;border-radius:6px;padding:0;cursor:pointer}
.fsdb-tokens-box.is-empty{display:flex;width:100%;min-height:22px}
.fsdb-tokens-box:hover{background:var(--dsw-hover)}
.fsdb-token{display:inline-flex;align-items:center;gap:2px;height:22px;border-radius:4px;padding:0 6px;font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-label);background:rgba(255,255,255,.08);white-space:nowrap}
.fsdb-tokens-option{display:block;width:100%;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;text-align:left;cursor:pointer}
.fsdb-tokens-option:hover{background:var(--dsw-hover)}
.fsdb-tokens-empty{padding:8px;color:var(--dsw-label-3);font-size:14px}
.fsdb-checkrow{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
.fsdb-checkrow:hover,.fsdb-checkrow.is-on{background:var(--dsw-hover)}
.fsdb-checkrow.is-on{color:var(--dsw-business);font-weight:600}
.fsdb-checkrow.is-locked{cursor:default;opacity:.72}
.fsdb-checkrow.is-locked:hover{background:transparent}
.fsdb-checkrow-label{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;min-width:0}
.fsdb-checkrow-icon{display:inline-flex;flex:none;align-items:center;color:var(--dsw-label-3)}
.fsdb-checkrow-gap{width:14px;flex:none}
.fsdb-checkrow.is-on .fsdb-checkrow-icon{color:var(--dsw-business)}
.fsdb-dlg-backdrop{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.fsdb-dlg{width:min(360px,calc(100vw - 32px));background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);padding:16px;display:flex;flex-direction:column;gap:12px}
.fsdb-dlg-title{font-size:14px;font-weight:700;color:var(--dsw-label)}
.fsdb-dlg-body{display:flex;flex-direction:column;gap:8px}
.fsdb-dlg-body p{margin:0;font-size:14px;line-height:1.6;color:var(--dsw-label-2)}
.fsdb-dlg-input{width:100%;box-sizing:border-box;border:none;border-radius:8px;padding:8px 10px;background:var(--dsw-input);color:var(--dsw-label);font:inherit;font-size:14px;outline:none}
.fsdb-dlg-error{font-size:14px;color:var(--dsw-danger)}
.fsdb-dlg-actions{display:flex;justify-content:flex-end;gap:8px}
.fsdb-dlg-cancel,.fsdb-dlg-ok{border-radius:8px;padding:6px 14px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.fsdb-dlg-cancel{border:none}
.fsdb-dlg-cancel:hover{background:var(--dsw-hover)}
.fsdb-dlg-ok{border:1px solid var(--dsw-business);background:var(--dsw-business);color:var(--dsw-bg)}
.fsdb-dlg-ok.is-danger{border-color:var(--dsw-danger);background:var(--dsw-danger);color:var(--dsw-bg)}
.fsdb-dlg-ok:disabled,.fsdb-dlg-cancel:disabled{opacity:.6;cursor:default}
.fsdb-empty,.fsdb-muted,.fsdb-meta,.fsdb-inspector-empty{color:var(--dsw-label-2)}
.fsdb-action-btn{display:inline-flex;align-items:center;justify-content:center;height:26px;margin:0;border:0;border-radius:6px;padding:0 8px;background:var(--dsw-hover);color:var(--dsw-label);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.fsdb-action-btn:hover{background:var(--dsw-hover)}
.fsdb-page .tasks-table td.is-cell-on{box-shadow:inset 0 0 0 2px var(--dsw-pick,#5b9fd6);position:relative;z-index:3}
.fsdb-page .tasks-table td.is-cell-on.is-cell-ro{box-shadow:inset 0 0 0 2px var(--dsw-label-3)}
.fsdb-page .tasks-table td:has(.db-cell-select),.fsdb-page .tasks-table td:has(.db-cell-multi),.fsdb-page .tasks-table td:has(.fsdb-cellselect),.fsdb-page .tasks-table td:has(.fsdb-tokens),.fsdb-page .tasks-table td:has(.fsdb-ref-chips),.fsdb-page .tasks-table td:has(.biu-tags),.fsdb-page .tasks-table td:has(.fsdb-person-list){min-width:0;white-space:normal}
.fsdb-page .tasks-table td:has(.db-cell-select) .fsdb-cell,.fsdb-page .tasks-table td:has(.db-cell-multi) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-cellselect) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-tokens) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-ref-chips) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-person-list) .fsdb-cell,.fsdb-page .tasks-table td:has(.biu-tags) .fsdb-cell{display:flex;flex-direction:row;flex-wrap:wrap;width:100%;max-width:100%;min-height:100%;align-self:stretch;align-items:center}
.fsdb-page .tasks-table td .db-cell-select,.fsdb-page .tasks-table td .db-cell-multi,.fsdb-page .tasks-table td .fsdb-cellselect,.fsdb-page .tasks-table td .fsdb-tokens{display:flex;width:100%;max-width:none;min-width:0}
.fsdb-page .tasks-table td .db-cell-select-trigger,.fsdb-page .tasks-table td .fsdb-cellselect-trigger{width:100%;max-width:none;justify-content:space-between;background:transparent}
.fsdb-page .tasks-table td .db-cell-multi-box,.fsdb-page .tasks-table td .fsdb-tokens-box{width:100%;max-width:none;background:transparent}
.fsdb-page .tasks-table td .db-cell-multi-box:hover,.fsdb-page .tasks-table td .db-cell-multi-box[aria-expanded="true"]{background:transparent}
.fsdb-page .tasks-table:not(.is-wrap) .biu-tags,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-tokens-box,.fsdb-page .tasks-table:not(.is-wrap) .db-cell-multi-box,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person-list,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-pop-host:has(.biu-tags),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-pop-host:has(.fsdb-person-list){display:flex;flex-direction:row;flex-wrap:wrap;width:100%;max-width:100%;min-width:0}
.fsdb-page .tasks-table.is-wrap .biu-tags,.fsdb-page .tasks-table.is-wrap .fsdb-tokens-box,.fsdb-page .tasks-table.is-wrap .db-cell-multi-box,.fsdb-page .tasks-table.is-wrap .fsdb-person-list,.fsdb-page .tasks-table.is-wrap .fsdb-pop-host:has(.biu-tags),.fsdb-page .tasks-table.is-wrap .fsdb-pop-host:has(.fsdb-person-list){display:inline-flex;flex-direction:row;flex-wrap:wrap;width:auto;max-width:100%;overflow-wrap:normal;word-break:normal;white-space:normal}
.fsdb-thumbs{display:inline-flex;align-items:center;gap:2px;min-width:0;max-width:100%}
.fsdb-fileview-imgs{display:flex;flex-wrap:wrap;gap:8px}
.fsdb-cell-pop{box-sizing:border-box;padding:8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:var(--dsw-shadow-lv2);display:flex;flex-direction:column;gap:8px;max-height:min(70vh,480px);overflow:auto;font-size:14px}
.fsdb-cell-pop.is-select,.fsdb-cell-pop.is-multi-select,.fsdb-cell-pop.is-facet,.fsdb-cell-pop.is-attachment,.fsdb-cell-pop.is-image,.fsdb-cell-pop.is-person,.fsdb-cell-pop.is-record-link,.fsdb-cell-pop.is-ref,.fsdb-cell-pop.is-multi-ref{min-width:280px;padding:8px}
.fsdb-cell-pop.is-string,.fsdb-cell-pop.is-title,.fsdb-cell-pop.is-number{padding:6px 8px}
.fsdb-cell-pop-tags{display:flex;flex-direction:column;gap:8px;min-width:0}
.fsdb-cell-pop-picked{display:flex;min-width:0}
.fsdb-cell-pop-text{box-sizing:border-box;width:100%;min-height:72px;margin:0;border:0;border-radius:6px;padding:4px 2px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;line-height:1.45;resize:vertical;outline:none}
.fsdb-cell-pop-url{box-sizing:border-box;width:100%;margin:0;border:0;border-radius:6px;padding:4px 2px;background:transparent;color:var(--dsw-label);font:inherit;font-size:14px;line-height:1.45;outline:none}
.fsdb-media-field{display:flex;flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:8px;min-width:0;width:100%;max-width:100%;min-height:22px;height:auto}
.fsdb-media-field.is-files{flex-direction:column;flex-wrap:nowrap;align-items:stretch;align-content:stretch}
.fsdb-media-preview{display:block;width:56px;height:56px;flex:none;object-fit:cover;border-radius:8px;background:var(--dsw-hover)}
.fsdb-media-thumb .ant-image-img{display:block;width:56px;height:56px;object-fit:cover;border-radius:8px}
.fsdb-media-thumbs{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;min-width:0}
.fsdb-media-thumb{position:relative;flex:none;line-height:0}
.fsdb-media-remove{position:absolute;top:-4px;right:-4px;display:grid;place-items:center;width:16px;height:16px;margin:0;border:0;border-radius:8px;padding:0;background:var(--dsw-sidebar);color:var(--dsw-label);cursor:pointer;box-shadow:0 0 0 1px var(--dsw-border)}
.fsdb-media-row{display:flex;align-items:center;gap:6px;min-width:0}
.fsdb-media-drop{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-height:72px;margin:0;border:1px dashed var(--dsw-border);border-radius:8px;padding:12px;background:transparent;color:var(--dsw-label-2);cursor:pointer}
.fsdb-media-drop.is-files{min-height:88px}
.fsdb-media-drop:hover,.fsdb-media-drop.is-over{border-color:var(--dsw-label-2);background:var(--dsw-hover);color:var(--dsw-label)}
.fsdb-media-pick{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0;border:0;border-radius:8px;padding:0;background:color-mix(in srgb,var(--dsw-hover) 80%,transparent);color:inherit;pointer-events:none}
.fsdb-media-pick.is-upload{width:32px;padding:0;justify-content:center}
.fsdb-media-pick-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-media-error{display:none}
.fsdb-person{display:inline-flex;flex-direction:row;align-items:center;gap:6px;flex:0 0 auto;width:auto;min-width:0;max-width:100%;white-space:nowrap}
.fsdb-person-list{display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:6px;min-width:0;width:auto;max-width:100%}
.fsdb-person.is-empty{color:var(--dsw-label-3)}
.fsdb-person-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-person-face{display:inline-flex;flex:none;line-height:0}
.fsdb-person-avatar{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;border-radius:50%;background:var(--dsw-hover);color:var(--dsw-label-2)}
.fsdb-person-pick{display:flex;flex-direction:column;gap:2px;min-width:0}
.fsdb-person-option{display:flex;align-items:center;gap:6px;width:100%;margin:0;border:0;border-radius:5px;padding:5px 6px;background:transparent;color:var(--dsw-label);font:inherit;cursor:pointer;text-align:left}
.fsdb-person-option:hover{background:var(--dsw-hover)}
.fsdb-person-option.is-selected{background:color-mix(in srgb,var(--dsw-pick) 14%,transparent)}
.fsdb-person-loading{display:flex;align-items:center;gap:6px;padding:6px;color:var(--dsw-label-3);font-size:12px}
.fsdb-pop-host,.fsdb-ref-host{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:4px;min-width:0;width:100%;min-height:22px;cursor:pointer}
.fsdb-pop-empty,.fsdb-detail-aside .fsdb-pop-empty{color:var(--dsw-label-3);font-size:14px;font-weight:600;user-select:none}
.fsdb-ref-chips{display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:4px;min-width:0;width:auto;max-width:100%}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-ref-chips{flex-wrap:nowrap}
.fsdb-page .tasks-table.is-wrap .fsdb-ref-chips{display:inline-flex;flex-direction:row;flex-wrap:wrap;width:auto;max-width:100%;overflow-wrap:normal;word-break:normal;white-space:normal}
.fsdb-ref-chip{display:inline-flex;flex-direction:row;align-items:center;gap:4px;flex:0 0 auto;width:auto;max-width:100%;margin:0;border:0;border-radius:4px;padding:1px 6px 1px 7px;background:var(--dsw-hover);color:var(--dsw-label);font:inherit;font-size:13px;line-height:20px;cursor:pointer;text-align:left;white-space:nowrap;overflow-wrap:normal;word-break:keep-all}
.fsdb-ref-chip:hover{background:color-mix(in srgb,var(--dsw-pick) 16%,transparent)}
.fsdb-ref-chip-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-underline-offset:2px}
.fsdb-ref-pick{display:flex;flex-direction:column;gap:6px;min-width:0}
.fsdb-ref-picked{display:flex;flex-wrap:wrap;gap:4px;align-items:center;align-content:flex-start;min-width:0;width:100%}
.fsdb-ref-picked-row{display:inline-flex;align-items:center;gap:2px;flex:none;width:auto;max-width:100%;min-width:0;border-radius:4px;padding:1px 2px 1px 4px;background:var(--dsw-hover)}
.fsdb-ref-picked-row .fsdb-ref-jump{flex:none;width:auto;max-width:100%;padding:2px 4px}
.fsdb-ref-row{display:flex;align-items:center;gap:4px;min-width:0;width:100%}
.fsdb-ref-row{border-radius:5px;padding:1px}
.fsdb-ref-row.is-on,.fsdb-ref-row:hover{background:var(--dsw-hover)}
.fsdb-ref-check{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;margin:0;border:1px solid var(--dsw-border);border-radius:4px;padding:0;background:transparent;color:var(--dsw-label);cursor:pointer}
.fsdb-ref-check.is-on{background:color-mix(in srgb,var(--dsw-pick) 22%,transparent);border-color:var(--dsw-pick)}
.fsdb-ref-jump{display:flex;align-items:center;gap:6px;min-width:0;flex:1;margin:0;border:0;border-radius:4px;padding:4px 4px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}
.fsdb-ref-jump:hover .fsdb-ref-title{text-decoration:underline;text-underline-offset:2px}
.fsdb-ref-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-ref-id{flex:none;color:var(--dsw-label-3);font-size:11px;font-variant-numeric:tabular-nums}
.fsdb-ref-x{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;margin:0;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dsw-label-3);font:inherit;cursor:pointer}
.fsdb-ref-x:hover{color:var(--dsw-label);background:var(--dsw-hover)}
.fsdb-ref-list{display:flex;flex-direction:column;gap:1px;max-height:240px;overflow:auto}
@media (max-width:900px){.fsdb-page{flex-direction:column}.fsdb-views{width:100%}}
.fsdb-share-wrap{position:relative;display:inline-flex}
.fsdb-share-panel{box-sizing:border-box;position:absolute;top:calc(100% + 6px);right:0;z-index:50;width:min(420px,calc(100vw - 16px));max-height:calc(100vh - 72px);overflow:auto;border:1px solid var(--dsw-border);border-radius:12px;background:var(--dsw-surface,var(--dsw-sidebar));color:var(--dsw-label);box-shadow:var(--dsw-shadow)}
.fsdb-share-panel *{box-sizing:border-box}
.fsdb-share-head{padding:16px 16px 12px}
.fsdb-share-head strong{display:block;font-size:14px;font-weight:700;color:var(--dsw-label)}
.fsdb-share-head p,.fsdb-share-perm{margin:4px 0 0;color:var(--dsw-label-2);font-size:12px;line-height:1.5;font-weight:500}
.fsdb-share-link-section{padding:0 16px 14px}
.fsdb-share-empty-title{margin:0;color:var(--dsw-label);font-size:13px;font-weight:650}
.fsdb-share-empty-copy{margin:3px 0 12px;color:var(--dsw-label-2);font-size:12px;line-height:1.45;font-weight:500}
.fsdb-share-publish,.fsdb-share-panel .fsdb-share-copy{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:34px;border:0;border-radius:7px;background:var(--dsw-pick,#2383e2);padding:0 12px;color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer}
.fsdb-share-publish{width:100%}
.fsdb-share-publish:hover,.fsdb-share-panel .fsdb-share-copy:hover{filter:brightness(.94)}
.fsdb-share-link-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.fsdb-share-link-field{display:flex;min-width:0;height:34px;align-items:center;gap:7px;border:1px solid var(--dsw-border);border-radius:7px;background:var(--dsw-input);padding:0 9px}
.fsdb-share-link-field svg{flex:none;color:var(--dsw-icon)}
.fsdb-share-link-field input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--dsw-label);font:inherit;font-size:12px;text-overflow:ellipsis}
.fsdb-share-panel .fsdb-share-copy{min-width:82px}
.fsdb-share-copy-note,.fsdb-share-stats{margin:8px 0 0;color:var(--dsw-label-3);font-size:12px;line-height:1.4;font-weight:500}
.fsdb-share-settings{border-top:1px solid var(--dsw-border);padding:12px 16px 6px}
.fsdb-share-settings h3{margin:0 0 4px;color:var(--dsw-label-3);font-size:12px;font-weight:650}
.fsdb-share-setting{display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:16px}
.fsdb-share-setting-copy{display:flex;min-width:0;flex-direction:column;gap:2px}
.fsdb-share-setting-copy strong{font-size:13px;font-weight:650}
.fsdb-share-setting-copy em{color:var(--dsw-label-2);font-size:12px;font-style:normal;font-weight:500;line-height:1.35}
.fsdb-share-toggle{position:relative;width:32px;height:18px;flex:none;border:0;border-radius:9px;background:var(--dsw-border);padding:0;cursor:pointer}
.fsdb-share-toggle span{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform 120ms ease}
.fsdb-share-toggle.is-on{background:var(--dsw-pick,#2383e2)}
.fsdb-share-toggle.is-on span{transform:translateX(14px)}
.fsdb-share-toggle:focus-visible{outline:2px solid var(--dsw-pick,#2383e2);outline-offset:2px}
.fsdb-share-pin{display:flex;height:34px;align-items:center;justify-content:space-between;margin:0 0 8px;border-radius:7px;background:var(--dsw-input);padding:0 8px 0 10px;color:var(--dsw-label-2);font-size:12px}
.fsdb-share-pin.is-collapsed{display:none}
.fsdb-share-pin strong{margin-left:5px;color:var(--dsw-label);font-size:13px;font-weight:700;letter-spacing:.12em}
.fsdb-share-pin button{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:6px;background:transparent;padding:5px 7px;color:var(--dsw-label);font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.fsdb-share-pin button:hover{background:var(--dsw-hover)}
.fsdb-share-footer{border-top:1px solid var(--dsw-border);padding:10px 16px 14px}
.fsdb-share-stop{width:100%;height:34px;border:1px solid var(--dsw-border);border-radius:7px;background:transparent;color:var(--dsw-danger);font:inherit;font-size:13px;font-weight:650;cursor:pointer}
.fsdb-share-stop:hover{border-color:var(--dsw-danger);background:color-mix(in srgb,var(--dsw-danger) 8%,transparent)}
.fsdb-share-publish:disabled,.fsdb-share-panel .fsdb-share-copy:disabled,.fsdb-share-stop:disabled{opacity:.5;cursor:default;filter:none}
.fsdb-share-error{margin:0 16px 12px;color:var(--dsw-danger);font-size:12px}
.fsdb-share-copy{border:0;border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;font-weight:650;cursor:pointer;background:transparent;color:var(--dsw-label)}
.fsdb-share-copy:hover{background:var(--dsw-hover)}
@media (max-width:360px){.fsdb-share-link-row{grid-template-columns:1fr}.fsdb-share-panel .fsdb-share-copy{width:100%}}
.fsdb-share-res-wrap{position:relative;display:inline-flex}
.fsdb-share-res-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:60;min-width:180px;padding:10px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow)}
.fsdb-share-res-pop p{margin:0;color:var(--dsw-label);font-size:13px;font-weight:600}
.fsdb-share-plugin-list{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.fsdb-share-page{position:fixed;inset:0;z-index:220;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-bg,#ffffff);color:var(--dsw-label,#2c2c2b)}
html.share .fsdb-crumb-menu.is-fixed,html.share .fsdb-cellselect-menu,html.share .fsdb-query-drag-overlay,html.share .fsdb-cell-pop,html.share .fsdb-emoji-picker.is-fixed,html.share .fsdb-pager-size-menu,html.share .db-search-menu,html.share .fsdb-dlg-backdrop{z-index:360!important}
html.share .fsdb-detail-float-nav,html.share .heading-outline-host:not(.is-sheet) .chat-outline{opacity:1}
.fsdb-share-record-nav{display:none;align-items:center;gap:2px;flex:none}
.heading-outline-host.is-sheet{inset:auto auto 16px 16px;width:auto;height:auto;z-index:30;pointer-events:auto}
.fsdb-share-outline-toggle{display:flex;width:36px;height:36px;align-items:center;justify-content:center;margin:0;border:1px solid var(--dsw-border);border-radius:10px;background:var(--dsw-sidebar);color:var(--dsw-icon);box-shadow:var(--dsw-shadow);cursor:pointer}
.fsdb-share-outline-toggle.is-open,.fsdb-share-outline-toggle:hover{color:var(--dsw-icon-active);background:var(--dsw-hover)}
.fsdb-share-outline-panel{position:absolute;left:0;bottom:calc(100% + 8px);z-index:31;min-width:200px;max-width:min(320px,calc(100vw - 32px));max-height:50vh;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:2px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:10px;box-shadow:var(--dsw-shadow)}
.fsdb-share-outline-item{display:block;width:100%;margin:0;border:0;border-radius:6px;padding:8px 10px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:600;text-align:left;cursor:pointer}
.fsdb-share-outline-item:hover{background:var(--dsw-hover)}
.fsdb-share-outline-item.is-h2{padding-left:18px;font-weight:550}
.fsdb-share-outline-item.is-h3{padding-left:28px;font-weight:500}
.fsdb-share-page .fsdb-right{min-height:0;flex:1}
.fsdb-share-page .fsdb-right-body:has(.tasks-main .fsdb-workspace){overflow:hidden}
.fsdb-share-page .fsdb-right-body:has(.tasks-main .fsdb-workspace)>*,.fsdb-share-page .fsdb-right-body:has(.tasks-main .fsdb-workspace) .fsdb-main{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}
.fsdb-share-page.fsdb-page{flex-direction:column;overflow:hidden}
.fsdb-share-page .chat-view-header{flex:none}
.fsdb-share-page .chat-view-header-left{min-width:0;flex:1;overflow:hidden}
.fsdb-share-page .chat-view-header-left .fsdb-crumbs{max-width:100%}
.fsdb-share-badge{margin-left:8px;border-radius:8px;padding:2px 8px;background:var(--dsw-hover);color:var(--dsw-label-2);font-size:11px;font-weight:700}
.fsdb-person-photo{width:18px;height:18px;border-radius:50%;object-fit:cover;flex:none}
.fsdb-share-owner-corner{position:absolute;right:16px;bottom:16px;z-index:8}
.fsdb-share-owner-face{display:block;width:36px;height:36px;border-radius:50%;object-fit:cover}
.fsdb-share-owner-card{position:absolute;right:0;bottom:calc(100% + 10px);width:260px;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:12px;box-shadow:var(--dsw-shadow)}
.fsdb-share-owner-card-head{display:flex;align-items:center;gap:10px;min-width:0}
.fsdb-share-owner-card-photo,.fsdb-share-owner-card-initial{width:40px;height:40px;border-radius:50%;flex:none;object-fit:cover}
.fsdb-share-owner-card-initial{display:grid;place-items:center;background:var(--dsw-hover);color:var(--dsw-label);font-size:16px;font-weight:650}
.fsdb-share-owner-card-copy{min-width:0}
.fsdb-share-owner-card-copy strong{display:block;color:var(--dsw-label);font-size:14px;font-weight:650}
.fsdb-share-owner-card-copy p{margin:4px 0 0;color:var(--dsw-label-2);font-size:12px;font-weight:500;line-height:1.45}
.fsdb-share-owner-extras:empty{display:none}
.fsdb-share-page .fsdb-dlg{margin:auto}
.fsdb-share-body{min-width:0;min-height:0;flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
.fsdb-share-page .fsdb-detail-stage{flex:1 0 auto;height:auto;overflow:visible}
.fsdb-share-list{min-height:0;padding:24px 0}
.fsdb-share-page .fsdb-share-list .tasks-table,.fsdb-share-list .tasks-table{width:max-content;min-width:100%}
.fsdb-share-list tr{cursor:pointer}
.fsdb-share-page .tasks-table tr{cursor:pointer}
.fsdb-share-gate{margin:auto;text-align:center}
.fsdb-share-loading{align-items:center;justify-content:center}
.fsdb-share-spinner{width:28px;height:28px;border:2px solid var(--dsw-border);border-top-color:var(--dsw-label);border-radius:50%;animation:fsdb-spin .7s linear infinite}
@media (max-width:720px){
.fsdb-share-page{--fsdb-share-pad:24px;--fsdb-check-gutter:0px}
.fsdb-share-page .fsdb-main > :not(.fsdb-page-banner),
.fsdb-share-page .fsdb-detail-main > :not(.fsdb-page-banner){padding-left:var(--fsdb-share-pad);padding-right:var(--fsdb-share-pad)}
.fsdb-share-page:not(.is-sheet) .fsdb-main > .fsdb-detail-title-row,
.fsdb-share-page:not(.is-sheet) .fsdb-main > .fsdb-detail-icon-slot,
.fsdb-share-page:not(.is-sheet) .fsdb-main > .tasks-toolbar{padding-left:var(--fsdb-share-pad);padding-right:var(--fsdb-share-pad)}
.fsdb-share-list{padding:var(--fsdb-share-pad) 0}
.fsdb-share-page .fsdb-banner-right{right:var(--fsdb-share-pad);max-width:calc(100% - 2 * var(--fsdb-share-pad))}
.fsdb-share-page .fsdb-main:not(:has(> .fsdb-page-banner)),
.fsdb-share-page .fsdb-detail-main:not(:has(> .fsdb-page-banner)){padding-top:var(--fsdb-share-pad)}
.fsdb-share-record-nav{display:inline-flex}
.fsdb-share-page .fsdb-detail-float-nav{display:none}
.fsdb-share-page .heading-outline-host:not(.is-sheet){display:none}
.fsdb-share-page .fsdb-detail-float-nav::before{display:none}
}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn:not(.is-active):not(.is-custom),
.fsdb-page .tasks-toolbar-right .tasks-refresh:not(.is-active){color:var(--dsw-icon)}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn.is-active,
.fsdb-page .tasks-toolbar-right .tasks-sort-btn.is-custom,
.fsdb-page .tasks-toolbar-right .tasks-refresh.is-active{color:var(--dsw-icon-active)}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn svg,
.fsdb-page .tasks-toolbar-right .tasks-refresh svg{color:inherit;fill:currentColor;opacity:1}
.fsdb-page .tasks-viewdd-btn svg,.fsdb-page .tasks-viewtab svg{color:var(--dsw-icon)!important;fill:currentColor;opacity:1}
.fsdb-page .tasks-viewtab.is-active svg,.fsdb-page .tasks-viewdd-btn.is-active svg{color:var(--dsw-icon-active)!important}
.fsdb-page .tasks-table thead .tasks-th svg,.fsdb-page .tasks-table thead .fsdb-field-bool-glyph{color:var(--dsw-icon)!important;fill:currentColor;opacity:1}
.fsdb-page .tasks-table thead .tasks-th.is-on svg,.fsdb-page .tasks-table thead .tasks-th.is-on .fsdb-field-bool-glyph{color:var(--dsw-icon-active)!important}
`

export function ensureFsdbStyle() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== CSS) style.textContent = CSS
}
