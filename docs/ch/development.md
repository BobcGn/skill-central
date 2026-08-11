# 开发指南

[English](../en/development.md) | [文档首页](./README.md) | [贡献规则](../../CONTRIBUTING.zh-CN.md)

本文说明代码库结构与本地验证流程。仓库政策、Review 要求和贡献行为以根目录贡献与安全文档为准。

## 环境要求

- Node.js 22 或 24
- 对应 Node.js 版本自带的 npm
- 只在测试对应桌面产物时需要 macOS 或 Windows 打包工具链

安装依赖并建立干净基线：

```bash
npm ci
npm run lint
npm test
```

## 仓库结构

| 位置 | 作用 |
| --- | --- |
| `src/index.ts` | CLI 命令定义与分发 |
| `src/storage/`、`src/schema/` | 配置、Layer 加载、YAML 解析、公开 Skill Model |
| `src/core/`、`src/registry/` | 解析 Engine 与共享查询 |
| `src/compiler/`、`src/adapters/` | Intent 编译、Capability、目标预览 |
| `src/protocol/`、`src/mcp.ts` | MCP Prompts、Tools、Resources 和 stdio 启动 |
| `src/reverse-output/`、`src/commands/reverse-output.ts` | IDE/CLI 共用的反向输出提案、Promote、Audit 与 Rollback 控制面 |
| `src/ide-detection/`、`src/connect/`、`src/health/` | IDE Metadata、Codec、连接事务、健康探测 |
| `src/auth/`、`src/sync/` | GitHub Device Flow 与 Registry 同步 |
| `src/local-store/`、`src/state/`、`src/scheduler/` | App Data、Session、Blackboard、Workflow Scheduling |
| `src/web/server.ts` | Hono Board API 与静态文件服务 |
| `src/web/static/` | 原生 HTML、CSS、JavaScript UI |
| `src/desktop/`、`src/update/` | Electron 生命周期与平台更新 |
| `scripts/test.sh` | 完整集成测试 |
| `.github/workflows/` | 必需 CI 与维护者 Release Workflow |

## 开发命令

```bash
npm run dev:mcp       # Watch TypeScript MCP 入口
npm run dev:board     # 从 TypeScript 启动本地 Board
npm run dev:desktop   # 构建、复制 Web Asset 并启动 Electron
npm run build         # 编译 TypeScript 并复制 Adapter Capability
npm run build:web     # 将静态 Board Asset 复制到 dist/web
npm run build:desktop # 构建 TypeScript 与 Board Asset
npm run lint          # TypeScript no-emit 校验
npm run test:reverse-output # 反向输出控制面专项矩阵
npm test              # 构建并运行集成测试
```

`npm run package:mac` 与 `npm run package:win` 在 `release-artifacts/` 生成可安装产物。打包前必须将项目 OAuth App 的公共 Client ID 设置为 `SKILL_CENTRAL_GITHUB_CLIENT_ID`；该 App 必须启用 Device Flow，且不得在客户端配置 Client Secret。只运行 `build:desktop` 不代表完成打包验证。

打包成功后，构建脚本会删除 electron-builder 留在输出目录中的中间解包应用副本
（`mac/`、`mac-arm64/`、`win-unpacked/`、`__msi-*` 等），使 `release-artifacts/` 只保留
最终交付物，系统中不会在 `/Applications`（macOS）或 Program Files（Windows）之外出现
第二个可运行的应用副本。桌面入口在从解包构建位置启动而非正式安装时，也会给出警告。

## 开发期本地状态

仓库中的 `.skills/` 和 `skill-central.yaml` 是实际开发 Fixture。集成测试会临时加入更多 Fixture，并通过 Cleanup Handler 清理。测试操作 Fixture 时应避免外部中断；如进程被强行终止，继续前先检查 `git status` 和本地 Skill Path。

目标测试应通过 `SKILL_CENTRAL_APP_STATE_DIR` 隔离 App State。Cleanup 代码不得指向宽泛的 Home 或 Workspace 目录。

`docs/dev/` 仅用于维护者个人开发记录，由 Git 忽略。公开架构与运行文档应放入 `docs/en/` 与 `docs/ch/`。外部贡献者不得 Force Add 私有记录。

## 变更流程

1. 从最新 `main` Fork，并创建单一目标的分支。
2. 修改共享逻辑前，先复现问题或建立失败测试。
3. 在拥有该职责的边界内修改，不要分别 Patch CLI 与 Board 中的同一规则。
4. 添加针对性测试；公共契约变化时同步更新两种语言文档。
5. 执行必需检查，在 PR 中准确记录命令。
6. 检查 Diff 中是否出现生成内容、凭据、本机路径或无关清理。

大型功能、Schema/Protocol 变化、认证、Updater、新依赖或 Framework Migration 必须先创建 Issue 并取得维护者同意。

## 测试策略

所有代码变更必须通过：

