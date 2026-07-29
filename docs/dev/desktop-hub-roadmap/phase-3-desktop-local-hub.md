# Phase 3: 本地桌面 Hub

## 1. 阶段目标

将 CLI 和 Web Board 产品化为本地桌面控制台。这个阶段的目标不是重写 IDE，而是提供一个稳定的本机入口，用于管理技能资产、预览编译产物、注册 MCP Server、检测 IDE、查看本地运行状态。

Phase 3 完成后，用户应能通过桌面应用完成本地 Skill 管理和 IDE 集成，不需要手动编辑配置文件。

## 2. 产品边界

桌面端负责：

- Skill / Prompt Template / Rule 的浏览、编辑、校验和版本状态展示。
- Layer preset、自定义 layer、覆盖链和冲突解释。
- MCP Server 启停、状态检测和日志查看。
- IDE 检测、Adapter 配置预览和安装。
- 一键连接 IDE：自动检测、生成配置、备份写入、启动或刷新、验证连通性。
- IDE 连接健康检查、MCP 握手测试和已加载 Skill 数量校验。
- 本地数据库和缓存管理。
- Session / Workflow 的基础入口预留。

桌面端不负责：

- 替代 IDE 文件编辑器。
- 运行用户项目命令。
- 绕过 IDE 权限直接改项目文件。
- 在未授权情况下上传本地 Skill 或项目上下文。

## 3. 技术路线建议

推荐优先采用 local web app + desktop shell 的渐进路线：

1. 复用现有 Hono Web Board，先升级为完整本地控制台。
2. 引入本地守护进程管理 MCP Server 和 Adapter 检测。
3. 再用 Tauri 或轻量 wrapper 打包桌面应用。

选型建议：

| 方案 | 优点 | 风险 |
|---|---|---|
| Tauri | 体积小，本地集成强，适合开发者工具 | 需要 Rust/Tauri 打包链路 |
| Electron | 生态成熟，开发快 | 体积和资源占用较高 |
| Local Web + Tray | 迁移成本低，可复用现有 Hono | 桌面体验较弱 |

MVP 建议先实现 Local Web + Tray 或 Tauri shell，不要一开始做重 Electron。

## 4. 任务拆解

### 4.1 本地运行时管理

任务：

- 引入 local runtime service，统一管理 MCP Server 进程。
- 提供 MCP 状态：running、stopped、error、port、transport、lastError。
- 日志输出区分 protocol stdout 和 diagnostic stderr。

产出：

- `src/runtime/*`
- Web Board runtime 页面。
- 本地日志文件或 ring buffer。

检查点：

- 用户可以在 UI 中启动和停止 MCP Server。
- MCP 进程异常退出时 UI 能显示原因。
- 不污染 MCP stdout 协议流。

返工触发：

- UI 无法判断 MCP 是否真实可用。
- 日志混入 JSON-RPC stdout。
- 进程重复启动导致端口或 stdio 冲突。

### 4.2 IDE 检测与注册

任务：

- 检测已安装 IDE：Cursor、Windsurf、Trae、Claude Code。
- 读取目标 IDE 的 MCP / rules 配置位置。
- 提供配置预览和显式安装按钮。
- 每次写入前备份。
- 注册后提供连接测试入口，验证目标 IDE 是否能连通 `skill-central`。
- 连通时显示该 IDE 视角下 MCP 已加载的 prompt/tool Skill 数量，并与主看板 Registry 统计做一致性校验。
- 不连通时给出结构化反馈：未注册、配置路径错误、MCP 进程未运行、命令不可执行、协议握手失败、权限或 sandbox 限制。

产出：

- `src/ide-detection/*`
- `src/health/ide-connection.ts`
- Adapter install UI。
- IDE connection health UI。
- 安装审计记录。

检查点：

- 至少能检测 Cursor 和 Windsurf。
- 安装前能看到将修改的文件和 diff。
- 写入失败有明确恢复说明。
- 对已注册 IDE 执行连接测试时，能完成 MCP `initialize` 和 `prompts/list` / `tools/list` 基础探测。
- 连通状态下显示 `loadedSkillCount`，并且等于主看板中 effective prompt/tool Skill 数量。
- 不连通状态下必须展示可执行的修复建议，而不是只显示 failed。

返工触发：

- 自动写入无预览。
- 检测逻辑硬编码单一操作系统路径且不可覆盖。
- 安装失败后用户无法恢复原配置。
- 只显示“已注册”，但无法证明 IDE 与 MCP 实际连通。
- 已加载 Skill 数量与主看板不一致且无差异解释。
- 连接失败没有分类原因或修复建议。

### 4.3 IDE 连接健康检查

任务：

