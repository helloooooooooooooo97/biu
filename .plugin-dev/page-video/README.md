# 视频编排

在页面里输入 `/视频`，插入一段能直接播放的片子。默认片子逐句说明怎么改它：改标签里的字，画面就变；一条 `<track>` 是一层，同一层按顺序接，不同层同时播。

代写时把下面的围栏写进页面正文。围栏体就是 `<timeline>`，不要包 JSON，也不要再写旧的 `<video>` 根。

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
| `<component>` | React 组件逃生口。`src`/`from` 指向附件；也可内联函数源码 |
| `<AbsoluteFill>` | 铺满画布的弹性层，时间轴标签与组件内布局都能用 |
| `<composition id>` | 可复用片段，用 `<clip use=id />` 展开 |

时间：`4s`、`700ms`、`96f`（按 `fps` 换算，内部按帧吸附）。`at="q1.end + 0.7s"` 相对引用。`follow=q1 offset="-0.15s,+0.5s"` 把字幕绑到旁白。`desc` / `description` 是给人和 Agent 的备注，只出现在源码和时间轴上，**不渲染进画面**。

## 示例写法

两秒标题，接着四秒自己的视频文件。标题写在标签里，`dur` 是停留秒数。

```md
:::pageBlock {kind=video plugin=page-video}
<timeline fps=30 size=1920x1080 background=#191919 description="产品介绍">
  <track name=main layer=3>
    <title id=open dur=2s>这是标题</title>
    <clip src=片段.mp4 dur=4s />
  </track>
  <track name=music kind=audio>
    <audio src=assets/bgm.mp3 at=0s dur=6s volume=.7 />
  </track>
</timeline>
:::
```

`片段.mp4` 先放到这一页的附件里。`src=assets/bgm.mp3` 用插件自带的配乐，播放器会到 `.plugin/page-video/assets/` 去取；其它文件名走页面附件。

插入时的默认片子是八句用法说明，用的是内置文字场景 `builtin:ad-scene`（版式 `hero` `split` `marquee` `stagger` `focus` `code` `stack` `finale`）和转场 `builtin:ad-transition`（`wipe` `iris` `split` `bars` `flash` `slide` `shutter`）。自己写片子时优先用上面的 `<title>` 和 `<clip>`，不必再套这些内置场景。

写入前可以先跑 `video_script`，它会指出重叠、空镜和失效的 `follow`，再 `db_content` 写入围栏。

## React 组件与 AbsoluteFill

常规剪辑继续用标签。复杂动效用 `<component src=hero.js dur=3s />`：文件经附件/`db_asset` 读取，改完立刻热重载，不 bundle。组件拿到 `frame` `time` `progress` `fps` `width` `height`，以及 `interpolate()` `spring()`。源码走 **Sucrase** 做完整 JSX/TS 转换（`Array.map` 返回元素、`x < 3` 比较都可以），再在沙箱里执行。

`<AbsoluteFill>` 铺满画布（`position:absolute; inset:0; display:flex; flex-direction:column`）。时间轴上可与标签混排；组件 JSX 里也可直接写 `<AbsoluteFill>`。无背景时下层会透出。组件抛错只坏自己这一层。

```xml
<title dur=2s>标签照旧</title>
<AbsoluteFill dur=3s at=2s />
<component src=hero.js dur=3s at=2s desc="自定义 React 组件" />
```

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
