# 视频编排

在页面里用 `/` 插入时间轴。编排语言是 **标签语法**。预览是 **前端实时合成**（和 [OpenScreen](https://github.com/siddharthvaddem/openscreen) 一样：时间轴时钟驱动舞台，`<media>` 走 HTMLVideoElement，`<zoom>` 做镜头，改脚本立刻上画面），不是先导出 mp4。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 语法

根必须是 `<video>`。子标签顺序即时间轴。`caption` / `zoom` 用 `at` 叠在已有片段上，不往后推时间。

| 标签 | 作用 | 常用属性 |
|---|---|---|
| `<video>` | 画布 | `fps` `size=1280x720` |
| `<title>` | 全屏标题卡 | `dur` `bg` `ink` `trans=cut\|fade\|slide` |
| `<scene>` | 色块场景 | 同上 |
| `<caption>` | 叠字幕 | `at` `dur` `ink` |
| `<media />` | 附件：视频实时播 / 图片定帧 | `src` `dur` `fit` `trans` |
| `<zoom />` | 镜头推进 | `at` `dur` `cx` `cy` `depth` |
| `<cut />` | 脚本分隔 | |

`cx`/`cy` 是 0–1 焦点。`depth` 是倍率（1–4）。时间 `2.4s` 或 `800ms`。

## 示例写法

围栏头：`kind=video plugin=page-video`。围栏体是 JSON，至少含 `script`。

```md
:::pageBlock {kind=video plugin=page-video}
{
  "script": "<video fps=30 size=1280x720>\n  <title dur=2.2s bg=#111111 ink=#f6f2ea trans=fade>Biu</title>\n  <scene dur=3.4s bg=#1a1a2e trans=slide>Compose with tags.</scene>\n  <zoom at=2.4s dur=0.8s cx=0.46 cy=0.38 depth=1.7 />\n  <media src=demo.mp4 dur=3.2s fit=cover trans=fade />\n</video>"
}
:::
```

写入页面用 `db_content`。斜杠输入 `video` 插入。点播放在块内实时合成；放大进入全屏。
