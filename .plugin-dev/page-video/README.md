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
<timeline fps=30 size=1920x1080>
  <track name=main>
    <clip src=shot-02.png dur=4.4s desc="数据页" />
    <clip src=shot-08.png dur=4.4s desc="表视图" />
    <title dur=3.1s desc="标题卡">I am Biu.</title>
  </track>
  <track name=music kind=audio>
    <audio src=bgm.mp3 dur=42.1s volume=0.32 />
  </track>
  <track name=voice>
    <audio id=q1 src=v-q1.mp3 dur=1.13s />
    <audio id=no src=v-no.mp3 dur=1.68s at="q1.end + 0.7s" />
  </track>
  <track name=subtitle layer=4>
    <caption follow=q1 offset="-0.15s,+0.5s">Are you Notion?</caption>
    <caption follow=no offset="-0.15s,+0.5s">No.</caption>
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
