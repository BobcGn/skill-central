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

Skill 在进入 Override Tree 前按项目过滤，因此不匹配候选项不会参与冲突解析，也不会进入 MCP、Compiler 或普通 CLI 查询。默认资产边界是当前项目配置的 `.skills/` Layer 与项目 `.rules/`；Skill Central 不再把 `~/.skill-central/skills`、`~/.skill-central/rules` 或旧的用户级 Layer 配置隐式合并到无关项目。

用户可在**个人设置 → 资产库**显式选择一个可复用资产库根目录。合法根目录必须同时包含 `skills/` 和 `rules/`；选择后 Board、CLI 与 MCP 会共同使用这两个目录。校验后的选择持久化在 `~/.skill-central/settings.json`。**使用项目资产库**只清除选择，不删除任何源文件。自动化或打包 Runtime 交接可使用受控环境变量 `SKILL_CENTRAL_ASSET_ROOT`。Coding Agent 可通过 `rule://registry`、`rule://rule/<id>` Resource，`rules:all`、`rule:<id>` Prompt，或 `rules.list`、`rules.get` Tool 直接消费规则。

`skill-central add --user` 会写入当前已选择自定义资产库的 `skills/` 树；未选择自定义库时命令明确失败，避免“创建成功但资产不在当前来源中”的孤立文件。

## 反向输出

反向输出（reverse output）指 IDE、Board 或工作流在日常工作中主动产生了当前技能库和规则库里还没有的内容，并把它沉淀为数字资产，而不是留在临时笔记、聊天记录或一次性导出里。

术语规范：

- Skill：可持续复用、持续更新、应不断写回 `.skills/` 的资产。
- Skill Central 公约：`.rules/` 中的共享规则资产，承载跨 IDE、跨人员的业务术语、架构边界、风格、质量底线和门禁。可以通过 `appliesTo` 作用于全局或项目。
- Rule：稳定、可复用的约束、审查或治理类资产；只有属于 Skill Central 公约的内容才进入 `.rules/`。
- IDE 原生规则：`AGENT.md`、`AGENTS.md`、`CLAUDE.md` 等环境说明文件，承载当前 IDE、机器、启动方式和本地执行方法，不承载具体业务公约。
- Project-local guidance：仅对单个项目成立的内容，默认保留在工作记录或临时产物中，不进入规则库。

### 规则边界划分法则

规则库与 IDE 原生规则不是两份需要全文同步的规则，而是“公约”和“环境适配器”的关系。判断反向输出应该写入哪里时，必须依次检查：

1. **业务领域 VS. 运行时环境**
   - 跨 IDE、跨人员都必须遵守的业务术语、架构边界、代码质量底线，归入 Skill Central 公约。
   - 当前机器的启动命令（例如 `./gradlew run`）、特定 IDE 的能力（例如 Cursor 的 `@` 检索语法）、要求 Agent 去远端拉取规则的 Bootloader，归入 IDE 原生规则。
2. **战略约束 VS. 战术执行**
   - 定义 What、Why 和绝对不能做什么的红线，归入 Skill Central 公约。
   - 定义当前本地环境里点击什么、调用什么、怎么执行命令，归入 IDE 原生规则。
3. **动态演进 VS. 相对静态**
   - 高频迭代、需要跨项目复用的开发痛点与沉淀，归入 Skill 或 Rule，并通过反向输出持续培养。
   - 工程模板初始化后几乎不再需要人类修改的低频基建配置，归入 IDE 原生规则。

### 公约与 IDE 原生规则冲突

- `.rules/` 负责定义跨 IDE 的 What、Why 和门禁；IDE 原生规则负责把这些要求翻译成当前环境中的 How。
- IDE 原生规则可以补充执行细节，但不得重定义公约中的业务术语、删除质量门禁或放宽架构边界。
- 同一份内容同时包含公约和本地执行细节时，必须拆分，而不是整段复制到两个位置。
- 当前 IDE 无法满足公约时，必须记录不兼容并停止或显式降级；不得静默用 IDE 原生规则覆盖公约。
- 不得仅因为加载方便，就把 `AGENT.md`、`AGENTS.md`、`CLAUDE.md` 或等价 Bootloader 文本写入 `.rules/`。

反向输出必须检查：

1. 来源与上下文。
2. 资产类型与目标目录。
3. 显式声明归属分类与理由，检查上述边界法则、重复和冲突资产。
4. `scope` 与 `appliesTo` 是否明确。
5. Schema 是否通过。
6. 若编辑既有资产，必须记录 diff 预览、backup 和 rollback 路径。
7. 是否完成验证和测试，或是否明确标记未验证。
8. 最终结论：promote、defer 或 discard。

### 当前 MVP 入口

当前实验性实现提供一个统一的反向输出控制面：

- 面向 IDE 的 MCP Tool 是 `reverse_output`。
- 对应的 CLI 入口是 `skill-central reverse-output <action>`。
- `preview` 不产生写入副作用。`apply` 必须显式选择 `promote`、`defer` 或 `discard`；
  只有 `promote` 会写入源资产。
- 每个提案都必须声明 `placement` 和 `placementReason`。Rule 必须使用
  `covenant-rule`；`ide-native-rule` 会被拒绝。`project-local` Skill 必须使用项目级
  `appliesTo`。
- Skill 与 Rule 会按各自公开 Schema 校验，必须显式提供 `appliesTo`，并在重复、
  目标路径或 expected SHA 冲突时阻断。
- 更新使用同级 Backup 与原子替换。写入后会再次解析和校验，Apply/Rollback 决策会
  写入 App State Audit Record。
- Board 当前可以管理已有 Skill 与 Rule，但尚未接入反向输出的提案和 Promote 控件；
  本 MVP 请使用 MCP Tool 或 CLI。

首期路径是：IDE 提议一个可复用 Skill 或公约 Rule，`preview` 记录边界检查和 Diff，
由人或 Workflow 选择决策，只有 `promote` 才写入已配置的库。只描述
`AGENT.md`、`AGENTS.md`、`CLAUDE.md` 或其他本地 Bootloader 的建议仍属于 IDE 原生
规则，不得 Promote 到 `.rules/`。

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
