# 数据看板块（data-board）

页面里插一块**活报表**：绑一条 SQL + 一组 `{{参数}}`，点「重跑」就用真实 MySQL 取数，
用手写 SVG 横向柱状图或表格展示；块里一直留着「上次跑于 xx 时间 · xx 行」。

- 只读白名单：SQL 必须以 **SELECT / SHOW / DESCRIBE** 开头，且只能一条语句（`;` 拼接、`INTO OUTFILE`、`LOAD DATA` 一律 403）。
- 参数：SQL 里写 `{{start}}`，块上就出现 `start` 输入框；值按字面量转义后绑定，写不写引号都行（`'{{start}}'` 和 `{{start}}` 都能跑）。
- 呈现：`view: "chart"`（默认，手写 SVG 横向柱状图，画前 12 行）或 `"table"`（带表头的表格，可滚动）。
- 数据源：默认 `127.0.0.1:3306 / root / scheduling_system`，密码走 `MYSQL_PWD` 环境变量传给 mysql 客户端，不落命令行。
- 结果不写进文档正文，只把「时间戳 + 行数 + 耗时」快照写进 `lastRun`；**打开页面会自动重跑一次**，所以看到的永远是新的。

## 示例写法

```md
:::pageBlock {kind=data-board plugin=data-board}
{
  "sql": "SELECT schedule_type AS 排班类型, COUNT(*) AS 数量\nFROM schedules\nWHERE schedule_date >= '{{start}}' AND schedule_date <= '{{end}}'\nGROUP BY schedule_type\nORDER BY 数量 DESC",
  "params": { "start": "2026-02-01", "end": "2026-03-31" },
  "conn": { "host": "127.0.0.1", "port": 3306, "user": "root", "password": "Abc123456", "database": "scheduling_system" },
  "view": "chart"
}
:::
```

可写字段：`sql`（模板）、`params`（`{{名字}} → 值`）、`conn`（host / port / user / password / database）、
`view`（`chart` | `table`）、`valueCol`（可选，指定哪一列当数值；默认自动挑第一个全数字的列）、
`lastRun`（快照，由块自己写）、`data.valueCol` 之外无需其它配置。

换一期：只改 `params`（比如 `start` / `end`），或者直接说「把这块改成按月份汇总」让 agent 改 `sql` —— **在原块上改，不重做一份**。

无头插件（`headless: true`），没有窗口；数据接口是 `POST /api/data-board/query`。
