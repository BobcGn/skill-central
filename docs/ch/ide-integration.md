# IDE 集成

[English](../en/ide-integration.md) | [文档首页](./README.md)

## 集成模型

源码与 CLI 安装通过本地 stdio MCP Server 连接 IDE：

```json
{
  "command": "skill-central",
  "args": ["mcp"]
}
```

`skill-central` 可执行文件必须存在于 IDE 进程使用的环境中。MCP 进程加载与 CLI 相同的 Skill Layer，并暴露 prompts、tools 和只读 resources。

打包桌面应用改为注册现有 Board 进程提供的 Streamable HTTP 回环端点：

```json
{
  "url": "http://127.0.0.1:5417/mcp"
}
```

实际端口可能位于 `5417` 到 `5427`。多个 Agent 会话在同一个桌面进程中使用各自的 MCP
Session，不再各自常驻一个 stdio 子进程。注册变更后，需要重载或重启已经打开的 Agent。
源码 CLI 的 `connect` 和 `register` 仍写入上面的通用命令。

## 公约与 IDE 原生规则

项目 `.rules/` 是 Skill Central 公约，承载跨 IDE、跨人员的业务与工程约束。`AGENT.md`、`AGENTS.md`、`CLAUDE.md` 等 IDE 原生规则属于当前 IDE 或机器的环境适配层，只描述启动、调用和本地执行方式。

两者不是同一份规则的两种副本：

- 公约定义 What、Why、术语、架构边界、质量底线和门禁。
- IDE 原生规则定义当前环境中的 How，例如启动命令、IDE 特有能力和 Bootloader。
- IDE 原生规则不得删除或放宽公约；同一内容同时包含两类信息时必须拆分。
- IDE 无法满足公约时，应报告不兼容或显式降级，不得静默覆盖公约。

## IDE 反向输出

完成 MCP 连接验证后，IDE 可以使用 `reverse_output` Tool，将工作中发现的内容提议为
持久化库资产。请求必须说明来源、上下文、资产类型、操作、目标库以及明确的
`appliesTo` 作用域以及明确的 `placement`/`placementReason`。Skill 写入已配置且可写的
Skill Layer（通常位于 `.skills/`）；Rule 写入 `.rules/` 下的目录，并且必须通过公约
边界检查。

安全流程是：

1. 使用 `action: "preview"` 调用 `reverse_output`。
2. 检查归属、Schema、作用域、重复、冲突、目标和 Diff 结果。
3. 使用 `action: "apply"`，并且明确选择 `promote`、`defer` 或 `discard` 之一。
4. 更新既有资产时，提供当前源文件检查得到的 SHA-256。成功更新会返回同级 Backup
   Path 和 App State Audit Path。
5. 需要恢复时，使用 `action: "rollback"`，提供 Target Path、Backup Path 和当前
   expected SHA-256。

本地验证可使用同一服务的
`skill-central reverse-output preview|apply|rollback`。当前实验性能力尚未在 Web
Board 接入反向输出提案和 Promote 控件；Board 已有的 Skill/Rule 管理仍是独立入口。

## 连接目标

| 目标 | 支持级别 | 格式 | 默认候选位置 |
| --- | --- | --- | --- |
| Codex | 正式支持 | TOML | 已存在的项目 `.codex/config.toml`，然后是 `~/.codex/config.toml` |
| Claude Code | 正式支持 | JSON | `~/.claude.json` |
| Cursor | 正式支持 | JSON | `~/.cursor/mcp.json` |
| Trae | 实验性 | JSON | 各平台应用数据目录中的 Trae、Trae CN、TRAE 路径 |
| Windsurf | 实验性 | JSON | `~/.codeium/windsurf/mcp_config.json` |
| Cline | 实验性 | JSON | VS Code Global Storage 中的 Cline Extension 配置 |

对于 Codex，检测可以报告已经存在且受信任的项目配置，但创建新配置时默认选择用户配置。其他目标选择第一个已存在的候选路径，否则选择第一个默认路径。

候选路径集中定义在 [`src/ide-detection/registry.ts`](../../src/ide-detection/registry.ts)。平台路径变化必须在这里统一修改并补充测试，不得在命令或 UI 中重复实现。

## 命令

注册单个目标：

