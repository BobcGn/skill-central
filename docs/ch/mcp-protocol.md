# MCP 协议参考

skill-central 通过 Stdio 实现了 [模型上下文协议 (Model Context Protocol)](https://modelcontextprotocol.io)。本页面记录了 JSON-RPC 方法、请求/响应的结构，以及 skill-central 特别使用的一些扩展约定。

## 传输

- `skill-central mcp` 启动一个 Stdio 传输（换行符分隔的 JSON-RPC 2.0）
- `stdout` 保留给 JSON-RPC 帧；所有日志都输出到 `stderr`
- IDE 配置示例 (Claude Code / Cursor):

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "npx",
      "args": ["-y", "@bobcgn/skill-central", "mcp"]
    }
  }
}
```

## 能力

skill-central 声明了 `prompts`、`tools` 和 `resources` 能力。Effective skills 会通过共享 Registry Query API 选择：`type: prompt` 暴露为 prompts，`type: tool` 暴露为 tools。Shadowed 和 conflicted 候选不会暴露为 prompt/tool，但可以通过 `skill://registry` Resource 作为审计证据读取。

## 方法

### `initialize`

标准的 MCP 握手。服务器返回其 `name` (`"skill-central"`) 和 `version`。

### `prompts/list`

列出所有 prompt 类型的技能。

**请求:** `{}`

**响应:**

```json
{
  "prompts": [
    {
      "name": "review-pr",
      "description": "根据团队约定审查拉取请求",
      "arguments": [
        { "name": "context", "description": "来自 IDE 的额外上下文", "required": false }
      ]
    }
  ]
}
```

### `prompts/get`

检索单个 prompt 渲染后的消息。

**请求:**

```json
{
  "name": "review-pr",
  "arguments": { "context": "这个 PR 添加了一个新的 REST 端点" }
}
```

**响应:**

```json
{
  "description": "根据团队约定审查拉取请求",
  "messages": [
    {
      "role": "user",
      "content": { "type": "text", "text": "…渲染后的提示，其中 {{context}} 已被替换…" }
    }
  ]
}
```

技能 `prompt` 字段中的 `{{handlebars}}` 占位符会从 `arguments` 映射中替换。

### 特例: `prompts/get` 使用 `name: "skills:compose"`

执行基于标签的多技能组合：

**请求:**

```json
{
  "name": "skills:compose",
  "arguments": { "tags": "kmp,android" }
}
```

Registry 会收集所有 effective prompt skills 中 `tags` 与 `{kmp, android}` 重叠的技能，按层优先级升序排序，并用 `\n\n---\n\n` 分隔符连接它们的 prompt 正文。组合后的 prompt 作为单个用户消息返回。

```json
{
  "description": "由标签组合的提示: kmp, android (3 个技能)",
  "messages": [
    { "role": "user", "content": { "type": "text", "text": "## architectural-mindset\n…\n\n---\n\n## kmp-expert\n…\n\n---\n\n## android-expert\n…" } }
  ]
}
```

MCP `GetPrompt` 的参数被限制为字符串，所以标签作为逗号分隔的字符串传递。提取器在 `src/protocol/prompts.ts:83`。

### `tools/list`

列出所有 tool 类型的技能，以及 skill-central 内置的 workflow 控制面工具。内置工具不来自 `.skills` 文件，因此 IDE 健康检查会把它们作为 MCP 可见基准的一部分单独纳入计数。

**请求:** `{}`

**响应:**

```json
{
  "tools": [
    {
      "name": "commit-conventions",
      "description": "生成或验证 git 提交信息",
      "inputSchema": {
        "type": "object",
        "properties": {
          "type":    { "type": "string", "description": "feat | fix | chore | …" },
          "scope":   { "type": "string" },
          "summary": { "type": "string" },
          "body":    { "type": "string" }
        },
        "required": ["type", "summary"]
      }
    },
    {
      "name": "workflow.start",
      "description": "Create a workflow session and return initial Data Plane Tasks.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "workflowId": { "type": "string" },
          "appStateDir": { "type": "string" }
        },
        "required": ["workflowId"]
      }
    }
  ]
}
```

### `tools/call`

使用具体参数调用一个 tool 类型的技能。

**请求:**

