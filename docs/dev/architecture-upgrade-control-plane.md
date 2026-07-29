# skill-central 架构升级与改造落地文档

## 1. 背景与目标

`skill-central` 当前是一个本地 MCP Server，核心能力是加载分层 Skill 文件，并通过 MCP `prompts` / `tools` 将 Prompt 或 Tool 暴露给 AI IDE。现阶段它更接近一个被动的技能目录服务：IDE 主动请求，`skill-central` 返回静态技能内容。

下一阶段的战略目标是将 `skill-central` 升级为跨 IDE、跨 Agent 的统一技能管理与多 Agent 调度中心，即 Hub / Control Plane。它不替代 Cursor、Windsurf、Trae、Claude Code 等 IDE，也不重新实现文件编辑、终端、LSP、代码索引和 Diff 视图。它只管理 AI 生产力资产，并负责把这些资产按上下文、目标端能力和工作流状态动态注入到不同 IDE / Agent 中。

### 1.1 核心定位

`skill-central` 负责：

- 管理 Prompt、Tool、Workflow、Policy、Context Rule 等 AI 生产力资产。
- 定义跨平台 Universal Skill Schema，作为所有技能的源格式。
- 将标准 Skill 编译 / 转译为不同 IDE 的方言或 MCP 响应。
- 根据项目上下文、用户意图、目标 IDE 能力动态选择和组装 Prompt。
- 将复杂的多 Agent 工作流封装为 MCP Tool，供 IDE 以单一工具调用。
- 维护跨 Agent 的轻量级 Session 状态和 Blackboard 上下文路由。

`skill-central` 不负责：

- 直接读写用户项目文件，除非是在自身配置、技能库和本地缓存范围内。
- 执行 Bash、启动测试、修改代码、解析 LSP、生成 Diff 或处理 IDE 编辑缓冲区。
- 接管 IDE Agent 的权限模型。
- 追求底层编辑器性能、代码索引性能或替代 IDE 交互。

### 1.2 设计原则

- 控制面与数据面分离：`skill-central` 只做编排、决策、资产分发和状态路由；环境操作由 IDE Agent 执行。
- Schema 优先：所有跨端能力先落到稳定的 Universal Skill Schema，再由 Adapter 编译为目标方言。
- 能力协商优先：每个 IDE 的权限、MCP 能力和执行边界不同，必须先做 capability check。
- 渐进增强：支持能力完整的 IDE 时启用自动化工作流；能力不足时退化为 Prompt 或手动操作指南。
- 上下文按需路由：禁止把全量历史直接塞进 LLM；通过 Blackboard 发布、索引、订阅和压缩关键信息。
- 可审计：每次 Skill 注入、转译、降级、Workflow 调度都必须能被记录和复现。

## 2. 目标架构

```text
┌────────────────────────────────────────────────────────────────────┐
│                         AI IDE / Agent Clients                      │
│        Cursor / Windsurf / Trae / Claude Code / Custom Agent         │
│                                                                    │
│  Data Plane: file edit, terminal, LSP, code search, test, browser   │
└───────────────────────────────┬────────────────────────────────────┘
                                │ MCP / generated config / CLI export
┌───────────────────────────────▼────────────────────────────────────┐
│                         skill-central Hub                           │
│                                                                    │
│  Control Plane                                                     │
│  ┌────────────────────┐  ┌────────────────────┐                    │
│  │ Skill Registry      │  │ Universal Schema    │                    │
│  │ layers / sources    │  │ validation / lock   │                    │
│  └──────────┬─────────┘  └──────────┬─────────┘                    │
│             │                       │                              │
│  ┌──────────▼─────────┐  ┌──────────▼─────────┐                    │
│  │ Skill Compiler      │  │ IDE Adapters        │                    │
│  │ prompt assembly     │  │ cursor / cascade    │                    │
│  │ workflow expansion  │  │ trae / generic mcp  │                    │
│  └──────────┬─────────┘  └──────────┬─────────┘                    │
│             │                       │                              │
│  ┌──────────▼─────────┐  ┌──────────▼─────────┐                    │
│  │ MCP Router          │  │ Workflow Scheduler  │                    │
│  │ resources / tools   │  │ multi-agent jobs    │                    │
│  └──────────┬─────────┘  └──────────┬─────────┘                    │
│             │                       │                              │
│  ┌──────────▼───────────────────────▼─────────┐                    │
│  │ Blackboard / Session State                  │                    │
│  │ facts, artifacts, decisions, task states    │                    │
│  └─────────────────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────┘
```

