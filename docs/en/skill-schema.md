# 技能 Schema

一个技能是 layer 目录中的一个 YAML 或 JSON 文件。`skill-central` 现在可以同时加载 legacy skill 和 Universal Skill v1，并在冲突解析与 MCP 暴露之前统一为同一个内部模型。

没有 `schemaVersion` 的旧文件仍然受支持，不需要用户手动迁移。

## Legacy 示例

```yaml
id: review-pr
name: PR Review
description: 根据团队约定审查拉取请求
type: prompt
tags:
  - review
  - workflow
  - git
prompt: |
  你是一名代码审查员。要具体，不要模糊。
  标记：安全问题、缺失的测试、破坏性变更。
```

## Universal Skill V1 示例

```yaml
schemaVersion: skillcentral.dev/v1
id: pr-review-workflow
name: Pull Request Review Workflow
description: Review a pull request with policy, security and maintainability checks.
version: 0.3.0
type: workflow
tags:
  - review
  - git
  - workflow
activation:
  intents:
    - review-pr
    - code-review
capabilities:
  required:
    - ide.context.currentDiff
    - ide.agent.readFiles
  optional:
    - ide.agent.runCommand
context:
  subscribe:
    - topic: diff.summary
  publish:
    - topic: review.summary
prompt:
  role: reviewer
  template: |
    Review the current diff and return findings ordered by severity.
workflow:
  strategy: sequential
  steps:
    - id: collect-context
      uses: prompt
      outputTopic: diff.summary
targets:
  genericMcp:
    injection:
      mode: resource
degradation:
  fallbackTarget: genericMcp
```

## 字段

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `schemaVersion` | string | 仅 v1 需要 | 必须为 `skillcentral.dev/v1`。缺失时按 legacy 格式处理。 |
| `id` | string | 是 | 全局唯一技能 id。 |
| `name` | string | 是 | 人类可读的名称。 |
| `description` | string | 是 | 用于 MCP 与 UI 元数据。 |
| `type` | `prompt` \| `tool` \| `workflow` \| `policy` \| `context-router` | 是 | legacy 只支持 `prompt` 和 `tool`；v1 支持五类资产。 |
| `tags` | string[] | 否 | 用于组合、发现和 layer 推断。 |
| `activation` | object | v1 可选 | 意图、文件模式和仓库信号匹配元数据。 |
| `capabilities` | object | v1 可选 | `required`、`optional`、`denied` 能力名。能力名是点分隔标识符，例如 `ide.agent.readFiles`。 |
| `targets` | object | v1 可选 | 后续 compiler 阶段使用的目标端 adapter 配置。 |
| `context` | object | v1 可选 | Blackboard 订阅与发布 topic 声明。 |
| `degradation` | object | v1 可选 | 目标能力缺失时的降级策略。 |
| `prompt` | string 或 `{ role, template }` | prompt skill 必需 | legacy 使用字符串。v1 支持字符串或带 `template` 的对象。 |
| `prompt_zh` | string | 否 | 可选中文 prompt 变体。 |
| `inputSchema` | object | tool 可选 | 工具参数的 JSON Schema。 |
| `inputs` | object | v1 可选 | 通用输入契约。v1 tool 没有 `inputSchema` 时，可将 `inputs` 用作 MCP 输入 schema。 |
| `outputs` | object | v1 可选 | 后续 compiler/workflow 阶段使用的通用输出契约。 |
| `workflow` | object | workflow 可选 | 工作流策略和步骤。 |
| `arguments` | object[] | 否 | MCP prompt 参数元数据。 |
| `version` | string | 否 | 自由格式版本。解析后缺失时默认 `0.1.0`。 |

## Legacy 自动提升

当文件没有 `schemaVersion` 时，parser 会按 legacy skill 读取并在内部提升：

- `schemaVersion` 变为 `skillcentral.dev/v1`。
- `sourceFormat` 变为 `legacy`。
- `type` 保持为 `prompt` 或 `tool`。
- 保留旧的 `prompt`、`prompt_zh`、`inputSchema`、`arguments`、`tags` 和 `version`。
- MCP `prompts/list`、`prompts/get`、`tools/list`、`tools/call` 行为保持兼容。

## 验证

验证逻辑位于 `src/schema/universal-skill.ts`、`src/schema/legacy.ts`，共享入口是 `src/storage/parser.ts`。

`skill-central validate <file...>` 会运行和引擎加载一致的检查。校验错误包含：

- 文件路径
- 字段路径
- 错误原因

示例格式：

```text
[skill-central] .skills/example.yaml: capabilities.required[0]: invalid capability name; expected dot-separated identifier such as ide.agent.readFiles
```

## 流程

```text
.skills/02-workflows/review-pr.yaml
        |
        |  parseSkillFile()
        v
legacy or v1 object
        |
        |  validateSkill() + upgradeLegacySkill()
        v
UniversalSkill
        |
        |  OverrideTree.insert()
        v
ResolvedSkill { ...skill, source, priority }
        |
        |  ListPrompts / ListTools / GetPrompt / CallTool
        v
IDE or agent client
```

## 检查命令

```bash
npm test
npm run build
skill-central validate .skills/**/*.yaml
skill-central doctor
```
