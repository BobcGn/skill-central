# Skill Central

面向多 IDE 的本地优先 MCP Skill 分发中心。

[English](./README.md)

> 当前版本：`1.0.0-alpha.1`。这是 Alpha 版本。请为重要的 Skill Registry 保留备份，并在执行同步或 IDE 连接前检查计划内容。

Skill Central 为 Codex、Claude、Trae、Cursor、Windsurf 和 Cline 提供共享 Skill 库，包含桌面应用、本地 Web Board、CLI、MCP Server、事务化 IDE 配置、GitHub Registry 同步以及 Workflow/Session 能力。

## 主要能力

- 使用明确层级优先级和冲突证据管理本地 Skill。
- 桌面/Web Board 提供 Skills、IDE Connections、Sync、Runtime 主导航。
- 个人设置支持 GitHub Device Flow、system/light/dark 主题和中英文切换。
- 检测并注册 Codex、Claude、Trae、Cursor、Windsurf 和 Cline。
- IDE 配置写入支持预览、备份、应用、验证与回退。
- GitHub Registry 同步支持冲突选择、审计记录和备份。
- 提供 MCP prompts、tools、resources、sessions、blackboard topics 和 workflow scheduler。
- Windows 通过 GitHub Release/NSIS 支持应用内更新；当前版本的 macOS 更新需要手动完成。

## 安装

### macOS：DMG

