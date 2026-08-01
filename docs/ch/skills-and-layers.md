# Skills 与 Layers

[English](../en/skills-and-layers.md) | [文档首页](./README.md)

## 领域模型

Skill 是 YAML 源资产。Layer 是一组 Skill 的治理边界，定义 scope、priority、写入策略、trust、同步策略和 visibility。Engine 会标准化源文件、解析重复 ID，并只向普通 Consumer 暴露确定性的 winner。

Skill 源文件与应用状态相互独立。移动或删除 App State 不会移动或删除已配置的 Layer 文件。

## 配置加载

配置按以下顺序合并：

1. 用户配置：`~/.skill-central/config.yaml`
2. 项目配置：`skill-central.yaml` 或 `skill-central.yml`
3. 两处都未定义 Layer 时使用内置的兼容性默认值

后加载的 Layer 会替换相同 `id` 的早期 Layer；为兼容旧配置，也会按相同 `name` 替换。无效 Layer Block 会带字段级警告被跳过，其他有效 Layer 仍可正常加载。

完整 Layer 示例：

```yaml
layers:
  - id: team-workflows
    name: Team Workflows
    path: .skills/team-workflows
    scope: workspace
    priority: 30
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private
```

治理字段的有效值：

| 字段 | 可选值 | 含义 |
| --- | --- | --- |
| `scope` | `user`、`workspace`、`repo`、`team`、`org`、`session` | 与当前 workspace 上下文的距离 |
| `trust` | `local`、`remote`、`org`、`verified` | 来源分类，不自动构成密码学保证 |
| `visibility` | `private`、`team`、`public` | 预期分发边界 |
| `sync.enabled` | Boolean | 该 Layer 是否允许参与 Registry 同步 |
| `writable` | Boolean | 调用方是否应将该 Layer 视为可编辑 |

生成的四层预设继续受支持，priority 依次为 `01-global`（10）、`02-workflows`（20）、`03-domains`（30）、`04-tech-stack`（40）。

## 解析规则

同一 Skill ID 存在多个候选项时，Override Tree 按以下顺序比较：

1. 更高的 `priority` 胜出。
2. priority 相同时，更近的 scope 胜出：`session`，然后 `workspace`/`repo`，再到 `user`、`team`、`org`。
3. priority 与 scope distance 都相同时，记录状态为 `conflicted`，不存在有效候选项。

未胜出的候选项保留为 `shadowed`，其 provenance 会标明 winner。Conflicted 与 shadowed 记录仍提供给诊断、Board 和编译预览；普通 MCP prompt/tool 列表只暴露 effective 记录。

## Universal Skill v1

当前公开 Schema Version 为 `skillcentral.dev/v1`。最小 Prompt Skill 示例：

```yaml
schemaVersion: skillcentral.dev/v1
id: review-pr
name: PR Review
description: Review a change against project constraints
type: prompt
tags: [review, workflow]
prompt: |
  Review correctness, regressions, security boundaries, and tests.
```

ID 必须保持稳定，建议使用小写 kebab-case。必填基础字段为 `schemaVersion`、`id`、`name`、`description` 和 `type`。

支持的类型：

| 类型 | 当前作用 |
| --- | --- |
| `prompt` | 作为 MCP Prompt 暴露，并组合为用户消息 |
| `tool` | 作为 MCP Tool 暴露，提供轻量参数校验 |
| `workflow` | 定义 Workflow Step 与编排元数据 |
| `policy` | 承载 Policy Prompt 与能力约束 |
| `context-router` | 声明上下文订阅与发布 |

Schema 还可以表达：

- `activation.intents`、`filePatterns`、`repoSignals` 和 priority；
- required、optional 和 denied capabilities；
- 目标特定元数据；
- 要订阅或发布的 Context Topic；
- 缺失能力时的 degradation 规则；
- Workflow 策略、依赖、角色和输出 Topic；
- 英文 `prompt` 与简体中文 `prompt_zh`。

不带 `schemaVersion` 的旧 Prompt/Tool 文件仍会标准化为当前内部视图。新的公开示例和功能应使用 Universal Skill v1。

## 资产作用域

