# 视频编排

在页面里用 `/` 插入只读时间轴。Agent 用 **标签语法**完成剪辑，前端只负责实时合成预览；不要求用户手动拖时间轴。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。围栏体就是 `<video>` 脚本，不要包 JSON。

## 语法

根必须是 `<video>`。子标签顺序即时间轴。`caption` / `zoom` 用 `at` 叠层。

| 标签 | 作用 | 常用属性 |
|---|---|---|
| `<video>` | 输出画布和录屏外观 | `fps` `size` `background` `wallpaper` `padding` `radius` `shadow` |
| `<title>` | 全屏标题卡 | `dur` `bg` `ink` `trans=cut\|fade\|slide` |
| `<scene>` | 色块场景 | 同上 |
| `<media />` | 主视频/图片 | `src` `in` `dur` `speed` `fit` `crop=x,y,w,h` `trans` |
| `<zoom />` | 平滑镜头 + 运动模糊 | `at` `dur` `cx` `cy` `depth` |
| `<text>` | 文字/字幕标注 | `at` `dur` `x` `y` `size` `color` `anim` |
| `<caption>` | 底部字幕 | `at` `dur` `ink` |
| `<arrow />` | 箭头标注 | `x` `y` `x2` `y2` `color` `width` |
| `<blur />` | 局部隐私模糊 | `x` `y` `w` `h` `amount` `shape` |
| `<cursor />` | 光标移动和点击反馈 | `x` `y` `x2` `y2` `click` `size` |
| `<pip />` | 摄像头画中画 | `src` `x` `y` `w` `h` `shape` |
| `<image />` | 图片/Logo 标注 | `src` `x` `y` `w` `h` `anim` |
| `<audio />` | 配音或音乐 | `src` `in` `at` `dur` `speed` `volume` |

坐标与尺寸使用 `0–1`；`at` 是输出时间，`in` 是素材入点。`anim` 支持 `fade`、`rise`、`pop`、`slide-left`、`typewriter`、`pulse`。

## 示例写法

围栏头：`kind=video plugin=page-video`。围栏体直接写标签脚本。

```md
:::pageBlock {kind=video plugin=page-video}
<video fps=30 size=1280x720 background=#dedbd3 padding=6 radius=18 shadow=28>
  <media src=demo.mp4 in=1.2s dur=6s speed=1.1 crop=0.05,0.05,0.9,0.9 />
  <zoom at=1.4s dur=.8s cx=.46 cy=.38 depth=1.7 />
  <text at=1.8s dur=2s x=.5 y=.82 size=30 anim=rise>Agent-directed video</text>
  <arrow at=2.2s dur=1.8s x=.22 y=.65 x2=.44 y2=.42 color=#7dd3fc width=5 />
  <cursor at=.6s dur=3s x=.12 y=.8 x2=.76 y2=.3 click=1.7s size=28 />
  <blur at=3s dur=2s x=.72 y=.2 w=.2 h=.14 amount=16 shape=rounded />
  <pip src=face.mp4 at=1s dur=5s x=.85 y=.76 w=.2 h=.28 shape=circle />
  <audio src=voice.mp3 dur=6s volume=.9 />
</video>
:::
```

Agent 用 `video_script` 先校验，再通过 `db_content` 写入围栏。时间轴不提供拖拽剪辑；脚本是唯一事实来源。
