export const MEMBER_AUTH_STYLE = `
.member-auth{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:var(--dsw-bg,#111);color:var(--dsw-label,#eee)}
.member-auth-card{width:min(360px,calc(100vw - 32px));display:flex;flex-direction:column;gap:12px;padding:24px;border:1px solid var(--dsw-border,#333);border-radius:12px;background:var(--dsw-sidebar,#1b1b1b)}
.member-auth-card h1{margin:0;font-size:18px}
.member-auth-card p{margin:0;color:var(--dsw-label-3,#888);font-size:13px}
.member-auth-card label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600}
.member-auth-card input{border:1px solid var(--dsw-border,#333);border-radius:8px;padding:8px 10px;background:transparent;color:inherit;font:inherit}
.member-auth-card button{border:0;border-radius:8px;padding:8px 12px;background:var(--dsw-business,#2563eb);color:#fff;font:inherit;font-weight:650;cursor:pointer}
.member-auth-card button:disabled{opacity:.5}
.member-auth-switch{background:transparent !important;color:var(--dsw-label-2,#bbb) !important;font-weight:600 !important}
.member-auth-error{color:#f43f5e;font-size:13px}
.member-account{position:fixed;top:10px;right:16px;z-index:50;display:flex;align-items:center;gap:8px;pointer-events:auto}
.member-account span{font-size:13px;font-weight:650}
.member-account button{border:0;border-radius:6px;padding:4px 8px;background:transparent;color:var(--dsw-label-2,#bbb);font:inherit;font-size:12px;cursor:pointer}
.member-toolbar{display:flex;align-items:center;gap:6px}
.member-toolbar-copied{color:var(--dsw-label-3,#888);font-size:12px}
`
