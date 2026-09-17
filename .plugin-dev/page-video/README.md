# 视频编排

在页面里用 `/` 插入只读时间轴。Agent 用 **声明式标签**完成剪辑：`<timeline>` 里每条 `<track>` 是一层，轨内串行、轨间并行。前端只负责实时合成；不要手算绝对秒数去叠图层。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。围栏体就是 `<timeline>` 脚本，不要包 JSON，也不要再写旧的 `<video>` 根。

## 结构

| 标签 | 作用 |
|---|---|
| `<timeline>` | 画布。`fps` `size` `background` `wallpaper` `padding` `radius` `shadow` `description` |
| `<track>` | 一层。轨内默认首尾相接；`layer` 越大越靠上；`kind=video\|audio` 可选 |
| `<clip />` | 主画面素材。`src` `in` `dur` `speed` `crop` `available` |
| `<gap />` | 透明空缺，让下层透出，不是黑帧 |
| `<transition />` | 独立转场，吃掉相邻各一半时长，总时长不变 |
| `<solid />` `<gradient>` `<bars />` | 生成器素材，不用文件 |
| `<title>` `<scene>` | 标题卡 / 色块 |
| 标注 | `<text>` `<caption>` `<arrow>` `<blur>` `<box>` `<spotlight>` `<stamp>` `<cursor>` `<pip>` `<image>` `<zoom>` `<speed>` `<trim>` `<audio>` |
| `<composition id>` | 可复用片段，用 `<clip use=id />` 展开 |

时间：`4s`、`700ms`、`96f`（按 `fps` 换算，内部按帧吸附）。`at="q1.end + 0.7s"` 相对引用。`follow=q1 offset="-0.15s,+0.5s"` 把字幕绑到旁白。

## 示例

```md
:::pageBlock {kind=video plugin=page-video}
<timeline fps=30 size=1920x1080 background=#111111 padding=4 radius=12 description="演示片：串行主轨、并行标注、转场、跟读、关键帧">
  <composition id=sting>
    <track>
      <title dur=1.2s bg=#0f172a ink=#f8fafc enter="pop" align=center valign=middle>I am Biu.</title>
    </track>
  </composition>
  <track name=main>
    <clip use=sting />
    <transition enter="move(x:+100%)" exit="move(x:-100%)" dur=0.5s ease="easeInOut" desc="左推" />
    <title id=open dur=2.4s bg=#111111 ink=#f6f2ea enter="fadeUp" desc="开场">Motion is syntax.</title>
    <gap dur=0.4s />
    <scene dur=3s bg=#1a1a2e enter="fade">Agent writes the cut.</scene>
    <transition kind=dissolve dur=0.6s />
    <clip src=demo/hero.mp4 in=0.4s dur=4.8s speed=1.15 zoom="1→1.35→1.12" enter="fade+scale(1.06→1)">
      <mask shape=ellipse x=.5 y=.5 w=.92 h=.86 />
    </clip>
  </track>
  <track name=fx layer=4>
    <text at=1.4s dur=2.2s enter="fade+move(y:+24)" unit=char stagger=0.05s>Write once. Play everywhere.</text>
    <caption follow=vo offset="-0.15s,+0.45s">Are you a timeline?</caption>
    <cursor at=4.8s dur=2.6s x=.16 y=.78 x2=.74 y2=.32 click=1.4s />
    <pip src=demo/face.mp4 at=9s dur=3.2s x=.84 y=.78 w=.18 h=.26 shape=circle />
  </track>
  <track name=voice>
    <audio id=vo src=demo/vo.mp3 dur=2.1s volume=0.9 />
  </track>
  <track name=music kind=audio>
    <audio src=demo/bed.mp3 dur=18s volume=0.28 />
  </track>
</timeline>
:::
```

先跑 `video_script`：它会返回覆盖时长、重叠、空镜、follow 失效等诊断，再 `db_content` 写入围栏。

## 能力（声明式，不是调色台）

不做校色、LUT、跟踪、抠像、粒子、3D。剪辑软件里那些 **操作**（ripple / slip / 拖修剪）用改 `in`/`dur` 表达，轨内自动相接就是 ripple。

动效只有三种东西：**原子 + 缓动 + 编排**。组合符号 `+` 同时、`;` 先后。别名只是糖，会展开成原子。

```xml
<clip src=a.mp4 dur=5s enter="fade+move(y:+24)" ease="easeOut" zoom="1→1.6→1.2">
  <animate prop="x" from="0.3" to="0.7" delay="1s" dur="3s" ease="inOut" />
  <mask shape=ellipse x=.5 y=.5 w=.8 h=.8 />
</clip>

<transition enter="move(x:+100%)" exit="move(x:-100%)" dur=0.5s desc="左推" />
<text dur=4s enter="fade+move(y:+24)" unit="char" stagger="0.06s">一个字一个字地浮出来</text>
```

原子：`fade` `move` `scale` `rotate` `blur` `wipe` `clip` `flash` `glitch`。别名：`fadeUp` `fadeDown` `slideIn` `pop` `typewriter` `blurIn` `scaleIn`。

`<keyframes>` / `<k>` 写多段曲线。`prop`：`x` `y` `scale` `rotate` `opacity` `speed` `volume`。缓动：`linear` `easeIn/Out/InOut` `circ*` `back*` `anticipate` `spring(stiffness,damping)` `cubic(a,b,c,d)`。
