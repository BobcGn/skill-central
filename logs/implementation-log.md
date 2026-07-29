# 重构实施日志

本日志记录每一个实施切片，让路线图具备可审计轨迹：当前改了什么、验证了什么、还有哪些内容保持开放。

## 2026-07-29 - Phase 1A / WP-01 Universal Skill 内部模型

状态：完成

变更：

- 在 `src/schema/universal-skill.ts` 中新增 Universal Skill v1 类型和运行时校验。
- 在 `src/schema/legacy.ts` 中新增 legacy 校验和确定性升级逻辑。
- 将 `src/storage/parser.ts` 接入新的 schema 模块，让 legacy 文件和 v1 文件归一化到同一个内部模型。
- 保持 MCP prompt/tool 行为兼容：只有 prompt skill 暴露到 `prompts/*`，只有 tool skill 暴露到 `tools/*`。
- 更新 Web Board DTO，携带 `schemaVersion` 和 `sourceFormat`，同时继续返回既有 prompt/tool 字段。
- 扩展 `scripts/test.sh`，加入 5 个 v1 示例，以及缺失 `id`、非法 `type`、非法 capability 名称的反向校验。
- 更新 `docs/en/skill-schema.md` 和 `docs/ch/skill-schema.md`。

验证：

- `npm run lint`：schema/parser 集成后通过。
- `npm test`：恢复 legacy parser 对可选 `name`、可选 `description` 和宽松 `tags` 的兼容后通过。
- 集成测试覆盖 5 个 v1 示例：`prompt`、`tool`、`workflow`、`policy`、`context-router`。
- 集成测试覆盖缺失 `id`、非法 `type`、非法 capability 名称的错误定位。

TODO：

- Phase 1C 已在下方完成；剩余 registry 性能工作在 Phase 1C 条目中跟踪。

## 2026-07-29 - Phase 1B / WP-02 可配置 Layer System

状态：完成

变更：

- 新增完整 `SkillLayer` 治理元数据：`id`、`scope`、`writable`、`trust`、`sync`、`visibility` 和可选 `activation`。
- 新增 `src/storage/layers.ts`，作为 layer 提升、默认 legacy preset 元数据、scope distance 和确定性优先级的唯一实现位置。
- 将 `src/storage/config.ts` 中基于正则的配置解析替换为 YAML 解析。
- 保持 legacy `skill-central.yaml` 兼容：三字段 layer block 会被提升为完整 layer 对象。
- 更新 `OverrideTree`，保留 resolution records，而不是静默覆盖失败候选。
- 新增显式状态：`effective`、`shadowed`、`conflicted`。
- 调整平局处理：相同 `priority` 且相同 scope distance 会成为显式冲突，不再通过 `listSkills()` 暴露。
- 更新 `doctor`，展示 layer 治理元数据、legacy/universal/invalid 计数、shadowed 链和冲突原因。
- 更新 `show` 和 Web Board provenance，改用 engine resolution records，不再重新扫描 layers。
- 扩展 `scripts/test.sh`，加入 shadowed 和 conflict 场景。
- 更新 `docs/en/layered-override.md` 和 `docs/ch/layered-override.md`。

验证：

- `npm run lint`
- `npm test`
- `npm test`
- 既有 legacy `skill-central.yaml` 仍可加载。
- 不同 priority 的同 id skill 会解析到高 priority layer，`doctor` 会展示 `shadowedBy`。
- 相同 priority 且相同 scope distance 的同 id skill 会报告 conflict，从 effective list 输出中排除，并使 `doctor` 失败。

TODO：

- Phase 1C 已在下方完成；剩余 registry 性能工作在 Phase 1C 条目中跟踪。
- 后续 UI 轮次：在 Web Board 中展示 layer 的 `writable`、`sync` 和 `visibility`，而不是只在 DTO provenance 中返回。

## 2026-07-29 - Phase 1C / WP-03 Registry Query API

状态：完成

变更：

- 新增 `src/registry/query.ts`，作为 resolved skill records 的共享查询入口。
- 新增 `SkillQuery`，支持按 `id`、`type`、`tags`、`intent`、`capabilities` 和 `status` 查询。
- 查询结果保留 resolution records，使 provenance 以及 effective/shadowed/conflicted 状态可检查。
- 新增 `SkillEngine.querySkills()`，并迁移 Engine 既有 `listSkills()`、`getSkill()` 和 `getSkillsByTags()` wrapper，使其内部使用 registry query。
- 将 `skill-central list` 的 type/tag 过滤迁移到 `querySkills()`。
- 将 MCP prompt/tool list 和 get/call 路径迁移到 `querySkills()`。
- 将 Web Board health 和 skill list endpoint 迁移到 `querySkills()`。
- 新增 intent、capability 和 status/provenance 查询的直接集成覆盖。
- 新增 `docs/en/registry-query.md` 和 `docs/ch/registry-query.md`。
- 更新 MCP 文档，明确 shadowed/conflicted 候选不会被暴露。

验证：

- `npm test`
- `npm run test:registry-perf`
- 按 type 查询可返回 v1 workflow skills。
- 按 tag 查询可返回 v1 universal-tagged skills。
- 按 intent 查询可返回 `test-v1-workflow`。
- 按 capability 查询可返回 `test-v1-tool`。
- 使用 `status: "any"` 查询时，可针对已知 layer override 返回 effective 和 shadowed 候选。
- 1000-skill 性能 fixture 加载 1000 个本地 Universal Skill v1 文件，并确认所有被测查询低于 200ms。

性能证据：

- `id=0.17ms/1`
- `type=0.18ms/200`
- `tag=0.57ms/50`
- `intent=0.27ms/50`
- `capability=0.80ms/50`
- `status-any=0.16ms/1000`

TODO：

- 在 Phase 2 compiler dry-run report 依赖 registry results 前，补充机器可读 CLI query 输出。
- 在下游命令不再直接调用 `listSkills()` / `getSkill()` 前，继续保留兼容 wrapper。

## 2026-07-29 - Phase 1D / Lockfile Source Metadata

状态：完成

变更：

- 将 lockfile schema 升级到 `version: 2`。
- 新增 lock entry 字段：`sourceKind`、`resolvedHash` 和 `schemaVersion`。
- 保留 `sha256` 作为兼容 alias，供既有 update drift detection 使用。
- 新增 v1 lockfile 归一化，让旧版 `~/.skill-central/lock.json` 继续可读。
- 更新 install flow，写入 `sourceKind`、`resolvedHash` 和已安装 skill 的 `schemaVersion`。
- 新增读取 v1 lock entry 并写回 v2 metadata 的集成覆盖。
- 更新 `docs/en/remote-sources.md` 和 `docs/ch/remote-sources.md`。
- 强化 `scripts/test.sh` cleanup，使用 trap 确保失败时恢复临时 project config 和 user lockfile 变更。

验证：

- `npm test`
- Legacy lock v1 entry 会按 lock v2 读取。
- `sourceKind` 可从 `github:` source 推断。
- `resolvedHash` 会从 legacy `sha256` 填充。
- 缺失的 legacy `schemaVersion` 会变为 `unknown`。
- `writeLock()` 会持久化升级后的 v2 形态。

TODO：

