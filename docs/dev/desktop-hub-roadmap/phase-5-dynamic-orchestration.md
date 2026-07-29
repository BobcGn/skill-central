# Phase 5: 动态调度

## 1. 阶段目标

将 `skill-central` 从静态技能分发工具升级为动态 MCP Hub。这个阶段通过 MCP Resource / Tool、Workflow Scheduler 和 Blackboard，实现实时 Prompt 注入、多 Agent 协作和上下文路由。

Phase 5 完成后，IDE 可以调用 `skill-central` 的高层 Tool 启动一个多步骤工作流。每个 Agent 只收到与自身任务相关的上下文，并通过 publish / subscribe 推动后续步骤。

## 1.1 Phase 5A：同步与审计只读控制面

在进入动态调度前，桌面 UI 需要先能查看 Phase 4 产生的同步证据。Phase 5A 的范围是只读控制面，不开放浏览器侧 apply：

- Web Board 新增 `GET /api/sync/status`，展示 app state、audit 目录和 layer sync policy。
- Web Board 新增 `POST /api/sync/plan`，要求显式传入本地 registry checkout 路径，只生成 dry-run `SyncPlan`。
- Web Board 新增 `GET /api/sync/audits`，读取 app state 中最近的 `sync-apply.*.json`，展示 `preflightBlocked`、counts、blocked reason 和 backup path。
- 前端本地控制台新增 **Sync Status**、**Sync Plan**、**Sync Audit**，复用同一个 `console-output` 面板。

当前限制：

- Phase 5A 不执行 `sync apply`；受保护写入已转入 Phase 5B。
- `sync apply` 的安全边界仍以 Phase 4F 的 preflight、backup 和 audit 为准。

## 1.2 Phase 5B：受保护的 Web Sync Apply

Phase 5B 的目标是允许桌面 Web 控制台触发同步写入，同时不绕过 Phase 4F 已建立的安全边界。

已完成：

- Web Board 新增 `POST /api/sync/apply`。
- 请求必须携带 `registryDir` 和确认短语 `confirm: "APPLY SYNC"`。
- `direction` 仍限制为 `push`、`pull` 或 `both`，`force` 只透传到 Phase 4F apply transaction。
- 服务端先调用 `buildSyncPlan()`，再调用 `applySyncPlan()`；Web 层不重新分类、不自行写文件。
- preflight blocked 时返回 `409 + { report }`，前端展示 `preflightBlocked`、audit path、plan hash、counts、blocked reason 和 backup path。
- Web local console API 测试使用 `.skills/web-sync-ci` 隔离 layer 和 `.skill-central-web-ci/app-state`，不得触碰真实 `.skills/01-global` 或 `.skills/02-workflows`。

当前限制：

- Phase 5B 不做 conflict resolution；显式选择已转入 Phase 5C。
- Sync audit report 已在 Phase 5G/5H 升级为可筛选、可分页的独立审计视图。

## 1.3 Phase 5C：显式 Sync Conflict Resolution

Phase 5C 的目标是让 Web Board 可以处理 `both` 方向中的 conflict，但仍不允许浏览器默认替用户选择本地或远端。

已完成：

- `POST /api/sync/apply` 支持 `resolutions` 数组。
- 每个 resolution 通过 `layerId + relativePath` 定位一个计划中的 conflict。
- `choice: "use-remote"` 会把 conflict 转换为 `update-local`；仍需 `force` 才能覆盖本地文件。
- `choice: "use-local"` 会把 conflict 转换为 `update-remote`；仍需 `force` 才能覆盖远端 checkout 文件。
- `choice: "skip"` 会把 conflict 转换为 `noop`，本轮不写该文件。
- resolution 可带 `expectedLocalHash` 和 `expectedRemoteHash`，服务端会和当前 plan 复核，避免基于过期 dry-run 结果执行。
- 前端在 `Sync Plan` 输出中为 conflict 渲染逐项选择框，默认值为 blocked。
- Web integration test 覆盖 conflict skip、stale hash 400、use-remote + force 覆盖本地并产生 backup。

当前限制：

- Phase 5C 不提供 diff 预览和 audit 筛选；可审查 UI 已转入 Phase 5D。

## 1.4 Phase 5D：Sync Diff 预览与 Audit 筛选

