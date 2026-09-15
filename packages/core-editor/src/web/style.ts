import { TAG_TONE_ROSE } from '@biu/public-ui'

export const PAGE_EDITOR_STYLE = `
.page-editor{position:relative;overflow:visible;min-width:0;width:100%;padding:6px 0 48px;padding-left:0;color:var(--dsw-label);font-family:var(--font-sans);font-size:15px;line-height:1.7;letter-spacing:-.003em}
.page-editor.is-source{font-family:var(--font-mono);font-size:14px;letter-spacing:0}
.page-source{min-width:0;width:100%}
.page-source .cm-editor{background:transparent}
.page-source .cm-focused{outline:none}
.page-source .cm-editor.cm-focused>.cm-scroller>.cm-selectionLayer .cm-selectionBackground,.page-source .cm-selectionLayer .cm-selectionBackground{background:color-mix(in srgb,var(--dsw-pick) 40%,transparent)}
.page-editor .tiptap{outline:none;min-height:240px}
.page-block-handle{position:absolute;z-index:6;width:28px;display:flex;flex-direction:column;align-items:center;pointer-events:auto}
.page-block-handle-grip{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:26px;margin:0;border:0;border-radius:6px;padding:0;background:transparent;color:#EFEEEC;cursor:grab}
.page-block-handle-grip:hover,.page-block-handle-grip:focus-visible{background:var(--dsw-hover);color:#EFEEEC}
.page-block-handle-grip:active{cursor:grabbing}
.page-block-handle-dots{display:block;width:10px;height:16px;background-image:radial-gradient(circle,currentColor 1.35px,transparent 1.45px);background-size:5px 5.2px;background-position:0 0}
.page-block-handle-menu{position:absolute;left:26px;top:0;z-index:40;min-width:132px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:0 8px 28px rgba(15,15,15,.12)}
.page-block-handle-menu button{display:flex;align-items:center;gap:8px;width:100%;margin:0;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:600;text-align:left;cursor:pointer}
.page-block-handle-menu button:hover{background:var(--dsw-hover)}
.page-editor .tiptap>:first-child{margin-top:0}
.page-editor .tiptap p,.page-editor .tiptap h1,.page-editor .tiptap h2,.page-editor .tiptap h3,.page-editor .tiptap ul,.page-editor .tiptap ol,.page-editor .tiptap blockquote,.page-editor .tiptap pre{margin:2px 0}
.page-editor .tiptap p{min-height:1.7em}
.page-editor .tiptap h1{font-size:1.875em;font-weight:700;line-height:1.3;margin-top:.9em}
.page-editor .tiptap h2{font-size:1.5em;font-weight:650;line-height:1.3;margin-top:.75em}
.page-editor .tiptap h3{font-size:1.25em;font-weight:650;line-height:1.3;margin-top:.6em}
.page-editor .tiptap [data-heading-plugin]{border-radius:8px}
.page-editor .page-block{margin:12px 0;position:relative;z-index:0;isolation:isolate;overflow:hidden}
.page-editor .page-block iframe{pointer-events:none}
.page-editor .page-block.ProseMirror-selectednode iframe{pointer-events:auto}
.page-editor .page-block.ProseMirror-selectednode{outline:none;box-shadow:none}
.page-editor .ProseMirror[contenteditable=false] .ProseMirror-selectednode{outline:none;box-shadow:none;background:transparent}
.page-editor .page-block[data-page-block=excalidraw]{outline:none;box-shadow:none;border:0;border-radius:8px}
.page-editor .page-block-missing{display:flex;flex-direction:column;gap:0;padding:12px 14px;border:1px dashed var(--dsw-border);border-radius:8px;color:var(--dsw-label-3);font-size:13px}
.page-editor .page-block-missing-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 10px;margin:0 0 10px;border-bottom:1px solid var(--dsw-border)}
.page-editor .page-block-missing-id{font-family:var(--font-mono);font-weight:600;color:#F0EFED}
.page-editor .page-block-missing-state{color:#7B7B79;font-size:13px;font-weight:600}
.page-editor .page-block-missing-enable{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;margin:0;border:0;border-radius:5px;padding:0;background:transparent;color:#F0EFED;cursor:pointer}
.page-editor .page-block-missing-enable:hover{background:var(--dsw-hover)}
.page-editor .page-block-missing-enable-icon{display:block;width:14px;height:14px}
.page-editor .tiptap ul,.page-editor .tiptap ol{padding-left:1.6em;list-style-position:outside}
.page-editor .tiptap ul{list-style-type:disc}
.page-editor .tiptap ol{list-style-type:decimal}
.page-editor .tiptap ul ul{list-style-type:circle}
.page-editor .tiptap ul ul ul{list-style-type:square}
.page-editor .tiptap li{display:list-item;margin:1px 0}
.page-editor .tiptap li p{min-height:0;margin:0}
.page-editor .tiptap blockquote{margin-left:0;padding-left:14px;border-left:3px solid var(--dsw-border);color:var(--dsw-label-2)}
.page-editor .tiptap hr{border:0;border-top:1px solid var(--dsw-border);margin:18px 0}
.page-editor .tiptap img{display:block;max-width:100%;height:auto;margin:8px 0;border-radius:8px}
.page-editor .tiptap table{width:100%;margin:8px 0;border-collapse:collapse;table-layout:fixed}
.page-editor .tiptap th,.page-editor .tiptap td{border:1px solid var(--dsw-border);padding:6px 8px;vertical-align:top}
.page-editor .tiptap th{background:var(--dsw-hover);font-weight:650;text-align:left}
.page-editor .tiptap .selectedCell{background:color-mix(in srgb,var(--dsw-business) 14%,transparent)}
.page-editor .tiptap div[data-type=block-math].tiptap-mathematics-render{margin:8px 0;overflow-x:auto}
.page-editor .tiptap .tiptap-mathematics-render--editable{cursor:pointer}
.page-editor .tiptap span[data-type=inline-math]{display:inline;margin:0;padding:0 .12em;line-height:inherit;vertical-align:baseline;overflow:visible;cursor:pointer}
.page-editor .tiptap span[data-type=inline-math] .katex{font-size:1em}
.page-editor .tiptap .block-math-error,.page-editor .tiptap .inline-math-error{color:var(--dsw-label-3);font-family:var(--font-mono);font-size:13px}
.page-editor .tiptap code{display:inline;padding:.12em .35em;border-radius:4px;background:var(--dsw-hover);font-family:var(--font-mono);font-size:.9em}
.page-editor .tiptap pre{position:relative;display:block;margin:8px 0;padding:10px 12px;border:1px solid var(--dsw-border);border-radius:10px;background:var(--dsw-chat-code-bg,var(--dsw-sidebar));overflow-x:auto;white-space:pre;font-family:var(--font-mono)}
.page-editor .tiptap pre[data-language]::before{content:attr(data-language);display:block;margin:0 0 6px;color:#7B7B79;font-size:11px;font-weight:600;line-height:1;letter-spacing:.02em}
.page-editor .tiptap pre code,.page-editor .tiptap pre code.hljs{display:block;padding:0;background:transparent;color:inherit;font-size:13px;line-height:1.6;white-space:inherit}
.page-editor pre.page-block-missing-source{margin:0;max-height:220px;overflow:auto;padding:10px 12px;border:1px solid var(--dsw-border);border-radius:8px;background:var(--dsw-chat-code-bg,var(--dsw-sidebar));color:var(--dsw-label-2);font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.page-editor .tiptap a{color:var(--dsw-business);text-underline-offset:2px}
.page-editor .tiptap span.mention,.page-editor .tiptap span.mention:has(.biu-tag){display:inline;padding:0;background:transparent;color:inherit}
.page-editor .tiptap span.mention .biu-tag,.page-editor .tiptap span.mention .composer-tool-chip.is-pick,.page-editor .tiptap span[data-type=mention].biu-tag{height:1.7em;line-height:1.7em;cursor:pointer}
.page-slash .pick-kind-icon{flex:none;width:14px;height:14px;color:var(--dsw-label-2)}
.page-editor .tiptap p.is-editor-empty:first-child::before,
.page-editor .tiptap .is-empty::before{content:attr(data-placeholder);float:left;height:0;pointer-events:none;color:var(--dsw-placeholder)}
.page-bubble{z-index:80;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);box-shadow:0 8px 28px rgba(15,15,15,.12),0 0 0 1px color-mix(in srgb,var(--dsw-border) 70%,transparent);border-radius:10px;overflow:hidden}
.page-slash{position:fixed;z-index:10000;width:240px;max-height:min(52vh,280px);padding:4px;display:flex;flex-direction:column;gap:0;overflow:hidden;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);box-shadow:0 8px 28px rgba(15,15,15,.12);border-radius:8px}
.page-slash-head,.page-slash-empty{padding:6px 8px 4px;color:var(--dsw-label-3);font-size:11px;font-weight:600}
.page-slash-head{flex:none;padding:6px 8px 2px}
.page-slash-list{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:1px}
.page-slash-group{display:flex;flex-direction:column;gap:1px}
.page-slash-item{display:flex;align-items:center;gap:8px;width:100%;margin:0;box-sizing:border-box;border:1px solid transparent;border-radius:6px;padding:4px 6px;background:transparent;color:var(--dsw-label);font:inherit;text-align:left;cursor:pointer}
.page-slash-item:hover,.page-slash-item.is-active{background:var(--dsw-hover);border-color:var(--dsw-border)}
.page-slash-icon{flex:none;display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:0;background:transparent;color:var(--dsw-label-2);font-size:11px;font-weight:700;line-height:1}
.page-slash-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;line-height:1.2}
.page-slash-keys{flex:none;color:var(--dsw-label-3);font-size:12px;font-weight:500}
.page-slash-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:2px;padding:6px 8px 4px;border-top:1px solid var(--dsw-border);color:var(--dsw-label-3);font-size:12px;font-weight:500}
.fsdb-right:has(.page-find-slot){position:relative}
.page-find-slot{position:absolute;right:12px;z-index:40;display:flex;justify-content:flex-end;pointer-events:none}
.page-find{display:flex;justify-content:flex-end;margin:0;pointer-events:none}
.page-find-box{pointer-events:auto;display:flex;align-items:center;gap:4px;min-width:240px;max-width:min(360px,100%);padding:4px 6px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:0 8px 24px rgba(15,15,15,.16)}
.page-find-icon{flex:none;width:14px;height:14px;color:#7B7B79}
.page-find-input{flex:1 1 auto;min-width:0;margin:0;border:0;padding:4px 4px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;outline:none}
.page-find-count{flex:none;min-width:2.4em;color:#7B7B79;font-size:12px;font-weight:600;text-align:right}
.page-find-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:0;border:0;border-radius:5px;padding:0;background:transparent;color:#EFEEEC;cursor:pointer}
.page-find-btn:hover{background:var(--dsw-hover)}
@keyframes page-agent-edit-fade{
  0%,55%{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent)}
  100%{color:inherit;background:transparent}
}
.page-agent-edit{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent);border-radius:2px;animation:page-agent-edit-fade 8s ease forwards}
.page-editor .page-agent-edit,.page-editor .page-agent-edit *{color:${TAG_TONE_ROSE}}
.page-source .page-agent-edit{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent);border-radius:2px;animation:page-agent-edit-fade 8s ease forwards}
.page-find-hit{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent);border-radius:2px}
.page-find-hit.is-current{background:color-mix(in srgb,${TAG_TONE_ROSE} 34%,transparent)}
.page-editor .page-find-hit:not(.page-block),.page-editor .page-find-hit:not(.page-block) *{color:${TAG_TONE_ROSE}}
.page-editor .page-block.page-find-hit{color:inherit;background:transparent;box-shadow:0 0 0 2px color-mix(in srgb,${TAG_TONE_ROSE} 55%,transparent)}
.page-editor .page-block.page-find-hit.is-current{box-shadow:0 0 0 2px ${TAG_TONE_ROSE}}
.page-bubble{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;max-width:min(420px,calc(100vw - 48px))}
.page-bubble button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;border:0;border-radius:6px;padding:0 7px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.page-bubble button:hover,.page-bubble button.is-on{background:var(--dsw-hover)}
.page-bubble button.is-on{color:var(--dsw-business)}
.page-bubble-chat{gap:4px;padding:0 8px}
.page-bubble-chat-icon{display:block;width:14px;height:14px;flex:none}
.page-bubble-letter{font-size:12px;font-weight:800;line-height:1;border-bottom:2px solid currentColor}
.page-bubble-mark{display:block;width:12px;height:12px;border-radius:3px;border:1px solid var(--dsw-border);box-sizing:border-box}
.page-color-menu{z-index:90;width:168px;padding:8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:0 8px 24px rgba(15,15,15,.16)}
.page-color-menu-h{padding:0 2px 6px;color:var(--dsw-label-3);font-size:11px;font-weight:600}
.page-color-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.page-color-grid button{min-width:0;width:32px;height:32px;padding:0;border:1px solid var(--dsw-border);border-radius:6px;font-size:13px;font-weight:800}
.page-color-grid button.is-on{box-shadow:0 0 0 2px var(--dsw-business)}
.page-color-clear{width:100%;margin:8px 0 0;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-align:left}
.page-color-clear:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.page-math-pop{position:fixed;z-index:10000;min-width:220px;max-width:min(360px,calc(100vw - 16px));padding:6px 8px;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);border-radius:8px;box-shadow:0 8px 24px rgba(15,15,15,.16)}
.page-math-pop-input{display:block;width:100%;margin:0;border:0;padding:2px 0;background:transparent;color:var(--dsw-label);font-family:var(--font-mono);font-size:13px;line-height:1.45;outline:none;resize:none}
.page-editor .tiptap mark{border-radius:2px;padding:0 .08em}
.page-blocks-view{min-width:0;min-height:0;flex:1;overflow:auto;padding:8px 12px 32px;display:flex;flex-direction:column;gap:20px}
.page-blocks-view-card{min-width:0;display:flex;flex-direction:column;gap:8px}
.page-blocks-view-head{display:flex;align-items:center;gap:10px;min-width:0}
.page-blocks-view-title{flex:1;min-width:0;margin:0;border:0;padding:0;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:650;outline:none;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page-blocks-view-meta{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.page-blocks-view-kind{color:var(--dsw-label-3);font-size:12px;font-weight:600}
.page-blocks-view-page{max-width:220px;margin:0;border:0;padding:2px 0;background:transparent;color:var(--dsw-label-2);font:inherit;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.page-blocks-view-page:hover{color:var(--dsw-label)}
.page-blocks-view-zoom,.page-blocks-view-open{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;margin:0;border:0;padding:0;border-radius:6px;background:transparent;color:var(--dsw-label-3);cursor:pointer}
.page-blocks-view-zoom:hover,.page-blocks-view-open:hover{background:var(--dsw-hover);color:var(--dsw-label)}
.page-blocks-view-zoom svg,.page-blocks-view-open svg{width:14px;height:14px}
.page-blocks-view .page-block{margin:0}
.page-blocks-view .page-block iframe{pointer-events:auto}
.page-blocks-detail{padding:0 0 32px}
`
