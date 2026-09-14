# 页面对外分享：技术方案

状态：草案，待实现  
范围：把「工作台里的页面」变成可对内网同事、对外客户交付的只读成品，而不是把现有编辑器 URL 转发出去。

## 1. 问题

当前进程是单机工作台：

- HTTP 默认监听 `127.0.0.1:3141`（`HTTP_HOST` / `packages/host-http`）
- 开发态 UI 在 `5173`，Vite 把 `/api`、`/ws` 代理到本机 3141
- `/pages` 只有 `title` / `tags` / `notes` / `parentId` 等编辑字段，没有发布态
- `/api/db/*` 与 `/api/page/file/:name` 无鉴权；CORS 为 `Access-Control-Allow-Origin: *`
- 页面详情走 File System 详情壳，客户若打开同一地址会看到侧栏、Agent、全库接口

把 `HTTP_HOST=0.0.0.0` 只能解决「局域网能连上」。不能解决：客户不该进工作台、草稿不该外泄、附件不能按文件名枚举、分享链接必须可撤销。

## 2. 目标与非目标

### 目标（一期）

1. 工作台内对单页执行「发布 / 停止发布 / 复制链接」。
2. 访客用独立只读壳打开该页，不加载工作台路由、不持有 `/api/db` 写权限。
3. 同一套数据支持两种入口：内网工作台、公网成品页。
4. 链接可撤销；公开资源仅限该页引用过的附件。

### 非目标（一期不做）

- 多租户、客户账号、评论、协作编辑
- 把 Agent / 任务 / 插件暴露给访客
- 全文搜索公开站、站点级 CMS
- 将工作台整体放到公网并靠 IP 保密

## 3. 架构

```
[作者浏览器]                     [访客浏览器]
  工作台 SPA                       公开壳 SPA（或同包另一路由树）
  /pages/:id 编辑                  /p/:slug   或  /s/:token
        │                                  │
        │ /api/db/* （内部）               │ /api/public/pages/:id  （只读）
        │ /api/share/* （需工作台身份）     │ /api/public/file/:name （白名单）
        ▼                                  │
   host-http 3141 ─────────────────────────┘
        │
   core-page store（.page/*.md + sqlite 索引）
```

原则：

- **同一 host 进程、两套路由前缀。** 不先拆第二个服务，避免两套数据目录。
- **内部 API 与公开 API 物理隔离。** 公开壳不得调用 `/api/db`。
- **身份与发布态正交。** 内网能打开工作台 ≠ 所有页面对外可见。

## 4. 数据模型

页面行（`PagesStore` / `.page/<id>.md` YAML 头）新增字段。索引 sqlite 同步这些列，便于列表筛选「正在对外的页」。

| 字段 | 类型 | 说明 |
|------|------|------|
| `shareStatus` | `'draft' \| 'published'` | 默认 `draft` |
| `shareSlug` | `string` | 对外稳定路径，`/p/{slug}`；创建发布时生成，停用后保留以便再次发布 |
| `shareToken` | `string` | 可选私密令牌，用于 `/s/{token}`；哈希存储 |
| `shareTokenHash` | `string` | `sha256(token)`，明文 token 只在创建时返回一次 |
| `shareExpiresAt` | `number \| null` | Unix ms，空表示不过期 |
| `shareMode` | `'live' \| 'snapshot'` | `live` 读当前正文；`snapshot` 读冻结副本 |
| `shareSnapshotRev` | `string \| null` | 快照 id；一期可先只做 `live` |
| `publishedAt` | `number \| null` | 最近一次发布成功时间 |
| `shareRevokedAt` | `number \| null` | 停止发布时间 |

约束：

- `shareSlug`：`^[a-z0-9][a-z0-9-]{1,63}$`，工作区内唯一。
- 默认 slug：标题 slugify；冲突则后缀短随机段。
- `shareToken`：32 字节 CSPRNG，url-safe base64；库里只存 hash。
- 停止发布：`shareStatus=draft`，token hash 清空或轮换，slug 可保留。

快照（二期，接口预留）：`/.page/share-snapshots/<pageId>/<rev>.md`，发布时拷贝 `notes` 与当时引用的附件清单。

## 5. 路由与前端壳

### 5.1 工作台（现有）