Phase 5D 的目标是让 Web Board 在执行同步写入前提供足够证据，并让用户能快速定位历史 apply 结果。

已完成：

- `POST /api/sync/plan` 在 Web 层为 conflict operation 附加 `diffPreview`。
- diff preview 读取本地/远端文本文件，生成截断的 unified-style 行级预览。
- diff preview 只作为 UI 决策证据，不写入底层 sync engine，不参与 apply plan hash，也不改变 Phase 4F audit 合约。
- 前端在 conflict resolution 控件下展示 diff preview，用户不再只凭 hash 选择 local/remote/skip。
- `Sync Audit` 输出升级为卡片列表，并支持 all / blocked / applied / skipped 筛选。
- Web integration test 覆盖 conflict plan 中包含本地/远端 diff preview。

当前限制：

- Phase 5D 的 audit 仍在控制台输出；独立视图和文件读取已转入 Phase 5E。

## 1.5 Phase 5E：独立 Sync Audit 视图

Phase 5E 的目标是把同步审计从控制台临时输出提升为桌面 UI 的独立审计面板，并提供受限的证据文件读取能力。

已完成：

- Web Board 新增 `sync-audit-view` 独立视图，与技能详情视图分离。
- 点击 **Sync Audit** 会加载最近 audit report，打开独立视图，并保留 all / blocked / applied / skipped 筛选。
- 每个 audit card 可打开对应 audit JSON。
- 每个有 backup 的 operation 可打开对应 backup 内容。
- 新增 `GET /api/sync/audit-file`，仅允许读取 app state audit 目录下的 `sync-apply.*.json`。
- 新增 `GET /api/sync/backup-file`，仅允许读取最近 sync audit report 中出现过的 `backupPath`。
- Web integration test 覆盖 audit JSON 读取、audit 引用 backup 读取，以及未被 audit 引用路径的拒绝。

当前限制：

- Phase 5E 不支持组合过滤；组合过滤已转入 Phase 5F。
- TODO：桌面封装后可把“打开文件”升级为系统文件管理器定位；Web Board 当前只展示文本内容。

## 1.6 Phase 5F：Sync Audit 组合过滤

Phase 5F 的目标是让审计视图支持多维组合查询，而不是只按 outcome 做前端本地过滤。

已完成：

- `GET /api/sync/audits` 支持 `outcome=all|blocked|applied|skipped`。
- `GET /api/sync/audits` 支持 `direction=all|push|pull|both`。
- `GET /api/sync/audits` 支持 `layer=<layerId>`。
- `GET /api/sync/audits` 支持 `since` 和 `until` ISO timestamp，并拒绝非法时间和反向时间范围。
- 过滤在服务端读取 audit report 后执行，不改写 audit report 原始内容。
- 前端独立审计视图新增 outcome、direction、layer、since、until 控件，点击 Apply 后重新请求服务端。
- Web integration test 覆盖 blocked/direction/layer/time 组合过滤、direction 排除、非法时间范围 400、applied+direction+layer 过滤。

当前限制：

- Phase 5F 的时间过滤仍在读取 JSON 后完成；读取前时间窗口预筛选已转入 Phase 5G。
- TODO：桌面封装后可把“打开文件”升级为系统文件管理器定位；Web Board 当前只展示文本内容。

## 1.7 Phase 5G：Audit 读取前时间窗口预筛选

Phase 5G 的目标是在 audit 目录变大时减少不必要的 JSON 读取，同时不牺牲 audit report 的原始证据语义。

已完成：

- `listSyncApplyAudits()` 支持接收 `since` / `until` 时间窗口。
- 服务端会从 `sync-apply.<timestamp>.json` 文件名解析时间戳，并在读取 JSON 前先排除窗口外文件。
- 非标准文件名仍保留读取路径，由 JSON `appliedAt` 做最终过滤，避免手工迁移文件被静默隐藏。
- JSON `appliedAt` 仍是最终过滤依据；文件名预筛选只是性能优化。
- Web integration test 覆盖窗口外 audit 文件被排除。

当前限制：

- TODO：桌面封装后可把“打开文件”升级为系统文件管理器定位；Web Board 当前只展示文本内容。
- Phase 5G 仍只依赖 `limit` 截断列表；cursor 分页已转入 Phase 5H。