- Phase 2 compiler dry-run 应在同一报告中消费 registry records 和 lockfile provenance。
- 后续供应链强化：在 sha256 drift detection 之外增加签名或 provenance 校验。

## 2026-07-29 - Phase 2A / WP-04 Compiler Dry-Run

状态：完成，带债务

变更：

- 在 `src/compiler/types.ts` 中新增 compiler dry-run 类型。
- 在 `src/compiler/capabilities.ts` 中新增最小 target capability matrix。
- 在 `src/compiler/degradation.ts` 中新增 degradation report 生成。
- 在 `src/compiler/prompt-bundle.ts` 中新增 preview artifact 生成。
- 在 `src/compiler/compiler.ts` 中新增 `compileIntentDryRun()`。
- 新增 `skill-central compile --target <target> --intent <intent> --dry-run`。
- Compiler 消费 Engine/Registry resolution records，而不是原始 skill files。
- Dry-run 输出 selected skills、shadowed/conflicted alternatives、capability checks、degradations、artifact previews 和稳定 report hash。
- 新增 cursor 和 windsurf dry-run report 集成覆盖，并验证不会写入目标文件。
- 更新 `docs/en/cli-reference.md` 和 `docs/ch/cli-reference.md`。

验证：

- `npm test`
- `skill-central compile --target cursor --intent ci-workflow --dry-run` 输出可审计报告。
- `skill-central compile --target windsurf --intent ci-workflow --dry-run` 输出可审计报告。
- Dry-run 不会写入 `.cursor/rules/test-v1-workflow.mdc` 或 `.windsurf/rules/test-v1-workflow.md`。

TODO：

- Phase 2B：将 target adapters 拆到 `src/adapters/*`，并把 capability matrix 移到 adapter interface 后面。
- 新增 `skill-central capabilities --target <target>`。
- 在实现 `export` 前新增机器可读 compile 输出。
- 新增 `export --target ... --out ...` 写事务，支持 diff、backup 且禁止静默覆盖。

## 2026-07-29 - Phase 2B / 目标端 Adapter 与能力矩阵

状态：完成，带债务

变更：

- 在 `src/adapters/types.ts` 中新增 `TargetAdapter` 契约。
- 在 `src/adapters/registry.ts` 中新增 adapter registry，让 CLI 和 compiler 共享 target validation。
- 新增首批 adapters：`src/adapters/generic-mcp.ts`、`src/adapters/cursor.ts` 和 `src/adapters/windsurf.ts`。
- 将 target capability declarations 移入 `src/adapters/capabilities/` 下由 adapter 拥有的 YAML 文件。
- 新增 `src/adapters/capability-loader.ts`，用于运行时加载和校验 capability YAML。
- 通过 `src/commands/capabilities.ts` 新增 `skill-central capabilities --target <target>`。
- 更新 compiler dry-run，让所选 adapter 负责 capability support 和 artifact previews。
- 用 adapter-backed capability lookup 替换 Phase 2A 中 compiler-local capability matrix。
- 保持 dry-run 无副作用；adapter artifacts 仍仅作为 previews。
- 更新 `docs/en/cli-reference.md` 和 `docs/ch/cli-reference.md`。
- 扩展 `scripts/test.sh`，加入 adapter snapshot、capability matrix 和 unknown-required-capability degradation 检查。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- `skill-central capabilities --target cursor` 输出 adapter-owned support data，包括 `requires-user-approval` 和 unknown-default note。
- Adapter snapshot 覆盖确认 `generic-mcp`、`cursor` 和 `windsurf` 生成稳定的 artifact kind/path，并携带 skill/layer provenance。
- `compile --dry-run` 仍不会写入 `.cursor/` 或 `.windsurf/` 文件。
- Required capability `ide.agent.experimentalMissing` 解析为 `unknown`，触发 degradation，并暴露声明的 `manual-instructions` fallback。

性能证据：

- `id=0.21ms/1`
- `type=0.20ms/200`
- `tag=0.47ms/50`
- `intent=0.31ms/50`
- `capability=0.49ms/50`
- `status-any=0.21ms/1000`

TODO：

- 在实现 export 前新增 JSON compile report 输出。
- 新增 `export --target ... --out ...` 写事务，支持 preview、diff、backup 且禁止静默覆盖。
- 扩展 degradation artifacts，让每一种 degradation mode 都具备 target-consumable instructions，而不只是 generic notes。

## 2026-07-29 - Phase 2C / Export 事务与 Phase 2 收尾

状态：完成

变更：

- 新增 `compile --json`，让 dry-run report 可被脚本消费，无需解析人类可读输出。
- 新增 `src/compiler/export-transaction.ts`，从 compile dry-run 返回的同一组 `AdapterArtifact[]` 规划写入。
- 新增 `skill-central export --target <target> --intent <intent> --out <dir>`。
- Export 支持 `--dry-run`、`--stdout`、`--json` 和 `--force`。
- Export 默认拒绝覆盖内容不同的既有文件。
- `--force` 会在覆盖前创建 `.bak.<timestamp>` 备份。
- Degradation artifacts 现在拥有确定性 target paths，并为 `manual-instructions`、`prompt-only`、`omit-step`、`ask-user`、`static-export` 和 `unavailable` 提供明确 next-action text。
- 更新 `docs/en/cli-reference.md` 和 `docs/ch/cli-reference.md`。
- 扩展 `scripts/test.sh`，加入机器可读 compile output、export dry-run、禁止静默覆盖、backup overwrite 和 stdout-only 检查。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- `compile --json` 输出可解析 bundle，包含 hash、artifacts 和 degradation reports。
- `export --dry-run` 列出 planned files 且不写文件。
- `export` 会写入 adapter artifacts 和 target-consumable degradation notes。
- 既有内容不同的文件默认会阻止 export。
- `export --force` 覆盖前会创建 timestamped backup。
- `export --stdout` 只打印 artifacts，不写文件。
- Phase 2 进入 Phase 3 的条件已满足：存在 3 个 adapters，capability/degradation 行为已测试，dry-run 和 export 共享 artifacts，生成 preview 包含 layer provenance，且禁止静默覆盖。

TODO：

- 在启用更广泛 IDE auto-apply workflow 前，增加更丰富的 unified diffs。
- 如果重复 export 产生过多备份，增加专用 transaction backup cleanup 命令。

## 2026-07-29 - Phase 3A / WP-05 IDE Connection Health

状态：完成，带债务

变更：

- 在 `src/ide-detection/types.ts` 中新增共享 IDE target 类型。
- 新增 `src/ide-detection/registry.ts`，作为 supported IDEs、默认 MCP config paths 和默认 `skill-central mcp` server entry 的规范来源。
- 新增 `src/ide-detection/detect.ts`，读取 IDE MCP configs 并报告注册证据，不写文件。
- 新增 `src/health/ide-connection.ts`，包含 `IdeConnectionHealth` 和 stdio MCP probe 逻辑，覆盖 `initialize`、`prompts/list` 和 `tools/list`。
- 新增 `doctor --ide <target>`、`--config-path`、`--verify` 和 `--json`。
- 重构 `register`，复用 IDE detection registry，不再维护独立 path constants。
- 更新 `docs/en/cli-reference.md` 和 `docs/ch/cli-reference.md`。
- 扩展 `scripts/test.sh`，加入 temporary-config health checks，覆盖 `not-registered` 状态和 JSON/human output 形态。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- `doctor --ide cursor --config-path <tmp> --json` 返回结构化 `not-registered` health report，并包含 Registry prompt/tool baseline counts。
- `doctor --ide cursor --config-path <tmp>` 打印人类可读 status 和 next actions。
- 未传 `--verify` 时，`doctor --ide cursor --config-path <tmp>` 报告 `registered`，不会启动 MCP probe。
- `doctor --ide cursor --config-path <tmp> --verify --json` 启动 `node dist/index.js mcp`，完成 `initialize`、`prompts/list` 和 `tools/list`，并确认 prompt/tool counts 与 Registry effective prompt/tool counts 一致。
- 默认 `doctor` 行为保持兼容，并通过既有 layer/schema/collision 检查。