架构分为四层：

| 层级 | 责任 | 典型模块 |
|---|---|---|
| 资产层 | 加载、校验、版本化和分层覆盖技能资产 | `storage/*`, `core/override-tree.ts`, future `registry/*` |
| 编译层 | 将 Universal Skill 编译为 Prompt Bundle、Workflow Plan 或 IDE 方言 | future `compiler/*`, `adapters/*` |
| 协议层 | MCP Resources / Prompts / Tools 路由，向 IDE 暴露能力 | `protocol/*`, future `protocol/resources.ts` |
| 状态层 | 维护 Session、Blackboard、事件、产物引用和工作流状态 | future `state/*`, `scheduler/*` |

## 3. 核心抽象：Universal Skill Schema

### 3.1 设计目标

当前 Skill Schema 只有 `prompt` 和 `tool` 两种类型，足够支撑静态 Prompt 分发，但不足以表达跨 IDE 能力、工作流依赖、上下文订阅、降级策略和目标端转译。新的 Universal Skill Schema 需要成为技能作者与 Control Plane 之间的稳定契约。

新 Schema 应支持：

- 声明 Skill 的语义类型：`prompt`、`tool`、`workflow`、`policy`、`context-router`。
- 声明运行需求：需要哪些 IDE / Agent 能力。
- 声明输入输出：面向 MCP Tool、Workflow 产物和 Blackboard 事件。
- 声明注入方式：作为系统规则、临时 Prompt、上下文 Resource、工具调用说明或工作流计划。
- 声明适配目标：Cursor、Windsurf Cascade、Trae、Claude Code、Generic MCP。
- 声明降级策略：缺失能力时如何改写执行路径。

### 3.2 Schema 示例

```yaml
schemaVersion: skillcentral.dev/v1
id: pr-review.workflow
name: Pull Request Review Workflow
description: Review a pull request with policy, test, security and maintainability checks.
version: 0.3.0
type: workflow

tags:
  - review
  - git
  - multi-agent

metadata:
  owner: platform-ai
  license: MIT
  maturity: experimental

activation:
  intents:
    - review-pr
    - code-review
  filePatterns:
    - "**/*.ts"
    - "**/*.tsx"
  repoSignals:
    packageManagers:
      - npm
      - pnpm
  priority: 50

capabilities:
  required:
    - ide.context.currentDiff
    - ide.agent.readFiles
  optional:
    - ide.agent.runCommand
    - ide.agent.searchCode
    - ide.agent.applyPatch
    - ide.lsp.diagnostics
  denied:
    - skillcentral.host.writeProjectFiles

inputs:
  type: object
  properties:
    reviewScope:
      type: string
      enum: [current-diff, branch, selected-files]
    riskLevel:
      type: string
      enum: [normal, strict]
  required:
    - reviewScope

context:
  subscribe:
    - topic: session.intent
    - topic: repo.summary
    - topic: diff.summary
    - topic: findings.security
  publish:
    - topic: review.findings
    - topic: review.summary
    - topic: review.followups

prompt:
  role: reviewer
  template: |
    You are a senior code reviewer.
    Scope: {{inputs.reviewScope}}
    Risk level: {{inputs.riskLevel}}

    Use the subscribed context only when relevant:
    {{context.diff.summary}}

    Return findings ordered by severity with file references.

workflow:
  strategy: sequential
  steps:
    - id: collect-context
      uses: prompt
      agentRole: context-analyst
      outputTopic: diff.summary
    - id: security-review
      uses: prompt
      agentRole: security-reviewer
      dependsOn:
        - collect-context
      outputTopic: findings.security
    - id: final-review
      uses: prompt
      agentRole: maintainer-reviewer
      dependsOn:
        - security-review
      outputTopic: review.summary

targets:
  cursor:
    injection:
      mode: rules
      scope: project
      output: .cursor/rules/pr-review.mdc
  windsurf:
    injection:
      mode: cascade
      scope: workspace
  genericMcp:
    injection:
      mode: resource
      uri: skill://workflow/pr-review.workflow

degradation:
  whenMissing:
    ide.agent.runCommand:
      mode: manual-instructions
      message: "Target IDE cannot run commands. Generate command list for the user to execute manually."
    ide.lsp.diagnostics:
      mode: omit-step
      omit:
        - collect-lsp-diagnostics
  fallbackTarget: genericMcp
```