## 1.8 Phase 5H：Sync Audit Cursor 分页

Phase 5H 的目标是让审计列表可以按页加载，而不是只靠单次 `limit` 截断。

已完成：

- `GET /api/sync/audits` 默认保持数组响应，兼容既有调用。
- `GET /api/sync/audits?page=true` 返回 `{ items, nextCursor? }`。
- Cursor 使用上一页最后一个 audit 文件名，保持 newest-first 顺序，不暴露额外本地路径。
- Cursor 与 `outcome`、`direction`、`layer`、`since`、`until` 过滤共同工作。
- 前端独立审计视图切换到 paged API，并在有 `nextCursor` 时显示 **Load more**。
- Web integration test 覆盖 `limit=1&page=true` 的第一页、`nextCursor` 和第二页继续读取。

当前限制：

- TODO：桌面封装后可把“打开文件”升级为系统文件管理器定位；Web Board 当前只展示文本内容。
- TODO：后续如需跨运行稳定分页，可将 cursor 扩展为 `{ fileName, appliedAt }` 编码。

## 1.9 Phase 5I：MCP Resource 路由器 MVP

Phase 5I 的目标是启动动态调度主线的 MCP Resource 层，但只交付已有证据的只读路由，不提前伪造 session 或 workflow 状态。

已完成：

- `skill-central mcp` 声明 `resources` capability。
- 新增 `src/protocol/resources.ts`，集中解析 `skill://` URI。
- MCP `resources/list` 返回 `skill://registry` 和每个 effective skill 的 `skill://skill/{skillId}`。
- MCP `resources/read` 支持 `skill://registry`，返回 registry resolution records。
- MCP `resources/read` 支持 `skill://skill/{skillId}`，返回单个 effective skill 的规范化 JSON 和 provenance。
- MCP `resources/read` 支持 `skill://bundle/{target}/{intent}`，复用现有 `compileIntentDryRun()` 生成 `CompiledSkillBundle`。
- `skill://session/{sessionId}/context` 已接入真实 session store，`skill://session/{sessionId}/topic/{topic}` 已接入真实 blackboard topic。
- `skill://workflow/{workflowId}/plan` 已开放只读 definition plan，解释 step 依赖、topic 边界和 workflow 控制面工具。
- 集成测试通过标准 MCP SDK Client 启动真实 `dist/index.js mcp`，覆盖 resource list、registry read、skill read、bundle read、workflow plan read 和未知 URI 拒绝。

当前限制：

- Phase 5I 本身不实现 session 持久化、不读取 blackboard，也不调度 workflow；这些能力已在 Phase 5J-5M 与收尾工作中接入。
- `skill://bundle/{target}/{intent}` 是 dry-run 编译证据，不执行 IDE 写入和项目环境操作。
- `skill://workflow/{workflowId}/plan` 仍只解释定义，不创建 session、不读取 blackboard live state。

## 1.10 Phase 5J：持久化 Session Store

Phase 5J 的目标是为后续 blackboard 和 workflow scheduler 提供可恢复、可审计的 session 状态。这个阶段只做控制面状态，不执行 workflow step，也不读取项目数据面。

已完成：

- app state manifest 新增 `sessions` 受管目录；session 状态不写入 `.skills` 或项目配置。
- 新增 `src/state/session-store.ts`。
- Session 文件使用 `skillcentral.dev/session/v1` JSON schema。
- 支持 `created`、`running`、`blocked`、`completed`、`failed` 状态。
- 每次状态变化追加 audit event，包含 `timestamp`、`from`、`to`、`reason` 和 `trigger`。
- 新增 `skill-central session` CLI：
  - `session create --workflow-id <id>`
  - `session list`
  - `session show --session-id <id>`
  - `session status --session-id <id> --status <status> --reason <reason>`
- MCP `resources/read skill://session/{sessionId}/context` 读取真实持久化 session 状态。
- 集成测试覆盖 session 创建、跨 CLI 进程读取、状态审计追加、blocked 与 running 区分，以及 MCP Resource 读取。

当前限制：

- Phase 5J 本身不实现 blackboard topic；Phase 5K 已在其上接入 topic-based blackboard。
- Phase 5J 不实现 workflow scheduler，也不生成 Data Plane Task。
- `skill://session/{sessionId}/topic/{topic}` 已在 Phase 5K 接到真实 topic 存储。