性能证据：

- `id=0.21ms/1`
- `type=0.21ms/200`
- `tag=0.49ms/50`
- `intent=0.49ms/50`
- `capability=1.40ms/50`
- `status-any=0.24ms/1000`

TODO：

- CLI health API 稳定后，新增 Web Board IDE health endpoint 和 UI card。
- 继续进入 WP-06 one-click connect plan：preview、backup、write、verify、rollback。

## 2026-07-29 - Phase 3B / WP-06 One-Click Connect Plan

状态：完成，带债务

变更：

- 新增 `src/connect/types.ts`，定义 `OneClickConnectPlan` 和可审计 step records。
- 新增 `src/connect/connect-plan.ts`，用于构建、应用、验证和回滚 IDE MCP registration transactions。
- 新增 `skill-central connect --target <ide>`，支持 `--dry-run`、`--verify`、`--json`、`--rollback`、`--backup-path` 和 `--config-path`。
- Connect 保留既有 `mcpServers` entries，只更新 `mcpServers.skill-central`。
- Connect 在写入既有 IDE config 前创建备份。
- Connect verify 复用 `IdeConnectionHealth`，使一键连接和 `doctor --ide --verify` 共享 probe 语义。
- 更新 `docs/en/cli-reference.md` 和 `docs/ch/cli-reference.md`。
- 扩展 `scripts/test.sh`，使用临时 config path 覆盖 Cursor connect dry-run、apply+verify、backup preservation 和 rollback。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- `connect --target cursor --config-path <tmp> --dry-run --json` 打印 plan，且不写入临时 config。
- `connect --target cursor --config-path <tmp> --verify --json` 写入 `mcpServers.skill-central`，保留已有 MCP server entry，创建备份，并验证 MCP `connected` 状态。
- `connect --target cursor --config-path <tmp> --rollback --backup-path <backup>` 从 backup 恢复原始 config。

性能证据：

- `id=0.22ms/1`
- `type=0.22ms/200`
- `tag=0.48ms/50`
- `intent=0.39ms/50`
- `capability=0.85ms/50`
- `status-any=0.18ms/1000`

TODO：

- 针对新创建的 config 文件，rollback 应删除已创建文件，而不是写入 `{}`。
- 在面向桌面 UI 大范围暴露前，为格式异常的既有 IDE configs 增加 diff conflict policy。
- CLI plan/apply/verify/rollback 稳定后，新增 Web Board connect wizard。

## 2026-07-29 - Phase 3C / Web Board 本地控制台 API

状态：完成，带债务

变更：

- 为 Web Board `SkillDto` 新增 resolution status fields，使 UI 可展示 effective/shadowed/conflicted provenance，无需重新扫描 layers。
- 新增 `POST /api/compile/preview`，由 `compileIntentDryRun()` 支撑。
- 新增 `GET /api/ide-health`，由 `checkIdeConnectionHealth()` 支撑。
- 新增 `POST /api/connect/plan`，由 `buildConnectPlan()` 支撑，并有意保持 preview-only。
- 为 Web Board 增加轻量 local console panel，包含 IDE Health、Connect Plan 和 Compile Preview 操作。
- 更新 `docs/en/web-board.md` 和 `docs/ch/web-board.md`。
- 扩展 `scripts/test.sh`，加入 Hono app-level tests，证明 Web API 复用 compiler/health/connect modules，并证明 connect planning 不写 config files。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- Hono app-level test 确认 `/api/skills` 暴露 resolution `status`。
- Hono app-level test 确认 `/api/compile/preview` hash 与直接调用 `compileIntentDryRun()` 一致。
- Hono app-level test 确认 `/api/ide-health` 针对临时 config 返回结构化 `not-registered` 状态。
- Hono app-level test 确认 `/api/connect/plan` 包含 skill-central diff，且不写入临时 config。

性能证据：

- `id=0.26ms/1`
- `type=0.22ms/200`
- `tag=0.55ms/50`
- `intent=0.28ms/50`
- `capability=1.18ms/50`
- `status-any=0.19ms/1000`

TODO：

- 将 local console panel 提升为更完整的 IDE connection wizard，带明确 apply/rollback 控件。
- 新增 layer resolution view，展示所选 skill 的全部候选，而不仅是 effective DTO status。
- 在 local runtime management 存在后，新增 Web Board runtime service controls。

## 2026-07-29 - Phase 4/5 桌面优先规划

状态：完成

变更：

- 新增 `docs/dev/desktop-hub-roadmap/phase-4-5-execution-plan.md`。
- 将 Phase 4 和 Phase 5 重新聚焦到打包后的桌面应用目标（`.msi` / `.dmg`），而不是独立 Web Console。
- 将 Phase 4 拆为本地应用状态与 token 边界、GitHub Device Flow 与 repo 绑定、远端 manifest、sync dry-run 和 sync apply 工作包。
- 将 Phase 5 拆为 MCP resource router、持久化 session store、blackboard、workflow scheduler 和 PR review workflow MVP 工作包。
- 增加明确的打包关联项：desktop shell、packaged MCP command、installer smoke tests 和未来 release checklist。
- 更新 `docs/dev/desktop-hub-roadmap/README.md`，链接 Phase 4/5 执行规划。

验证：

- 仅规划变更；除文档复核外不需要实施验证。

TODO：

- Phase 4/5 API 稳定后，将 packaging tie-in 转换为专门的 release/installer phase。

## 2026-07-29 - Phase 3D / Phase 3 Closeout

状态：完成

变更：