### 3.3 字段分层

| 字段组 | 说明 | 编译期用途 |
|---|---|---|
| `schemaVersion` / `id` / `version` | 基础身份与版本 | 校验、锁文件、迁移 |
| `type` | Skill 语义类型 | 决定暴露为 Prompt、Tool、Resource 或 Workflow |
| `activation` | 激活条件 | 用于动态检索和上下文匹配 |
| `capabilities` | 能力要求 | 用于目标 IDE 能力校验和降级 |
| `inputs` / `outputs` | 数据契约 | 用于 MCP Tool 参数、Workflow 产物、UI 表单 |
| `context` | Blackboard 订阅 / 发布 | 用于上下文路由，避免全量历史注入 |
| `prompt` | 可渲染模板 | 用于 Prompt Bundle 组装 |
| `workflow` | 多 Agent 步骤图 | 用于 Scheduler 生成执行计划 |
| `targets` | 目标端适配配置 | 用于 Cursor / Cascade / Trae / Generic MCP 转译 |
| `degradation` | 降级策略 | 用于缺失能力时生成替代产物 |

### 3.4 编译 / 转译能力

`skill-central` 需要新增 Skill Compiler，将 Universal Skill 转为不同目标端可消费的产物。

```text
UniversalSkill
      │ validate
      ▼
ResolvedSkill
      │ match target + capabilities
      ▼
CompiledSkillBundle
      ├─ Cursor rules files
      ├─ Windsurf Cascade config
      ├─ Trae-compatible prompt/config
      ├─ Generic MCP Resource payload
      └─ MCP Tool descriptors
```

建议模块拆分：

```text
src/schema/
  universal-skill.ts       # TypeScript 类型与校验入口
  migrations.ts            # schemaVersion 迁移

src/compiler/
  compiler.ts              # compileSkill(skill, target, capabilities)
  prompt-bundle.ts         # Prompt 组装、变量绑定、上下文裁剪
  workflow-plan.ts         # Workflow DAG 展开与校验
  degradation.ts           # 降级决策

src/adapters/
  types.ts                 # TargetAdapter 接口
  cursor.ts                # .cursor/rules/*.mdc 或 .cursorrules
  windsurf.ts              # Cascade 方言
  trae.ts                  # Trae 方言
  generic-mcp.ts           # MCP Resource / Prompt / Tool 映射
```

Adapter 接口建议：

```ts
export interface TargetAdapter {
  id: string;
  displayName: string;
  detectCapabilities(env: AdapterEnvironment): Promise<TargetCapabilities>;
  compile(bundle: CompiledSkillBundle): Promise<AdapterArtifact[]>;
  install?(artifacts: AdapterArtifact[], env: AdapterEnvironment): Promise<InstallResult>;
}
```

编译过程必须是纯逻辑优先：先生成 `AdapterArtifact[]`，再由 install 阶段写入 IDE 配置。这样可以支持 dry-run、审计、Web 看板预览和 CI 校验。

## 4. 运行边界：Control Plane 与 Data Plane 分离

### 4.1 职责边界

`skill-central` 是 Control Plane，负责“应该做什么、用什么技能、以什么顺序、给哪个 Agent、需要什么上下文”。IDE Agent 是 Data Plane，负责“在用户授权下实际操作环境”。

