# Skill Central

面向多 IDE 的本地优先 MCP Skill 分发中心。

[English](./README.md)

> `1.1.0` 正式支持 macOS（Apple Silicon 与 Intel）和 Windows x64；正式支持的 Coding Agent 为 Codex、Claude Code 与 Cursor。请为重要 Registry 保留备份，并在执行同步或 Agent 连接前检查计划内容。

AI 编码约定经常被复制到 Codex、Claude Code、Cursor 等工具中，每个工具都有自己的配置文件和提示词格式。Skill Central 让你只编写一次可复用 Skill 和公约 Rule，把它们放在有治理边界的本地层级中，再通过 MCP 暴露给每个已连接的 Agent。

Agent 连接后，可以通过 MCP Resources、Prompts 与 Tools 直接读取 Skill 和适用的公约 Rule；同一个本地 Server 也提供 reverse output、workflow 等内置控制工具。

Skill Central 包含桌面应用、本地 Web Board、CLI、MCP Server、事务化 IDE 配置、GitHub Registry 同步以及 Workflow/Session 能力。

## 主要能力

- 使用明确层级优先级和冲突证据管理本地 Skill。
- 桌面/Web Board 提供 Skills、Rules、IDE Connections、Sync、Runtime 主导航。
- 个人设置支持 GitHub Device Flow、system/light/dark 主题和中英文切换。
- 正式检测并注册 Codex、Claude Code 与 Cursor。Trae、Windsurf、Cline 适配器为实验性；未安装应用时明确显示“未验证”。
- IDE 配置写入支持预览、备份、应用、验证与回退。
- GitHub Registry 同步支持冲突选择、审计记录和备份。
- 提供 MCP prompts、tools、resources、sessions、blackboard topics 和 workflow scheduler。
- 提供实验性的 IDE 反向输出，可通过 MCP 或 CLI 沉淀可复用 Skill 与公约 Rule。
- macOS Homebrew Cask 安装带固定 SHA-256；macOS/Windows 桌面应用内更新统一检查 GitHub Releases。

## 安装

### macOS：DMG