- 修复 `rollbackConnectPlan()` 对新建 IDE config 的回滚行为：无 backup 的回滚现在会删除由 connect 新建的配置文件，而不是写入 `{}`。
- 为无 backup rollback 增加防护：只有配置文件严格等于 connect 生成的 `mcpServers.skill-central` 单项配置时才允许删除，避免误删用户已有配置。
- 在 `buildConnectPlan()` 中阻断格式异常的既有 IDE config；异常 JSON 不会生成写入计划，错误信息会提示用户先修复或恢复备份。
- Web Board 新增 `POST /api/connect/apply` 和 `POST /api/connect/rollback`，复用 CLI connect 的 plan/apply/verify/rollback 事务。
- Web Board 新增 `GET /api/skills/:id/resolution`，返回某个 skill 的完整 resolution record 和全部候选来源。
- 新增 `src/runtime/manager.ts`，为 Web Board 本地控制台提供 MCP 子进程 start/stop/status 管理；stdout 作为协议通道只进入 bounded ring buffer，stderr 作为诊断日志供 UI 查看。
- Web Board 新增 `GET /api/runtime/status`、`POST /api/runtime/start` 和 `POST /api/runtime/stop`。
- Web Board UI 增加连接 apply/rollback、Runtime/Start MCP/Stop MCP 控件，并在 skill 详情中增加 Resolution 视图，用户可以检查 effective/shadowed/conflicted 候选链。
- 扩展 `scripts/test.sh`，覆盖新建配置回滚删除、异常 JSON 阻断、Web connect plan/apply/rollback、Web resolution API、runtime API，以及 `LocalRuntimeManager` start/stop/stderr capture smoke。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- `connect --target cursor --config-path <new> --rollback` 会删除 connect 新建的配置文件。
- 异常 JSON IDE config 会在 connect plan 阶段失败，且原文件内容保持不变。
- Web connect apply 会写入配置并可执行 verify；rollback 可恢复备份或删除 connect 新建文件。
- Web resolution API 返回 `test-layer-shadow` 的 effective 和 shadowed 候选链。
- Web runtime API 可返回 stopped/running 状态，并能通过注入 runtime controller 验证 start/stop 契约。
- `LocalRuntimeManager` smoke 验证可启动子进程、捕获 diagnostic stderr，并可停止子进程。

TODO：

- 桌面 shell 形态确认后，需要把当前 Web Board 控件映射到正式桌面 UI，并补 `.msi` / `.dmg` 安装包内 smoke tests。

## 2026-07-29 - 文档简体中文统一

状态：完成

变更：

- 将 `docs/en/*.md` 同步为既有简体中文版本，保留目录作为兼容入口。
- 将 `README.md` 同步为 `README.zh-CN.md` 的简体中文内容。
- 将 `CHANGELOG.md`、`logs/implementation-log.md` 和 Phase 4/5 执行规划改写为简体中文。

验证：

- 已完成排除代码块后的英文散文扫描；剩余英文命中均为命令、字段名、协议名、代码示例、文件路径、错误原文、枚举值或外部专有名词。
- `npm run lint` 通过，确认文档调整未破坏现有 TypeScript 校验流程。

TODO：

- 后续新增文档默认使用简体中文；如必须保留英文原文，应确保它属于命令、字段、协议、错误输出或专有名词。

## 2026-07-29 - Phase 4A / 本地 App State 与 Token 边界

状态：完成，带打包前债务

变更：

- 新增 `src/local-store/paths.ts`，按 macOS、Windows、Linux 解析桌面安全 app state 根目录，并支持 `SKILL_CENTRAL_APP_STATE_DIR` / `--app-state-dir` 覆盖。
- 新增 `src/local-store/app-state.ts`，创建 `state`、`audit`、`cache`、`sync`、`tokens` 子目录，并写入 `state/app-state.json` manifest。
- 新增 `src/auth/token-store.ts`，定义 `TokenStore` interface 和 `DevelopmentFileTokenStore` fallback。
- `DevelopmentFileTokenStore` 只写入 app state 的 `tokens` 子目录，默认拒绝 `NODE_ENV=production` 使用。
- 新增 `skill-central sync status`，作为 Phase 4 local-first 状态入口，展示 app state、audit、sync metadata、cache 和 token store 边界。
- 更新 CLI 文档和新增 `docs/dev/desktop-hub-roadmap/local-app-state.md`，记录桌面存储边界和生产 keychain 要求。
- 扩展 `scripts/test.sh`，新增 Phase 4A app state/token boundary 覆盖。

验证：

- `npm run lint`
- `npm test`
- `sync status --app-state-dir <tmp> --json` 创建隔离 app state 目录，并报告 local-first / not logged in 状态。
- 测试确认 app state 不创建 `.skills`，也不在项目目录写 token 文件。
- `DevelopmentFileTokenStore` 支持 set/get/delete roundtrip，并在 `NODE_ENV=production` 下默认拒绝构造。

TODO：

- `.msi` / `.dmg` 发布前必须接入 OS keychain TokenStore；development fallback 不允许作为生产凭据存储。
- 下一切片进入 WP-07B：GitHub Device Flow 与 repo 绑定预览，继续复用本轮 TokenStore 和 app state 边界。

## 2026-07-29 - Phase 4B / GitHub Device Flow 与 Repo 绑定预览

状态：完成，preview-only

变更：

- 新增 `src/auth/github.ts`，实现可注入 `fetch` 的 GitHub Device Flow client，支持 request device code、poll access token、fetch user。
- GitHub token 持久化仍通过 Phase 4A 的 `TokenStore` 边界完成；auth 模块不直接写文件。
- 新增 `src/sync/github-registry.ts`，生成 GitHub registry repo 绑定/创建计划，默认 repo 为私有 `skill-central-registry`。
- 扩展 `skill-central sync`：支持 `status`、`login`、`logout`、`repo`。
- `sync login` 必须提供 `--client-id` 或 `SKILL_CENTRAL_GITHUB_CLIENT_ID`；缺失时明确失败且不写 token。
- `sync repo --dry-run` 在未登录状态下也能生成默认私有 registry plan；当前不创建 repo、不 push 文件。
- 更新 CLI 文档和 `docs/dev/desktop-hub-roadmap/local-app-state.md`，记录 Device Flow、repo dry-run 和 preview-only 边界。
- 扩展 `scripts/test.sh`，用 mock fetch 离线测试 Device Flow，并覆盖 repo dry-run、login 缺 client id、logout。

验证：

- `npm run lint`
- `npm test`
- GitHub Device Flow client 离线测试覆盖 device code、token response、user response 和 StoredToken 映射。
- `sync repo --owner octocat --dry-run --json` 未登录也返回 `create-private` plan，默认 repo 为 `skill-central-registry`。
- `sync login` 缺少 client id 时失败，且不写 token。
- `sync logout` 可清理 GitHub token 边界。

TODO：

- Phase 4C：冻结 remote registry manifest、lockfile 和 workspace profile schema。
- Phase 4D：在 manifest 和 sync plan 稳定后实现 repo apply / sync dry-run；所有远端写入仍必须先进入 preview 并写 audit log。

## 2026-07-29 - Phase 4C / Remote Registry Manifest 与 Scanner

状态：完成

变更：

- 新增 `src/sync/manifest.ts`，定义并校验 `skillcentral.dev/registry/v1` remote registry manifest。
- 新增 `src/sync/workspace-profile.ts`，定义并校验 `skillcentral.dev/workspace-profile/v1`，并强制 `sync.includeSessionState: false`。
- 新增 `src/sync/scanner.ts`，对本地 remote registry checkout 执行 dry-run scanner。
- Scanner 会报告 manifest 状态、`layers/` 下可导入 skill 文件、workspace profile 校验结果、unknown files 和字段路径级 issues。
- 扩展 `skill-central sync scan --registry-dir <path> --dry-run`，当前只读扫描，不写本地或远端状态。
- 更新 CLI 文档和 `docs/dev/desktop-hub-roadmap/local-app-state.md`，记录 registry layout、manifest、workspace profile 和 scanner 输出。
- 扩展 `scripts/test.sh`，构造 registry fixture，覆盖 manifest/profile 成功路径、unknown file 报告和 workspace profile 字段路径错误。

