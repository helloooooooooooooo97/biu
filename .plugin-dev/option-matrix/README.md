# 方案对比块（option-matrix）

在页面文档里插入一个**多方案 × 多维度**的加权对比矩阵：填方案、填维度、给权重和打分，块会**实时算加权总分并排出推荐**。

- **越低越好的维度会反向计入**：维度上可切 `↑越高越好` / `↓越低越好`。标成「越低越好」的维度（比如开发成本），打分越高代表越差，算总分时会换成 `满分+1 − 原分` 再加权（表格里会显示 `→反向分`）。这是这个块和「简单求和」最大的差别。
- 实时计算：改权重、改分数、加方案、加维度，总分、百分比、推荐标记立刻变。
- 每个维度的最优格高亮（越高越好取最大、越低越好取最小，归一化后都是最大）。
- 底部自动生成一句「为什么推荐它」，把各维度最优项拼起来。
- 只读态纯展示；点「导出 Markdown」可把矩阵导出成 markdown 表格（带权重、方向、反向分），直接给 agent 读。

## 示例写法

```md
:::pageBlock {kind=option-matrix plugin=option-matrix}
{
  "title": "登录方案选型",
  "scale": 5,
  "options": ["手机号+验证码", "微信一键登录", "账号密码"],
  "criteria": [
    { "name": "开发成本", "weight": 3, "higherIsBetter": false },
    { "name": "安全性", "weight": 5, "higherIsBetter": true },
    { "name": "转化率", "weight": 5, "higherIsBetter": true }
  ],
  "scores": {
    "手机号+验证码": { "开发成本": 4, "安全性": 4, "转化率": 4 },
    "微信一键登录": { "开发成本": 3, "安全性": 4, "转化率": 5 },
    "账号密码": { "开发成本": 5, "安全性": 2, "转化率": 2 }
  }
}
:::
```

可写字段：`title`（标题）、`scale`（满分制，默认 5）、`options`（方案名数组）、`criteria`（`{name, weight, higherIsBetter}`）、`scores`（`方案 → 维度 → 分`）。

## 算法

```
归一化分 = higherIsBetter ? 原分 : (scale + 1 − 原分)
加权总分 = Σ( weight × 归一化分 )
满分     = Σ( weight × scale )
推荐     = 总分最高者（并列时按方案名）
```


## 自测（可选）

`verify.mjs` 是不依赖浏览器的算法自测：把打包后的 `.plugin/web.js` 渲染成静态 HTML（react-dom/server），断言加权总分、反向计入、改权重/翻转维度方向后结论会变。

```sh
cd /Users/tangcong/Documents/UGit/biu-harness
node .plugin-dev/option-matrix/verify.mjs
```

预期输出以 `ALL PASS ✅` 结尾。默认样例三个方案的加权总分分别是 46.0 / 54.0 / 23.0（满分 65.0），推荐「微信一键登录」；若写成简单求和会是 12 / 12 / 9（前两名并列，推不出结论）——这就是反向计入的价值。
