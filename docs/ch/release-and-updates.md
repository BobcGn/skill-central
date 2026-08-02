# 发布与更新

[English](../en/release-and-updates.md) | [文档首页](./README.md)

Release 创建、Tag、Package 发布、签名和仓库权限变更仅由维护者执行。贡献者可以改进实现与测试，但未经明确授权不得创建项目 Release。

## 当前 Release Candidate

`1.0.0-rc.2` 是当前 Release Candidate。Release Workflow 先生成 Draft Artifact，核验通过后应手动公开为 GitHub Prerelease。只有公开 Prerelease 后，Homebrew 和应用内更新才能下载 `latest-mac.yml`、`latest.yml` 与安装资产。RC.2 包含本地 MCP Runtime 子进程的 macOS Dock 单图标修复、打包后自动清理解包应用副本，以及从解包构建位置启动的警告。macOS 仍未签名、未公证；Windows 打包行为仍需要真实机器验证后才能进入 `1.0.0`。

已经公开的 `alpha.1` 应用包含旧更新器，无法被追溯修复。因此，现有 `alpha.1` 安装升级至 `alpha.2` 时，需要执行一次终端命令或手动安装新版 DMG；后续打包桌面版可使用修复后的应用内更新。

## 版本不变量

以下位置的版本必须一致：

- 格式为 `v<version>` 的 Git Tag；
- `package.json` 与 Lockfile Package Metadata；
- `CHANGELOG.md` 中对应的 `## [<version>]` 条目；
- Package Metadata、Artifact Filename 和生成的 Cask。

Runtime Version 在构建时来自 Package Metadata。带 Prerelease Suffix 的版本属于 GitHub Prerelease。

## 发布流水线

候选验收完成后，推送 `v*` Tag 才能启动 Release Workflow：

1. 校验版本和 Changelog，运行 Lint 与完整集成测试。
2. 构建 Source Archive 和 macOS/Windows Desktop Artifact。
3. 根据真实 arm64/x64 DMG 及其 SHA-256 生成 Cask。
4. 创建更新 Cask 的 Pull Request，但暂不合并。
5. 将产物汇总到 Draft GitHub Release。
6. 只有全部 Release Gate 通过后，才由维护者检查并手动公开 Draft。
7. Release 公开后立即合并生成的 Cask PR，再测试公开 Homebrew 安装与升级路线。

Workflow 不会自动公开 Release。目标 Artifact 仍在私有 Draft 时不得合并生成的 Cask，否则公开 Tap 会指向无法下载的文件。先公开 Release、后合并 Cask 只会产生 Homebrew 暂时仍显示旧版本的短暂窗口，不会破坏现有安装路线。

## 产物

| 平台 | 架构 | 产物 |
| --- | --- | --- |
| macOS | x64、arm64 | DMG、ZIP、`latest-mac.yml` |
| Windows | x64 | NSIS EXE、MSI、ZIP、Blockmap、`latest.yml` |
| Source | 平台无关 | 由 `git archive` 生成、带版本前缀的 ZIP |
| Homebrew | arm64、x64 | 带双架构 SHA-256 的生成文件 `skill-central.rb` |

Desktop 文件名使用 `Skill-Central-<version>-<os>-<arch>.<ext>`。本地产物生成在 `release-artifacts/`，不提交到仓库。

打包成功后，electron-builder 留在输出目录中的中间解包应用副本（`mac/`、`mac-arm64/`、
`win-unpacked/`、`__msi-*` 等）会被自动删除。因此 `release-artifacts/` 只包含最终
产物，绝不会在正式安装之外留下第二个可运行的应用副本。

## macOS Homebrew 安装

当前受支持的 Tap 通过显式 Custom Remote 直接使用应用仓库；目前不存在单独的 `homebrew-skill-central` 仓库。Homebrew 6 在加载该第三方 Tap 前要求显式信任：