验证：

- `npm run lint`
- `npm test`
- `sync scan --registry-dir <fixture> --dry-run --json` 可报告 importable files、workspace profiles 和 unknown files。
- 错误 profile 中 `sync.includeSessionState: true` 会产生 `sync.includeSessionState` 字段路径 issue。

TODO：

- Phase 4D：实现 sync engine dry-run，基于 manifest layer layout 与本地 layer policy 生成 create/update/delete/conflict/noop 计划。
- Phase 4E：实现 sync apply，所有 overwrite/delete 必须先备份并写 audit log。

## 2026-07-29 - Phase 4D / Sync Engine Dry-Run

状态：完成

变更：

- 新增 `src/sync/sync-engine.ts`，生成只读 `SyncPlan`，不写本地文件、remote checkout 或 GitHub。
- 扩展 `scanRemoteRegistry()`，在 manifest 校验成功时把标准化 manifest 放入 scanner report，供 sync engine 使用。
- 新增 `skill-central sync plan --registry-dir <path> --direction push|pull|both --dry-run`，并支持 `--json` 输出完整计划。
- 计划操作状态覆盖 `create-local`、`create-remote`、`update-local`、`update-remote`、`delete-local`、`delete-remote`、`conflict`、`noop`、`excluded-policy`。
- 本地/远端文件 identity 固定为 `layerId/relativePath`，内容证据使用 `sha256`；后续 apply 不应重新发明分类规则。
- `sync.enabled: false` 会优先产生 `excluded-policy`；`--direction both` 遇到双方 hash 不一致会产生 `conflict`。
- 扩展 CLI 文档和 Phase 4 本地状态规划，记录 plan 命令、状态语义和 dry-run 边界。
- 扩展 `scripts/test.sh`，为 Phase 4D 增加 push/pull/both 方向和 dry-run 强制校验。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 临时目录清理检查：`.skill-central-app-state-ci`、`.skill-central-registry-ci`、`.skill-central-connect-ci`、`.skill-central-web-ci`、`.skill-central-export-ci` 均不存在。

TODO：

- Phase 4E：实现 `sync apply`，消费 Phase 4D plan；所有 overwrite/delete 必须先备份，并将 plan hash、用户决策和结果写入 app state `audit` 目录。

## 2026-07-29 - Phase 4E / Sync Apply Transaction

状态：完成

变更：

- 新增 `src/sync/sync-apply.ts`，实现 `applySyncPlan()`，消费 Phase 4D `SyncPlan` 执行本地 layer 与本地 registry checkout 写入。
- `create-local` / `create-remote` 默认允许；`update-local`、`update-remote`、`delete-local`、`delete-remote` 默认 blocked，必须使用 `--force`。
- update/delete 执行前会在原文件旁创建 `.bak.<timestamp>` 备份，并把备份路径写入 apply report。
- `conflict` 不自动解决；`noop` 和 `excluded-policy` 只记录为 skipped。
- 每次 apply 都会写入 app state `audit/sync-apply.<timestamp>.json`，记录 `planHash`、方向、远端根目录、force 状态、操作结果和备份路径。
- 扩展 `sync plan`，为 create 操作补齐缺失侧目标路径，确保 apply 使用用户可复核的 plan 目标，不自行推断写入位置。
- 新增 `skill-central sync apply --registry-dir <path> --direction push|pull|both [--force] [--json]`。
- 扩展 `scripts/test.sh`，覆盖 create apply、blocked conflict、默认阻断 destructive 操作、`--force` 备份后 update/delete 和 audit report。
- 更新 CLI 文档与 Phase 4 本地状态规划，记录 apply 边界、备份和审计语义。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 临时目录清理检查：`.skill-central-app-state-ci`、`.skill-central-registry-ci`、`.skill-central-connect-ci`、`.skill-central-web-ci`、`.skill-central-export-ci` 均不存在。

TODO：

- Phase 4F：已决定并实现全量预检阻断；见下一节。
- Phase 4F/5A：将 audit report 接入桌面 UI，展示 backup path、blocked reason 和下一步操作。

## 2026-07-29 - Phase 4F / Sync Apply Preflight 阻断

状态：完成

变更：

- 调整 `src/sync/sync-apply.ts`，将 apply 改为两阶段：先生成 preflight report，再执行文件写入。
- 只要 preflight 发现 `conflict` 或未使用 `--force` 的 update/delete，本轮 apply 不写任何本地 skill 文件或 registry checkout 文件。
- apply report 新增 `preflightBlocked`，用于 CLI、桌面 UI 和审计日志明确区分“已写入”和“预检阻断”。
- blocked preflight 仍会写入 app state `audit/sync-apply.<timestamp>.json`，保留 plan hash、blocked reason 和 skipped 操作证据。
- 更新 Phase 4D/E 集成测试，确认 conflict 阻断时 create 操作不会落盘。
- 将 Phase 4D/E sync apply 测试迁移到 `.skills/sync-ci-global` / `.skills/sync-ci-workflows` 隔离 layer，并临时覆盖 `skill-central.yaml`；测试结束恢复原配置，避免 `pull --force` 触碰真实 `.skills/01-global` 内容。
- 更新 CLI 文档和 Phase 4 规划文档，移除“部分成功”描述，将 preflight 全量阻断记录为当前合约。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 临时目录清理检查：`.skill-central-app-state-ci`、`.skill-central-registry-ci`、`.skill-central-connect-ci`、`.skill-central-web-ci`、`.skill-central-export-ci`、`.skills/sync-ci-global`、`.skills/sync-ci-workflows` 均不存在，`skill-central.yaml.bak.ci` 不存在。

TODO：

- 后续 conflict resolution 需要引入显式选择入口，避免 `both` 方向自动选择本地或远端。
- Phase 5A：将 audit report 接入桌面 UI，展示 backup path、blocked reason、preflight 状态和下一步操作。

## 2026-07-29 - Phase 5A / Web Board 同步审计只读控制面

状态：完成

变更：

- 扩展 `src/web/server.ts`，新增 `GET /api/sync/status`、`POST /api/sync/plan`、`GET /api/sync/audits`。
- `/api/sync/status` 复用 app state 边界，返回 app state paths 与 layer sync policy。
- `/api/sync/plan` 要求显式传入 `registryDir`，只生成 dry-run `SyncPlan`，不写本地或远端文件。
- `/api/sync/audits` 读取 app state `audit/sync-apply.*.json`，返回最近的 `SyncApplyReport`，包含 `preflightBlocked`、counts、blocked reason 和 backup path。
- 扩展 Web Board 前端，新增 registryDir 输入框和 **Sync Status**、**Sync Plan**、**Sync Audit** 按钮。
- Web UI 本轮不开放 `sync apply`，避免浏览器侧绕过 CLI 的显式 `--force`、preflight 和后续 conflict resolution。
- 扩展 `scripts/test.sh` 的 Web local console API fixture，覆盖 sync status、sync plan、sync audits 和缺少 registryDir 的 400 错误。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 文档，记录 Phase 5A 只读控制面边界。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5B：设计 conflict resolution 与 apply confirmation UI，明确何时允许 Web UI 发起 `sync apply`。
- 已关闭：sync audit report 已在 Phase 5G/5H 升级为可筛选、可分页的独立审计视图。