- 继续：`/` 下 File System、Chat、Tasks。
- 页面详情 `chrome.DetailTools` 增加「分享」。
- 未配置 `PUBLIC_ORIGIN` 时，复制链接用 `window.location.origin`，并提示这是当前访问源（内网 IP 或 localhost）。

### 5.2 公开壳（新建）

独立路由树，**不挂** app-shell 侧栏、session、inspector。

| 路径 | 行为 |
|------|------|
| `/p/:slug` | 按 slug 解析已发布页；过期或未发布 → 404 页（不泄露草稿存在） |
| `/s/:token` | 按 token hash 查找；同样 404 |
| `/p/:slug` 下资源 | 只通过 `/api/public/...` 拉数据 |

实现建议：

- `web` 包增加 `public-page` 入口组件，在 `react-router` 最外层：若 `location.pathname` 匹配 `/p/` 或 `/s/`，只渲染公开壳。
- 公开壳按 markdown / page-block 只读渲染；复用现有只读渲染路径，禁用编辑器、bubble、pick。
- HTML 块、htmlframe 仍走现有沙箱策略，不新开任意脚本权限。

## 6. HTTP API

### 6.1 工作台（需内部身份；一期若无登录则为「能访问工作台网络的人」）

前缀 `/api/share`，由 `core-page` 注册。

`POST /api/share/pages/:id/publish`

```json
{
  "slug": "optional-custom",
  "mode": "live",
  "expiresAt": null,
  "issueToken": false
}
```

- 将页标为 published，必要时生成 slug。
- `issueToken: true` 时轮换 token，响应里带一次 `token` 明文。
- 返回：

```json
{
  "id": "p1",
  "status": "published",
  "slug": "proposal-q3",
  "publicUrl": "https://share.example.com/p/proposal-q3",
  "secretUrl": null,
  "expiresAt": null,
  "mode": "live"
}
```

`POST /api/share/pages/:id/revoke`

- `shareStatus=draft`，token 失效，公开 GET 变 404。

`GET /api/share/pages/:id`

- 工作台分享面板回显当前状态与 `publicUrl`（由 `PUBLIC_ORIGIN` 拼接）。

`publicUrl` 生成：

```
PUBLIC_ORIGIN 优先（无尾斜杠）
否则请求 Host
禁止把 127.0.0.1 当成对外 URL 写进剪贴板而不提示
```

### 6.2 公开只读（无工作台 cookie）

`GET /api/public/pages/by-slug/:slug`  
`GET /api/public/pages/by-token/:token`

响应（仅已发布且未过期）：

```json
{
  "id": "p1",
  "title": "...",
  "emoji": "",
  "banner": "...",
  "notes": "<markdown>",
  "updatedAt": 0,
  "assets": ["a.png"]
}
```

不返回：`facet` 内部字段、parent 树、其他页面 id 列表、agent 字段、未引用附件。

`GET /api/public/file/:name?page=<id>`

- `name` 必须落在该页 `collectPageAssetNames(notes, banner, blocks)` 白名单。
- 复用 `PagesStore.readAsset`，`cache-control: public, max-age=3600`，etag 保留。
- 未发布、过期、或不在白名单 → 404，不 403（避免探测）。

公开 API **禁止**：

- `/api/db/*`
- `PUT /api/page/file/:name`
- WebSocket `/ws` 业务频道（公开壳不连工作台 WS）

中间件：`host-http.dispatch` 增加路由分类。匹配 `/api/public/*` 与 `/p`/`/s` 静态入口的请求不要求内部身份；其余 `/api/*` 在开启 `SHARE_REQUIRE_AUTH=1` 后拒绝匿名（二期）。一期可先不强制登录，但公开路由仍然不得复用 db handler。

## 7. 权限与安全

| 风险 | 处理 |
|------|------|
| 客户打开工作台 | 公开壳独立路由；反向代理可不暴露 `/` 工作台 |
| 草稿外泄 | 仅 `shareStatus=published` 且未过期可解析 |
| 附件遍历 | 公开文件接口按页引用白名单 |
| Token 泄露 | 只存 hash；revoke 即失效；日志不打 token |
| 把 localhost 发给客户 | `PUBLIC_ORIGIN`；UI 在 origin 为 loopback 时警告 |
| CORS | 公开 API 可保持 GET + `*`；内部 API 收紧为工作台 origin（二期）。一期至少：公开 handler 不用现有 `send()` 把写接口一起放行的错觉——写接口仍在 `/api/db`，公开壳根本不调用 |
| SSRF / 页面块 | 公开渲染沿用现有 html 消毒与 htmlframe sandbox，不新增 `allow-same-origin` 写 cookie |

