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
- 支持应用内检查更新：macOS 使用 Homebrew Cask，Windows 使用 GitHub Release/NSIS。

## 安装

### macOS：Homebrew Cask

项目当前没有使用 Apple Developer Program 证书，因此 macOS Alpha 包未签名、未公证。请通过项目 Tap 安装，并显式关闭 quarantine：

```bash
brew tap bobcgn/skill-central https://github.com/BobcGn/skill-central
brew install --cask skill-central --no-quarantine
```

请只对官方 `BobcGn/skill-central` 仓库使用该命令。`--no-quarantine` 会绕过 Gatekeeper 对该未签名构建的隔离检查。

通过 Homebrew 管理的安装可以在 **个人设置 > 软件更新** 中检查并应用后续版本。应用只会运行固定参数的 `brew update`、`brew outdated` 和 `brew upgrade --cask skill-central`，不会执行来自浏览器界面的命令文本。

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

Board 默认监听 `127.0.0.1:5417`；端口被占用时会继续尝试后续十个端口。需要应用内软件更新时，请使用打包后的桌面应用。

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

- **macOS：** 打包应用会在后台检查已 Tap 的 Homebrew Cask；发现新版本后可在个人设置中应用，`brew upgrade` 完成后自动重启。
- **Windows：** NSIS 安装版本检查 GitHub Releases，自动下载更新包和 blockmap，准备完成后显示 **安装并重启**。
- **仅 CLI/Web 模式：** 明确显示更新器不可用，不会尝试修改安装目录。
- 当前安装版本为 Alpha 时允许接收预发布更新。

## 安全边界

- Board 默认只监听 loopback；绑定非 loopback 地址需要显式确认。
- IDE 写入经过预览、备份、验证与回退阶段。
- Sync 的远程写入需要明确计划和确认。
- Device code 和 access token 不进入浏览器响应或 Web Storage。
- macOS 包未签名；Homebrew 命令会主动绕过 quarantine，执行前必须确认仓库和 Release 来源。

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