```bash
skill-central register codex
skill-central register claude
skill-central register trae
```

如果 `skill-central` 已经注册但 entry 与当前期望启动命令不同，`register` 会刷新该 entry，
而不是静默跳过。受支持 IDE 将配置存放在非标准位置时，可以指定路径：

```bash
skill-central register codex --config-path <path>
```

搜索已存在的已知配置并注册检测到的目标：

```bash
skill-central register
```

只生成可见连接计划，不写入：

```bash
skill-central connect --target codex --dry-run
```

应用配置并探测 MCP Server：

```bash
skill-central connect --target codex --verify
skill-central doctor --ide codex --verify
```

受支持 IDE 将配置存放在非标准位置时，`register`、`connect` 和 `doctor` 均可使用
`--config-path <path>`。

## 连接事务

Connection Plan 是 CLI 与 Board 共用的结构化数据，包含：

1. Target 和解析后的配置路径
2. 当前注册状态
3. 期望的 Server Entry
4. 有限长度的 Diff Preview
5. 已存在文件的 Backup Path
6. Detect、Preview、Backup、Write、Verify、Rollback Step

Apply 会解析当前 JSON 或 TOML，保留无关设置和其他 MCP Server，只新增或替换 `skill-central` Entry。配置文件已存在时，写入前会在同级目录创建带时间戳的 `.bak.*` 副本。

当前实现在完成备份后直接写入合并内容，尚未采用临时文件加 Rename 的原子替换。因此 Backup 是必需的恢复边界。

## 回退

事务修改既有配置时，Rollback 恢复计划记录的 Backup。事务创建新配置时，只有当前文件仍然只包含 Skill Central 创建的 Entry 才会删除；一旦出现无关数据，系统会拒绝删除。

请保留 Plan 展示的 Backup Path。Rollback 不会在多个备份中猜测应该恢复哪一个。

## 健康状态

只执行检测时可以返回 `registered`，不会建立连接。Verification 会按配置的 HTTP 或 stdio
Transport 执行有超时限制的 Probe，并检查：

1. Transport Connection（stdio 模式还包括 Process Spawn）
2. MCP Initialize Handshake
3. `prompts/list`
4. `tools/list`
5. IDE 可见 Skill ID 是否与 Registry Baseline 一致

可能的状态：

| 状态 | 含义 |
| --- | --- |
| `connected` | Probe 成功，且可见 ID 与 Registry 一致 |
| `connected-with-drift` | MCP 可用，但可见 ID 存在差异 |
| `registered` | 配置存在，但未请求实时 Probe |
| `not-registered` | Server Entry 不存在 |
| `server-stopped` | 配置的进程无法启动或提前退出 |
| `handshake-failed` | Initialize 或 List 协议检查失败 |
| `permission-blocked` | 配置或进程访问被拒绝 |
| `unknown-error` | 无法安全分类的失败 |

Health Result 会包含失败阶段、诊断文本和下一步建议。默认 Probe Timeout 为八秒。

Board 的 Runtime 视图是独立、按需启动的 stdio Launcher 烟测面，默认保持 stopped，也不是
打包桌面应用注册给 IDE 的服务。手动启动它可以验证内置 CLI 入口；IDE 健康检查则直接探测
共享 HTTP 端点。macOS 上显式启动的 Runtime 子进程会隐藏自己的 Dock 图标
（`app.dock.hide()`）。

## 新增 IDE

仅在 UI 中加入名称不代表完成 IDE 支持。贡献必须覆盖：

- Target Type 与共享 Registry Metadata；
- 官方文档链接；
- 适用的 macOS、Windows、Linux 候选路径；
- 配置结构与结构化 Codec；
- 已有注册检测；
- Plan、Backup、Apply、Verification 和 Rollback；
- Board 本地化与状态渲染；
- 路径、配置保留、畸形配置和回退测试。

不得对猜测路径进行静默兜底写入。不支持或有歧义的情况必须对用户可见。

## 连接目标与编译目标

上述目标表示 Skill Central 可以在哪里生成或协调 MCP 配置；当前稳定版仅正式支持 Codex、Claude Code、Cursor。Compiler Adapter 用于生成目标特定的预览产物，目前支持 generic MCP、Cursor、Windsurf。两组 Registry 用途不同，不得将其描述为相同覆盖范围。