## 1.11 Phase 5K：Topic Blackboard

Phase 5K 的目标是在持久化 session 之上增加 topic-based blackboard，让每个 Agent 只发布和读取明确 topic 的结构化结果。

已完成：

- 新增 `src/state/blackboard.ts`。
- Blackboard 按 session 隔离存储，路径位于 app state `sessions/{sessionId}/blackboard/`。
- 每个 topic 文件使用 `skillcentral.dev/blackboard-topic/v1` JSON schema。
- `publish` 会追加 entry，而不是覆盖既有 topic 历史。
- Entry 记录 `entryId`、`sessionId`、`topic`、`producer`、`kind`、`content`、`summary`、`refs` 和 `createdAt`。
- `skill-central session publish` 支持向 topic 发布 JSON 或文本 content。
- `skill-central session topic` 支持查看单个 topic。
- MCP `resources/read skill://session/{sessionId}/topic/{topic}` 读取真实 blackboard topic。
- 集成测试覆盖 JSON content、文本 content、producer/kind/refs provenance、topic append 和 MCP Resource 读取。

当前限制：

- Phase 5K 不实现 subscribe 策略执行；Prompt Compiler 后续必须只读取 Skill 显式声明的 subscribe topic。
- Phase 5K 不实现 workflow scheduler，也不自动判断 task ready。
- 已由 Phase 5L 实现 workflow scheduler，使 `workflow.publish` 后可以根据 topic 和 DAG 依赖推进下一批 Data Plane Task。

## 1.12 Phase 5L：Workflow Scheduler MVP

Phase 5L 的目标是把 session 与 blackboard 串成可推进的 workflow 控制面。Scheduler 只返回 Data Plane Task，不执行 Bash、不读取项目文件、不写 skill source。

已完成：

- 新增 `src/scheduler/workflow-scheduler.ts`。
- 调度器支持 sequential workflow。
- 调度器支持基础 DAG `dependsOn`。
- 调度器通过 workflow step 的 `outputTopic` 判断 step 是否已完成。
- 调度器为依赖 topic 生成 `skill://session/{sessionId}/topic/{topic}` resource 引用，避免注入全量 session 历史。
- 缺少依赖 step/topic 时返回 `blockedReasons`，不抛异常。
- 新增 `skill-central workflow` CLI：
  - `workflow start --workflow-id <id>`
  - `workflow next --session-id <id>`
  - `workflow publish --session-id <id> --topic <topic>`
  - `workflow summarize --session-id <id>`
- `workflow start` 会创建持久化 session 并返回第一批 ready Data Plane Task。
- `workflow publish` 复用 blackboard append-only 存储。
- `workflow next` 根据 blackboard topic 推进 ready/blocked/completed 状态。
- 集成测试覆盖 start 返回第一步、未 publish 时保持等待、publish 后进入下一步、最终 completed、summary 聚合 topic 摘要。

当前限制：

- Phase 5L 不执行项目数据面动作；执行仍由 IDE Agent 根据返回任务完成。
- Phase 5L/5M 的 prompt bundle 是最小可用版本，只列出显式 topic resource URI，不做复杂 prompt 模板编排。

## 1.13 Phase 5M：MCP Workflow Tools 与 Prompt Bundle

Phase 5M 的目标是让 IDE 不必绕回 CLI，就能通过 MCP `tools/call` 启动和推进 workflow，同时让每个 Data Plane Task 自带可执行提示。

已完成：

- MCP `tools/list` 暴露内置 workflow tools：`workflow.start`、`workflow.next`、`workflow.publish`、`workflow.summarize`。
- MCP `tools/call` 复用 `skill-central workflow` 控制面逻辑，返回 JSON text，便于 IDE 读取完整调度报告。
- Data Plane Task 新增 `promptBundle`，包含 `role`、`text` 和 `resourceUris`。
- `promptBundle.text` 明确 workflow id、session id、step id、uses、agent role、发布 topic 和必要 context resource。
- `promptBundle.resourceUris` 只包含当前 step 显式依赖的 `skill://session/{sessionId}/topic/{topic}`，不注入全量 blackboard 内容。
- IDE 健康检查把内置 workflow tools 纳入 MCP 可见工具基准，避免把预期的内置工具误报为 drift。
- 集成测试通过真实 MCP stdio 验证 tools/list、workflow.start、workflow.publish、workflow.next 和 workflow.summarize。