请从 [GitHub Releases](https://github.com/BobcGn/skill-central/releases) 下载适合当前 Mac 架构的 `.dmg`，打开后将 **Skill Central** 拖入 **Applications（应用程序）**。

项目当前没有使用 Apple Developer Program 证书，因此 macOS 正式包仅有本地 ad-hoc 签名（无 Developer ID），未公证。首次启动被 Gatekeeper 阻止时，请先确认 DMG 来自官方 `BobcGn/skill-central` Release，然后在**系统设置 → 隐私与安全性**中选择**仍要打开**。也可以在 Finder 中按住 Control 点击应用、选择**打开**并确认。

如果系统仍提示应用“已损坏”且没有提供放行选项，才使用以下最后手段：

```bash
xattr -r -d com.apple.quarantine /Applications/"Skill Central".app
```

执行完成后，从 **Applications（应用程序）** 再次启动 Skill Central。该命令只会移除上述准确路径中应用的 quarantine 属性，会降低该 App Bundle 的 Gatekeeper 保护；不要对其他路径或未经核验的产物执行。真正的修复仍是 Developer ID 签名和 Apple 公证。

早期预览版若无法通过旧更新器访问正式 Release，需要手动安装一次当前 DMG；后续打包版本可使用[发布与更新](./docs/ch/release-and-updates.md)中说明的应用内更新路线。

### macOS：Homebrew

公开 Homebrew 路线通过 Cask 将桌面程序安装到 `/Applications/Skill Central.app`：

```bash
brew tap bobcgn/skill-central https://github.com/BobcGn/skill-central
brew trust bobcgn/skill-central
brew install --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

Homebrew 6 在加载第三方 Tap 前要求显式信任。执行 `brew trust` 前应先检查仓库和 `Casks/skill-central.rb`。安装不会自动启动应用；`open -a` 启动的是打包后的 Electron 桌面程序。维护者可以在源码 Checkout 中运行 `npm run homebrew:diagnose`，核验 Tap 归属、版本、进程数量和 Loopback Listener。

当前版本仅有本地 ad-hoc 签名（无 Developer ID），未公证。如果 macOS 阻止首次启动，请先核验仓库、Release 产物和固定校验值，再优先使用系统提供的**仍要打开**；仅在系统没有提供放行选项时，使用 DMG 小节中限定准确路径的 `xattr` 命令。完成签名和公证后才能移除这个临时处理。

安装 Skill Central 后，点击左上角红色按钮会保留一个本地进程和 Board Server。可以通过 Dock、应用菜单或菜单栏图标重新显示窗口；使用 **Quit Skill Central** 或 `Command-Q` 才会完全退出。

### Windows

从 [GitHub Releases](https://github.com/BobcGn/skill-central/releases) 下载 NSIS `.exe`。NSIS 安装版本可以在应用中接收后续稳定更新，并在安装完成后重启。

当前 Windows 正式包尚未使用 Authenticode 签名。首次运行时 SmartScreen 可能显示“无法识别的应用”警告；在项目加入 Windows 代码签名前，这是预期行为。运行安装包前，请先确认它来自官方 `BobcGn/skill-central` Release。

每个 Release 会发布包含 NSIS 安装包 base64 SHA-512 摘要的 `latest.yml`。可在 PowerShell 中计算下载文件并与该值比对：

```powershell
$path = ".\Skill-Central-1.1.0-win-x64.exe"
$h = [System.Security.Cryptography.SHA512]::Create().ComputeHash([System.IO.File]::ReadAllBytes($path))
[Convert]::ToBase64String($h)
```

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

## 反向输出（实验性）

IDE 连接 Skill Central 后，可以调用 `reverse_output` MCP Tool，预览并显式
Promote、Defer、Discard 或 Rollback 结构化 Skill/Rule 候选项。相同控制面也可通过
`skill-central reverse-output <action>` 使用。Skill 是持续演进的主要数字资产；Rule
提案必须说明 placement 与理由，且只有在内容属于跨 IDE 的 Skill Central 公约时才
Promote。Web Board 当前尚未提供反向输出 Promote 控件。

## Desktop Board

主导航围绕常用工作流组织：

| 区域 | 用途 |
| --- | --- |
| Skills | 搜索、查看、编辑、编译、恢复以及检查解析来源 |
| Rules | 独立搜索和查看规则，并管理 Rule 与 Skill 的项目作用域 |
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

| 目标 | 支持级别 | 配置位置 |
| --- | --- | --- |
| Codex | 正式支持 | 已存在时使用项目 `.codex/config.toml`，否则使用 `~/.codex/config.toml` |
| Claude Code | 正式支持 | Claude Code 用户级 JSON 配置 |
| Cursor | 正式支持 | Cursor MCP JSON 配置 |
| Trae | 实验性 | 国际版与中国版 `mcp.json` 候选路径 |
| Windsurf | 实验性 | Windsurf MCP JSON 配置 |
| Cline | 实验性 | Cline MCP settings JSON 配置 |

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
skill-central rules                查询公约 Rule
skill-central validate-rule <files...> 校验 Rule 文件
skill-central scope                查看或修改资产作用域
skill-central reverse-output <action> 预览/应用/回退反向输出
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

Skill 使用 YAML。本仓库包含一个完整 Tool Skill：`.skills/02-workflows/commit-conventions.yaml`：

```yaml
id: commit-conventions
name: Commit Conventions
description: Generate or validate git commit messages following Conventional Commits format
type: tool
tags: [git, workflow, commit]
arguments:
  - name: type
    description: Commit type (feat, fix, chore, docs, refactor, test, style)
    required: true
  - name: scope
    description: Scope of the change
    required: false
  - name: summary
    description: Short imperative description of the change
    required: true
prompt: |
  Generate a Conventional Commit message with the following structure:

  {{type}}({{scope}}): {{summary}}

  Rules:
  - type must be one of: feat, fix, chore, docs, refactor, test, style
  - summary must be lowercase, imperative mood, no period at end
```

Board、CLI 与 MCP 默认共享用户根目录下的 `~/.skill-central` 资产库。程序首次启动时会幂等创建 `~/.skill-central/skills` 与 `~/.skill-central/rules`，并分别加载 Skill 与 Rule；即使含 `skill-central.yaml` 的项目作为显式项目 Layer 覆盖，启动初始化也仍会完成。在**同步 → 本地资产库**或**个人设置 → 资产库**中，可以选择另一个同时包含 `skills/`、`rules/` 的根目录。同步页下方的 Registry 本地目录是另一条路径，只用于生成同步计划，不会替代资产库。点击**使用默认目录**可切回 `~/.skill-central`，不会删除任何文件。`*.bak.*` 备份与 `_` 前缀模板不会作为生效资产加载。Agent 可通过 `rule://` Resource、`rules:all` / `rule:<id>` Prompt 以及 `rules.list` / `rules.get` Tool 直接读取规则。

## GitHub 同步

GitHub 认证使用 OAuth Device Flow。正式桌面安装包内置项目 OAuth App 的公开 Client ID，用户只需在个人设置中点击**连接 GitHub**并在 GitHub 完成授权，不需要创建 OAuth App 或填写 Client ID。源码 Checkout 和 CLI 开发可通过 `SKILL_CENTRAL_GITHUB_CLIENT_ID` 配置同一公共标识符。

```bash
skill-central sync status --json
SKILL_CENTRAL_GITHUB_CLIENT_ID=<oauth-client-id> skill-central sync login --poll
skill-central sync plan --registry-dir ./skill-central-registry --direction both
```

正式桌面包内置项目 Client ID，可在个人设置中使用 GitHub Device Flow。未包含该元数据的早期预览包需要先升级，才能使用 GitHub Sync。

远程写入必须先生成计划并显式确认。Registry 目录必须包含有效 `manifest.yaml`，不能直接选择
`~/.skill-central` 资产库代替 Registry。Registry v1 没有删除 tombstone，因此缺失文件只会被
保留，不会被 pull/push 推断为删除；`--force` 也不能绕过该边界。同步操作会保留审计和备份
证据；token 不会通过 Web API 返回，也不会写入浏览器存储。

正式桌面程序通过 macOS Keychain 或 Windows DPAPI 加密 GitHub Token；系统安全存储不可用时不会回退明文。旧开发型明文 Token 会被删除且不迁移，需要重新登录。CLI 登录仍仅供源码开发使用，Windows DPAPI 路线必须通过真实打包应用验证后才能声明已验证。

## 自动更新

- **macOS：** 打包桌面版检查 GitHub Releases，不再要求 Homebrew Tap 已信任或由 Cask 接管后才能检查更新。应用为本地 ad-hoc 签名（无 Developer ID）、未公证，应用内更新安装可通过本地签名校验；失败时按 Release DMG 手动替换。Homebrew 仍可作为安装和固定校验值路线。
- **Windows：** NSIS 安装版本检查 GitHub Releases，自动下载更新包和 blockmap，准备完成后显示 **安装并重启**。
- **仅 CLI/Web 模式：** 明确显示更新器不可用，不会尝试修改安装目录。
- 稳定版接收稳定更新；预览版可按其安装版本 Channel 接收预发布更新。

## 安全边界

- Board 默认只监听 loopback；绑定非 loopback 地址需要显式确认。
- IDE 写入经过预览、备份、验证与回退阶段。
- Sync 的远程写入需要明确计划和确认。
- Device code 和 access token 不进入浏览器响应或 Web Storage。
- macOS 包为本地 ad-hoc 签名（无 Developer ID）、未公证；上述 `xattr` 命令会移除已安装应用的 quarantine 属性，执行前必须确认仓库和 Release 来源。

## 技术文档

公开中文技术文档从 [docs/ch/README.md](./docs/ch/README.md) 开始，涵盖系统架构、Skills 与 Layers、IDE 集成、本地数据与安全边界、开发流程以及发布/更新机制。

英文文档位于 [docs/en/README.md](./docs/en/README.md)。两个语言目录描述同一套公开契约，变更时必须同步更新。

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
export SKILL_CENTRAL_GITHUB_CLIENT_ID="<项目 OAuth App 的公共 Client ID>"
npm run package:mac
npm run package:win
```

发布资产输出到 `release-artifacts/`。Tag Release 由 GitHub Actions 构建 macOS x64/arm64 与 Windows x64 版本。

## 许可

[MIT](./LICENSE)
