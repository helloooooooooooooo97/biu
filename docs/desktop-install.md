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

## 别人的 Mac 怎么装（没有开发者证书）

**能装、能用。** 没有公证时，从浏览器下下来的 app 第一次会被系统拦住；这不是包坏了。第一次用右键打开，**之后就可以和平时一样双击。**

芯片选对文件：Apple 芯片（M1/M2/M3/M4）用 `*-mac-arm64.dmg`，Intel 用 `*-mac-x64.dmg`。

### 第一次（约 30 秒）

1. 打开 dmg，把 **Biu** 拖进 **应用程序**（或 Applications）。关掉 dmg。
2. 打开「应用程序」文件夹，找到 Biu。
3. **按住 Control 再点一下图标**（或双指点按 / 右键）→ 选 **打开**。
4. 弹出「无法验证开发者」或类似提示时，再点一次 **打开**。
5. 以后从 Launchpad 或 Dock **双击即可**，不用再右键。

不要用第一次的双击：系统会直接说打不开，有时还写成「已损坏」。

### 若仍然写「已损坏」

把下面整段贴进「终端」回车（只这一次）：

```bash
xattr -dr com.apple.quarantine /Applications/Biu.app
open /Applications/Biu.app
```

若你是解压 zip、没有拖进应用程序，把路径换成实际的 `Biu.app`。

系统设置里也可以放行：打开后到 **系统设置 → 隐私与安全性**，拉到下面，对 Biu 点 **仍要打开**。

要让别人下载后也能直接双击、不再出现上述步骤，需要加入 Apple 开发者计划并做公证（每年约 $99），再改 `electron-builder.yml` 里的签名配置。

## Windows

未做 Authenticode 签名时，SmartScreen 可能显示「Windows 已保护你的电脑」：

**更多信息 → 仍要运行**。

把 Biu 加入信任的发布者需要购买代码签名证书。

## 数据目录

桌面版把工作区写在系统用户数据目录（Electron `userData`），不写进 `.app` 包内，升级安装不会清掉笔记。