当前限制：

- MCP workflow tools 仍只负责控制面调度，不执行 Bash、不读取项目文件、不写 skill source。
- Prompt bundle 还不是完整的多 Agent prompt compiler；后续如需更复杂模板，应继续保持显式 topic 读取边界。

## 2. 范围

包含：

- MCP `resources/list` 和 `resources/read`。
- Resource URI 路由。
- Workflow Session。
- Blackboard topic 存储。
- Workflow 调度器。
- 动态 Prompt Bundle。（Phase 5M 已提供最小可用 bundle）
- 多 Agent 审查工作流 MVP。

不包含：

- 云端 Agent 执行。
- 自研 IDE 数据面。
- 无限制长期记忆。
- 复杂图数据库。

## 3. 任务拆解

### 3.1 MCP Resource 路由器

任务：

- 在 MCP Handler 中支持 `resources/list` 和 `resources/read`。（Phase 5I 已完成）
- 定义 `skill://` URI 规范。（Phase 5I 已完成）
- Resource 内容支持动态编译。（Phase 5I 已完成 `skill://bundle/{target}/{intent}`）
- Session / topic URI 已接入真实状态存储。（Phase 5J/5K 已完成）
- `skill://workflow/{workflowId}/plan` 已开放只读 definition plan，解释 step 依赖、topic 边界和 workflow 控制面工具。（收尾完成）

URI：

```text
skill://registry
skill://skill/{skillId}
skill://bundle/{target}/{intent}
skill://session/{sessionId}/context
skill://session/{sessionId}/topic/{topic}
skill://workflow/{workflowId}/plan
```

产出：

- `src/protocol/resources.ts`。
- Resource URI parser。
- MCP integration tests。
- Session Resource adapter。（Phase 5J 已完成）
- Topic Resource adapter。（Phase 5K 已完成）

检查点：

- IDE 能 list 出可用资源。
- `skill://bundle/cursor/review-pr` 会返回编译后的 Prompt Bundle。
- `skill://workflow/{workflowId}/plan` 会返回只读 workflow definition plan，不创建 session。
- 未知 URI 返回标准 MCP error，不影响 server。

返工触发：

- Resource 只返回静态文件，无法使用 session/context。
- URI 解析分散在多个模块。
- Resource error 破坏 JSON-RPC 会话。

### 3.2 Session 存储

任务：

- 实现本地 Session 状态。（Phase 5J 已完成）
- 支持 `created`、`running`、`blocked`、`completed`、`failed`。（Phase 5J 已完成）
- 记录状态变化审计。（Phase 5J 已完成）
- `workflow.start` 自动创建 session。（Phase 5L CLI、Phase 5M MCP 已完成）

产出：

- `src/state/session-store.ts`。
- session CLI 基础视图。
- 桌面 UI session 视图移入 MSI/DMG 桌面封装阶段，避免在 Web Board 收尾中引入新的导航面。

检查点：

- session create 后生成 sessionId。（Phase 5J CLI 已完成；workflow.start 已接入）
- 每次状态变化有 timestamp、reason、trigger。（Phase 5J 已完成）
- 应用重启后可以恢复未完成 session。（Phase 5J 已通过跨进程 CLI/MCP 测试）

返工触发：

- Session 只存在内存，重启即丢。
- 状态变化无审计记录。
- blocked 和 failed 无法区分。

### 3.3 Blackboard

任务：

- 实现 topic-based publish / subscribe。（Phase 5K 已完成 publish/read；subscribe enforcement 转入 compiler/scheduler）
- 每条 entry 记录 producer、kind、content、summary、refs。（Phase 5K 已完成）
- Scheduler / prompt bundle 只列出 Skill 声明或 step 依赖订阅的 topic。（Phase 5L/5M 已完成最小闭环）

产出：

- `src/state/blackboard.ts`。
- `session publish` / `session topic` CLI inspect 入口。
- `workflow.publish` Tool。（Phase 5M 已完成）
- Topic inspect UI 移入 MSI/DMG 桌面封装阶段；当前 CLI 与 MCP Resource 已提供可审计读取入口。

