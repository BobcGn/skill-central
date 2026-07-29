# Phase 1: 资产统一

## 1. 阶段目标

建立 `skill-central` 的统一资产模型。这个阶段不追求桌面端体验，也不追求动态调度，重点是把 Skill、Prompt Template、Rule、Workflow 的源格式标准化，形成后续编译、同步和调度的基础。

Phase 1 完成后，系统应能同时加载 legacy skill 和 Universal Skill v1，并在内部统一为稳定的数据结构。

## 2. 范围

包含：

- Universal Skill Schema v1。
- legacy schema 自动提升。
- 可配置 Layer System。
- schema 校验和错误报告。
- Registry 查询模型。
- 基础 lockfile 元数据。
- 文档和示例。

不包含：

- IDE 方言生成。
- 桌面应用打包。
- GitHub 登录。
- 云端同步。
- 多 Agent 动态调度。

## 3. 任务拆解

### 3.1 定义 Universal Skill Schema v1

任务：

- 新增 `schemaVersion` 字段。
- 扩展 `type`：`prompt`、`tool`、`workflow`、`policy`、`context-router`。
- 新增 `activation`、`capabilities`、`targets`、`context`、`degradation` 字段。
- 保留现有 `id`、`name`、`description`、`tags`、`prompt`、`inputSchema`。
- 定义 TypeScript 类型和运行时校验。

产出：

- `src/schema/universal-skill.ts`
- `src/schema/legacy.ts`
- `docs/ch` 和 `docs/en` 的 schema 文档更新。

检查点：

- 至少 5 个 v1 示例文件可以通过校验。
- 缺失 `id`、非法 `type`、非法 capability 名称能给出清晰错误。
- schema 校验错误包含文件路径、字段路径和错误原因。

返工触发：

- v1 schema 无法表达现有 prompt/tool。
- 新字段需要大量特殊分支才能兼容 legacy。
- 错误信息无法定位到具体文件或字段。

### 3.2 可配置 Layer System

任务：

- 将当前固定的 4 层目录模型升级为可配置 layer 模型。
- 保留 `01-global`、`02-workflows`、`03-domains`、`04-tech-stack` 作为兼容 preset。
- 为 layer 增加 `id`、`name`、`path`、`scope`、`priority`、`writable`、`trust`、`sync`、`visibility`、`activation` 字段。
- 定义确定性冲突规则：先按 `priority`，再按 scope 距离，仍冲突则进入显式 conflict。
- Registry 查询结果必须包含 layer provenance 和 shadowed 状态。

建议配置：

```yaml
layerPresets:
  active: default

layers:
  - id: personal
    name: Personal
    path: ~/.skill-central/skills/personal
    scope: user
    priority: 10
    writable: true
    trust: local
    sync:
      enabled: true
    visibility: private

  - id: project
    name: Project
    path: .skills/project
    scope: workspace
    priority: 50
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private

  - id: packages
    name: Packages
    path: .skills/packages
    scope: workspace
    priority: 30
    writable: false
    trust: remote
    sync:
      enabled: true
    visibility: private
```

产出：

- `src/storage/layers.ts`
- layer config schema。
- legacy 4 层 preset 迁移逻辑。
- `doctor` layer conflict 报告。

检查点：

- 不配置新 layer 字段时，现有 `skill-central.yaml` 仍可加载。
- 同一个 Skill id 出现在多个 layer 时，解析结果稳定。
- 被覆盖 Skill 标记为 `shadowed`，并能说明被哪个 layer 覆盖。
- priority 相同且 scope 也无法消歧时，不静默随机选择。

返工触发：

- 代码仍然依赖目录名判断语义层级。
- layer 冲突解析不可预测。
- 用户无法知道某个 Skill 为什么生效或为什么被覆盖。
- 新 layer 模型要求旧用户立即重写配置。

### 3.3 Legacy Skill 自动提升

任务：

- 将旧格式 Skill 在加载时转换为 Universal Skill 内部模型。
- 保证 MCP `prompts/list`、`prompts/get`、`tools/list`、`tools/call` 行为不变。
- 在 `doctor` 中展示 legacy skill 数量和迁移建议。

产出：

- `upgradeLegacySkill()`。
- 兼容测试。
- `doctor` 输出扩展。

检查点：

- 现有测试和 MCP 基础流程不需要修改技能文件即可通过。
- 同一个 legacy skill 在内部有确定的默认 `schemaVersion`、`capabilities` 和 `targets`。
- `doctor` 能区分 legacy、universal、invalid。

返工触发：

- legacy 兼容导致现有 MCP 行为变化。
- legacy 升级结果不稳定，重复加载产生不同内部模型。
- 用户必须手动迁移旧技能才能继续使用。

### 3.4 Registry 查询能力

任务：

- 将当前 Engine 演进为 Registry 查询入口。
- 支持按 `id`、`tags`、`type`、`activation.intents`、`capabilities` 查询。
- 基于可配置 Layer System 执行确定性覆盖和 shadowed 标记。

产出：

- `src/registry/*` 或在 `src/core/engine.ts` 中先引入轻量查询接口。
- Query API 单元测试。

检查点：

- 输入 intent `review-pr` 可以返回所有匹配 Skill。
- id 冲突仍然遵循现有 layer priority。
- 查询结果包含 source、layer、scope、priority、schemaVersion、shadowed。

返工触发：

- 查询逻辑绕开现有 override-tree，导致冲突规则不一致。
- 查询结果缺少 source provenance。
- 后续 compiler 无法复用查询接口。

### 3.5 Lockfile 与来源元数据

任务：

- 扩展已安装远程 Skill 的来源记录。
- 保存 source、version、resolved hash、installedAt、schemaVersion。
- 为后续 GitHub 同步和供应链审计预留字段。

产出：

- lockfile schema 更新。
- 安装 / 更新 / 卸载流程兼容测试。

检查点：

- 远程安装后 lockfile 能记录 hash。
- 本地 Skill 不强制要求 lockfile。
- lockfile 旧版本可以被读取或迁移。

返工触发：

- lockfile 更新破坏现有 install/update/uninstall。
- 无法判断一个 Skill 来自本地、GitHub raw 还是 npm。

## 4. 可观测指标

| 指标 | 目标 |
|---|---|
| legacy 兼容率 | 现有示例与测试 100% 兼容 |
| schema 错误定位 | 100% 包含文件路径和字段路径 |
| Registry 查询延迟 | 本地 1000 个 Skill 内低于 200ms |
| 覆盖规则一致性 | 与现有 override-tree 行为一致 |
| layer 冲突解释率 | 100% 冲突包含生效原因或返工提示 |

## 5. 阶段验收命令

```bash
npm test
npm run build
skill-central validate .skills/**/*.yaml
skill-central doctor
```

## 6. 阶段决策

可以进入 Phase 2 的条件：

- legacy skill 不破坏。
- Universal Skill v1 可校验、可加载、可查询。
- 可配置 layer 兼容旧配置，并能解释覆盖结果。
- Registry 查询结果稳定并包含 provenance。
- lockfile 能记录远程来源和 hash。

必须返工的条件：

- 旧用户技能无法无迁移继续使用。
- Schema 设计无法支撑 `capabilities`、`targets` 或 `context`。
- 查询与层级覆盖规则不一致。
- layer 模型仍被固定目录语义限制。
