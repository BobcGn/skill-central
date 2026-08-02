# IDE 集成

[English](../en/ide-integration.md) | [文档首页](./README.md)

## 集成模型

Skill Central 以本地 stdio MCP Server 连接 IDE：

```json
{
  "command": "skill-central",
  "args": ["mcp"]
}
```

`skill-central` 可执行文件必须存在于 IDE 进程使用的环境中。MCP 进程加载与 CLI 相同的 Skill Layer，并暴露 prompts、tools 和只读 resources。

通过打包桌面应用执行一键连接时，Skill Central 会写入当前 App Bundle 的绝对可执行路径，并让该可执行文件以 `mcp` 参数进入 stdio MCP 模式。这样 IDE 不需要从 shell `PATH` 中找到 `skill-central` 命令。源码 CLI 运行 `connect` 或 `register` 时仍写入上面的通用命令。

## 支持的连接目标

| 目标 | 格式 | 默认候选位置 |
| --- | --- | --- |
| Codex | TOML | 已存在的项目 `.codex/config.toml`，然后是 `~/.codex/config.toml` |
| Claude | JSON | `~/.claude.json`，然后是各平台 Claude Desktop 配置 |
| Trae | JSON | 各平台应用数据目录中的 Trae、Trae CN、TRAE 路径 |
| Cursor | JSON | `~/.cursor/mcp.json` |
| Windsurf | JSON | `~/.codeium/windsurf/mcp_config.json` |
| Cline | JSON | VS Code Global Storage 中的 Cline Extension 配置 |

对于 Codex，检测可以报告已经存在且受信任的项目配置，但创建新配置时默认选择用户配置。其他目标选择第一个已存在的候选路径，否则选择第一个默认路径。

候选路径集中定义在 [`src/ide-detection/registry.ts`](../../src/ide-detection/registry.ts)。平台路径变化必须在这里统一修改并补充测试，不得在命令或 UI 中重复实现。

## 命令

注册单个目标：

```bash
skill-central register codex
skill-central register claude
skill-central register trae
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

受支持 IDE 将配置存放在非标准位置时，使用 `--config-path <path>`。

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

只执行检测时可以返回 `registered`，不会启动进程。Verification 会执行有超时限制的 stdio Probe，并检查：

1. Process Spawn
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

上述六个目标表示 Skill Central 能在哪里注册 MCP Server。Compiler Adapter 用于生成目标特定的预览产物，目前只支持 generic MCP、Cursor 和 Windsurf。两组 Registry 用途不同，不得将其描述为相同覆盖范围。
