# Phase 4/5 执行规划：桌面优先的同步与编排

## 1. 定位

Phase 4 和 Phase 5 必须服务于最终打包成桌面应用的目标（`.msi` / `.dmg`）。本地 Web Console 仍然有价值，但它的定位只是可嵌入 UI 表面和开发验证路径，不能演变成独立产品线。

因此，桌面打包约束会同时影响两个阶段：

- 所有 local-first 能力必须在未登录 GitHub 时可用。
- GitHub 登录和同步只是桌面应用内部的可选增强能力。
- 同步状态、工作流会话、审计日志和本地应用状态默认必须写入桌面安全存储位置，而不是项目目录。
- 对 IDE 配置、registry 文件、同步状态或工作流状态的任何写入，都必须可预览、可备份或可恢复，并写入审计记录。
- Runtime API 必须继续可被 CLI、嵌入式 WebView UI 和未来 native shell command 复用。

## 2. Phase 4 目标

Phase 4 引入 GitHub 支撑的同步能力，但不能削弱离线本地使用体验。

MVP 结果：

- 用户无需登录即可继续使用本地 skills。
- 用户可以通过桌面安全流程完成 GitHub 认证。
- 用户可以绑定或初始化私有 registry repo。
- 用户可以执行 dry-run、push、pull，并查看同步状态。
- 同步必须遵守 layer 的 `sync.enabled`、`visibility`、`writable` 和 `trust`。
- 冲突必须显式呈现，绝不能静默覆盖。
- Workspace profile 同步默认排除绝对路径和项目上下文，除非用户明确批准。

## 3. Phase 4 工作包

### WP-07A 本地应用状态与安全 Token 边界

目的：

- 在 OAuth 或 sync 产生任何写入前，先建立桌面应用状态边界。

任务：

- 新增 `src/local-store/*`。
- 定义 macOS、Windows 和 Linux 的 app data directories。
- 分离 skill source files、app state、audit logs、cache 和 sync metadata。
- 新增 `TokenStore` interface，并提供一个拒绝生产使用的 development fallback。
- 为 `.msi` / `.dmg` 构建记录 production secure storage 要求。

产物：

- `src/local-store/paths.ts`
- `src/local-store/app-state.ts`
- `src/auth/token-store.ts`
- 桌面存储文档。

验收：

- 删除 app state 不会删除 `.skills`。
- 测试可以使用 override directory。
- token 不会写入普通 project config。

TODO：

- 生产凭据存储可能需要在打包阶段接入 OS keychain。

### WP-07B GitHub Device Flow 与 Repo 绑定

目的：

- 把 GitHub identity 作为可选同步设置，而不是本地使用前置条件。

任务：

- 实现 GitHub Device Flow。
- 通过 `TokenStore` 存储 token。
- 检测 login state。
- 绑定既有 repo，或规划创建默认私有 `skill-central-registry`。
- 所有 repo 创建和绑定动作都必须先进入 preview。

产物：

- `src/auth/github.ts`
- `src/sync/github-registry.ts`
- CLI：`skill-central sync login`、`sync logout`、`sync status`、`sync repo --dry-run`。

验收：

- 未登录时，本地命令仍可工作。
- login scopes 保持最小化。
- repo 创建计划默认 private。

TODO：

- 浏览器跳转和回填体验属于桌面 shell 的职责。

### WP-07C 远端 Registry Manifest

目的：

- 在同步 skill files 前冻结 remote registry format。

任务：

- 定义 registry manifest schema。
- 定义 lockfile 和 layer directory layout。
- 定义 workspace profile schema。
- 新增 manifest validation 和 dry-run scanner。

产物：

- `src/sync/manifest.ts`
- `src/sync/workspace-profile.ts`
- remote registry layout 文档。

验收：

- 扫描既有 repo 时，会报告可导入文件和未知文件。
- Workspace profile 默认排除绝对路径。
- Manifest validation errors 包含字段路径。

### WP-08A Sync Engine 预演

目的：

- 在 push/pull 写入前，实现确定性的同步规划。

任务：

- 对比 local 和 remote content hashes。
- 分类 create/update/delete/conflict/noop。
- 强制执行 layer sync policy。
- 生成机器可读 sync report。

产物：

- `src/sync/sync-engine.ts`
- CLI：`skill-central sync plan --direction push|pull|both --json`。

验收：

- `sync.enabled: false` 的 layers 不会上传。
- 同一文件本地和远端都发生变化时，必须判定为 conflict。
- plan 阶段不发生写入。

### WP-08B Sync Apply 与冲突安全

目的：

- 应用 sync plans，但不能静默覆盖或造成数据丢失。

任务：

- 应用 create/update/delete operations。
- 覆盖或删除本地文件前创建备份。
- 写入 sync audit log。
- 持久化 local/remote revision metadata。