- 定义 `IdeConnectionHealth` 数据结构，覆盖目标 IDE、注册状态、MCP 进程状态、握手状态、Skill 统计和错误分类。
- 提供手动测试按钮和自动周期检测。
- 连接成功时展示：IDE 名称、配置文件路径、MCP server command、server version、prompt count、tool count、loaded skill count、last checked time。
- 连接失败时展示：失败阶段、错误摘要、原始诊断日志入口和下一步修复建议。
- 将主看板 Registry 的 effective Skill 统计作为基准，校验 IDE 侧 `prompts/list` + `tools/list` 数量。

建议状态模型：

| 状态 | 含义 | UI 行为 |
|---|---|---|
| `connected` | MCP 握手成功且 Skill 数量一致 | 显示 loaded skill count 和最后检测时间 |
| `connected-with-drift` | MCP 握手成功但 Skill 数量不一致 | 显示差异、建议刷新或重新注册 |
| `not-registered` | 未找到 IDE 注册配置 | 提供注册入口 |
| `server-stopped` | MCP Server 未运行或命令不可执行 | 提供启动或修复 command 建议 |
| `handshake-failed` | JSON-RPC initialize 失败 | 展示协议错误和日志 |
| `permission-blocked` | IDE 权限、sandbox 或用户设置阻止调用 | 展示目标 IDE 的权限检查建议 |
| `unknown-error` | 无法分类 | 展示诊断日志并建议重新检测 |

产出：

- `IdeConnectionHealth` schema。
- `skill-central doctor --ide <target>` 或等价健康检查命令。
- 桌面端 IDE 连接卡片。

检查点：

- 测试成功时，UI 显示 loaded skill count，且拆分为 prompt count 与 tool count。
- `loadedSkillCount = prompt count + tool count`。
- `loadedSkillCount` 与主看板 effective prompt/tool Skill 数量一致；如果不一致，UI 显示缺失或额外的 skill id。
- 失败时可以定位到失败阶段，并提供至少一个下一步动作。

返工触发：

- 健康检查只检查配置文件存在，不做 MCP 握手。
- 无法对比 IDE 侧加载数量和主看板 Registry 数量。
- skill 数量不一致时没有差异列表。
- 失败反馈不可操作。

### 4.4 一键连接 IDE

一键连接是可实现的，但不能假设所有 IDE 都提供完整自动化接口。产品上应定义为“尽最大可能自动完成连接，并在受限场景下退化为可验证的 guided connect”。核心不是把按钮做成无反馈的自动写配置，而是把检测、写入、验证、失败解释和回滚封装成一个稳定流程。

实现难点：

- IDE 配置格式不统一：不同 IDE 的 MCP 配置位置、JSON 结构、rules 目录和热加载行为不同。
- 操作系统路径差异：macOS、Windows、Linux 的应用配置目录、权限模型和 shell command resolution 不一致。
- MCP server command 可执行性：`npx`、全局安装、本地 dev build、桌面内置 runtime 的启动方式不同。
- 用户已有配置合并：不能静默覆盖已有 MCP servers、rules、Cascade 配置或用户注释。
- IDE 刷新能力不确定：部分 IDE 修改配置后需要重启，部分可能需要用户手动刷新 MCP。
- 连通性验证不一定能从 IDE 内部发起：如果 IDE 不暴露验证 API，只能通过本地 MCP probe、配置校验和用户侧确认组合判断。
- 权限和安全边界：桌面应用写 IDE 配置必须可预览、可备份、可回滚，不能绕过用户授权。
- 多版本 IDE 漂移：同一 IDE 不同版本可能改变配置路径、字段或 MCP 支持程度。

任务：

- 定义 `OneClickConnectPlan`，将连接过程拆成可预览、可执行、可回滚的步骤。
- 为每个 IDE Adapter 实现 `detect`、`planInstall`、`applyInstall`、`verify`、`rollback`。
- 支持 `skill-central connect --target <ide> --verify` CLI，供桌面端和自动化测试复用。
- 一键连接前展示将修改的配置文件、MCP server command、预计加载 Skill 数量。
- 写入前创建备份，写入后执行 MCP handshake 和 Skill 数量校验。
- 如果目标 IDE 需要重启或手动刷新，UI 必须明确显示下一步，并在用户完成后继续验证。
- 如果任一步失败，保留失败阶段、错误原因、日志入口和 rollback 操作。

建议流程：

```text
detect IDE
  │
  ▼
resolve adapter + config path
  │
  ▼
build connect plan
  │
  ▼
preview config diff
  │
  ▼
backup existing config
  │
  ▼
write / merge config
  │
  ▼
ensure MCP server command
  │
  ▼
refresh or ask user to restart IDE
  │
  ▼
run health check
  │
  ├─ connected: show loadedSkillCount
  ├─ connected-with-drift: show diff and repair action
  └─ failed: show reason + rollback
```

产出：

- `src/connect/one-click-connect.ts`
- `src/connect/connect-plan.ts`
- `skill-central connect --target <ide> --verify`
- 桌面端 `Connect` 按钮和连接向导。
- 连接操作审计日志。

检查点：

