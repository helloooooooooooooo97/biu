# 视频编排

在页面里用 `/` 插入时间轴。编排语言是 **标签语法**。预览在文档里实时合成；**改脚本请点全屏**，避免和页面拖动抢手势。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。围栏体就是 `<video>` 脚本，不要包 JSON。

## 语法

根必须是 `<video>`。子标签顺序即时间轴。`caption` / `zoom` 用 `at` 叠层。

| 标签 | 作用 | 常用属性 |
|---|---|---|
| `<video>` | 画布 | `fps` `size=1280x720` |
| `<title>` | 全屏标题卡 | `dur` `bg` `ink` `trans=cut\|fade\|slide` |
| `<scene>` | 色块场景 | 同上 |
| `<caption>` | 叠字幕 | `at` `dur` `ink` |
| `<media />` | 附件视频/图 | `src` `dur` `fit` `trans` |
| `<zoom />` | 镜头 | `at` `dur` `cx` `cy` `depth` |

## 示例写法

围栏头：`kind=video plugin=page-video`。围栏体直接写标签脚本。

```md
:::pageBlock {kind=video plugin=page-video}
<video fps=30 size=1280x720>
  <title dur=2.2s bg=#111111 ink=#f6f2ea trans=fade>Biu</title>
  <scene dur=3.4s bg=#1a1a2e trans=slide>Compose with tags.</scene>
  <zoom at=2.4s dur=0.8s cx=0.46 cy=0.38 depth=1.7 />
  <media src=demo.mp4 dur=3.2s fit=cover trans=fade />
</video>
:::
```

写入页面用 `db_content`。斜杠输入 `video` 插入。