产物：

- CLI：`skill-central sync apply --plan <file>`。
- local app state 中的 sync audit log。

验收：

- conflict 会阻止 apply。
- 每个本地 overwrite/delete 都存在 backup。
- sync report 记录数量和受影响路径。

## 4. Phase 4 闸门

只有满足以下条件，才能进入 Phase 5：

- 未登录时本地应用仍可工作。
- token storage path 明确，且不是 project config。
- remote registry 默认 private。
- sync dry-run 和 apply 都有测试。
- layer sync policy 被强制执行。
- workspace profile 默认不会泄露项目路径或上下文。
- 冲突可恢复，并有审计记录。

## 5. Phase 5 目标

Phase 5 将桌面应用升级为动态 MCP 控制面。

MVP 结果：

- IDE 可以发现 dynamic resources。
- IDE 可以跨多次 MCP 调用启动并推进 workflow sessions。
- Blackboard topics 以显式方式路由上下文。
- Scheduler 返回交给 IDE/Agent 执行的 tasks；`skill-central` 绝不直接读取项目文件或运行项目命令。
- 桌面 UI 可以查看 sessions、topics 和 audit events。

## 6. Phase 5 工作包

### WP-09A MCP Resource Router

任务：

- 新增 MCP `resources/list` 和 `resources/read`。
- 新增集中式 `skill://` URI parser。
- 暴露 registry、skill、bundle、session、topic 和 workflow resources。

产物：

- `src/protocol/resources.ts`
- `src/protocol/resource-uri.ts`

验收：

- `skill://bundle/cursor/<intent>` 返回与 CLI/Web Board 相同的 compile bundle preview。
- 未知 URI 返回受控 MCP error。

### WP-09B 持久化 Session Store

任务：

- 在 app state 下新增 local session store。
- 支持 `created`、`running`、`blocked`、`completed`、`failed`。
- 记录 state transition audit entries。

产物：

- `src/state/session-store.ts`

验收：

- session 在应用重启后仍存在。
- 每个 status transition 都包含 timestamp、reason 和 trigger。

### WP-09C Blackboard Topic 存储

任务：

- 新增 topic publish/read APIs。
- 存储 producer、kind、content、summary、refs 和 timestamps。
- 将 prompt injection 限制在已订阅 topics 内。

产物：

- `src/state/blackboard.ts`
- MCP tool：`workflow.publish`。

验收：

- 下游 prompts 只接收声明订阅的 topics。
- topic entries 可从桌面 UI/API 检查。

### WP-10A Workflow 调度器

任务：

- 实现 sequential 和基础 DAG `dependsOn`。
- 返回 data-plane tasks，而不是执行代码。
- 在缺少所需 topic/context 时进入 blocked。

产物：

- `src/scheduler/workflow-scheduler.ts`
- MCP tools：`workflow.start`、`workflow.next`、`workflow.summarize`。

验收：

- `workflow.start` 返回 ready tasks。
- `workflow.publish` 可以解除 `workflow.next` 的 blocked 状态。
- 缺少上下文会产生可恢复的 `blocked` 状态。

### WP-10B PR Review 工作流 MVP

任务：

- 新增内置 PR review workflow。
- 角色：context analyst、security reviewer、maintainer reviewer。
- 将角色输出存入不同 topics。
- 汇总 findings，并保留 provenance。

产物：

- `skills/workflows/pr-review.workflow.yaml`
- MCP tool：`agent.review`。
- 桌面 session/topic inspector。

验收：

- 多步骤 review 可跨 MCP calls 推进。
- 角色默认不会接收完整历史。
- 最终报告将 findings 链接到 topic/source entries。

## 7. Phase 5 闸门

只有满足以下条件，Phase 5 才算完成：

- MCP resource/tool routing 稳定。
- Workflow state 可持久化且可审计。
- Blackboard 控制 context injection。
- `skill-central` 不执行任何项目 data-plane operation。
- blocked sessions 可恢复。
- 桌面 UI 可以查看 sessions、topics 和 audit logs。

## 8. 打包关联项

发布 `.msi` / `.dmg` 前必须完成：

- 选择 shell：优先考虑 Tauri；如果 Node runtime bundling 让 Electron 更实际，则改用 Electron。
- 定义 MCP server 和 connect plans 在打包应用中的 bundled runtime command。
- 用 packaged executable paths 替换 development `skill-central` command 假设。
- 增加 installed app smoke tests：
  - 启动桌面 shell。
  - 加载本地 skills。
  - 使用 packaged command 注册 Cursor。
  - 验证 MCP handshake。
  - 在未登录状态创建 sync dry-run。
  - 查看一个 workflow session。

TODO：

- Phase 4/5 API 稳定后，新增面向打包的 Phase 6 或 release checklist。
