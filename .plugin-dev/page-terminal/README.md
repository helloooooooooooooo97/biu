# 页面终端

在页面里用 `/` 插入**真实可交互的终端块**。每个块拥有独立 PTY 会话，会自动适配块尺寸；页面卸载时会话仍保留，插件停用时才统一关闭。无头插件，不占运行窗口。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 示例写法

围栏头：`kind=terminal plugin=page-terminal`。围栏体是 JSON：`title`（标题，可省）、`height`（终端高度像素，默认 240）。

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "title": "终端",
  "height": 260
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换。斜杠插入时编辑器会补 `id=`；手写围栏可省略 `id`。

## 结构

- `host.ts`：注册 WebSocket 端点 `/ws/page-terminal`，用 node-pty 拉起交互 zsh（补齐 Unix PATH，不用登录壳）；
维护**会话池**（见下）；转发输入输出与尺寸。
- `web.tsx`：`pageEditor.registerBlock({ kind: 'terminal' })` 注册块；
xterm + FitAddon 渲染 + 历史采集 + 历史面板。

## MySQL 批处理 API

宿主保留独立的非交互 MySQL 接口：

- `GET /api/page-terminal/mysql/bin`：检查本机 MySQL 客户端。
- `POST /api/page-terminal/mysql`：以 batch 模式执行 SQL；请求体为 `{ sql, conn, timeoutMs? }`。

连接密码只通过 `MYSQL_PWD` 子进程环境变量传递，不放进命令行；接口拒绝 `\!`、`system` 和 `source` 等客户端 shell 指令。交互操作仍建议直接在 PTY 中运行 `mysql`。

## 会话池（关页面不丢状态）

前端只是「显示层」，**关掉前端不该杀掉后端进程**。


| 操作            | 行为                                         |
| ------------- | ------------------------------------------ |
| 刷新 / 切页 / 块卸载 | 连接断开，**进程保留**，可重连                          |
| 重开页面 / 同一块    | 按 `sid` **连回同一个 shell**（`cd`、`export` 都还在） |
| 插件停用 / 卸载     | 杀掉全部会话                                     |
| 超过 50 个会话     | LRU 淘汰最久没被连接的                              |


**会话键** `sid` 存在块数据里（`:::pageBlock` 的 JSON 中），跟着 markdown 走，
所以块在哪个页面、什么时候打开，都能连回它自己的 shell。

**重连回放**：后端为每个会话保留最近 `MAX_BUFFER_BYTES`（512KB）的输出字节，
重连时先发 `ESC[2J ESC[3J ESC[H` 清屏，再把最近 `MAX_REPLAY_LINES`（200 行）字节重放，
然后接上实时流。按行截取时会避开残缺的 ANSI 序列。

## 历史记录（写进块数据，供 agent 读）

每次回车算一条命令，记录 `{ cmd, at, out? }`，写回块数据的 `history` 字段：

```json
"history": [
  { "cmd": "cd ..", "at": 1789292949505 },
  { "cmd": "ls",    "at": 1789292950106, "out": "LICENSE\ndocs\n..." }
]
```

- 上限 **200 条**；每条输出最多前 **10 行** / 600 字符
- 采集自 xterm 的 `onData`（纯用户按键，不受提示符格式影响）
- 输出里会**剔掉泄露进来的下一条提示符**（`isPromptLike` 启发式判断）
- 历史在 UI 上是**独立面板**（默认折叠），不往 xterm 里塞内容 —— 避免干扰真实 shell 输出

## 实现注意事项（血泪总结，改前必读）

xterm 在编辑器容器里跑，比独立页面麻烦得多：

1. **helper-textarea 不能 `display:none`** —— 那是 xterm 接收键盘输入的节点，隐藏后会失去焦点，**整个终端打不了字**。要用「移出屏幕 + 透明 + 1px」的方式藏。
2. **不能压 `.xterm-helpers`，也不能 `display:none` 字符测量元素** —— 测量元素住在 `.xterm-helpers` 里，压掉后它量不出字符宽度（width=0），**字间距错乱、光标消失**。
3. **顶部若出现一行"会自己变的乱码"（`%%%%`/`zzzz`/`vvvv`）** —— 那是字符测量元素里的占位文本显形了。祖先的 `transform` / `backdrop-filter` 会改变定位包含块，让它的 `left:-119988px` 失效。修法：`opacity:0`（**不要** `clip-path: inset(100%)`：Chrome 里 `getBoundingClientRect()` 会变成 0，字格宽度为 0，提示符叠在最左边，历史却还能记到命令）。
4. **PTY 输出可能是 WebSocket 二进制帧** —— `event.data` 不是 string 时不能丢成 `''`，要按 ArrayBuffer/Blob 解码再 `term.write`。
5. **PTY 列数必须等于 xterm 列数** —— zsh 的提示符擦行序列宽度依赖列数，不一致会在屏幕上残留一行反显 `%`。要带实测尺寸建连、连发几次 resize、并监听 `term.onResize`。
6. **不要往 PTY 写清屏序列** —— shell 开着 echo，会被原样回显成 `^[[2J` 乱码。清屏用前端 `term.reset()`。
7. **向 head 注入 `<style>` 不要写「已存在同 id 就 return」** —— 旧版本留下的同 id 标签会一直挡着，新样式永远不生效。每次覆盖内容，并清理旧标签。
8. **改完代码要 pack + 重载** —— 宿主不会自动重新 import 已挂载的插件。
9. **可见纵向滑块不能靠 viewport 原生条** —— `.xterm-screen` 的 canvas 盖住滚动条。滚轮仍走 viewport；右侧 `.pt-scroll-rail` 是叠在 canvas 上的自定义滑块，跟 `buffer.viewportY` 同步。
