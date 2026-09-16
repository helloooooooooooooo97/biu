# 视频编排

在页面里用 `/` 插入时间轴预览。编排语言是 **标签语法**，不是散文。Agent 用 `video_script` 编译，再把结果写进页面块。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 语法

根必须是 `<video>`。子标签顺序即时间轴（`caption` 可用 `at` 叠在已有片段上）。

| 标签 | 作用 | 常用属性 |
|---|---|---|
| `<video>` | 画布 | `fps` `size=1280x720` 或 `w` `h` |
| `<title>` | 全屏标题卡 | `dur` `bg` `ink` `trans=cut\|fade\|slide` |
| `<scene>` | 色块场景 + 正文 | 同上 |
| `<caption>` | 叠字幕 | `at` `dur` `ink` |
| `<media />` | 页面附件画面 | `src` `dur` `fit=cover\|contain` |
| `<cut />` | 仅作脚本分隔，不占时间 | |

时间写成 `2.4s` 或毫秒 `800ms`。颜色用 `#111` / `#1a1a2e`。文本可写任意语言，**结构只能用这些英文标签**。

## 示例写法

围栏头：`kind=video plugin=page-video`。围栏体是 JSON，至少含 `script`。

```md
:::pageBlock {kind=video plugin=page-video}
{
  "script": "<video fps=30 size=1280x720>\n  <title dur=2.4s bg=#111111 ink=#f6f2ea trans=fade>Biu</title>\n  <scene dur=3.2s bg=#1a1a2e>Compose with tags, not prose.</scene>\n  <caption at=3.0s dur=2.0s>structured · timeline</caption>\n</video>"
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown。斜杠菜单输入 `video` 即可插入。
