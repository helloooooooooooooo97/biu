# 插件体检（plugin-doctor）

页面块插件：在文档里插入一块「插件体检」，点一下按钮就扫描仓库 `.plugin/` 下所有**已安装**插件，给出一张体检表。

**扫什么**

- 每个插件的 `id` / 显示名 / 是否 `headless`
- 有没有 `host.js`、有没有 `web.js`（入口齐全度）
- 文件总大小、文件数
- 最近运行时间（读 `.plugin/store.json` 的 `lastRunAt`，以及是否在 `enabled` 里）
- README 里有没有 `:::pageBlock` 示例写法（页面块插件的必备项）
- 结论：`合规` / `缺 README 示例` / `缺引擎` / `空插件`（鼠标悬停结论可看具体问题）

**结果存在哪**：点「体检」后整份报告写进块自己的 `data.report`（就是围栏体里的 JSON）。所以这是一份**数据**，不是一次性日志：刷新页面、以只读态分享出去，看到的还是上次那份体检结果。

**HTTP 接口**（宿主侧 `inject = ['http']`）：

```
GET /api/plugin-doctor/scan   ->   { scannedAt, root, total, summary, plugins: [...] }
```

**文件**

- `host.ts` —— 注册 `/api/plugin-doctor/scan`：读 `.plugin/*/manifest.json` + 各文件大小 + `store.json`，算出结论
- `web.tsx` —— 注册页面块 `kind=plugin-doctor`（斜杠菜单「开发工具 › 插件体检」）

**怎么用**：编辑页面时输入 `/`，选「插件体检」；或者照下面的围栏直接写进 markdown。

## 示例写法

:::pageBlock {kind=plugin-doctor plugin=plugin-doctor}
{
  "report": null
}
:::

体检过一次之后，围栏体里会带上结果（节选）：

```md
:::pageBlock {kind=plugin-doctor plugin=plugin-doctor}
{
  "report": {
    "scannedAt": 1789446000000,
    "root": "/path/to/biu-harness",
    "total": 7,
    "summary": { "ok": 4, "warn": 3, "broken": 0, "bytes": 420000 },
    "plugins": [
      { "id": "page-terminal", "conclusion": "合规", "headless": true, "hasHost": true, "hasWeb": true }
    ]
  }
}
:::
```

## 注意

- 只读态展示上次结果，不显示「体检」按钮；结果不会因为只读就消失。
- 结论只按**能核对的事实**给，不做猜测；要加新规则改 `host.ts` 的 `diagnose()`。