```bash
brew tap bobcgn/skill-central https://github.com/BobcGn/skill-central
brew trust bobcgn/skill-central
brew install --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

授予信任前应检查仓库和 `Casks/skill-central.rb`。Cask 将应用安装到 `/Applications/Skill Central.app`，但不会自动启动；`open -a` 启动的是打包后的 Electron 桌面程序。维护者可以在源码 Checkout 中使用以下命令核验归属和运行状态：

```bash
npm run homebrew:diagnose
```

macOS Alpha 没有 Developer ID 签名，也没有公证，不能通过标准 Gatekeeper 验证。如果首次启动被阻止，请先核验官方仓库、Release 产物和 Cask 中固定的 SHA-256，然后优先在**系统设置 → 隐私与安全性**中选择**仍要打开**，或在 Finder 中按住 Control 点击应用并选择**打开**。仅在系统仍提示应用“已损坏”且没有提供放行选项时，才执行：

```bash
xattr -r -d com.apple.quarantine /Applications/"Skill Central".app
```

这个限定准确路径的最后手段会移除该 App Bundle 的 quarantine 属性并降低 Gatekeeper 保护。不得对其他路径或未经核验的产物执行。真正的修复是完成 Developer ID 签名和 Apple 公证；在此之前，升级后的首次启动也可能再次需要系统安全确认。

## 接管现有 DMG 安装

先通过 `Command-Q` 或 **Quit Skill Central** 完全退出应用。安装并信任 Tap 后，让 Homebrew 尝试接管已有 App Bundle：

```bash
brew install --cask --adopt --require-sha bobcgn/skill-central/skill-central
```

只有现有 Bundle Version 与 Cask 产物匹配时，Homebrew 才会接管。如果接管被拒绝，不要删除现有应用，而是先保留一份可恢复备份：

```bash
mv /Applications/"Skill Central".app "$HOME/Desktop/Skill Central.app.pre-homebrew"
brew install --cask --require-sha bobcgn/skill-central/skill-central
```

该操作只移动 App Bundle，不会触碰 `~/.skill-central/` 下的 Skill Source，也不会触碰 `~/Library/Application Support/skill-central/` 下的 App State。Homebrew 安装通过 Smoke Test 前应保留备份。迁移和常规更新不得使用 `brew uninstall --zap`。

## Alpha.1 一次性升级

由于 `alpha.2` Release 已公开且生成的 Cask 已合并，`alpha.1` 用户应先按上文接管或安装 Cask，再执行：

```bash
brew update
brew upgrade --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

公开的 `alpha.1` Binary 不包含修复后的 Updater，因此这次终端操作或手动 DMG 替换无法省略。

## 桌面后台契约

启动后，一个 Skill Central 应用进程只拥有一个监听 Loopback 的 Board Server。点击 macOS 左上角红色按钮关闭最后一个窗口后，进程和服务都应继续运行。通过 Dock、应用菜单或菜单栏图标重新打开时，必须复用同一个服务，不得增加进程或端口。`Command-Q` 和 **Quit Skill Central** 必须完全停止进程和服务。

Homebrew 能保证安装桌面 App Bundle，但不会自动启动应用，也不代表应用会注册 Login Item。Skill Central 当前不会开机自启。真实应用必须完成以下验证：

1. 启动 Cask 安装的应用并运行 `npm run homebrew:diagnose`。
2. 点击红色按钮关窗，确认诊断仍显示一个进程和一个 Loopback Listener。
3. 分别通过 Dock 和菜单栏恢复，确认没有出现第二个进程或 Listener。
4. 使用应用菜单或菜单栏的 Quit，确认进程和 Listener 均消失。
5. 连续启动两次，确认单实例逻辑只恢复原窗口。

## 发布前本地候选 Tap

候选测试使用本地 DMG 与临时 Git Tap，不需要创建 GitHub Release。构建两个架构后生成 Tap：

```bash
export SKILL_CENTRAL_GITHUB_CLIENT_ID="<项目 OAuth App 的公共 Client ID>"
npm run package:mac
CANDIDATE_TAP="$(mktemp -d /tmp/skill-central-homebrew.XXXXXX)"
npm run homebrew:candidate -- \
  --version "$(node -p "require('./package.json').version")" \
  --arm64 "release-artifacts/Skill-Central-$(node -p "require('./package.json').version")-mac-arm64.dmg" \
  --x64 "release-artifacts/Skill-Central-$(node -p "require('./package.json').version")-mac-x64.dmg" \
  --tap-dir "$CANDIDATE_TAP"
```

生成器会校验 Artifact Filename、计算两个 SHA、提交 Cask 并输出 Tap Path；它本身不会修改 Homebrew 或 `/Applications`。为了验证应用内硬编码的正式 Tap Identity，需要临时用本地 Remote 替换公开 Tap：