| 能力 | Control Plane: skill-central | Data Plane: IDE Agent |
|---|---|---|
| Skill 加载与版本管理 | 是 | 否 |
| Prompt 组装与策略选择 | 是 | 否 |
| Workflow 编排 | 是 | 可执行单步 |
| 多 Agent 角色分配 | 是 | 承接角色 Prompt |
| 文件读写 | 仅限自身配置和技能库 | 是 |
| Bash / 测试命令 | 不直接执行项目命令 | 是 |
| LSP / AST / 索引 | 不直接解析项目 | 是 |
| Diff 应用 | 不直接应用项目 Patch | 是 |
| 上下文摘要和路由 | 是 | 提供局部上下文 |

### 4.2 数据面操作代理化

如果 Workflow 需要读取文件、运行测试或搜索代码，`skill-central` 不应直接执行这些动作，而应返回结构化的 Data Plane Task，让 IDE Agent 执行：

```json
{
  "taskId": "run-tests",
  "requiredCapability": "ide.agent.runCommand",
  "instruction": "Run the package test command and publish the summarized result.",
  "suggestedCommand": "npm test",
  "publishTo": "test.result",
  "expectedOutput": {
    "type": "object",
    "properties": {
      "passed": { "type": "boolean" },
      "summary": { "type": "string" },
      "failureFiles": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

这使边界保持清晰：

- `skill-central` 可以编排 `run-tests`，但不实际运行 `npm test`。
- IDE Agent 可以基于自身权限请求用户确认并执行。
- 执行结果以结构化事件发布回 Blackboard。

### 4.3 安全与权限

Control Plane 不持有项目级高危权限，降低供应链和远程技能风险。需要建立以下规则：

- Universal Skill 默认不能声明 `skillcentral.host.writeProjectFiles`。
- 任何跨出技能库和配置目录的写操作都必须由 IDE Adapter 生成用户可审查的安装产物。
- 远程 Skill 安装必须记录来源、版本、hash 和签名状态。
- MCP Tool 如果触发多 Agent 工作流，只能返回执行计划、子任务、摘要和建议，不直接修改项目。
- 所有降级、跳过步骤和能力缺失必须写入 Session 审计记录。

## 5. 动态调度：MCP 的反向运用

### 5.1 从被动 MCP 到超级 MCP Server

当前 MCP 使用方式是 IDE 调用 `prompts/list`、`prompts/get`、`tools/list`、`tools/call`。升级后，`skill-central` 应成为动态能力注入层：

- Resource 路由：根据当前 session、repo、语言、IDE 能力和用户意图，动态返回最合适的 Skill Prompt 或 Workflow Context。
- Tool 路由：把复杂的多 Agent 工作流封装成一个可调用 Tool，IDE 只需调用 `skill.review_pr`、`skill.plan_refactor` 等高层工具。
- Prompt 路由：保留现有 Prompt 能力，但由静态 id 获取升级为可按 intent / tags / context 组合。

### 5.2 MCP Resource 路由设计

新增 `resources/list` 和 `resources/read` 支持。Resource URI 采用稳定命名：

```text
skill://registry
skill://skill/{skillId}
skill://bundle/{target}/{intent}
skill://session/{sessionId}/context
skill://session/{sessionId}/topic/{topic}
skill://workflow/{workflowId}/plan
```

示例：

```json
{
  "uri": "skill://bundle/cursor/review-pr?session=abc123",
  "mimeType": "text/markdown",
  "name": "Cursor PR Review Bundle",
  "description": "Compiled review skill bundle for the current Cursor session."
}
```

Resource 读取流程：

```text
resources/read(skill://bundle/{target}/{intent})
      │
      ▼
resolve session context
      │
      ▼
match activation rules
      │
      ▼
check target capabilities
      │
      ▼
compile prompt bundle
      │
      ▼
return target-specific content
```

Resource 不能只返回静态文件内容，而应成为上下文敏感的 Prompt Delivery Channel。

### 5.3 MCP Tool 路由设计

复杂工作流通过 Tool 暴露，IDE 调用单个 Tool 即可获得可执行计划、Agent 角色 Prompt、需要 IDE 执行的 Data Plane Task 和最终聚合规则。

建议内置工具：

| Tool | 作用 |
|---|---|
| `skill.resolve` | 根据 intent、tags、target 和 capabilities 返回匹配技能 |
| `skill.compile` | 将 Universal Skill 编译成指定目标端产物 |
| `workflow.start` | 创建 Session 并展开 Workflow Plan |
| `workflow.next` | 根据 Blackboard 状态返回下一批可执行任务 |
| `workflow.publish` | IDE Agent 发布任务结果或摘要 |
| `workflow.summarize` | 聚合当前 Workflow 的结论和后续动作 |
| `agent.review` | 封装多 Agent 审查工作流 |

`workflow.start` 示例响应：

```json
{
  "sessionId": "sess_01HZY...",
  "workflowId": "pr-review.workflow",
  "status": "running",
  "tasks": [
    {
      "id": "collect-context",
      "agentRole": "context-analyst",
      "promptResource": "skill://session/sess_01HZY/task/collect-context/prompt",
      "dataPlaneRequirements": [
        "ide.context.currentDiff",
        "ide.agent.readFiles"
      ],
      "publishTo": "diff.summary"
    }
  ]
}
```

### 5.4 Prompt 组装策略

Prompt 组装应从简单拼接升级为结构化 Bundle：

```text
PromptBundle
  ├─ role instruction
  ├─ task objective
  ├─ relevant policies
  ├─ subscribed blackboard facts
  ├─ target IDE operation constraints
  ├─ output schema
  └─ degradation notice
```

组装规则：

- 基于 `activation` 匹配候选技能。
- 基于 `capabilities` 过滤或降级。
- 基于 `context.subscribe` 读取必要 Blackboard topics。
- 基于 Token Budget 对历史事件做摘要，而不是直接拼接。
- 明确输出格式，便于后续 publish / parse。

## 6. 跨端兼容：Graceful Degradation

### 6.1 Capability Model

不同 IDE 的开放能力不同，因此不能假设所有目标端都支持自动运行命令、读取全仓库、写入规则文件或调用多个 Agent。Universal Skill 必须声明能力需求，Adapter 必须声明目标端实际能力。

能力命名建议采用分层命名：

```text
ide.context.currentFile
ide.context.currentSelection
ide.context.currentDiff
ide.context.workspaceMetadata
ide.agent.readFiles
ide.agent.searchCode
ide.agent.applyPatch
ide.agent.runCommand
ide.agent.openBrowser
ide.lsp.diagnostics
ide.config.projectRules
ide.config.userRules
mcp.resources
mcp.prompts
mcp.tools
mcp.sampling
skillcentral.session
skillcentral.workflow
```

### 6.2 能力校验流程

```text
load UniversalSkill
      │
      ▼
load TargetCapabilities
      │
      ▼
missing = required - supported
      │
      ├─ empty: compile full bundle
      │
      ├─ has degradation rule: compile degraded bundle
      │
      └─ no degradation rule: mark unavailable with actionable reason
```

不可用不是崩溃。系统应返回结构化说明：

```json
{
  "available": false,
  "reason": "Missing required capability: ide.context.currentDiff",
  "suggestedFallbacks": [
    "Ask user to paste a diff",
    "Use selected-files review mode",
    "Switch to an IDE adapter that supports current diff"
  ]
}
```

### 6.3 降级模式

| 降级模式 | 适用场景 | 行为 |
|---|---|---|
| `manual-instructions` | 目标端不能运行命令 | 生成用户手动执行步骤和结果回填格式 |
| `prompt-only` | 不支持 MCP Tool | 将 Workflow 编译为单段 Prompt |
| `omit-step` | 缺少可选能力 | 跳过非关键步骤，并记录审计事件 |
| `ask-user` | 缺少上下文输入 | 生成需要用户补充的信息列表 |
| `static-export` | 不支持动态 Resource | 生成静态 IDE 配置文件 |
| `unavailable` | 缺失硬性能力且无替代路径 | 返回明确错误与替代方案 |

示例：目标 IDE 不支持 Bash 执行时，原本的测试步骤：

```yaml
- id: run-tests
  requiredCapability: ide.agent.runCommand
  command: npm test
```

应降级为：

````markdown
请在终端中运行以下命令：

```bash
npm test
```

然后按以下格式发布结果：

```json
{
  "passed": true,
  "summary": "...",
  "failureFiles": []
}
```
````

### 6.4 Adapter 能力矩阵

建议维护 `adapters/capabilities/*.yaml`：

```yaml
target: cursor
versionRange: "*"
capabilities:
  mcp.prompts: supported
  mcp.tools: supported
  mcp.resources: partial
  ide.config.projectRules: supported
  ide.agent.runCommand: unknown
  ide.lsp.diagnostics: unavailable
notes:
  - "Runtime tool execution depends on the user's IDE settings and approval mode."
```

能力值不应只有 boolean，建议使用：

- `supported`
- `partial`
- `unavailable`
- `unknown`
- `requires-user-approval`

编译器对 `unknown` 必须保守处理：如果是 required，默认触发降级或要求显式用户确认。

## 7. 状态流转：Context Routing 与 Blackboard

### 7.1 问题定义

多 Agent 协作容易产生上下文爆炸。常见错误做法是把所有历史消息、所有文件内容、所有 Agent 输出直接拼接进下一次 LLM 调用。这会导致：

- Token 成本不可控。
- 关键事实被噪声淹没。
- Agent 间互相污染上下文。
- 无法追踪某个结论来自哪个任务。
- Workflow 无法恢复或审计。

`skill-central` 需要引入轻量级 Blackboard Pattern，作为全局 Session 状态机和上下文路由层。

### 7.2 Blackboard 数据模型

```ts
export interface Session {
  id: string;
  target: string;
  workflowId?: string;
  status: "created" | "running" | "blocked" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  capabilities: Record<string, CapabilityStatus>;
}

export interface BlackboardEntry {
  id: string;
  sessionId: string;
  topic: string;
  kind: "fact" | "artifact" | "decision" | "finding" | "task-result" | "summary";
  producer: string;
  content: unknown;
  summary?: string;
  refs?: ContextRef[];
  confidence?: number;
  createdAt: string;
  ttl?: string;
}

export interface ContextRef {
  type: "file" | "diff" | "command" | "url" | "mcp-resource";
  uri: string;
  range?: {
    startLine?: number;
    endLine?: number;
  };
}
```

### 7.3 Publish / Subscribe 机制

Skill 不直接声明“把所有历史给我”，而是声明订阅哪些 topic：

```yaml
context:
  subscribe:
    - topic: repo.summary
      required: true
    - topic: diff.summary
      required: true
    - topic: test.result
      required: false
      maxAge: 30m
  publish:
    - topic: review.findings
    - topic: review.summary
```

运行时流程：

```text
Agent completes task
      │
      ▼
workflow.publish(topic, content, refs)
      │
      ▼
Blackboard stores event + summary + provenance
      │
      ▼
Scheduler checks dependent steps
      │
      ▼
Prompt compiler fetches subscribed topics only
      │
      ▼
Next Agent receives scoped context
```

### 7.4 上下文压缩策略

Blackboard 不等于无限消息日志。每个 topic 应维护三种信息：

| 信息 | 用途 |
|---|---|
| `latest` | 当前最相关的结构化事实 |
| `summary` | 面向 Prompt 注入的短摘要 |
| `refs` | 可追溯来源，必要时让 IDE Agent 读取原始数据 |

Prompt Compiler 注入上下文时优先使用 `summary` 和 `refs`：

```markdown
## Relevant Context

### diff.summary
Summary: Authentication middleware changed for `/api/admin/*`.
Refs:
- file: src/middleware/auth.ts:32
- diff: currentDiff

### test.result
Summary: Unit tests passed. No integration tests were executed.
```

只有当 Skill 明确需要原始内容，且目标 IDE 支持读取对应 ref 时，才让 IDE Agent 在 Data Plane 中获取原文。

### 7.5 Session 状态机

Workflow Session 建议采用以下状态机：

```text
created
  │ workflow.start
  ▼
running
  ├─ missing required context ─▶ blocked
  ├─ task failed unrecoverably ─▶ failed
  ├─ all terminal steps done ───▶ completed
  └─ user cancelled ───────────▶ failed

blocked
  ├─ workflow.publish fills gap ─▶ running
  └─ timeout / cancel ───────────▶ failed
```

每次状态变化都应记录：

- `sessionId`
- `from`
- `to`
- `reason`
- `trigger`
- `timestamp`

这为多 Agent 调度、Web 看板可视化和后续排障提供基础。

## 8. 工程落地改造

### 8.1 与现有代码的演进关系

现有模块可以保留，并逐步扩展：

| 当前模块 | 当前职责 | 升级方向 |
|---|---|---|
| `src/storage/parser.ts` | 解析旧 Skill Schema | 支持 Universal Skill v1，并兼容旧 schema |
| `src/storage/schemas.ts` | TypeScript 类型 | 拆分 legacy schema 与 universal schema |
| `src/core/engine.ts` | 加载和解析技能 | 升级为 Registry，支持 query / activation |
| `src/core/composer.ts` | Prompt 拼接和 Tool 参数校验 | 升级为 Prompt Bundle Compiler |
| `src/protocol/prompts.ts` | MCP Prompt 暴露 | 保留并接入动态编译 |
| `src/protocol/tools.ts` | MCP Tool 暴露 | 新增 workflow tool router |
| `src/protocol/handler.ts` | JSON-RPC 路由 | 增加 resources/list 和 resources/read |
| `src/web/server.ts` | Web 看板 | 增加 Adapter 预览、Session 状态和审计视图 |

### 8.2 兼容旧 Skill

旧 schema：

```yaml
id: review-pr
name: PR Review
type: prompt
prompt: |
  ...
```

加载时自动提升为：

```yaml
schemaVersion: skillcentral.dev/v1
id: review-pr
type: prompt
capabilities:
  required: []
  optional: []
targets:
  genericMcp:
    injection:
      mode: prompt
```

兼容策略：

- 旧文件不要求立即迁移。
- `validate` 增加 `--schema universal` 严格模式。
- `doctor` 报告 legacy skill 数量和可迁移建议。
- `skill-central migrate-schema` 可生成 v1 文件，但默认不覆盖原文件。

### 8.3 新增 CLI

建议新增：

```bash
skill-central compile --target cursor --intent review-pr --dry-run
skill-central export --target cursor --out .cursor/rules
skill-central capabilities --target cursor
skill-central workflow start pr-review.workflow --target cursor
skill-central session show <sessionId>
skill-central session publish <sessionId> --topic test.result --file result.json
```

其中 `compile --dry-run` 是关键调试入口：维护者可以看到选中了哪些 Skill、缺失哪些 capabilities、触发了哪些 degradation、最终生成哪些 artifacts。

### 8.4 测试策略

必须优先覆盖以下行为：

- Universal Skill Schema 校验。
- Legacy Skill 自动提升。
- Capability check 与 degradation 分支。
- Adapter 编译快照。
- MCP Resource URI 解析。
- Workflow DAG 展开、依赖检查和状态流转。
- Blackboard topic subscribe / publish / summary 注入。

测试分层：

| 测试类型 | 覆盖 |
|---|---|
| 单元测试 | Schema、compiler、capability matcher、degradation |
| 快照测试 | Cursor / Windsurf / Generic MCP 编译产物 |
| 集成测试 | MCP `resources/read`、`tools/call` workflow 生命周期 |
| E2E 冒烟测试 | `init`、`compile --dry-run`、`mcp` 基础握手 |

## 9. 关键风险与约束

| 风险 | 影响 | 缓解 |
|---|---|---|
| IDE 方言频繁变化 | Adapter 失效 | Adapter 独立版本化，能力矩阵可配置 |
| 远程 Skill 供应链风险 | Prompt 注入或恶意工作流 | lockfile、hash、来源审计、权限声明 |
| Workflow 过度复杂 | 难以调试 | MVP 先支持 sequential 和简单 DAG |
| Capability 识别不准确 | 自动化失败或越权 | unknown 保守处理，默认降级 |
| 上下文路由过度抽象 | 开发成本高 | Blackboard 首版只做 topic KV + append-only events |
| 多端静态配置写入冲突 | 破坏用户配置 | dry-run、备份、冲突检测、显式安装 |

## 10. MVP 执行路径

### Phase 1: 资产统一（基础定义与配置管理）

目标：建立 Universal Skill Schema 和统一资产注册表，但不要求立即实现动态调度。

交付项：

- 新增 `schemaVersion: skillcentral.dev/v1` 的 Universal Skill Schema。
- 支持 legacy skill 自动提升为 v1 内部模型。
- 引入 `capabilities`、`targets`、`activation`、`context` 基础字段。
- 新增 schema 校验和 `validate --schema universal`。
- Registry 支持按 `id`、`tags`、`type`、`activation.intent` 查询。
- Lockfile 记录远程 Skill 来源、版本和 hash。
- 文档更新：schema reference、迁移指南、示例技能。

验收标准：

- 现有技能文件无需修改仍可正常通过 MCP 暴露。
- 新 v1 技能可以被 CLI 校验、列表展示和 Web 看板预览。
- `doctor` 能区分 legacy、universal、invalid 三类技能。

### Phase 2: 多端分发（静态生成与转译下发）

目标：实现 Universal Skill 到目标 IDE 方言的静态编译和安装预览。

交付项：

- 新增 Compiler 与 Adapter 接口。
- 实现 `generic-mcp`、`cursor`、`windsurf` 三个首批 Adapter。
- 新增目标端 capability matrix。
- 实现 capability check 和 degradation 编译。
- 新增 `compile --target ... --dry-run`。
- 新增 `export --target ... --out ...`，支持备份和冲突检测。
- Web 看板增加 target preview，展示编译产物和降级说明。

验收标准：

- 同一个 Universal Skill 可生成 Cursor rules 和 Windsurf Cascade 配置。
- 缺失 `ide.agent.runCommand` 时不会失败，而是生成手动执行指南。
- `compile --dry-run` 输出完整决策链：匹配技能、目标能力、降级、产物列表。

### Phase 3: 动态调度（基于 MCP 的实时编排与协同）

目标：将 `skill-central` 从静态分发服务升级为动态 MCP Hub。

交付项：

- MCP Handler 支持 `resources/list` 和 `resources/read`。
- 新增 Resource URI 路由：`skill://bundle/*`、`skill://session/*`、`skill://workflow/*`。
- 新增 Workflow Scheduler，支持 sequential 和基础 DAG。
- 新增 Blackboard Session Store，支持 topic publish / subscribe。
- 新增 MCP Tools：`workflow.start`、`workflow.next`、`workflow.publish`、`workflow.summarize`。
- Prompt Compiler 支持按 Blackboard topic 注入摘要。
- Web 看板增加 Session、Workflow DAG、Blackboard topic 和审计日志视图。

验收标准：

- IDE 可通过 MCP Tool 启动一个多步骤审查工作流。
- 每个 Agent 步骤只收到其订阅 topic 的上下文。
- IDE Agent 执行 Data Plane 任务后，可将结果 publish 回 `skill-central` 并驱动下一步。
- 缺少能力或上下文时，Session 进入 `blocked` 并返回可执行的补充说明，而不是崩溃。

## 11. 结论

这次升级的关键不是把 `skill-central` 做成另一个 IDE，而是把它做成 AI 能力资产的控制面：统一定义、统一分发、统一调度、统一状态路由。IDE 和 Agent 保持对本地环境的实际执行权，`skill-central` 则负责把正确的技能、正确的上下文和正确的工作流步骤，在正确的时间交给正确的执行端。

按 MVP 路径推进时，应先稳住 Schema 和编译模型，再做多端静态分发，最后引入 MCP Resource / Tool 动态调度和 Blackboard。这样可以在不破坏现有 MCP 使用方式的前提下，逐步把项目从被动技能目录升级为跨 IDE、跨 Agent 的 Hub / Control Plane。
