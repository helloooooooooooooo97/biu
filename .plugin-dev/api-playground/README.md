# API 调试块（api-playground）

**长在文档里的 Mini-Postman。** 在页面里用 `/` 插入一个块，填 `method / url / headers / body`，点「发送」，
host 侧用 Node 的 `fetch` **真发** HTTP 请求，把**状态码 / 耗时 / 响应头 / 响应体**画回块里。

- 两个视角：**请求**（headers / body 编辑） ↔ **响应**（状态码、耗时、大小、响应头、响应体，JSON 自动美化）。
- **请求历史（最近 20 条）写进块数据 `data.history`**，跟着文档走——不是跟着浏览器走，也能被 agent 读。
- 安全边界：只放行 `http:` / `https:`；**15s 超时**；响应体超过 **200 KB 截断**并在块里标出「已截断」。
- 无头插件（`headless: true`）。host 侧只注册一条路由：`POST /api/api-playground/send`。

## 示例写法

围栏头写 `kind` / `plugin`，围栏体是 JSON 块数据（method / url / headers / body 都可省）：

```md
:::pageBlock {kind=api-play plugin=api-playground}
{
  "method": "GET",
  "url": "http://127.0.0.1:3141/api/page-terminal/shell",
  "headers": "Content-Type: application/json",
  "body": ""
}
:::
```

可写字段：

| 字段 | 说明 |
|---|---|
| `method` | `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` |
| `url` | 必填，只允许 `http:` / `https:` |
| `headers` | 原始多行文本，一行一个 `Key: Value`，`#` 开头当注释 |
| `body` | 请求体文本（`GET` / `HEAD` / `OPTIONS` 不发 body） |
| `history` | 最近 20 条请求记录（method/url/headers/body/status/ms/bytes/preview），点一条可载回 |
| `last` | 最后一次响应（状态码、耗时、响应头、响应体），刷新页面后块里仍能看到 |

## HTTP 路由

```sh
# 直接调（不用打开页面）
curl -X POST http://127.0.0.1:3141/api/api-playground/send \
  -H 'Content-Type: application/json' \
  -d '{"method":"GET","url":"http://127.0.0.1:3141/api/page-terminal/shell"}'
# → {"ok":true,"status":200,"statusText":"OK","ms":1,"bytes":701,"truncated":false,
#    "headers":{...},"body":"{\"terms\":[...]}"}

# 探活
curl http://127.0.0.1:3141/api/api-playground/health
```

出错也返回 200，`ok:false` + `error`（前端好统一渲染）：
`只允许 http/https，收到 file:`、`URL 解析失败：…`、`请求超时（15000ms）`、`fetch failed`。

## 踩过的坑

- 块数据（`data`）会写进页面 markdown，所以**别把 200KB 响应体整段塞进 `last`**：代码里 `last.body` 截到 20 000 字、历史条目只留 4 000 字 `preview`。
- 前端不能 `import react`：用 `globalThis.React`；host 侧要用 `ctx.http.route` 得先 `inject = ['http']`。
- 字段改动是**失焦时才写回文档**（`onBlur` / 发送），否则每敲一个字都会产生一次文档事务。