## 2026-07-29 - Phase 5B / Web Board 受保护 Sync Apply

状态：完成

变更：

- 扩展 `src/web/server.ts`，新增 `POST /api/sync/apply`。
- Web apply 必须传入 `registryDir` 和确认短语 `APPLY SYNC`；`direction` 仅允许 `push`、`pull`、`both`。
- Web apply 先复用 `buildSyncPlan()` 生成可审查计划，再调用 Phase 4F 的 `applySyncPlan()`，不在 Web 层重新分类或直接写文件。
- `force` 只作为 Phase 4F apply transaction 的显式输入；update/delete 默认仍由 preflight 阻断。
- `SyncApplyBlockedError` 会返回 `409 + { report }`，前端展示 `preflightBlocked`、audit path、plan hash、counts、blocked reason 和 backup path。
- 扩展 Web Board 前端，新增 direction 选择、force 勾选、确认短语输入和 **Apply Sync** 按钮。
- 扩展 `scripts/test.sh`，使用 `.skills/web-sync-ci` 隔离 layer 和 `.skill-central-web-ci/app-state` 覆盖 Web apply 缺少确认短语的 400、create-local 成功写入和 audit 边界。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5B 受保护写入边界。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5C：将 sync conflict resolution 做成显式逐项选择流程，不能由浏览器默认选择 local 或 remote。
- Phase 5C：将 sync audit report 升级为可筛选表格，支持按 blocked/applied/skipped、layer 和 direction 过滤。

## 2026-07-29 - Phase 5C / Web Sync Conflict Resolution

状态：完成

变更：

- 扩展 `POST /api/sync/apply`，支持 `resolutions` 数组，逐项处理 `both` 方向的 conflict。
- 每个 resolution 以 `layerId + relativePath` 定位 conflict，并要求 `choice` 为 `use-remote`、`use-local` 或 `skip`。
- `use-remote` 将 conflict 转换为 `update-local`；`use-local` 将 conflict 转换为 `update-remote`；`skip` 将 conflict 转换为 `noop`。
- 选择 local/remote 后仍需要 `force` 才能通过 Phase 4F preflight，Web 层不绕过 destructive write 保护。
- resolution 可携带 `expectedLocalHash` 和 `expectedRemoteHash`；服务端复核 hash，防止用户基于过期 Sync Plan apply。
- 扩展 Web 前端，在 `Sync Plan` 输出中渲染 conflict 逐项选择控件，默认保持 blocked。
- 扩展 `scripts/test.sh` Web fixture，覆盖 conflict skip 不落盘、stale hash 返回 400、use-remote + force 备份后覆盖本地文件。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5C 当前状态与剩余 TODO。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5D：为 conflict resolution 增加本地/远端 diff 预览，避免用户只凭 hash 做选择。
- Phase 5D：将 sync audit report 升级为可筛选表格，支持按 blocked/applied/skipped、layer 和 direction 过滤。

## 2026-07-29 - Phase 5D / Sync Diff 预览与 Audit 筛选

状态：完成

变更：

- 扩展 `POST /api/sync/plan` 的 Web 层响应，为 conflict operation 附加 `diffPreview`。
- 新增服务端行级 diff 生成逻辑，读取 local/remote 文本文件并输出截断的 unified-style 预览。
- diff preview 仅作为 UI 决策证据，不进入底层 sync engine、不参与 apply plan hash、不改变 Phase 4F audit 合约。
- 扩展 Web 前端，在 conflict resolution 控件下展示 diff preview，辅助用户选择 `use remote`、`use local` 或 `skip`。
- 将 `Sync Audit` 从纯文本输出升级为卡片列表，并支持 all / blocked / applied / skipped 筛选。
- 扩展 `scripts/test.sh` Web fixture，验证 conflict plan 包含本地/远端 diff preview。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5D 当前状态与剩余 TODO。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5E：将 audit 视图从控制台输出升级为独立桌面页面，支持按 layer、direction 和时间范围组合过滤。
- Phase 5E：支持打开具体 audit 文件和 backup 文件路径。

## 2026-07-29 - Phase 5E / 独立 Sync Audit 视图

状态：完成

变更：

- 扩展 Web Board HTML，新增 `sync-audit-view` 独立审计视图，与技能详情视图区分。
- 点击 **Sync Audit** 会加载最近 audit report，打开独立视图，并保留 all / blocked / applied / skipped 筛选。
- Audit card 新增 **Open audit**，可查看对应 audit JSON 内容。
- Audit card 为带 `backupPath` 的 operation 新增 **Open backup**，可查看备份文件内容。
- 新增 `GET /api/sync/audit-file`，只允许读取 app state audit 目录下的 `sync-apply.*.json`。
- 新增 `GET /api/sync/backup-file`，只允许读取最近 sync audit report 中出现过的 `backupPath`，避免 Web Board 变成任意本地文件读取器。
- 扩展 `scripts/test.sh` Web fixture，覆盖 audit JSON 读取、audit 引用 backup 读取、未引用路径 400 拒绝。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5E 当前状态与剩余 TODO。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5F：增加按 layer、direction 和时间范围组合过滤。
- Phase 5F：桌面封装后支持通过系统文件管理器定位 audit/backup 文件。

## 2026-07-29 - Phase 5F / Sync Audit 组合过滤

状态：完成

变更：

- 扩展 `GET /api/sync/audits`，支持 `outcome=all|blocked|applied|skipped`。
- 扩展 `GET /api/sync/audits`，支持 `direction=all|push|pull|both`、`layer=<layerId>`、`since`、`until`。
- 服务端会校验非法 outcome、direction、时间格式和反向时间范围，错误返回 400。
- 过滤只影响视图查询结果，不改写 audit report；原始 audit JSON 仍可通过受限的 `audit-file` 读取。
- 扩展 Web 前端独立审计视图，新增 outcome、direction、layer、since、until 控件，点击 Apply 后按组合条件重新请求服务端。
- 扩展 `scripts/test.sh` Web fixture，覆盖 blocked/direction/layer/time 组合过滤、direction 排除、非法时间范围 400、applied+direction+layer 过滤。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5F 当前状态与剩余 TODO。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5G：桌面封装后支持通过系统文件管理器定位 audit/backup 文件。
- Phase 5G：当 audit 目录很大时，引入按文件名时间窗口的读取前过滤。

## 2026-07-29 - Phase 5G / Audit 读取前时间窗口预筛选

状态：完成

变更：

- 扩展 `listSyncApplyAudits()`，支持传入 `since` / `until` 时间窗口。
- 新增 audit 文件名时间戳解析逻辑，识别 `sync-apply.<timestamp>.json`。
- 在读取 JSON 前，先通过文件名时间戳排除窗口外 audit 文件，减少大目录下的无效 JSON 读取。
- 非标准文件名仍保留读取路径，由 JSON `appliedAt` 做最终过滤，避免手工迁移文件被静默隐藏。
- JSON `appliedAt` 仍是最终过滤依据；文件名预筛选只是性能优化，不改变 audit 证据语义。
- 扩展 `scripts/test.sh` Web fixture，覆盖 `since` 窗口排除现有 audit report。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5G 当前状态与剩余 TODO。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5H：桌面封装后支持通过系统文件管理器定位 audit/backup 文件。
- Phase 5H：当 audit 数量进一步增长时，引入分页 cursor。

