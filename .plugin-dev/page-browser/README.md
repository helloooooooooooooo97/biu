# 浏览器（page-browser）

一个插件两处入口：

- 页面里 `/browser` **卡片**：iframe 嵌网页，可放大。
- 右侧检查器 **浏览器** 栏：Electron 里是原生 Chromium（不受 X-Frame-Options 限制），可点选 DOM 做成 `<pick>`。

站点禁止嵌入时，卡片会提示；点工具条跳转或「侧栏打开」，会打开检查器浏览器并继续访问同一地址。没有 Electron 时退回系统浏览器标签。

地址栏不是链接时会按搜索词打开 DuckDuckGo。对话里搜网页用 `web_search`，读某个链接用 `web_fetch`（对齐 Claude / Codex / DSH：搜和读是两个工具）。

## 示例写法

页面卡片围栏如下。

围栏头：`kind=browser plugin=page-browser`。

```md
:::pageBlock {kind=browser plugin=page-browser}
{
  "url": "https://example.com",
  "height": 420
}
:::
```