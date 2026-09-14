# 全局终端

模拟 macOS Terminal 的全局浮动终端窗口。基于 xterm.js + node-pty，每个窗口一个独立 PTY 会话，
可交互访问本机目录，支持缩放与全屏。

## 打开方式

插件商店卡片点「运行」即可弹出终端窗口。

## 结构

- `host.ts`：注册 WebSocket 端点 `/ws/global-terminal`，用 node-pty 拉起交互 zsh（补齐 Unix PATH），
转发输入输出与尺寸。
- `web.tsx`：xterm 渲染 + FitAddon 自适应 + 辅助节点压制 + 底部留白。

---

# 踩过的坑（都是血泪，勿重蹈）

xterm.js 在**宿主窗口里跑**（外层有 `transform` / `backdrop-filter` / `overflow:hidden` 等）
比在独立页面里跑要麻烦得多。以下每一条都是实际踩出来的，改之前务必读完。

## 1. `display:none` 会让终端打不了字

xterm 用一个隐藏的 `<textarea class="xterm-helper-textarea">` 接收键盘输入。

- **错误做法**：`display:none` 隐藏它。
→ 隐藏元素**无法获得焦点** → **整个终端无法输入**。
- **正确做法**：移出屏幕 + 透明 + 1px 尺寸，**保留可聚焦性**：
  ```js
  position: absolute; left: -9999px; top: 0;
  width: 1px; height: 1px; opacity: 0;
  color: transparent; caret-color: transparent; background: transparent;
  // 千万不要 display:none
  ```

## 2. 碰字符测量元素会让字间距错乱、光标消失

xterm 用 `.xterm-char-measure-element`（在 `.xterm-width-cache-measure-container` 里）
**测量每个字符的宽度**，里面塞着一坨占位字符（`%%%`、`vvv` 等，会不断变化）。

- **错误做法 A**：`display:none` 隐藏它。
→ 它从布局树消失 → 量不出宽度（`getBoundingClientRect().width === 0`）
→ **字间距错乱 + 光标画不出来**。
- **错误做法 B**：压它的父容器 `.xterm-helpers`。
→ 测量元素是 `.xterm-helpers` 的**子节点**，父容器被 `display:none`，子节点同样量不出宽度。

### 正确做法：`opacity: 0`

```js
opacity: 0;
pointer-events: none;
// 不要 clip-path: inset(100%) —— Chrome 里 getBoundingClientRect 宽高为 0
```


| 方式                           | 测量宽度    | 单元格宽度    | 结果           |
| ---------------------------- | ------- | -------- | ------------ |
| xterm 默认（`left:-119988px`）   | 231     | 7.22     | 在普通容器里正常     |
| `display:none`               | **0**   | —        | ❌ 字间距错乱、无光标  |
| `clip-path: inset(100%)`     | **0（Chrome）** | 0 | ❌ 提示符叠在最左边 |
| **`opacity: 0`**             | **231** | **7.22** | ✅ 测量正常且不可见 |


## 3. 顶部多出一行乱码 → 测量元素在宿主容器里显形了

**症状**：终端顶部多出一行字符，而且**会自己变**（`%%%%%` → `zzzzz` → `vvvvv`）。

**真身**：那行就是 `.xterm-char-measure-element` / `.xterm-width-cache-measure-container`
**里面的占位文本**，不是 shell 输出，也不是 PTY 字节问题。

**原因**：它默认靠 `left: -119988px` 藏到屏幕外，但它的**定位包含块**会被祖先的
`transform` / `filter` / `backdrop-filter` / `will-change` 改变；一旦包含块变了，
那个负偏移就可能不再把它送出可视区，于是那串占位字符就显示出来了。

**排查方法**（浏览器 Console）：

```js
const el = document.querySelector('.xterm-char-measure-element')
el.textContent            // 会打印 "%%%%%%%%%%%%%%%%..." —— 和屏幕顶部那行一致
el.getBoundingClientRect()
```

**修法**：见上面第 2 条，用 `opacity: 0`，不要 `clip-path`。

## 4. PTY 列数必须始终等于 xterm 列数

zsh 每次画提示符前会输出一段「反显 `%` + 填满整行的空格」来擦除上一行。
**这段序列的宽度 = 它认为的终端列数。**

只要 `PTY 列数 ≠ xterm 显示列数`，这行就填不满/撑爆，**反显的 `%` 会残留在屏幕上**。

- 建连接时带上实测尺寸：`?cols=${term.cols}&rows=${term.rows}`
- **连接建立后立刻同步尺寸，并补发几次**（尺寸可能晚一拍才稳定）：
  ```js
  const sync = () => ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
  sync(); setTimeout(sync, 50); setTimeout(sync, 200)
  ```
- **监听 `term.onResize`**，列数任何变化都同步给 PTY（`fit.fit()` 内部改列数时
不一定会触发 `ResizeObserver`）。
- 连接**延后到布局稳定**（双 `requestAnimationFrame`）再建，避免用错误尺寸启动 shell。

## 5. 不要往 PTY 写清屏序列

`session.write('\x1b[2J')` 之类**没用** —— PTY 的 shell 开着 echo，
你写进去的字节会被当作「用户输入」**原样回显**，屏幕上出现 `^[[2J` 之类的乱码。

清屏属于**显示层**的事，应该在前端用 xterm 自己的 API（`term.reset()` / `term.clear()`），
**不要经 PTY**。

## 6. 底部要留白

滚动到底时，最后一行会贴住窗口下边缘。给 xterm 外框加下内边距：

```css
.gt-pane .xterm { padding-bottom: 56px !important; box-sizing: border-box !important; }
```

FitAddon 计算行数时会**少算这几行**，底部自然空出约 3\~4 行，输出能顺畅「顶上去」。

（注意：给 `.xterm-scrollable-element` 加 padding 无效，会被 xterm 的行高计算覆盖。）

## 7. 改完必须真正重载插件

宿主的插件加载器有这层逻辑：

```js
for (const row of enabledRows) {
  if (forks.has(row.id)) continue   // 已加载的直接跳过
  ...
}
```

而「是否需要重新同步」的判定键是 `id + web 路径 + enabled + state`。
**反复 `start` 不会让改动生效**（这几个值没变，且 fork 已存在）。
改完代码要 **`uninstall` → `pack` → `start`**，才能真正重新加载。

（开发时很容易误判「改了没效果」，先确认这一步。）