## 2026-07-29 - Phase 5H / Sync Audit Cursor 分页

状态：完成

变更：

- 扩展 `GET /api/sync/audits`，默认继续返回数组，兼容既有调用。
- 新增 `page=true` 查询参数；启用后返回 `{ items, nextCursor? }`。
- Cursor 使用上一页最后一个 audit 文件名，保持 newest-first 顺序，不暴露额外本地路径。
- Cursor 与 `outcome`、`direction`、`layer`、`since`、`until` 组合过滤共同工作。
- 前端独立审计视图切换到 paged API，并在存在 `nextCursor` 时显示 **Load more**。
- 扩展 `scripts/test.sh` Web fixture，覆盖 `limit=1&page=true` 第一页、`nextCursor` 和第二页继续读取。
- 更新 `docs/ch/web-board.md`、`docs/en/web-board.md` 和 Phase 5 规划文档，记录 Phase 5H 当前状态与剩余 TODO。

验证：

- `npm run lint`
- `npm test`

TODO：

- Phase 5I：桌面封装后支持通过系统文件管理器定位 audit/backup 文件。
- Phase 5I：如需跨运行稳定分页，可将 cursor 扩展为 `{ fileName, appliedAt }` 编码。

## 2026-07-29 - Phase 5I / MCP Resource 路由器 MVP

状态：完成

变更：

- 新增 `src/protocol/resources.ts`，集中解析 `skill://` URI，并保持 Resource 读取只读、无副作用。
- `skill-central mcp` 新增 `resources` capability，并在 MCP handler 中注册 `resources/list` 与 `resources/read`。
- `resources/list` 返回 `skill://registry` 和每个 effective skill 的 `skill://skill/{skillId}`。
- `resources/read` 支持 `skill://registry`，返回 registry resolution records，保留 effective/conflicted 候选与 layer provenance。
- `resources/read` 支持 `skill://skill/{skillId}`，返回单个 effective skill 的规范化 JSON。
- `resources/read` 支持 `skill://bundle/{target}/{intent}`，复用 `compileIntentDryRun()` 返回 `CompiledSkillBundle`，不写 IDE 文件、不执行项目数据面操作。
- `skill://session/...` 与 `skill://workflow/...` URI 已集中解析，但当前会显式失败，避免在 session store / blackboard / scheduler 落地前返回不可审计的占位状态。
- 扩展 `scripts/test.sh`，通过标准 MCP SDK Client 启动真实 `dist/index.js mcp`，覆盖 resource list、registry read、skill read、bundle read 和未知 URI 拒绝。
- 更新 `docs/ch/cli-reference.md`、`docs/en/cli-reference.md` 和 Phase 5 规划文档，记录 Resource URI 边界与后续 TODO。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 清理复核：无 `.skill-central-*-ci`、`.skills/sync-ci-*`、`.skills/web-sync-ci`、`skill-central.yaml.bak.ci` 残留。
- 真实 `.skills/01-global` 复核：仅保留 `architectural-mindset.yaml`、`debugging-expert.yaml`、`error-handling-patterns.yaml`，无 `.bak.*`、`test-sync-*`、`web-*` 或 `test-layer-shadow.yaml` 残留。
- `git diff --check`

TODO：

- Phase 5J：实现 `src/state/session-store.ts`，支持 session 生命周期、状态变化审计和重启恢复。
- Phase 5J：将 `skill://session/{sessionId}/context` 接到真实 session 状态；在此之前不要返回伪造 session resource。

## 2026-07-29 - Phase 5J / 持久化 Session Store

状态：完成

变更：

- app state 新增 `sessions` 受管目录，并更新 manifest notes，明确 workflow session 不写入 skill source。
- 新增 `src/state/session-store.ts`，以 `skillcentral.dev/session/v1` JSON 文件持久化 workflow session。
- Session 支持 `created`、`running`、`blocked`、`completed`、`failed` 状态。
- 每次状态变化会追加 audit event，包含 `timestamp`、`from`、`to`、`reason` 和 `trigger`。
- 新增 `skill-central session` CLI，支持 `create`、`list`、`show`、`status`，并支持 `--app-state-dir` 和 `--json`。
- MCP `resources/read skill://session/{sessionId}/context` 改为读取真实 app state session 文件，不再返回 Phase 5I 的占位失败。
- 扩展 `scripts/test.sh`，覆盖 session 创建、跨 CLI 进程恢复、running/block 状态转换审计、session list 和 MCP Resource 读取。
- 更新 `docs/ch/cli-reference.md`、`docs/en/cli-reference.md`、`docs/ch/mcp-protocol.md`、`docs/en/mcp-protocol.md`、`docs/dev/desktop-hub-roadmap/local-app-state.md` 和 Phase 5 规划文档。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 清理复核：无 `.skill-central-*-ci`、`.skills/sync-ci-*`、`.skills/web-sync-ci`、`skill-central.yaml.bak.ci` 残留。
- 真实 `.skills/01-global` 复核：仅保留 `architectural-mindset.yaml`、`debugging-expert.yaml`、`error-handling-patterns.yaml`，无 `.bak.*`、`test-sync-*`、`web-*` 或 `test-layer-shadow.yaml` 残留。
- `git diff --check`

TODO：

- Phase 5K：实现 topic-based blackboard，并把 `skill://session/{sessionId}/topic/{topic}` 接到真实 topic 存储。
- Phase 5K：保持 Prompt Compiler 只读取显式订阅 topic，避免恢复全量 session 历史。

## 2026-07-29 - Phase 5K / Topic Blackboard

状态：完成

变更：

- 新增 `src/state/blackboard.ts`，按 session 隔离持久化 blackboard topic。
- Topic 文件使用 `skillcentral.dev/blackboard-topic/v1` JSON schema，并保存在 app state `sessions/{sessionId}/blackboard/`。
- `publish` 采用 append-only 语义，不覆盖既有 topic entries。
- Blackboard entry 记录 `entryId`、`sessionId`、`topic`、`producer`、`kind`、`content`、`summary`、`refs` 和 `createdAt`。
- 扩展 `skill-central session` CLI，新增 `publish` 和 `topic` 动作，支持 JSON content、纯文本 content 和逗号分隔 refs。
- MCP `resources/read skill://session/{sessionId}/topic/{topic}` 改为读取真实 blackboard topic，并保持按 session/topic 精确读取，不返回全量 session 历史。
- 扩展 `scripts/test.sh`，覆盖 JSON content、文本 content、producer/kind/refs provenance、topic append 和 MCP Resource 读取。
- 更新 `docs/ch/cli-reference.md`、`docs/en/cli-reference.md`、`docs/ch/mcp-protocol.md`、`docs/en/mcp-protocol.md` 和 Phase 5 规划文档。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 清理复核：无 `.skill-central-*-ci`、`.skills/sync-ci-*`、`.skills/web-sync-ci`、`skill-central.yaml.bak.ci` 残留。
- 真实 `.skills/01-global` 复核：仅保留 `architectural-mindset.yaml`、`debugging-expert.yaml`、`error-handling-patterns.yaml`，无 `.bak.*`、`test-sync-*`、`web-*` 或 `test-layer-shadow.yaml` 残留。
- `git diff --check`

