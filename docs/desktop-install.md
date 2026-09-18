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

## macOS：没有开发者证书能不能给别人用？

**能用，但不能当作「下载后双击即开」的正式分发。**

没有加入 Apple Developer Program（约每年 $99）就：

- **不能**用 Developer ID 签名
- **不能**公证（notarize）
- 从浏览器 / 隔空投送拿到的 app 会带上隔离属性 `com.apple.quarantine`

Gatekeeper 常见文案是「已损坏，无法打开」或「无法验证开发者」。**应用本身往往是好的。**

本仓库在 CI 里做 **ad-hoc 签名**（`identity: '-'`）：你自己这台 Mac 上一般还能开；别人下载后仍会被隔离。

### 给别人的用法

1. 安装 dmg，把 Biu 拖到「应用程序」。
2. **右键 Biu → 打开** → 打开（不要双击）。
3. 若仍提示已损坏：

```bash
xattr -dr com.apple.quarantine /Applications/Biu.app
open /Applications/Biu.app
```

zip 解压后的路径改成实际 `.app` 即可。

要做成无提示分发，需要 Apple 开发者证书 + 公证，并把 `electron-builder.yml` 里的 `mac.identity` / `notarize` 换成正式配置。

## Windows

未做 Authenticode 签名时，SmartScreen 可能显示「Windows 已保护你的电脑」：

**更多信息 → 仍要运行**。

把 Biu 加入信任的发布者需要购买代码签名证书。

## 数据目录

桌面版把工作区写在系统用户数据目录（Electron `userData`），不写进 `.app` 包内，升级安装不会清掉笔记。