```bash
npm run lint
npm test
```

集成测试覆盖 CLI 启动、Universal Skill 兼容、Override/Conflict、MCP Surface、Compiler Preview、IDE 配置与健康、Board API、App State、GitHub Flow 基础能力、同步、Runtime/Session 与 Backup。

按风险追加检查：

| 变更 | 追加验证 |
| --- | --- |
| Registry Query 或 Resolution | `npm run test:registry-perf` 与 Conflict Fixture |
| Board HTML/CSS/JS | `npm run build:web`；桌面/移动视觉检查；键盘、溢出、Loading、Empty、Error、Success 状态 |
| MCP Protocol | 启动真实 stdio Client，并确认 stdout 只含协议数据 |
| Runtime Manager | 通过 `LocalRuntimeManager` 启动真实 `dist/index.js mcp`，确认 stdin 保持打开、状态维持 `running`，并且 stop 能捕获 stderr 且不污染 stdout |
| 反向输出 | `npm run test:reverse-output`；覆盖 Schema、作用域、路径、重复、SHA、Backup、Rollback、CLI 与 MCP |
| IDE Target | 平台路径 Fixture、畸形配置、无关 Entry 保留、Backup、Rollback 和实时 Probe |
| Sync/Auth | Path 与凭据泄露负向测试；区分 Dry-run/Apply；Audit Evidence |
| Desktop/Updater | `npm run build:desktop`、受影响 Package Build 与真实安装行为 |
| 文档/模板 | `git diff --check`、相对链接、相关 YAML 解析与双语对应检查 |

平台不可用时不得静默降低覆盖。应在 PR 中记录未测试的平台及其风险。

## 各边界规则

### Engine 与 Schema

- 集中处理标准化与校验。
- 未经迁移批准，不破坏 Legacy 兼容。
- 完全并列时不得按插入顺序解析。
- 确保所有 Consumer 使用一致的 Provenance 与 Status 语义。

### IDE 集成

- 使用共享 Target Registry 与 JSON/TOML Codec。
- 保留用户无关配置。
- 保持 Plan、Preview、Backup、Apply、Verify、Rollback 可观测。
- 将新增 Target 作为端到端功能交付。

### Board 与 Desktop

- 未经批准，不迁移当前原生 HTML/CSS/JavaScript 架构。
- 同步更新两套 Message Dictionary 与两种语言公共文档。
- 保持 System/Light/Dark Theme、Keyboard Focus 与窄屏导航。
- 保持 `contextIsolation`、禁用 Node Integration 和 Sandbox。
- 桌面 Board 拥有一个本地 MCP Runtime 进程，必须保持 stdio stdin 打开，直到显式停止或应用退出。
  打包 MCP Server Config 已存在时，不得再从 Electron argv 猜测启动入口。
- macOS 上 Runtime 子进程必须在 MCP 分支调用 `app.dock.hide()` 隐藏 Dock 图标，
  确保程序坞不会为同一 App Bundle 显示第二个图标。

### Authentication 与 Sync

- 依赖 `TokenStore` 等接口，不依赖具体凭据路径。
- 禁止向浏览器代码发送 Secret。
- Planning 必须保持无副作用。
- 每次修改都需要 Conflict Handling 与可审计证据。

### 反向输出

- 反向输出必须先说明来源、资产类型、目标目录和适用 scope。
- 反向输出必须显式说明 `placement` 与 `placementReason`；IDE 原生规则不得 Promote 为公约 Rule。
- Skills 默认应持续沉淀、更新并写回 `.skills/`；Rules 只在属于 Skill Central 公约、足够稳定且可复用时才进入 `.rules/`。
- `.rules/` 负责跨 IDE 的业务术语、What/Why、架构边界、风格、质量底线和门禁；`AGENT.md`、`AGENTS.md`、`CLAUDE.md` 等 IDE 原生规则只负责当前 IDE/机器的环境和 How。
- 判断归属时必须检查：业务领域/运行时环境、战略约束/战术执行、动态演进/相对静态三组边界。
- 同一内容同时包含公约和本地执行细节时必须拆分；IDE 原生规则不得重定义术语、删除门禁或放宽架构边界。
- Project-local guidance 不默认进入规则库，应保留在工作记录或临时产物中。
- 写入既有资产前，必须保留 diff 预览、backup 路径和 rollback 方案。
- 反向输出任务必须附带验证结果，或者明确标记为未验证。
- 最终结论必须是 `promote`、`defer` 或 `discard`，不能只停留在“可行/不可行”的口头判断。

## 文档审查

公共文档只描述 `main` 已有行为。部分能力应明确使用“实验性”“尚未实现”或“当前限制”等标签，不得将私有 Roadmap 转换为产品承诺。

修改一种语言时，必须在同一 Commit 更新对应语言。两种语言的标题与概念范围应保持一致，但不要求逐字直译。
