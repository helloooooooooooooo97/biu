# 页面回归检查块

页面里插一个块，配一组**断言**，点「跑一遍」逐条在真页面上执行，出 **通过 / 失败 / 耗时**；
结果写进块自己的 `data.runs`（留最近 10 次），并**自动和上一次对比**：上次失败这次通过标 `fixed`，反过来标 `broken`。

- 断言类型：`exists(选择器)`、`text(选择器, 期望文案)`、`count(选择器, 期望个数)`、`http(方法与 url, 期望状态码)`
- 前三种读当前页面的真 DOM；`http` 走 host 路由 `POST /api/page-regression/http`（host 侧真发请求，避开浏览器 CORS）
- 断言写在块里、跟着文档走：**下次点一下就能重跑**，不用重写用例
- `data.runs` 是结构化记录，可 diff 两次运行

斜杠菜单输入 `run`、`回归`、`regression`、`断言` 即可插入。

## 示例写法

:::pageBlock {kind=run plugin=page-regression}
{
  "asserts": [
    { "id": "a1", "type": "exists", "selector": "h1", "note": "标题存在" },
    { "id": "a2", "type": "text", "selector": "h1", "expect": "举例说明", "note": "标题文案" },
    { "id": "a3", "type": "count", "selector": "h1", "expect": "1", "note": "只有一个 h1" },
    { "id": "a4", "type": "http", "method": "GET", "url": "/api/db/stat?path=/pages/p005", "status": 200, "note": "页面可读" }
  ],
  "runs": []
}
:::

可写字段：

| 字段 | 说明 |
|---|---|
| `asserts[]` | 断言列表，每条含 `id` / `type` / `selector` / `expect` / `method` / `url` / `status` / `note` |
| `asserts[].type` | `exists` 元素存在、`text` 文案含子串、`count` 匹配个数等于期望、`http` 状态码等于期望 |
| `asserts[].expect` | `text` 填期望子串；`count` 填期望个数 |
| `asserts[].status` | `http` 的期望状态码，默认 200 |
| `runs[]` | 运行记录，块自己写：`{ at, ms, total, passed, failed, items[] }`，`items[].delta` 为 `fixed` / `broken` |

`runs` 由块在点击「跑一遍」后写回（host 会把它落回页面的 `:::pageBlock` 围栏体里），**不用手写**。

## host 路由

```
POST /api/page-regression/http   { method, url }  → { ok, status, statusText, ms, body }
GET  /api/page-regression/ping                     → { ok, plugin, at }
```