检查点：

- Agent 可以向 topic 发布结构化结果。（Phase 5K CLI/MCP 已完成）
- 下游步骤只收到订阅 topic URI。（Phase 5L/5M 已完成）
- 每个 topic 可以查看 latest、summary、refs。（Phase 5K 可查看 entries/summary/refs；latest 专用视图转入 UI）

返工触发：

- 下一步 Prompt 注入全量历史。
- entry 无 provenance，无法追踪来源。
- topic 没有摘要策略，Token 无法控制。

### 3.4 Workflow 调度器

任务：

- 支持 sequential workflow。（Phase 5L 已完成）
- 支持基础 DAG：`dependsOn`。（Phase 5L 已完成）
- 根据 Blackboard topic 判断任务是否 ready。（Phase 5L 已完成）
- 返回 Data Plane Task，而不是直接执行环境操作。（Phase 5L 已完成）

产出：

- `src/scheduler/workflow-scheduler.ts`。
- `skill-central workflow start`。
- `skill-central workflow next`。
- `skill-central workflow publish`。
- `skill-central workflow summarize`。
- MCP Tool `workflow.start` / `workflow.next` / `workflow.publish` / `workflow.summarize`。（Phase 5M 已完成）

检查点：

- `workflow.start` 返回第一批可执行任务。（Phase 5L CLI、Phase 5M MCP 已完成）
- `workflow.publish` 后 `workflow.next` 返回下一步。（Phase 5L CLI、Phase 5M MCP 已完成）
- 缺少 required context 时进入 blocked。（Phase 5L 已返回 blockedReasons）
- Data Plane Task 带 `promptBundle`，且只列出必要 topic resource URI。（Phase 5M 已完成）

返工触发：

- Scheduler 直接执行 Bash 或读项目文件。
- DAG 依赖判断不可测试。
- 缺少上下文时抛异常而不是 blocked。

### 3.5 多 Agent 审查工作流 MVP

任务：

- 实现一个内置 `pr-review.workflow`。
- 包含 context analyst、security reviewer、maintainer reviewer 三个角色。
- 每个角色有独立 Prompt 和输出 topic。
- 最终 summarize 生成 findings。

产出：

- `skills/workflows/pr-review.workflow.yaml`
- MCP Tool `agent.review`。
- 桌面端 workflow run 视图。

检查点：

- IDE 可以通过单个 Tool 启动 review。
- 三个角色不会共享全量上下文。
- 最终输出包含 finding、severity、file ref、recommendation。

返工触发：

- 多 Agent 只是把三个 Prompt 拼在一起。
- 任一 Agent 输出无法被后续步骤引用。
- 最终报告无法追踪到来源 topic。

## 4. 可观测指标

| 指标 | 目标 |
|---|---|
| Prompt 上下文来源 | 100% 来自显式 subscribe topic |
| Session 状态变化审计 | 100% 记录 |
| Data Plane 越界执行 | 0 |
| blocked 可恢复性 | publish 缺失 topic 后可继续 |
| 单 workflow token 注入 | 可通过 summary 控制，不注入全量历史 |

## 5. 阶段验收

验收路径：

1. IDE 调用 `workflow.start` 启动 PR Review。
2. `skill-central` 返回第一批 Data Plane Task。
3. IDE Agent 执行读取 diff 或让用户提供 diff，并调用 `workflow.publish`。
4. Scheduler 推进到 security review。
5. security reviewer 发布 findings。
6. maintainer reviewer 汇总结果。
7. `workflow.summarize` 返回最终审查报告。
8. 桌面端可查看 session、topic、状态变化和审计记录。

## 6. 阶段决策

可以判定 Phase 5 完成的条件：

- MCP Resource 和 Tool 路由稳定。
- Workflow 可以跨多次 IDE 调用推进。
- Blackboard 能有效限制上下文注入。
- 数据面操作全部交给 IDE Agent。
- 缺少能力或上下文时可 blocked、可恢复、可审计。

必须返工的条件：

- 动态调度退化为一次性 Prompt 拼接。
- `skill-central` 开始直接执行项目环境操作。
- 上下文路由无法控制 Token，仍然依赖全量历史。
- Session 无法恢复或无法审计。
