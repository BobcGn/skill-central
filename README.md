# skill-central

**Local MCP Server for Cross-IDE AI Skill Distribution**

skill-central is a local [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that communicates with AI IDEs (Cursor, Windsurf, Claude Code, etc.) via the **Stdio protocol**, enabling **cross-IDE AI skill (prompts/tools) distribution and reuse**.

> A **skill** is a structured prompt or tool definition — organised by topic, managed in layers, matched by tags. You manage your AI's capability boundaries the same way you manage code.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [CLI Commands](#cli-commands)
- [JSON-RPC API](#json-rpc-api)
- [Skill File Format](#skill-file-format)
- [Tag Composition](#tag-composition)
- [Layered Override](#layered-override)
- [Config Resolution Order](#config-resolution-order)
- [IDE Integration](#ide-integration)
- [Custom Skill Development](#custom-skill-development)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

---

## Quick Start

### Install

```bash
npx @bobcgn/skill-central init
```

This scaffolds a `.skills/` directory with 4 layered skill directories and a `skill-central.yaml` config file.

```bash
# Verify skills are loaded
npx @bobcgn/skill-central board
```

Expected output — 4 layers, 5 skill files (including a tool-type example):

```
▸ Skills (5 total)
┌─────────┬──────────────────────────┬────────────────────────────────┬──────────┬────────────────────────────────┐
│ (index) │ ID                       │ Name                           │ Type     │ Tags                           │
├─────────┼──────────────────────────┼────────────────────────────────┼──────────┼────────────────────────────────┤
│ 0       │ 'architectural-mindset'  │ 'Architectural Mindset'        │ 'prompt' │ 'global'                       │
│ 1       │ 'debugging-expert'       │ 'Debugging Expert'             │ 'prompt' │ 'debug, fix, error'            │
│ 2       │ 'commit-conventions'     │ 'Commit Conventions'           │ 'tool'   │ 'git, workflow, commit'        │
│ 3       │ 'container-infra'        │ 'Container & Infrastructure'   │ 'prompt' │ 'docker, nginx, infra, devops' │
└─────────┴──────────────────────────┴────────────────────────────────┴──────────┴────────────────────────────────┘
```

### Start the MCP server

```bash
npx @bobcgn/skill-central mcp
```

The server listens on **stdin** for JSON-RPC messages and writes responses to **stdout**. All diagnostic output goes to **stderr**.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│               AI IDE (Cursor / Windsurf / etc.)        │
│                        │  Stdio (JSON-RPC)             │
└────────────────────────┼───────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│  skill-central         ▼                                │
│  ┌────────────┐  ┌─────────────────┐  ┌─────────────┐   │
│  │  Entry     │  │  Protocol       │  │  Core       │   │
│  │  index.ts  │→ │  handler.ts     │→ │  engine     │   │
│  │  mcp.ts    │  │  prompts.ts     │  │  override-  │   │
│  │  board.ts  │  │  tools.ts       │  │  tree       │   │
│  │  init.ts   │  │                 │  │  composer   │   │
│  └────────────┘  └─────────────────┘  └──────┬──────┘   │
│                                              │          │
│                                       ┌──────▼───────┐  │
│                                       │  Storage     │  │
│                                       │  reader.ts   │  │
│                                       │  parser.ts   │  │
│                                       │  config.ts   │  │
│                                       └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Default Skill Layers

| Layer | Priority | Scope |
|-------|----------|-------|
| `01-global` | 10 | Universal context — applies to every interaction |
| `02-workflows` | 20 | Cross-cutting workflows (debugging, review, planning) |
| `03-domains` | 30 | Domain-specific knowledge (infra, security, data) |
| `04-tech-stack` | 40 | Tech-stack specifics — languages and frameworks |

---

## CLI Commands

```bash
npx @bobcgn/skill-central <command>
```

| Command | Description |
|---------|-------------|
| `mcp` | Start the Stdio MCP Server (silent mode, output on stderr only). For IDE integration. |
| `board` | Developer dashboard — print all loaded layers and skills as tables. |
| `init` | Scaffold `.skills/` directory with sample definitions and layer config. |

After global install:

```bash
npm install -g @bobcgn/skill-central
skill-central init
skill-central board
skill-central mcp
```

---

## JSON-RPC API

### `prompts/list`

List all prompt-type skills.

```json
// Request
{"jsonrpc":"2.0","id":1,"method":"prompts/list"}

// Response
{"result":{"prompts":[
  {"name":"architectural-mindset","description":"Before writing code, always reason..."},
  {"name":"debugging-expert","description":"Systematic debugging..."},
  {"name":"container-infra","description":"Docker, Nginx, and infra deployment..."}
]}}
```

### `prompts/get`

**Single skill lookup:**

```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"container-infra"}}
```

Template interpolation is supported: placeholders like `{{name}}` in the skill's `prompt` field are replaced with argument values:

```json
{"method":"prompts/get","params":{"name":"my-skill","arguments":{"name":"Alice"}}}
```

**Tag-based composition** (combine multiple skills, low→high priority):

```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,debug,docker"}}}
```

### `tools/list` / `tools/call`

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"commit-conventions","arguments":{"type":"feat","summary":"add login page"}}}
```

Tool arguments are validated against the skill's `inputSchema` — missing required fields or type mismatches return an error result with `isError: true`.

---

## Skill File Format

Skills can be defined in **YAML** (recommended) or **JSON**.

```yaml
# .skills/04-tech-stack/languages/typescript.yaml
id: typescript-conventions
name: TypeScript Conventions
description: TypeScript coding standards for the project
type: prompt
tags:
  - typescript
prompt: |
  You are an expert TypeScript developer. Follow these conventions:

  ## Code Style
  - Use strict mode — always enable `strict: true` in tsconfig.
  - Prefer interfaces over type aliases for object shapes.
  - Use explicit return types on public functions.
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Globally unique identifier. Used as prompt name. |
| `name` | string | ✓ | Human-readable label. |
| `description` | string | ✓ | One-line description. |
| `type` | `"prompt"` / `"tool"` | ✓ | Skill type. |
| `tags` | string[] | | Categorisation tags for composition. |
| `prompt` | string | for prompt | Markdown instructions sent to the AI. Supports `{{placeholder}}` interpolation. |
| `inputSchema` | object | for tool | JSON Schema input definition. Validated on tool call. |
| `arguments` | object[] | | Declared arguments (informational, for IDE UI). |
| `version` | string | | Semver for change tracking. |

---

## Tag Composition

When an IDE calls `skills:compose`, the engine:

1. **Matches** all skills whose tags overlap the requested tag set
2. **Sorts** by layer priority (ascending — low first)
3. **Concatenates** prompt content separated by `---`

Example — `tags: "debug,docker"` triggers:

```
[docker, nginx, infra, devops]  ← container-infra (priority 30)
                                   matched via "docker"
[debug, fix, error]              ← debugging-expert (priority 20)
                                   matched via "debug"
```

Result: debugging guidance first, then infra standards — layered from concrete workflow to domain knowledge, combined in priority order.

---

## Layered Override

When multiple layers define the **same `id`**, the highest-priority entry wins:

```yaml
layers:
  - name: "01-global"      # priority: 10 — overridable baseline
  - name: "04-tech-stack"  # priority: 40 — team-wide conventions
  - name: "user-override"  # priority: 100 — personal preference
```

This lets teams share a common skill repository while allowing individuals to layer custom overrides — no file copying required.

---

## Config Resolution Order

```
1. ~/.skill-central/config.yaml       ← machine-wide defaults
2. <project>/skill-central.yaml       ← per-project (overrides same-named layers)
3. Built-in fallback                  ← { name: "project", path: ".skills", priority: 100 }
```

Layers with the same name are merged (later sources overwrite path/priority).

---

## IDE Integration

Connect skill-central to your AI IDE as an MCP tool.

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "npx",
      "args": ["@bobcgn/skill-central", "mcp"]
    }
  }
}
```

### Windsurf

`.windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "npx",
      "args": ["@bobcgn/skill-central", "mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add skill-central -- npx @bobcgn/skill-central mcp
```

---

## Custom Skill Development

### Step 1 — Create a skill file

```bash
mkdir -p .skills/04-tech-stack/languages
```

`.skills/04-tech-stack/languages/typescript.yaml`:

```yaml
id: typescript-conventions
name: TypeScript Conventions
description: TypeScript coding standards
type: prompt
tags:
  - typescript
prompt: |
  You are an expert TypeScript developer...
```

### Step 2 — Verify

```bash
npx @bobcgn/skill-central board
```

### Step 3 — Use it

```bash
# Via direct lookup
{"method":"prompts/get","params":{"name":"typescript-conventions"}}

# Or via tag composition
{"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"typescript"}}}
```

Refer to `.skills/04-tech-stack/_template.yaml` for a complete annotated example.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Server starts but no response | stdout pollution | Check for rogue `console.log` calls. All output must go to stderr. |
| IDE can't connect | Wrong command in MCP config | Use `npx @bobcgn/skill-central mcp` as the command. |
| Skills not loading | YAML syntax error | Run `npx @bobcgn/skill-central board` to see load status. Check `id` and `type` fields exist. |
| Tag composition returns empty | Tags missing or mismatched | Verify skill YAML has `tags:`. Use `board` to confirm. Pass comma-separated: `"tags":"kmp,android"`. |
| Tool call returns error | Missing or invalid arguments | Check the skill's `inputSchema.required` field. Arguments are validated against declared types. |

---

## Development

```bash
# Clone and set up
git clone https://github.com/BobcGn/skill-central.git
cd skill-central
npm install

# Dev commands
npm run dev:mcp       # MCP server in watch mode
npm run dev:board     # dashboard view
npm run dev:init      # (re)generate sample skills
npm run build         # tsc compile → dist/
npx tsc --noEmit      # type-check only
```

### Tech Stack

| Component | Choice |
|-----------|--------|
| **Runtime** | Node.js 22+ (ESM) |
| **Language** | TypeScript 5.8 (ES2022, NodeNext) |
| **MCP SDK** | `@modelcontextprotocol/sdk` ^1.9.0 |
| **CLI** | `commander` ^14.0.0 |
| **YAML** | `js-yaml` ^4.1.1 |
| **Dev Runner** | `tsx` ^4.19.3 |

---

## License

MIT
