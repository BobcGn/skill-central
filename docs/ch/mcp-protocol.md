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

skill-central 声明了 `prompts` 和 `tools` 能力。每个加载的技能都作为 `Prompt` (如果 `type: prompt`) 或 `Tool` (如果 `type: tool`) 暴露出来。

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

引擎会收集所有其 `tags` 与 `{kmp, android}` 重叠的技能，按层优先级升序排序，并用 `\n\n---\n\n` 分隔符连接它们的 prompt 正文。组合后的 prompt 作为单个用户消息返回。

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

列出所有 tool 类型的技能。

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
