# Electron 外壳（侧栏浏览器）

给现有的 web 应用套一层 Electron 皮，并在右侧栏叠一个**原生 `BrowserView`**，
于是侧栏里就是一个真 Chromium：**任意站点都能开**，不再受 `X-Frame-Options` /
CSP `frame-ancestors` 限制（那是 iframe 才有的约束）。

## 为什么这样能行

| | iframe（网页方案） | `BrowserView`（本方案） |
|---|---|---|
| 请求形态 | 被嵌入 | **顶层导航** |
| 对方站的 `X-Frame-Options` | 生效，直接拒 | **不参与判断** |
| 能否读 DOM | 跨域读不到 | ✅ 自己的视图，随便读 |
| 流畅度 | 取决于网页 | **原生渲染，60fps** |

跟 Cursor / VS Code 右侧那个浏览器是同一套原理。

## 跑起来

```bash
npm run electron:dev     # 编译 electron/main.ts，host/vite 已在跑就复用，否则自己起
```

窗口里就是你现在的界面。macOS 红绿灯会让开左侧品牌行，不再叠在导航上。右侧栏点 `+` 选「浏览器」（要先开一个会话）。第一次启动会 pack + start `page-browser`。页面卡片里点跳转也会打开这一栏。

其它：

```bash
npm run dev              # 原来的网页版，照常可用（面板会提示需要 Electron）
npm run electron:build   # 先 vite build，再用 dist 起 Electron（不依赖 5173）
npm run electron:pack    # 打 dmg / exe / zip，见 docs/desktop-install.md
```

## 文件

| 文件 | 作用 |
|---|---|
| `main.ts` | 主进程：`BrowserWindow` + `BrowserView` + IPC |
| `preload.cjs` | 只暴露一个很小的 `window.biuBrowser` 桥（网页拿不到 node/electron） |
| `tsconfig.json` | 给编辑器用的类型配置 |

## IPC 协议

渲染进程 → 主进程（`biu:browser:cmd`）：

```ts
{ type: 'bounds',  rect }     // 面板空位的矩形（CSS 像素，相对窗口内容区）
{ type: 'visible', visible }  // 面板被切走时收成 0 尺寸藏起来
{ type: 'navigate', url }
{ type: 'back' | 'forward' | 'reload' | 'stop' }
{ type: 'inspect', x, y }     // 视图内坐标 → 该点上的 DOM 节点
{ type: 'openExternal', url }
{ type: 'close' }
```

主进程 → 渲染进程：

```ts
'biu:browser:state'     // { url, title, canGoBack, canGoForward, loading }
'biu:browser:error'     // { code, desc, url } —— 来自 did-fail-load，是真实原因
'biu:browser:inspected' // { tag, id, className, text, html }
```

主进程是 TypeScript，启动前会 `tsc` 成 `electron/out/main.js` 再交给 Electron（它不能直接加载 `.ts`）。Linux 容器里会带 `no-sandbox`，否则 Chromium 沙箱起不来。

## 已知的粗糙处（要改就从这里下手）

1. **位置靠前端每 500ms 报一次矩形兜底**（外加 `ResizeObserver`）。
   `BrowserView` 是原生视图，不参与网页布局，所以只能这么对齐。窗口拖动时没有回调，
   这是那 500ms 轮询存在的原因；想更顺可以在主进程监听 `move` 一起重算。
2. **同一时间只开一个视图**（`view` 是单例）。要支持多个侧栏浏览器得改成 Map。
3. **没有做持久化**：页面登录态跟着 Electron 的默认 session 走，重启还在，
   但没做「每个面板独立分区」。
4. 面板被别的 tab 盖住时靠 CSS 的 `visibility: hidden` + 量到 0 矩形来隐藏，
   如果以后 CSS 改了（不再用 visibility），这招会失效。
