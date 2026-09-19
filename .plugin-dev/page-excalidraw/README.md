# Excalidraw 画板

在页面编辑器里用 `/` 插入画板。场景 JSON 存在 `.biu/assets`，页面正文只留 `file` 引用。缩小预览，放大后才能编辑。无头插件：不占运行窗口，关掉后斜杠里不再出现画板块。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 示例写法

围栏头：`kind=excalidraw plugin=page-excalidraw`。围栏体是 JSON，`file` 指向页面资源（`assets/….json`）。不要把整份场景嵌进围栏。

```md
:::pageBlock {kind=excalidraw plugin=page-excalidraw}
{
  "file": "assets/画板-demo.json"
}
:::
```

斜杠插入会自动生成新的 `assets/画板-<短id>.json` 并在首次打开时建空场景。代写已有画板时，只改 `file` 指向已有资源，或先把场景 JSON 写到对应 page 附件再引用。写入页面用 `db_content` 对应 page 的 markdown。
