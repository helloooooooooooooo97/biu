# 桌面版安装（macOS / Windows）

GitHub Release 提供打包产物：

| 系统 | 文件 |
|------|------|
| macOS Apple Silicon | `Biu-<version>-mac-arm64.dmg`（另有 `.zip`） |
| macOS Intel | `Biu-<version>-mac-x64.dmg` |
| Windows x64 | `Biu-<version>-win-x64.exe`（NSIS），以及 `.zip` |

打 tag `v0.1.1` 并 push，或在 Actions 里手动跑 **desktop-release**。本地：

```bash
npm run electron:pack          # 当前系统
npx electron-builder --mac     # 仅在 macOS 上出 dmg
npx electron-builder --win     # 仅在 Windows 上出 exe
```

产物在 `release/`。

## 别人的 Mac 怎么装（ad-hoc，无开发者证书）

**能装、能用。** 没有公证时，浏览器下载会带隔离属性，双击可能显示「已损坏」。拖进「应用程序」后执行一行：

```bash
xattr -dr com.apple.quarantine /Applications/Biu.app
```

然后照常打开 Biu。Apple 芯片用 `*-mac-arm64.dmg`，Intel 用 `*-mac-x64.dmg`。

也可以不敲命令：在「应用程序」里 **Control+点按 / 右键 → 打开 → 打开**。成功一次之后即可双击。系统设置 → 隐私与安全性 → **仍要打开** 同样有效。

本仓库打包使用 ad-hoc 签名（`electron-builder.yml` 里 `identity: '-'`），不申请 Developer ID。

## Windows

未做 Authenticode 签名时，SmartScreen 可能显示「Windows 已保护你的电脑」：

**更多信息 → 仍要运行**。

把 Biu 加入信任的发布者需要购买代码签名证书。

## 数据目录

桌面版把工作区写在系统用户数据目录（Electron `userData`），不写进 `.app` 包内，升级安装不会清掉笔记。
