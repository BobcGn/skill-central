# skill-central 改造执行规划

## 1. 当前结论

目前没有阻塞规划的未解决疑点。可以开始执行，但需要把若干产品决策作为默认值冻结，并允许后续通过 Adapter 或配置回滚。

默认决策：

- 产品形态：local-first 桌面 Hub，本地功能不依赖登录。
- 首批 IDE：Cursor、Windsurf、Claude Code；Trae 作为预留 Adapter。
- 首批同步：GitHub private registry repo。
- 默认 layer preset：Personal、Project、Packages。
- 兼容策略：现有 4 层配置继续可用，通过 legacy preset 自动提升。
- 一键连接：支持完整自动化的 IDE 做 one-click connect；受限 IDE 使用 guided connect。

## 2. 执行顺序

建议先做 Phase 1 和 Phase 2 的薄切片，再进入桌面端。原因是桌面端 UI 必须复用稳定的 schema、registry、compiler 和 health check API，否则会形成两套业务逻辑。

执行顺序：

1. Phase 1A：Schema 与 legacy 兼容。
2. Phase 1B：可配置 Layer System。
3. Phase 1C：Registry 查询与 provenance。
4. Phase 2A：Compiler dry-run。
5. Phase 2B：首批 Adapter 与 capability matrix。
6. Phase 3A：IDE 检测、连接健康检查、一键连接。
7. Phase 3B：桌面控制台 UI。
8. Phase 4A：GitHub 登录与 private registry repo。
9. Phase 4B：Sync Engine 与 workspace profile。
10. Phase 5：动态调度与 Blackboard。

## 3. 第一批可开工工作包

### WP-01 Universal Skill 内部模型

目标：

- 建立 `UniversalSkill` 类型。
- legacy skill 加载后自动提升。
- 不改变现有 MCP 行为。

任务：

- 新增 `src/schema/universal-skill.ts`。
- 新增 `src/schema/legacy.ts`。
- 将 parser 输出升级为内部统一模型。
- 增加 legacy 兼容测试。

验收：

- `npm test` 通过。
- 现有 `prompts/list`、`prompts/get`、`tools/list`、`tools/call` 行为不变。
- 旧 skill 不需要手动迁移。

### WP-02 可配置 Layer System

目标：

- 把 layer 从固定目录语义升级为可配置资产治理边界。
- 保留当前 4 层作为兼容 preset。

任务：

- 新增 layer config schema。
- 实现 legacy 4 层配置提升。
- 实现 deterministic resolution：priority -> scope distance -> conflict。
- Registry result 增加 `effective`、`shadowed`、`conflicted`、`provenance`。
- `doctor` 输出覆盖链和冲突原因。

验收：

- 旧 `skill-central.yaml` 可加载。
- 同 id 多 layer 冲突可解释。
- priority 相同且无法消歧时不会随机选择。

### WP-03 Registry Query API

目标：

- 提供后续 compiler、MCP、UI 共享的查询入口。

任务：

- 支持按 id、type、tag、intent、capability 查询。
- 查询结果携带 layer、source、priority、scope、schemaVersion。
- 为 1000 个本地 Skill 做基础性能测试。

验收：

- 查询结果与 override resolution 一致。
- 1000 个 Skill 内查询低于 200ms。
- CLI / MCP / UI 不各自实现一套过滤逻辑。

### WP-04 Compiler Dry-Run

目标：

- 先实现可观察的编译报告，不急于写入 IDE 配置。

任务：

- 新增 `CompiledSkillBundle`。
- 新增 `compile --target <target> --intent <intent> --dry-run`。
- 输出 selected skills、shadowed skills、capability check、degradation、artifacts preview。

验收：

- dry-run 无文件写入。
- 编译报告能解释为什么选中某个 Skill。
- 同输入输出 hash 稳定。

### WP-05 IDE Connection Health

目标：

- 在做桌面 UI 前先建立可复用的 IDE 连接健康检查 API。

任务：

- 定义 `IdeConnectionHealth`。
- 实现 MCP probe：`initialize`、`prompts/list`、`tools/list`。
- 计算 `loadedSkillCount = prompt count + tool count`。
- 与 Registry effective prompt/tool 数量对比。
- 失败分类：not-registered、server-stopped、handshake-failed、permission-blocked、unknown-error。

验收：

- 连通时显示 loaded skill count。
- 数量不一致时列出 missing / extra skill id。
- 失败时返回可执行修复建议。

### WP-06 One-Click Connect Plan

目标：

- 将 IDE 连接从“写配置”升级为可预览、可回滚、可验证的事务。

任务：

- 定义 `OneClickConnectPlan`。
- Adapter 实现 `detect`、`planInstall`、`applyInstall`、`verify`、`rollback`。
- 新增 `connect --target <ide> --verify`。
- 至少支持 Cursor 完整流程。

验收：

- detect -> backup -> write -> verify 可完整跑通。
- 写入前展示 diff。
- 失败后可 rollback。
- 无法全自动时进入 guided connect。

## 4. GitHub 持久化执行包

### WP-07 GitHub Registry 仓库

目标：

- 用户登录后创建或绑定一个 private registry repo。

任务：

- 实现 GitHub Device Flow。
- token 存入系统安全凭据存储。
- 检测默认 repo `skill-central-registry`。
- 不存在时引导创建 private repo。
- 初始化 `manifest.yaml`、`lockfile.yaml`、`layers/`、`workspaces/`。

验收：

- 未登录本地功能不受影响。
- 新建 repo 默认 private。
- token 不明文落盘。

### WP-08 Workspace Profile 同步

目标：

- 将 workspace 保存为 profile，而不是每个 workspace 一个仓库。

任务：

- 定义 workspace profile schema。
- 保存 layer 启用关系、同步策略和用户批准的 repo 元数据。
- 默认不保存绝对路径、不保存会话历史、不保存项目上下文。

验收：

- workspace profile 可 push / pull。
- 用户未批准的 repo owner/name 不上传。
- `sync.enabled: false` 的 layer 不上传。

## 5. 返工总闸门

出现以下情况应停止进入下一阶段并返工：

- 旧用户 skill 或 `skill-central.yaml` 无法兼容。
- layer 冲突解析不可解释或不稳定。
- CLI、MCP、UI 出现三套不同的 Skill 查询结果。
- 一键连接只写配置但不验证连通性。
- GitHub 登录成为本地使用前置条件。
- 同步上传项目上下文、绝对路径、会话历史或未授权私有内容。

## 6. 建议下一步

下一步从 WP-01 开始，先建立 Universal Skill 内部模型和 legacy 兼容测试。WP-01 完成后再进入 Layer System，因为 layer resolution 会影响 Registry、Compiler、UI 和 Sync 的全部后续行为。