后续状态：

- Workflow scheduler 已在 Phase 5L 完成，可根据 topic 和 DAG 依赖推进下一批 Data Plane Task。
- Prompt Compiler / Scheduler 接入时必须继续只读取 Skill 显式声明的 subscribe topic，不能恢复全量 session 历史。

## 2026-07-29 - Phase 5L / Workflow Scheduler MVP

状态：完成

变更：

- 新增 `src/scheduler/workflow-scheduler.ts`，实现纯控制面的 workflow 调度器。
- 调度器支持 sequential workflow 和基础 DAG `dependsOn`。
- 调度器根据 workflow step 的 `outputTopic` 与 blackboard topic entry 判断 step 是否完成。
- 缺少依赖 step 或缺少显式 subscribe topic 时返回 `blockedReasons`，不执行项目数据面操作。
- Data Plane Task 只返回 `stepId`、`uses`、`resources` 和 `publishTo`；`resources` 仅包含所需 topic 的 `skill://session/{sessionId}/topic/{topic}` URI，避免注入全量 session 历史。
- 新增 `skill-central workflow` CLI，支持 `start`、`next`、`publish`、`summarize`。
- `workflow start` 会创建持久化 session 并返回第一批 ready tasks。
- `workflow publish` 复用 Phase 5K blackboard append-only 存储。
- `workflow next` 会根据 topic 和 DAG 依赖推进 ready / blocked / completed 状态。
- `workflow summarize` 聚合当前 session topic 的 latest summary 与 refs。
- 扩展 `scripts/test.sh`，覆盖 blocked required topic、start 第一批任务、未 publish 时保持等待、publish 后推进下一步、最终 completed 和 summary 聚合。
- 更新 `docs/ch/cli-reference.md`、`docs/en/cli-reference.md` 和 Phase 5 规划文档。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 清理复核：无 `.skill-central-*-ci`、`.skills/sync-ci-*`、`.skills/web-sync-ci`、`skill-central.yaml.bak.ci` 残留。
- 真实 `.skills/01-global` 复核：仅保留 `architectural-mindset.yaml`、`debugging-expert.yaml`、`error-handling-patterns.yaml`，无 `.bak.*`、`test-sync-*`、`web-*` 或 `test-layer-shadow.yaml` 残留。
- `git diff --check`

TODO：

- Phase 5M：将 `workflow.start`、`workflow.next`、`workflow.publish`、`workflow.summarize` 暴露为 MCP Tools。
- Phase 5M：为 Data Plane Task 增加 prompt bundle，使 IDE Agent 能直接获得与 step 相关的执行提示。

## 2026-07-29 - Phase 5M / MCP Workflow Tools 与 Prompt Bundle

状态：完成

变更：

- Data Plane Task 新增 `promptBundle`，包含 `role`、`text` 和 `resourceUris`。
- Prompt bundle 暴露 workflow id、session id、step id、uses、agent role、发布 topic 和必要 context resource，避免 IDE Agent 需要自行拼装控制面上下文。
- Prompt bundle 只列出当前 step 显式依赖的 `skill://session/{sessionId}/topic/{topic}`，不注入全量 blackboard history。
- MCP `tools/list` 新增内置 workflow tools：`workflow.start`、`workflow.next`、`workflow.publish`、`workflow.summarize`。
- MCP `tools/call` 复用 `runWorkflowAction()`，让 MCP 与 CLI 使用同一套 scheduler / session / blackboard 控制面路径。
- `workflow.publish` 的 MCP 参数允许 JSON-compatible content，CLI 字符串 content 仍保持 JSON 优先解析、失败后按文本写入。
- IDE 健康检查把内置 workflow tools 纳入 MCP 可见工具基准，避免 5M 后将预期工具误判为 drift。
- 扩展 `scripts/test.sh`，通过真实 MCP stdio 覆盖 workflow tools 列表、start、publish、next、summarize 和 prompt bundle resource 边界。
- 更新 `docs/ch/cli-reference.md`、`docs/en/cli-reference.md`、`docs/ch/mcp-protocol.md`、`docs/en/mcp-protocol.md` 和 Phase 5 规划文档。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 清理复核：无 `.skill-central-*-ci`、`.skills/sync-ci-*`、`.skills/web-sync-ci`、`skill-central.yaml.bak.ci` 残留。
- 真实 `.skills/01-global` 复核：仅保留 `architectural-mindset.yaml`、`debugging-expert.yaml`、`error-handling-patterns.yaml`，无 `.bak.*`、`test-sync-*`、`web-*` 或 `test-layer-shadow.yaml` 残留。
- `git diff --check`

后续状态：

- Phase 5M 完成后，Phase 5 已具备 MCP Resource + Session + Blackboard + Workflow Scheduler + MCP Workflow Tools 的最小闭环。
- 已关闭：`skill://workflow/{workflowId}/plan` 已在 Phase 5 收尾中接入只读 workflow definition plan。

## 2026-07-29 - Phase 5 收尾 / Workflow Plan Resource 与文档债务复核

状态：完成

变更：

- MCP `resources/list` 新增每个 workflow skill 的 `skill://workflow/{workflowId}/plan` 只读 Resource。
- MCP `resources/read skill://workflow/{workflowId}/plan` 返回 `skillcentral.dev/workflow-plan/v1` JSON，包含 workflow identity、strategy、source/layer provenance、capabilities/degradation、topic publish/subscribe 汇总和 step 依赖图。
- Workflow plan Resource 明确记录 `dataPlaneBoundary`：不执行命令、不读取项目文件、不写 skill source、不注入全量 session history。
- Workflow plan Resource 只解释 workflow definition，不创建 session、不读取 blackboard live state；真实推进仍通过 `workflow.*` MCP Tools 与 `skill://session/...` Resources 完成。
- 扩展 Phase 5I MCP Resource 集成测试，覆盖 workflow plan list/read、step dependency topic 和 data-plane boundary。
- 清理 Phase 5 规划文档中的过期 TODO：sync audit 表格化、session context、topic resource、workflow plan resource 已标记为完成或移入桌面封装阶段。
- 更新 `docs/ch/cli-reference.md`、`docs/en/cli-reference.md`、`docs/ch/mcp-protocol.md`、`docs/en/mcp-protocol.md` 和 Phase 5 规划文档。

验证：

- `npm run lint`
- `npm test`
- `npm run test:registry-perf`
- 清理复核：无 `.skill-central-*-ci`、`.skills/sync-ci-*`、`.skills/web-sync-ci`、`skill-central.yaml.bak.ci` 残留。
- 真实 `.skills/01-global` 复核：仅保留 `architectural-mindset.yaml`、`debugging-expert.yaml`、`error-handling-patterns.yaml`，无 `.bak.*`、`test-sync-*`、`web-*` 或 `test-layer-shadow.yaml` 残留。
- `git diff --check`

后续状态：

- Phase 5 的 MCP Resource + Session + Blackboard + Scheduler + Workflow Tools + Workflow Plan 只读证据闭环已收口。
- TODO：桌面封装阶段再处理系统文件管理器定位 audit/backup 文件、session/topic 独立 UI 导航，以及 OS keychain 等 MSI/DMG 专属能力。
