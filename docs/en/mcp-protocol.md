# MCP Protocol Reference

skill-central implements the [Model Context Protocol](https://modelcontextprotocol.io) over Stdio. This page documents the JSON-RPC methods, request/response shapes, and a few extension conventions used by skill-central specifically.

## Transport

- `skill-central mcp` starts a Stdio transport (newline-delimited JSON-RPC 2.0)
- `stdout` is reserved for JSON-RPC frames; all logging goes to `stderr`
- IDE config example (Claude Code / Cursor):

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

## Capabilities

skill-central declares `prompts` and `tools` capabilities. Every loaded skill is exposed as either a `Prompt` (if `type: prompt`) or a `Tool` (if `type: tool`).

## Methods

### `initialize`

Standard MCP handshake. The server returns its `name` (`"skill-central"`) and `version`.

### `prompts/list`

Lists every prompt-typed skill.

**Request:** `{}`

**Response:**

```json
{
  "prompts": [
    {
      "name": "review-pr",
      "description": "Review pull requests against team conventions",
      "arguments": [
        { "name": "context", "description": "Additional context from the IDE", "required": false }
      ]
    }
  ]
}
```

### `prompts/get`

Retrieve a single prompt's rendered messages.

**Request:**

```json
{
  "name": "review-pr",
  "arguments": { "context": "this PR adds a new REST endpoint" }
}
```

**Response:**

```json
{
  "description": "Review pull requests against team conventions",
  "messages": [
    {
      "role": "user",
      "content": { "type": "text", "text": "…rendered prompt with {{context}} interpolated…" }
    }
  ]
}
```

`{{handlebars}}` placeholders in the skill's `prompt` field are replaced from the `arguments` map.

### Special: `prompts/get` with `name: "skills:compose"`

Performs tag-based multi-skill composition:

**Request:**

```json
{
  "name": "skills:compose",
  "arguments": { "tags": "kmp,android" }
}
```

The engine collects every skill whose `tags` overlap `{kmp, android}`, sorts by ascending layer priority, and concatenates their prompt bodies with `\n\n---\n\n` separators. The composed prompt is returned as the single user message.

```json
{
  "description": "Composed prompt from tags: kmp, android (3 skills)",
  "messages": [
    { "role": "user", "content": { "type": "text", "text": "## architectural-mindset\n…\n\n---\n\n## kmp-expert\n…\n\n---\n\n## android-expert\n…" } }
  ]
}
```

MCP `GetPrompt` arguments are constrained to strings, so tags are passed as a comma-separated string. The extractor is in `src/protocol/prompts.ts:83`.

### `tools/list`

Lists every tool-typed skill.

**Request:** `{}`

**Response:**

```json
{
  "tools": [
    {
      "name": "commit-conventions",
      "description": "Generate or validate git commit messages",
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

Invoke a tool-typed skill with concrete arguments.

**Request:**

```json
{
  "name": "commit-conventions",
  "arguments": {
    "type": "feat",
    "scope": "cli",
    "summary": "add list and show subcommands"
  }
}
```

**Response (success):**

```json
{
  "content": [
    { "type": "text", "text": "feat(cli): add list and show subcommands" }
  ]
}
```

**Response (validation error):**

```json
{
  "content": [
    { "type": "text", "text": "Missing required argument: \"summary\"" }
  ],
  "isError": true
}
```

Argument validation lives in `src/core/composer.ts:75` and checks `required` + simple JSON-Schema type matching (string, number, integer, boolean, array, object). For deeper validation, layer your own schema check in the skill's prompt or via custom tooling.

## Error handling

skill-central throws standard MCP errors:

| Condition | Behaviour |
|---|---|
| Unknown prompt name | `Error("Unknown prompt skill: <name>")` |
| Unknown tool name | `Error("Unknown tool: <name>")` |
| Missing required tool argument | `isError: true` with a human-readable message in `content[0]` |
| Tag composition matches nothing | `Error("No skills found for tags: …")` |
| Layer parse error | Skill silently skipped; warning to stderr; not surfaced as MCP error |

## Stdio discipline

`skill-central mcp` patches `console.log` to redirect to stderr at startup. This prevents stray output from corrupting the JSON-RPC stream. If you're debugging:

```bash
# Watch what the server is doing
npx @bobcgn/skill-central mcp 2> /tmp/mcp.log
tail -f /tmp/mcp.log
```