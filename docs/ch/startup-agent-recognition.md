# 启动即识别：Coding Agent 可用性规划

[English](../en/startup-agent-recognition.md) | [文档首页](./README.md)

## 目标

Skill Central 启动后，应尽最大可控程度让本机支持 MCP 的 Coding Agent 发现并使用它。这里的“可用”不是单一健康灯，而是四层条件同时成立：

1. 桌面应用或 CLI 进程可运行。
2. `skill-central mcp` 作为 stdio MCP Server 可以完成 initialize、`prompts/list` 和 `tools/list`。
3. 目标 IDE/Agent 的 MCP 配置中存在正确的 `skill-central` server entry。
4. 当前 Agent 会话已经加载或发现该 MCP 工具集合。

前 3 层由 Skill Central 控制并验证；第 4 层取决于具体 Agent 的加载模型。对已经启动且工具清单固化的会话，Skill Central 只能提示刷新、新建任务或触发该客户端支持的 discovery 流程，不能无条件热注入工具。

## 保证边界

Skill Central 可以保证：

- 正式检测并协调 Codex、Claude Code、Cursor；Trae、Windsurf、Cline 保持明确的实验性目标。
- 对支持目标写入或刷新 `skill-central` MCP 配置。
- 使用连接事务保留用户既有配置、生成备份并支持回退。
- 验证配置中的命令能完成 MCP handshake、列出 prompts/tools，并与 Registry baseline 对齐。
- 在配置缺失、命令不可执行、握手失败、数量漂移或当前会话需要刷新时给出可执行修复建议。

Skill Central 不能保证：

- 不支持 MCP 的 Agent 自动拥有 Skill Central 能力。
- 云端隔离或无本机文件访问权限的 Agent 访问本地 stdio server。
- 已经固化工具清单的会话在不刷新、不新建任务、不运行 discovery 的情况下立即出现新工具。
- 第三方客户端在未来版本中保持配置路径和热加载行为不变。

## 启动流程设计

桌面应用启动后应执行 `StartupConnectionReconciler`：

1. 读取当前工作区、全局配置、Skill Registry 和 Rules。
2. 启动本地 MCP runtime，并确认 stdio server 可握手。
3. 扫描 `RELEASE_SUPPORTED_IDES`（Codex、Claude Code、Cursor）的配置候选路径。
4. 对每个目标构建 connect plan：
   - 未注册：生成写入计划。
   - 已注册且配置一致：标记为 ready-to-verify。
   - 已注册但配置漂移：生成 refresh 计划。
   - 配置不可读：标记为 blocked，不写入。
5. 对允许自动修复的目标应用计划；对需要用户确认的目标展示计划和备份路径。
6. 对所有 registered/refreshed 目标运行 health probe。
7. 将状态返回 Board：`available`、`registered-needs-refresh`、`drift-refreshable`、`blocked`、`unsupported`。

CLI 路径继续复用同一套 `connect` transaction：`register` 负责幂等注册与漂移刷新，`connect --dry-run/--verify/--rollback` 负责显式事务控制。

Board API 提供同一后端核心：

```http
POST /api/startup-recognition
GET  /api/startup-recognition/latest
```

默认只返回识别报告，不写入配置。调用方必须显式传入 `applyDrift: true` 才会刷新已注册但漂移的 `skill-central` entry；传入 `registerMissing: true` 才会向已经存在且可读的 Agent 配置添加 entry。该 API 会逐 target 返回结构化状态，单个 target 的配置错误不会阻断其他 target 的报告。

桌面应用在 Board Server 监听成功后会异步调用该 API，并写入 app-state audit。这个启动钩子不阻塞窗口显示；它可以通过带备份的事务修复漂移，也可以向已经存在且可读的正式 Agent 配置注册 Skill Central，但不会为未安装或没有配置证据的 Agent 创建新文件。Board 的 IDE 页面读取 latest audit，展示最近一次识别时间、状态计数和审计文件路径。

## 任务拆分

### Phase 1：注册一致性与漂移修复

- 让 `register <ide>` 在已注册但 server entry 不等于期望配置时仍构建并应用 connect plan。
- 在 connect plan 中显式暴露漂移状态，供 CLI 与 Board 展示。
- 测试覆盖未注册、已注册一致、已注册漂移、不可读配置四种路径。

验收证据：

- CLI 测试证明漂移配置会被刷新，完全一致配置不会重复写入。
- `doctor --ide <target> --verify` 可以区分 `connected` 与 `connected-with-drift`。

### Phase 2：桌面启动 Reconciler

- 新增启动协调模块，复用 `buildConnectPlan`、`applyConnectPlan`、`verifyConnectPlan` 和 `checkIdeConnectionHealth`。
- 默认只自动修复安全、幂等且可回退的配置漂移；新建配置或高风险路径进入用户确认。
- Board 新增启动识别摘要，显示每个目标的状态、配置路径、命令、验证结果和下一步。

验收证据：

- 桌面启动后 Board 能展示所有目标的注册和验证状态。
- 配置写入均产生 backup 或可验证的“新建配置”回退条件。
- 被阻塞目标不被静默改写。

当前状态：后端核心 `reconcileStartupConnections()`、Board API `/api/startup-recognition`、app-state audit、桌面启动异步触发和 Board latest 摘要已实现。真实打包桌面应用的跨平台 smoke 验证仍属于 release gate，不能仅用单元/集成测试结果替代。

### Phase 3：Agent 会话发现引导

- 为 Codex 等懒加载环境提供 discovery 引导：说明当前任务需要触发工具发现或新建任务才能出现 `mcp__skill_central`。
- 在 Board 中区分“IDE 配置已连接”和“当前会话已发现工具”。
- 评估是否提供轻量 Codex skill/plugin 作为启动提示层，但不得把提示层当作 MCP 本身。

验收证据：

- 文档和 UI 不把已注册误报为当前会话已可调用。
- 对 Codex 工具懒加载场景有明确诊断和修复建议。

### Phase 4：可观测性与回归矩阵

- 为启动识别写入 app-state audit，记录目标、配置路径、计划摘要、验证结果和失败摘要。
- 增加跨平台路径样本测试，覆盖正式支持的 macOS 与 Windows 配置格式。
- 为 release checklist 增加“安装后首次启动识别矩阵”。

验收证据：

- audit 能恢复“启动 -> 注册/刷新 -> 验证 -> 用户提示”的证据链。
- 稳定版完成 Codex、Claude Code、Cursor 的真实本机识别验证。

## 回退策略

- 配置刷新通过 connect transaction 写入；既有文件先创建 `.bak.<timestamp>`。
- 新建配置只有在当前文件仍只包含 Skill Central entry 时才允许 rollback 删除。
- Startup Reconciler 不直接修改配置文件；它只调用 connect transaction。
- 回退只针对本轮计划记录的配置路径和 backup path，不扫描并猜测其他备份。

## 当前实现

`1.0.0` 已实现漂移修复、向既有正式 Agent 配置安全注册、异步启动审计，以及带实验性/未验证标签的 Board 状态。Skill 通过 MCP Prompts、Tools、Resources 暴露；Rule 可通过 `rule://` Resource、`rules:all` / `rule:<id>` Prompt 和 `rules.list` / `rules.get` Tool 直接消费。当前会话是否立即发现这些能力仍取决于 Agent，必要时需要刷新或新建任务。
