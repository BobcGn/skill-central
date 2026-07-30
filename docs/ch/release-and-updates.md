# 发布与更新

[English](../en/release-and-updates.md) | [文档首页](./README.md)

Release 创建、Tag、Package 发布、签名和仓库权限变更仅由维护者执行。贡献者可以改进实现与测试，但未经明确授权不得创建项目 Release。

## 版本不变量

以下位置的版本必须一致：

- 格式为 `v<version>` 的 Git Tag；
- `package.json`；
- `CHANGELOG.md` 中对应的 `## [<version>]` 条目；
- 生成的 Package Metadata 与 Filename。

Runtime Version 在构建时来自 Package Metadata。带 Prerelease Suffix 的版本会发布为 GitHub Prerelease。

## 发布流水线

推送 `v*` Tag 会启动 Release Workflow：

1. 检出完整历史，使用 Node.js 24 安装依赖。
2. 运行 TypeScript 校验与完整集成测试。
3. 验证 Tag、Package、Changelog 版本一致。
4. 提取对应 Changelog Section 作为 Release Notes。
5. 创建或更新 GitHub Release。
6. 构建并上传 Source Archive。
7. 独立构建 macOS 与 Windows Desktop Artifact。

正在运行的 Release 不会被自动取消。平台 Job 失败必须保持可见，不得将部分产物伪装为全部支持平台均已通过。

## 产物

| 平台 | 架构 | 产物 |
| --- | --- | --- |
| macOS | x64、arm64 | DMG、ZIP、`latest-mac.yml` |
| Windows | x64 | NSIS EXE、MSI、ZIP、Blockmap、`latest.yml` |
| Source | 平台无关 | 由 `git archive` 生成、带版本前缀的 ZIP |

桌面文件名使用 `Skill-Central-<version>-<os>-<arch>.<ext>`。本地产物生成在 `release-artifacts/`，不提交到仓库。

## 更新架构

Desktop 创建一个平台特定的 `UpdateController`，通过本地 Board API 暴露 Snapshot。状态包括 Idle、Checking、Up-to-date、Available/Downloading、Ready、Installing、Unsupported 和 Error。

打包的 Desktop 在首个窗口加载后不久启动一次后台检查。开发版本与不支持的平台返回明确的 Unsupported Snapshot，不会修改安装目录。

### Windows

打包的 Windows 版本使用 `electron-updater` 与 GitHub Provider。Alpha 阶段允许接收 Prerelease。Updater 会自动下载，并按配置在用户请求或退出时安装，安装后可以重启应用。

NSIS EXE 是支持自动更新的安装入口。MSI 与 ZIP 是手动分发格式，不得假设它们具备相同的 NSIS 更新行为。

### macOS

macOS Controller 只在以下条件满足时调用 Homebrew：

- `/opt/homebrew/bin/brew` 或 `/usr/local/bin/brew` 存在且可执行；
- `brew list --cask --versions skill-central` 确认应用由该 Cask 管理。

它会执行 `brew update --quiet`，读取 `brew outdated --cask --json=v2 skill-central`，并通过 `brew upgrade --cask skill-central --no-ask --no-quit` 应用更新后重启。

该路径已有实现，但未通过 `1.0.0-alpha.1` 用户测试，仍为实验能力，计划在 `1.0.0-alpha.2` 进行端到端复测。当前 macOS 用户应从 GitHub Releases 手动更新。

macOS Package 没有 Apple Developer Identity，未签名、未公证。请按根目录 README 执行当前 Quarantine 处理方式，并先确认 Release 来源。

## Homebrew Cask

仓库包含 `Casks/skill-central.rb`，但应用仓库内的 Cask 文件本身不构成公开 Homebrew 分发渠道。当前 Cask 还使用 `sha256 :no_check`，且下载/更新流程尚未通过端到端测试。

在宣告支持 Homebrew 前，应尽可能在 Apple Silicon 与 Intel 上验证：

1. 真实可用的 Tap 或被接受的分发位置
2. 正确的 Artifact Name 与 URL 解析
3. 不可变 Release Asset 的固定 SHA-256
4. 没有既有 App Bundle 时的全新安装
5. 从上一版本升级
6. 应用重启与上报版本
7. Uninstall/Zap 不会误删用户所有的 Skill Layer

## 维护者发布检查表

1. 确认目标 Commit 位于受保护的 `main`，且必需 CI 全绿。
2. 同步更新 `package.json`、Lockfile Metadata、Runtime Version 预期、Changelog 与双语 README。
3. 在干净 Checkout 中运行 `npm ci`、`npm run lint`、`npm test`。
4. 在真实支持平台上构建并启动受影响的 Desktop Package。
5. 确认没有凭据、私有 `docs/dev/` 或 `logs/` 内容被追踪。
6. 创建并推送准确的 `v<version>` Tag。
7. 观察所有 Release Job 直到完成。
8. 检查 Release Notes、Filename、Size、Update Metadata 与可下载性。
9. 从公开 Release 安装并执行 Smoke Test。
10. Updater 变化时，从上一已安装版本执行真实升级测试。

## 回退与失败发布

不得静默替换 Release 历史。Artifact 无效时，应记录影响，按需移除或标记损坏 Release，在 `main` 修复后发布新版本。客户端可能缓存 Update Metadata，复用已发布版本会产生不可验证状态。

源 Commit 与 Changelog 应使恢复路径可审计。私有事故证据继续保存在维护者本地记录中，不进入公开文档树。