```bash
brew tap --custom-remote bobcgn/skill-central "file://$CANDIDATE_TAP"
brew trust bobcgn/skill-central
brew install --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

从匹配的 DMG Bundle 测试迁移时，在 Install 命令中增加 `--adopt`。测试应用内更新时，应再构建一个 Package Version 严格更高的候选版本，使用同一个 `--tap-dir` 再次运行 `homebrew:candidate`，然后在已安装的第一个候选版本中点击**检查更新**和**安装并重启**。应用版本和 Cask 版本都必须变成第二个候选版本。

测试结束后，先退出应用；不带 `--zap` 卸载候选版本，再把 Tap Remote 恢复为公开仓库：

```bash
brew uninstall --cask bobcgn/skill-central/skill-central
brew tap --custom-remote bobcgn/skill-central https://github.com/BobcGn/skill-central
brew trust bobcgn/skill-central
```

候选版本卸载后才能恢复 `.pre-homebrew` App Bundle；之后可以移除临时 Tap 目录。

## 更新架构

Desktop 创建一个平台特定的 `UpdateController`，通过 Loopback Board API 暴露 Snapshot。打包版本在首个窗口加载后检查一次；开发版本与不支持的平台不会修改安装目录。

macOS 与 Windows 打包桌面版通过 `electron-updater` 检查 GitHub Release Metadata。Alpha 版本允许接收 Prerelease；检查更新不再依赖 Homebrew Tap 信任状态或 Cask 归属。当前 macOS Alpha 仍未签名，自动安装行为必须用真实包验证；失败时应按 Release DMG 手动替换。Homebrew Cask 仍是 macOS 安装和固定 SHA-256 校验路线，但不是应用内检查更新的前置条件。

Windows 打包的 NSIS 版本同样通过 `electron-updater` 使用 GitHub。MSI 与 ZIP 属于手动部署格式，不得假设它们拥有 NSIS 更新行为。本轮变更尚未在 Windows 验证，对外说明时必须明确该状态。

## GitHub OAuth 发布配置

正式桌面包需要项目自己的 GitHub OAuth App。维护者在 GitHub 的 **Settings → Developer settings → OAuth Apps → New OAuth App** 创建应用：Application Name 使用 `Skill Central`，Homepage URL 使用 `https://github.com/BobcGn/skill-central`；注册表单要求的 Authorization Callback URL 可使用同一项目 URL，Device Flow 不会使用该回调。创建后在 OAuth App 设置中启用 **Enable Device Flow**。

只记录页面显示的公共 Client ID，不要生成、复制或配置 Client Secret。然后在仓库 **Settings → Secrets and variables → Actions → Variables** 中新增 Repository Variable：

- Name：`SKILL_CENTRAL_GITHUB_CLIENT_ID`
- Value：OAuth App 页面显示的 Client ID

Release Workflow 会校验该变量并写入桌面包的 Package Metadata；变量缺失或格式无效时拒绝构建。配置完成后仍必须用真实 release candidate 安装包执行一次登录、用户信息读取和登出测试。

## Alpha Release Gate 检查表

1. 落地全部中英文安装、迁移、更新、安全和生命周期文档。
2. 在实现与文档准备好生成候选包之前，Package Metadata 保持为当前已发布版本。
3. 在干净 Checkout 运行 `npm ci`、`npm run lint`、`npm test` 和 `npm run build:desktop`。
4. 构建两个 macOS 架构，生成候选 Cask，并运行 `ruby -c`、`brew style` 和离线 Strict Cask Audit；需要联网的 `brew audit --new` 只能在 Release URL 公开后运行。
5. 在 Apple Silicon 与可用的 Intel Mac 上测试全新 Homebrew 安装。
6. 测试 DMG Adopt 与可恢复备份路线，确认 Skill Source 和 App State 未被修改。
7. 测试红色关窗后台行为、Dock/菜单栏恢复、单实例和完全退出。
8. 在两个本地候选版本间执行真实 Cask 升级，验证应用内重启和版本核验。
9. 恢复公开 Tap Remote 和已备份的 DMG App Bundle，再次运行只读诊断。
10. 将 Windows 标记为已验证或明确未验证，不得用 macOS 结果推断 Windows 成功。
11. 创建由项目维护者控制且启用 Device Flow 的 GitHub OAuth App，将其公共 Client ID 配置为 Repository Variable `SKILL_CENTRAL_GITHUB_CLIENT_ID`；不得配置 Client Secret。
12. 使用注入该 Client ID 的真实桌面候选包完成 GitHub 登录、用户信息读取、应用重启与登出；确认普通用户无需填写 Client ID，重启后仍保持登录，密文不含 Token 明文，登出删除密文，旧明文凭据被清除且不迁移，API 响应和日志中没有 Access Token、Device Code、Authorization Header、密文或原始原生异常。
13. 审查最终 Diff，确认没有追踪私有 `docs/dev/` 或 `logs/` 内容；得到维护者确认后，才可修改 Version 或创建 Tag。

## 回退与失败发布

不得静默替换公开 Artifact，也不得复用已发布 Version。迁移前通过移动方式保存现有 DMG App Bundle。候选清理只执行普通 Cask Uninstall，绝不使用 `--zap`，因此不会主动删除用户 Skill Layer 与本地 App State。

Draft 或 Artifact 无效时保持私有，在 `main` 修复后重新构建并重复检查。公开 Release 无效时应记录影响，修复源代码后发布新版本；客户端可能已缓存旧 Metadata。