监听：

- 内网工作台：`HTTP_HOST=0.0.0.0`
- 公网：反向代理只反代公开路径（见 §9）

## 8. 工作台 UI

页面详情顶栏「分享」打开面板，不跳转站外：

1. 状态：未发布 / 已发布 / 已过期
2. 主按钮：发布并复制 / 复制链接
3. 次级：停止发布、生成私密链接（`/s/...`）、自定义 slug
4. 一期 `mode` 固定 live，UI 文案写明「客户看到的是当前正文」

复制内容为 `publicUrl` 或 `secretUrl` 字符串。

列表（可选同迭代）：`/pages` 增加「已发布」列或筛选，避免遗漏未收回的页。

## 9. 部署

### 9.1 仅内网同事看工作台

```
HTTP_HOST=0.0.0.0
PORT=3141
```

生产构建后由 host 提供静态 UI（`host-http` `publicDir`）。同事访问 `http://<lan-ip>:3141`。分享链接若也只给内网客户，`PUBLIC_ORIGIN=http://<lan-ip>:3141`。

开发态仍是 5173 代理 3141：局域网要看 Vite 时，需让 Vite `server.host=true`，且代理 target 不变。正式分享不依赖 Vite。

### 9.2 工作台内网 + 客户走域名

```
PUBLIC_ORIGIN=https://share.example.com
```

反向代理（示意）：

```
# 公网
share.example.com
  /p /s /api/public  → 127.0.0.1:3141
  /                  → 404 或静态「此链接无效」
  /api/db /ws /api/share → 不暴露

# 内网或 VPN
studio.internal
  / 与 /api /ws     → 127.0.0.1:3141 全量工作台
```

进程仍是一个 Node host。公网与内网是入口策略，不是两份数据库。

### 9.3 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `HTTP_HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `3141` | 监听端口 |
| `PUBLIC_ORIGIN` | 空 | 分享 URL 的对外 origin |
| `SHARE_DEFAULT_TTL_MS` | 空 | 发布默认过期；空为永不过期 |

## 10. 模块切分

| 模块 | 职责 |
|------|------|
| `core-page` host | 字段、publish/revoke、公开 GET、附件白名单 |
| `core-page` 或小包 `core-page-share` web | 分享面板 |
| `web-app-shell` / router | `/p` `/s` 走公开壳，短路工作台 |
| `host-http` | 可选：路由前缀分类；不把公开 404 与内部 401 混用 |
| `core-editor` | 只读 markdown / page-block 渲染复用；不在公开壳挂编辑 |

不把分享逻辑写进 `core-file-system` 通用详情，避免所有表都长出「对外 URL」。

## 11. 测试

- store：publish 改 YAML；revoke 后 by-slug 为空；过期页视为未发布
- slug 冲突、非法字符
- `collectPageAssetNames`：公开 file 只放行引用；未引用 404
- token：库中无明文；revoke 后旧 token 404
- HTTP：`/api/public/pages/by-slug/x` 在 draft 下 404；publish 后 200
- 前端：公开路径不渲染 shell rail；分享面板复制 `PUBLIC_ORIGIN` 拼接结果
- 构建：`npm run build` 后静态入口仍能匹配 `/p/:slug`（history fallback 须把 `/p/*` 回 index.html）

## 12. 实现顺序

1. 数据字段 + `PagesStore` 读写 + 单测
2. `/api/share/*` 与 `/api/public/*` + 单测
3. 公开壳路由与只读渲染
4. 详情「分享」面板
5. `PUBLIC_ORIGIN` 与生产静态 fallback
6. （可选）pages 列表已发布筛选、token 链接、TTL

一期完成的验收：作者在工作台点分享，客户用另一浏览器打开链接，只看到该页正文与引用图，不能列出其他页、不能调用 `db_update`。