请从 [GitHub Releases](https://github.com/BobcGn/skill-central/releases) 下载适合当前 Mac 架构的 `.dmg`，打开后将 **Skill Central** 拖入 **Applications（应用程序）**。

项目当前没有使用 Apple Developer Program 证书，因此 macOS Alpha 包未签名、未公证。首次启动时，macOS 可能提示应用“已损坏”。请先在弹窗中点击**取消**，然后打开终端执行：

```bash
sudo xattr -r -d com.apple.quarantine /Applications/"Skill Central".app
```

执行完成后，从 **Applications（应用程序）** 再次启动 Skill Central。该命令只会移除上述准确路径中应用的 quarantine 属性。执行带 `sudo` 的命令前，请确认 DMG 来自官方 `BobcGn/skill-central` Release。

当前用户测试中，Homebrew 下载和应用内更新路径未能正常工作，因此 `1.0.0-alpha.1` 暂不推荐使用 Homebrew。macOS 用户目前应从 GitHub Releases 手动更新；Homebrew 全流程将在 `1.0.0-alpha.2` 发布时重新进行端到端测试。

### Windows

从 [GitHub Releases](https://github.com/BobcGn/skill-central/releases) 下载 NSIS `.exe`。NSIS 安装版本可以在应用中接收后续预发布更新，并在安装完成后重启。

Release 仍提供 `.msi` 和 `.zip` 用于手动部署，但 NSIS `.exe` 是受支持的自动更新入口。

### CLI

建议使用 Node.js 22 或更高版本。

```bash
npx @bobcgn/skill-central init
npx @bobcgn/skill-central board
```

全局安装：

```bash
npm install -g @bobcgn/skill-central
skill-central init
skill-central board
```

## 首次运行

初始化项目：

```bash
skill-central init
```

该命令会创建 `skill-central.yaml` 和分层的 `.skills/` 目录，并尝试检测本机 IDE、注册 Skill Central。

打开本地 Board：

```bash
skill-central board
```

Board 默认监听 `127.0.0.1:5417`；端口被占用时会继续尝试后续十个端口。更新器是否可用取决于平台和安装方式。

启动 stdio MCP Server：

```bash
skill-central mcp
```

协议响应使用 stdout，诊断信息使用 stderr，避免污染 MCP JSON-RPC 通道。

## Desktop Board

主导航围绕常用工作流组织：

| 区域 | 用途 |
| --- | --- |
| Skills | 搜索、查看、编辑、编译、恢复以及检查解析来源 |
| IDE Connections | 检测 IDE，预览/应用/验证/回退 MCP 配置 |
| Sync | 检查本地状态、生成 GitHub Registry 计划、解决冲突并查看证据 |
| Runtime | 检查、启动和停止本地 MCP Runtime |
| 个人设置 | GitHub 登录、主题、语言和桌面应用更新 |

窄屏下界面会切换为底部导航。主题、语言、当前视图以及非敏感偏好仅保存在本地 Board 中。

## IDE 连接

```bash
skill-central register
skill-central register codex
skill-central register claude
skill-central register trae
```

| 目标 | 配置位置 |
| --- | --- |
| Codex | 已存在时使用项目 `.codex/config.toml`，否则使用 `~/.codex/config.toml` |
| Claude | Claude Code 与 Claude Desktop JSON 配置候选路径 |
| Trae | 国际版与中国版 `mcp.json` 候选路径 |
| Cursor | Cursor MCP JSON 配置 |
| Windsurf | Windsurf MCP JSON 配置 |
| Cline | Cline MCP settings JSON 配置 |

Codex 配置通过 TOML 解析和校验，其他目标使用结构化 JSON 处理。现有无关配置会被保留；Apply 会生成备份证据并支持回退。

## 核心 CLI

```text
skill-central mcp                 启动 stdio MCP Server
skill-central board               打开本地 Web Board
skill-central board --cli         输出终端 Board
skill-central init                创建本地层级并检测/注册 IDE
skill-central register [ide]      注册一个或全部支持的 IDE
skill-central add <id>             创建 Skill
skill-central list                 查询已加载 Skill
skill-central show <id>            查看一个解析后的 Skill
skill-central validate <files...> 校验 Skill 文件
skill-central doctor               诊断层级、冲突和备份
skill-central install <source>     从 GitHub 或 npm 安装 Skill
skill-central update [id]          更新已安装 Skill
skill-central uninstall <id>       删除已安装 Skill
skill-central sync <action>        GitHub 登录、Registry、计划和应用操作
skill-central workflow <action>    启动并推进 Workflow Session
skill-central session <action>     检查 Session 和 Blackboard Topic
```

使用 `skill-central <command> --help` 查看当前参数。

## Skill 格式

Skill 使用 YAML。最小 Prompt Skill 示例：

```yaml
schemaVersion: skillcentral.dev/v1
id: review-pr
name: PR Review
description: Review changes against project conventions
type: prompt
tags: [review, workflow]
prompt: |
  Review the current change. Prioritize correctness, regressions,
  security boundaries, and missing tests.
```

各层级有明确优先级。ID 冲突时，高优先级的有效 Skill 生效，同时完整解析链仍可检查。

## GitHub 同步

GitHub 认证使用 OAuth Device Flow。当前需要在个人设置中提供 GitHub OAuth App Client ID，或设置 `SKILL_CENTRAL_GITHUB_CLIENT_ID`。

```bash
skill-central sync status --json
skill-central sync login --client-id <oauth-client-id> --poll
skill-central sync plan --registry-dir ./skill-central-registry --direction both
```

远程写入必须先生成计划并显式确认。同步操作会保留审计和备份证据；token 不会通过 Web API 返回，也不会写入浏览器存储。

当前 Alpha 在 OS keychain 集成完成前仍使用开发文件型 TokenStore。请将 GitHub 登录视为实验功能，不要复用高价值凭据。

## 自动更新

- **macOS：** `1.0.0-alpha.1` 请使用 DMG 手动更新。Homebrew 下载与应用内更新仍是实验能力，将在 `1.0.0-alpha.2` 重新测试。
- **Windows：** NSIS 安装版本检查 GitHub Releases，自动下载更新包和 blockmap，准备完成后显示 **安装并重启**。
- **仅 CLI/Web 模式：** 明确显示更新器不可用，不会尝试修改安装目录。
- 当前安装版本为 Alpha 时允许接收预发布更新。

## 安全边界

- Board 默认只监听 loopback；绑定非 loopback 地址需要显式确认。
- IDE 写入经过预览、备份、验证与回退阶段。
- Sync 的远程写入需要明确计划和确认。
- Device code 和 access token 不进入浏览器响应或 Web Storage。
- macOS 包未签名；上述 `xattr` 命令会移除已安装应用的 quarantine 属性，执行前必须确认仓库和 Release 来源。

## 参与贡献

外部贡献使用 fork + Pull Request 流程。开始前请阅读[中文贡献指南](./CONTRIBUTING.zh-CN.md)或 [English guide](./CONTRIBUTING.md)，并使用结构化 Issue 表单提交错误、功能建议和问题。

安全漏洞必须按 [SECURITY.md](./SECURITY.md) 私密报告，禁止发布到公开 Issue。

## 开发

```bash
npm ci
npm run lint
npm test
npm run dev:board
npm run dev:desktop
```

构建发布包：

```bash
npm run package:mac
npm run package:win
```

发布资产输出到 `release-artifacts/`。Tag Release 由 GitHub Actions 构建 macOS x64/arm64 与 Windows x64 版本。

## 许可

[MIT](./LICENSE)
