# 技能 Schema

一个技能是层目录中的一个 YAML (或 JSON) 文件。该 schema 很小，并在加载时进行严格验证。

## 最小示例

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

## 字段

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `id` | string | **是** | 全局唯一。Kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`)。在 MCP 中用作 prompt/tool 的名称。 |
| `name` | string | **是** | 人类可读的标签。 |
| `description` | string | **是** | 一句话描述。在 MCP 的 `ListPrompts` / `ListTools` 输出中显示。 |
| `type` | `"prompt"` \| `"tool"` | **是** | 鉴别器：`prompt` → 发送给 AI 的指令；`tool` → 可调用的函数。 |
| `tags` | string[] | 否 | 用于基于标签的组合 (`GetPrompt("skills:compose", { tags: "kmp,android" })`) 以及 `add` / `install` 中的层自动推断。 |
| `prompt` | string | 当 `type: prompt` 时必需 | 多行字符串。`{{handlebars}}` 占位符会从 MCP `GetPrompt` 的参数中插值替换。 |
| `inputSchema` | object | 当 `type: tool` 时必需 | 工具参数的 JSON Schema。在 `CallTool` 时进行验证。 |
| `arguments` | object[] | 否 | 用于 IDE UI 的信息性元数据。与 MCP `Prompt.arguments` 的形状相同。 |
| `version` | string | 否 | 自由格式的版本字符串。缺失时默认为 `"0.1.0"`。 |

## 工具示例

```yaml
id: commit-conventions
name: Commit Conventions
description: 遵循约定式提交标准生成或验证 git 提交信息
type: tool
tags:
  - git
  - workflow
  - commit
inputSchema:
  type: object
  properties:
    type:
      type: string
      description: '提交类型 (feat, fix, chore, docs, refactor, test, style)'
    scope:
      type: string
      description: '变更范围 (例如 api, cli, core)'
    summary:
      type: string
      description: 简短的祈使句描述
    body:
      type: string
      description: 带有动机的更长描述
  required:
    - type
    - summary
arguments:
  - name: type
    description: 提交类型
    required: true
  - name: summary
    description: 简短的祈使句描述
    required: true
prompt: |
  生成一个约定式提交信息：
  {{type}}({{scope}}): {{summary}}
  {{body}}
```

## 验证

验证逻辑位于 `src/storage/parser.ts` 中，并由引擎和 CLI 共享：

- `id` 必须为非空字符串
- `type` 必须为 `"prompt"` 或 `"tool"`
- `tags` 会被规范化：单个字符串会变为 `["that-string"]`；非字符串条目会被丢弃

`skill-central validate <file…>` 从命令行运行相同的检查，并在任何失败时以退出码 1 退出。`skill-central doctor` 在每个加载的层上运行这些检查，并报告带有文件路径的错误。

## 文件名约定

文件命名为 `<id>.yaml` (或 `.yml`, `.json`)。引擎会忽略以 `_` (被视为模板) 或 `.` (隐藏文件) 开头的文件。参见 `src/storage/reader.ts`。

## Schema 如何在系统中流动

```
.skills/04-tech-stack/languages/python-code-review.yaml
        │
        │  parseSkillFile()  (js-yaml + validateSkill)
        ▼
SkillSchema  { id, name, type, ... }
        │
        │  OverrideTree.insert()   (per-layer)
        ▼
ResolvedSkill { ...schema, source, priority }
        │
        │  ListPrompts / ListTools / GetPrompt / CallTool
        ▼
IDE (Cursor, Windsurf, Claude Code, ...)
```

Schema 是技能作者和引擎之间的契约；如果您更改它，请同时更新 `src/storage/schemas.ts` 和 `parser.ts` 中的验证器。