```json
{
  "name": "commit-conventions",
  "arguments": {
    "type": "feat",
    "scope": "cli",
    "summary": "添加 list 和 show 子命令"
  }
}
```

**响应 (成功):**

```json
{
  "content": [
    { "type": "text", "text": "feat(cli): add list and show subcommands" }
  ]
}
```

**响应 (验证错误):**

```json
{
  "content": [
    { "type": "text", "text": "缺少必需的参数: \"summary\"" }
  ],
  "isError": true
}
```

参数验证位于 `src/core/composer.ts:75`，检查 `required` + 简单的 JSON-Schema 类型匹配 (string, number, integer, boolean, array, object)。对于更深层次的验证，可以在技能的 prompt 中或通过自定义工具加入您自己的 schema 检查。

#### 内置 workflow tools

Phase 5M 起，`tools/call` 也支持以下内置控制面工具：

| Tool | 作用 |
|---|---|
| `workflow.start` | 创建 workflow session，并返回第一批 ready Data Plane Task |
| `workflow.next` | 根据当前 blackboard topic 推进 session，返回 ready / blocked / completed report |
| `workflow.publish` | 向指定 session topic 追加 agent 结果 |
| `workflow.summarize` | 聚合 session 当前 topic 摘要 |

这些工具复用 `skill-central workflow` CLI 的控制面逻辑，响应体以 `content[0].text` 返回格式化 JSON。Data Plane Task 会包含 `promptBundle`：`text` 是给 IDE Agent 的执行提示，`resourceUris` 只列出当前 step 显式需要读取的 `skill://session/{sessionId}/topic/{topic}`。它不会注入全量 session history，也不会执行 Bash、读取项目文件或写 skill source。

### `resources/list`

列出可读取的只读 Resource。

**请求:** `{}`

**响应:**

```json
{
  "resources": [
    {
      "uri": "skill://registry",
      "name": "skill-central registry",
      "mimeType": "application/json"
    },
    {
      "uri": "skill://skill/review-pr",
      "name": "review-pr",
      "mimeType": "application/json"
    }
  ]
}
```

### `resources/read`

读取一个 `skill://` Resource。当前支持以下只读 URI：

| URI | 内容 |
|---|---|
| `skill://registry` | Registry resolution records，包含 effective/conflicted 候选与 layer provenance |
| `skill://skill/{skillId}` | 单个 effective skill 的规范化 JSON |
| `skill://bundle/{target}/{intent}` | 复用 compiler dry-run 的 `CompiledSkillBundle` |
| `skill://session/{sessionId}/context` | app state 中持久化的 workflow session JSON，包含状态和 audit events |
| `skill://session/{sessionId}/topic/{topic}` | app state 中持久化的 blackboard topic JSON，包含 entries、summary 和 refs |
| `skill://workflow/{workflowId}/plan` | 只读 workflow definition plan，包含 step 依赖、topic 边界和可用 `workflow.*` 控制面工具 |

`skill://bundle/{target}/{intent}` 只返回编译证据，不写 IDE 文件，不执行项目数据面操作。`skill://session/{sessionId}/topic/{topic}` 只读取指定 session 下的指定 topic，不会注入全量 session 历史。`skill://workflow/{workflowId}/plan` 不创建 session、不读取 blackboard live state，只解释 workflow 定义和调度边界。Workflow 推进通过 `workflow.*` tools 完成，Resource 层只承担只读证据读取。

## 错误处理

skill-central 抛出标准的 MCP 错误：

| 条件 | 行为 |
|---|---|
| 未知的 prompt 名称 | `Error("Unknown prompt skill: <name>")` |
| 未知的 tool 名称 | `Error("Unknown tool: <name>")` |
| 缺少必需的 tool 参数 | `isError: true` 并在 `content[0]` 中提供人类可读的消息 |
| 标签组合无匹配 | `Error("No skills found for tags: …")` |
| 层解析错误 | 技能被静默跳过；向 stderr 输出警告；不作为 MCP 错误浮现 |

## Stdio 规范

`skill-central mcp` 在启动时会修补 `console.log` 以重定向到 stderr。这可以防止零散的输出破坏 JSON-RPC 流。如果您正在调试：

```bash
# 观察服务器正在做什么
npx @bobcgn/skill-central mcp 2> /tmp/mcp.log
tail -f /tmp/mcp.log
```