- 对至少一个 IDE 可以完成 detect -> backup -> write -> verify 的完整一键流程。
- 连接计划 dry-run 与实际写入一致。
- 已有用户配置不会被静默覆盖。
- 失败后可以从备份恢复。
- 无法全自动的 IDE 会退化为 guided connect，并且仍能执行最终健康检查。

返工触发：

- 一键连接只写配置，不做验证。
- 失败后无法回滚。
- 连接过程需要用户理解底层 MCP 配置细节。
- 不同 IDE Adapter 逻辑散落在 UI 层，无法通过 CLI 复用。
- 修改 IDE 配置前没有 diff 预览和用户确认。

### 4.5 资产管理 UI

任务：

- Skill 列表支持按 type、tag、layer、schemaVersion 过滤。
- Layer 页面支持查看默认 preset、自定义 layer、scope、priority、writable、trust、sync、visibility。
- Skill 编辑时执行实时 schema 校验。
- 支持 legacy / universal 状态标记。
- 支持显示 Skill 的 effective / shadowed / conflicted 状态。
- 支持 compile preview。

产出：

- Web Board 资产页升级。
- Layer 管理和冲突解释页面。
- Schema 错误展示组件。
- 编译预览面板。

检查点：

- 编辑非法 Skill 时不能静默保存。
- 用户可以一眼看到技能来源、层级、类型和目标端支持情况。
- 用户可以看到某个 Skill 为什么生效、被哪个 Skill 覆盖、是否可编辑。
- compile preview 与 CLI dry-run 结果一致。

返工触发：

- UI 只能编辑 prompt 文本，无法展示结构化字段。
- 校验错误不可定位。
- UI 只展示目录树，不解释 layer 语义和覆盖关系。
- UI 和 CLI 编译逻辑不一致。

### 4.6 本地存储

任务：

- 建立本地 app state 存储。
- 区分技能库文件、运行时状态、审计日志和 UI 偏好。
- 为 Phase 4 同步预留 local revision / remote revision 字段。

产出：

- `src/local-store/*`
- 数据目录规范文档。

检查点：

- 删除 app state 不会删除用户技能库。
- 审计日志可清理。
- 本地状态 schema 可迁移。

返工触发：

- 缓存和真实技能源混在一起。
- 无法判断某个 Skill 是否有未同步变更。
- 卸载应用会误删用户资产。

## 5. 可观测指标

| 指标 | 目标 |
|---|---|
| MCP 启停成功率 | 本机 smoke test 100% |
| IDE 注册可恢复性 | 每次写入有备份 |
| 一键连接完整性 | 至少一个 IDE 完成 detect -> backup -> write -> verify |
| IDE 连接健康检查 | 已注册 IDE 可执行 MCP handshake 和 Skill 数量校验 |
| Skill 数量一致性 | 连通时 IDE loadedSkillCount 与主看板 effective prompt/tool 数量一致 |
| UI / CLI 编译一致性 | 相同输入输出 hash 一致 |
| 本地模式可用性 | 未登录状态下核心功能可用 |
| layer 冲突可解释性 | 每个 conflict 都能在 UI 定位到来源文件 |

## 6. 阶段验收

验收路径：

1. 启动桌面应用或本地控制台。
2. 创建或编辑一个 Universal Skill。
3. 创建一个同 id 的 Project Skill 覆盖 Personal Skill，确认 UI 标记 effective / shadowed。
4. 对 Cursor 执行 compile preview。
5. 对 Cursor 执行一键连接，确认写入前有 diff 预览和备份。
6. 一键连接完成后执行 IDE 连接测试，确认 MCP `initialize`、`prompts/list`、`tools/list` 成功。
7. 确认 IDE loaded skill count 与主看板 effective prompt/tool Skill 数量一致。
8. 模拟 MCP command 错误，确认 UI 给出失败分类、修复建议和 rollback。
9. 对一个无法自动刷新的 IDE 目标执行 guided connect，确认用户完成手动步骤后仍可验证。
10. 关闭网络后仍可浏览和编辑本地技能。

## 7. 阶段决策

可以进入 Phase 4 的条件：

- 未登录状态下，本地技能管理和 IDE 注册可用。
- MCP Server 生命周期可观测。
- 至少一个 IDE 支持完整一键连接；其他受限 IDE 有 guided connect 降级路径。
- 至少一个 IDE 能完成连接健康检查，并显示与主看板一致的 Skill 数量。
- 桌面端所有写入都有预览、备份和错误处理。
- 用户能在 UI 中理解 layer 覆盖和冲突。
- UI 和 CLI 共享底层能力，不出现两套业务逻辑。

必须返工的条件：

- 桌面端成为云端功能的壳，本地离线不可用。
- 用户无法确认或恢复 IDE 配置修改。
- MCP 运行状态不可观测，出错只能看终端。
- 一键连接没有验证、回滚或 guided connect 降级路径。
- IDE 连接测试无法证明真实 MCP 连通性或 Skill 加载数量。
- layer UI 无法解释 effective / shadowed / conflicted。
