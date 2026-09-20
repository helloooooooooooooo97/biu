# 页面目录

在页面里用 `/` 插入目录块：扫描当前页正文的 h1–h3，点击条目平滑跳到对应标题。无头插件，不占运行窗口。建议放在页面最开头。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 示例写法

围栏头：`kind=toc plugin=page-toc`。围栏体是 JSON：`title` 为卡片标题。

```md
:::pageBlock {kind=toc plugin=page-toc}
{
  "title": "目录"
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换。斜杠插入时编辑器会补 `id=`；手写围栏可省略 `id`。
