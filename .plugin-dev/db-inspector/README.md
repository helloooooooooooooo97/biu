# 数据库巡检块（db-inspector）

在页面里用 `/` 插入一个块，点「跑巡检」，**真连本机 MySQL** 跑一组巡检 SQL（版本与运行时长、连接数与上限、慢查询计数、大表 TopN、无主键表、当前锁等待、复制状态），结果表格化展示在文档里，同时**存进块数据**（`report` + 近 10 次 `history`），所以能对比两次巡检的差异。

- 每条巡检独立跑，**单条失败不影响其它条**（失败项红字显示错误原因）。
- 前端 `POST /api/db-inspector/run`，可选 `conn`（host/port/user/password/database）、`extraChecks`（自定义巡检项 `[{id,label,sql}]`）。
- 另提供 `GET /api/db-inspector/bin` 查看 mysql 客户端探测结果。
- mysql 客户端路径用 `existsSync` 逐个探测（`/opt/homebrew/opt/mysql-client/bin/mysql` 等），并走 `ctx.sandbox.wrap({argv:[bin]})` 拿沙箱环境，不写死。
- 无头插件：不占运行窗口。

## 示例写法

围栏头：`kind=db-inspect plugin=db-inspector`。围栏体是 JSON，`conn` 是连接参数，可留默认（本机 `127.0.0.1:3306` / `root` / 测试库）。插入后点「跑巡检」即可，结果与历史都写在块数据里，**不要手写 `report`**。

```md
:::pageBlock {kind=db-inspect plugin=db-inspector}
{
  "conn": {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "Abc123456",
    "database": "scheduling_system"
  }
}
:::
```

可写字段：

- `conn`：`host` / `port` / `user` / `password` / `database`（`database` 决定大表、无主键表查哪个库）。
- `extraChecks`：`[{ "id": "bogus", "label": "查不存在的库", "sql": "SELECT COUNT(*) FROM no_such_schema.t" }]`，用于叠加自定义巡检项。
- `report` / `history`：**只由块自己写**，别手工填。