Skill 与 Rule 共用 `appliesTo` 字段。它与 Layer 的 `scope` 不同：Layer `scope` 用于候选项优先级，资产 `appliesTo` 决定当前项目是否能加载该资产。未声明时默认为全局：

```yaml
appliesTo: global
```

绑定一个或多个项目：

```yaml
appliesTo:
  projects:
    - git:github.com/acme/service-a
    - git:github.com/acme/service-b
```

项目身份优先由 Git `origin` 生成稳定的 `git:<host>/<owner>/<repo>` ID。没有受支持的 Remote 时，退化为规范化真实路径 `path:<absolute-path>`。GitHub 项目 ID 不区分大小写；无效、空或重复 ID 会产生字段级校验错误。

Skill 在进入 Override Tree 前按项目过滤，因此不匹配候选项不会参与冲突解析，也不会进入 MCP、Compiler 或普通 CLI 查询。Rule 使用同一个匹配函数。Rules CLI 和 Web Board 提供独立规则视图；Rule MCP Resource 尚未实现，因为规则的 Agent 消费模型仍待确定。

查看当前项目身份或资产作用域：

```bash
skill-central scope current
skill-central scope show .rules/no-secrets.yaml
```

原子修改 Skill 或 Rule 源文件：

```bash
skill-central scope set .rules/no-secrets.yaml --global
skill-central scope set .skills/02-workflows/review.yaml --current-project
skill-central scope set .rules/no-secrets.yaml \
  --projects git:github.com/acme/service-a,git:github.com/acme/service-b
```

`scope set` 在写入前复用对应 Schema 校验，同目录临时文件写完后再原子替换。自动化调用可以传 `--expected-sha256 <hash>`，文件已变化时会拒绝覆盖。`list`、`show` 和 `rules` 支持 `--project-id`/`--project-root` 作为显式上下文覆盖。

Web Board 将 Skills 与 Rules 作为两类独立资产展示，并允许把任一资产设为全局或绑定到一个/多个项目。管理清单会保留当前项目不匹配的资产，因此用户可直接将其作用域改回当前项目。浏览器写入受 Same-Origin、Schema 校验和 expected SHA 并发检查保护，最终复用与 CLI 相同的原子文件编辑器。

## Prompt 与 Tool 组合

Prompt 占位符使用 `{{name}}`，由请求参数替换。当 `prompt` 和 `prompt_zh` 同时存在时，Skill Central 会生成一条带明确语言分区的双语消息。

Tool 输入可以使用 `inputSchema`。当前运行时只校验必填字段与基础 JSON 类型，并不是完整 JSON Schema 实现，贡献者不得将其描述为完整实现。

按 Tag 组合时，Prompt Skill 会从低 Layer priority 排到高 priority，使基础上下文先于更具体的规则出现。

## Registry 与查询

`SkillEngine` 持有内存中的 Override Tree。Registry Query Layer 为 CLI、MCP、Board、Compiler 和 Health Consumer 提供统一视图。调用方可按 ID、类型、Tag、Layer、源格式或状态等条件查询。

需要解释解析结果的 Consumer 应使用 Resolution Record，不得根据 effective Skill 重新推断 provenance。

## 编译

当前编译是 dry-run 操作：

1. 先匹配 `activation.intents`，再匹配 ID 或完全一致的 Tag。
2. 选择 effective Skill，同时保留 shadowed/conflicted 证据。
3. 由目标 Adapter 判断 required、optional、denied capabilities。
4. Required Capability 不可用时生成 degradation 报告。
5. 生成预览产物和确定性 Hash，不写入目标文件。

Compile Adapter 当前支持 `generic-mcp`、`cursor` 和 `windsurf`。该列表独立于 IDE 连接目标列表。

## 编写与审查规则

- Skill 发布后保持 ID 稳定，Board 编辑会显式拒绝 ID 变化。
- 变更身份或 Layer 所有权时，使用新文件并移除旧文件。
- 不得依赖文件发现顺序实现 Override。
- 在 Layer 边界声明 Sync 与 Visibility Policy，不使用未记录的约定。
- 修改定义后运行 `skill-central validate <files...>`。
- 修改 Layer 或解决冲突后运行 `skill-central doctor`。
- Capability 声明是一项契约，必须有 Adapter 和 Degradation 覆盖。
