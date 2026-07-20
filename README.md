[中文文档](./README.zh-CN.md)

# skill-central

**Local MCP Server for Cross-IDE AI Skill Distribution**

skill-central is a local [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that communicates with AI IDEs (Cursor, Windsurf, Claude Code, etc.) via the **Stdio protocol**, enabling **cross-IDE AI skill (prompts/tools) distribution and reuse**.

> A **skill** is a structured prompt or tool definition — organised by topic, managed in layers, matched by tags. You manage your AI's capability boundaries the same way you manage code.

Since **v0.2.0** skill-central ships a complete local CRUD CLI, a Hono-based **web board** for in-browser editing, and a **remote install** path from GitHub raw URLs and npm packages.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [CLI Commands](#cli-commands)
- [Local CRUD](#local-crud)
- [Web Board](#web-board)
- [Remote Install](#remote-install)
- [JSON-RPC API](#json-rpc-api)
- [Skill File Format](#skill-file-format)
- [Tag Composition](#tag-composition)
- [Layered Override](#layered-override)
- [Config Resolution Order](#config-resolution-order)
- [IDE Integration](#ide-integration)
- [Custom Skill Development](#custom-skill-development)
- [Deployment & Troubleshooting](#deployment--troubleshooting)
- [Documentation](#documentation)
- [Pre-release Testing](#pre-release-testing)
- [Trusted Publishing](./docs/en/trusted-publishing.md) / [受信任的发布](./docs/ch/trusted-publishing.md)
- [Manual Publishing](./docs/en/manual-publishing.md) / [手动发布](./docs/ch/manual-publishing.md)
- [Development](#development)
- [License](#license)

---

## Quick Start

> **Note:** `skill-central` is a template repository. You can either use the pre-published package (`@bobcgn/skill-central`) directly, or clone/fork this repository to publish your own custom MCP server. 

### Install / Initialize

```bash
# If using the default published service:
npx @bobcgn/skill-central init

# If you published your own package:
# npx your-package-name init

# If running from a cloned repo locally:
# npm run build && npm link
# skill-central init
```

This scaffolds a `.skills/` directory with 4 layered skill directories and a `skill-central.yaml` config file.

### Open the web board

```bash
# Using the default published service
npx @bobcgn/skill-central board
```

Prints `http://127.0.0.1:5417/` and opens a Hono dashboard in your terminal — browse, preview, edit, and restore skills from the browser. Use `board --cli` (or `--no-web`) for the terminal-table fallback.

### Start the MCP server

```bash
npx @bobcgn/skill-central mcp
```

The server listens on **stdin** for JSON-RPC messages and writes responses to **stdout**. All diagnostic output goes to **stderr**.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│               AI IDE (Cursor / Windsurf / etc.)         │
│                        │  Stdio (JSON-RPC)              │
└────────────────────────┼────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│  skill-central         ▼                                 │
│  ┌────────────┐  ┌─────────────────┐  ┌─────────────┐   │
│  │  CLI       │  │  Protocol       │  │  Core       │   │
│  │  mcp/init  │→│  handler.ts     │→│  engine     │   │
│  │  add/list  │  │  prompts.ts     │  │  override-  │   │
│  │  show/...  │  │  tools.ts       │  │  tree       │   │
│  │  install   │  └─────────────────┘  │  composer   │   │
│  │  board     │  ┌─────────────────┐  └──────┬──────┘   │
│  │  (Hono)    │  │  Web board      │         │          │
│  │            │  │  server.ts      │  ┌──────▼───────┐  │
│  │            │  │  router.ts      │  │  Storage     │  │
│  │            │  │  backup.ts      │  │  reader.ts   │  │
│  └────────────┘  └─────────────────┘  │  parser.ts   │  │
│                                       │  config.ts   │  │
│                                       └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Default Skill Layers

| Layer | Priority | Scope |
|-------|----------|-------|
| `01-global` | 10 | Universal context — applies to every interaction |
| `02-workflows` | 20 | Cross-cutting workflows (debugging, review, planning) |
| `03-domains` | 30 | Domain-specific knowledge (infra, security, data) |
| `04-tech-stack/languages` | 40 | Language conventions (TypeScript, Python, Kotlin…) |
| `04-tech-stack/frameworks` | 40 | Framework conventions (React, Vue, Spring…) |

Higher priority wins on id collision. See [Layered Override](#layered-override).

---

## CLI Commands

```bash
npx @bobcgn/skill-central <command>
```

| Command | Description |
|---------|-------------|
| `mcp` | Start the Stdio MCP Server (IDE-facing, silent on stdout) |
| `board` | Open the **web dashboard** (default) or print terminal table (`--cli`) |
| `init` | Scaffold `.skills/` with sample skills and `skill-central.yaml` |
| `add` | Create a new skill definition (auto-selects layer from tags) |
| `list` | List loaded skills (filters: `--layer`, `--tag`, `--type`) |
| `show <id>` | Print full skill details + prompt body |
| `remove <id>` | Delete a skill definition file (with `--layer` ambiguity guard) |
| `validate <files…>` | Parse + validate one or more skill files |
| `doctor` | Scan layers for missing dirs, parse errors, collisions, backups |
| `install <source>` | Install a skill from `github:` or `npm:` URL |
| `update [id]` | Re-fetch installed skill(s); preserves original scope |
| `uninstall <id>` | Remove an installed skill (file + lock entry) |

After global install:

```bash
npm install -g @bobcgn/skill-central
skill-central init
skill-central board          # opens web dashboard
skill-central mcp            # or start the MCP server
```

See [`docs/en/cli-reference.md`](./docs/en/cli-reference.md) / [`docs/ch/cli-reference.md`](./docs/ch/cli-reference.md) for the full flag reference.

---

## Local CRUD

```bash
# Create a skill — layer inferred from tags
skill-central add review-pr \
  --name "PR Review" \
  --description "Review pull requests against team conventions" \
  --tags "review,workflow,git" \
  --prompt-file ./review.md

# Inspect
skill-central list --tag review
skill-central show review-pr

# Validate before committing
skill-central validate .skills/02-workflows/review-pr.yaml

# Clean up
skill-central remove review-pr --force
```

`add` writes the YAML to a layer directory chosen by:

1. an explicit `--layer` flag (always wins)
2. an existing file with the same id (idempotent re-add)
3. tag-based inference via [`LAYER_RULES`](./docs/en/cli-reference.md#layer-inference)
4. fallback to `02-workflows` if no tags match

`doctor` is your diagnostic safety net:

```bash
$ skill-central doctor
...
▸ Layers
  01-global     ✓   1 file
  02-workflows  ✓   9 files
  03-domains    ✓   3 files
  04-tech-stack ✓   3 files
▸ ✓ All skill files parse cleanly
▸ ✓ No id collisions
▸ ✓ No orphan backups
```

---

## Web Board

`skill-central board` starts a local Hono server and prints a URL:

```
  ✓ skill-central web board
    http://127.0.0.1:5417/

  Press Ctrl+C to stop.
```

The dashboard shows skills grouped by layer in the sidebar. Click any skill to preview its prompt body in the detail pane. Click **Edit** to open an in-browser textarea; **Save** writes the change back to disk via `PUT /api/skills/:id`.

Each save moves the previous content to `<file>.yaml.bak.<ISO-no-colons>`. Concurrent edits are caught by sha256 mismatch — the server returns `409` with the current content if your expected sha doesn't match.

### Security

- **Loopback-only by default.** `--host 0.0.0.0` requires `--i-understand-nonlocal` because the web board has no authentication.
- **Port conflict retry.** `+1..+10` from the requested port.
- **Static asset path traversal.** `GET /*` resolves under `dist/web/`; `..` returns 404.

Full HTTP API and edit-flow walkthrough in [`docs/en/web-board.md`](./docs/en/web-board.md) / [`docs/ch/web-board.md`](./docs/ch/web-board.md).

---

## Remote Install

Install a skill from a remote URL into your local layers:

```bash
# From a GitHub raw file (any branch / tag / SHA)
skill-central install \
  github:BobcGn/skill-central/.skills/02-workflows/review-pr.yaml@v1.0.0

# From an npm package (requires skill-central.paths in its package.json)
skill-central install npm:@bobcgn/some-skills@1.2.3

# Re-fetch on demand
skill-central update                 # all installed
skill-central update review-pr       # one

# Tear down
skill-central uninstall review-pr --purge-backups
```

Every install writes a `~/.skill-central/lock.json` entry recording the source URL, resolved version, sha256, layer, and absolute file path. `update` re-fetches, compares sha256, and only writes when the upstream has actually changed.

### Security

- **HTTPS-only.** `http://` URLs are rejected.
- **No loopback hosts.** Tarball sources pointing at `localhost`, `127.0.0.0/8`, `::1`, or `0.0.0.0` are rejected (tar-slip / SSRF mitigation).
- **Tar-slip defence.** npm tarball entries must start with `package/`; `..` and `\` are rejected.
- **sha256 verification.** Every install + update computes and stores the sha256.

Full grammar and manifest conventions in [`docs/en/remote-sources.md`](./docs/en/remote-sources.md) / [`docs/ch/remote-sources.md`](./docs/ch/remote-sources.md).

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
{"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,debug,docker"}}}
```

### `tools/list` / `tools/call`

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"commit-conventions","arguments":{"type":"feat","summary":"add login page"}}}
```

Tool arguments are validated against the skill's `inputSchema` — missing required fields or type mismatches return an error result with `isError: true`.

See [`docs/en/mcp-protocol.md`](./docs/en/mcp-protocol.md) / [`docs/ch/mcp-protocol.md`](./docs/ch/mcp-protocol.md) for the full schema.

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
| `id` | string | ✓ | Globally unique identifier (kebab-case). Used as prompt name. |
| `name` | string | ✓ | Human-readable label. |
| `description` | string | ✓ | One-line description. |
| `type` | `"prompt"` / `"tool"` | ✓ | Skill type. |
| `tags` | string[] | | Categorisation tags for composition + layer inference. |
| `prompt` | string | for prompt | Markdown instructions. Supports `{{placeholder}}` interpolation. |
| `inputSchema` | object | for tool | JSON Schema input definition. Validated on tool call. |
| `arguments` | object[] | | Declared arguments (informational, for IDE UI). |
| `version` | string | | Semver for change tracking. |

Full schema reference in [`docs/en/skill-schema.md`](./docs/en/skill-schema.md) / [`docs/ch/skill-schema.md`](./docs/ch/skill-schema.md).

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

When multiple layers define the **same `id`**, the highest-priority entry wins. The `skill-central.yaml` produced by `init` looks like:

```yaml
layers:
  - name: "01-global"
    path: ".skills/01-global"
    priority: 10
  - name: "02-workflows"
    path: ".skills/02-workflows"
    priority: 20
  - name: "03-domains"
    path: ".skills/03-domains"
    priority: 30
  - name: "04-tech-stack"
    path: ".skills/04-tech-stack"
    priority: 40
```

This lets teams share a common skill repository while allowing individuals to layer custom overrides — no file copying required.

### User-level baseline (v0.2.0)

`add --user` and `install` (default scope) write to `~/.skill-central/skills/`. The four sub-directories mirror the project 1:1, with priorities `5 / 15 / 25 / 35` — always below the project, so a project can always shadow a global baseline. See [`docs/en/layered-override.md`](./docs/en/layered-override.md) / [`docs/ch/layered-override.md`](./docs/ch/layered-override.md).

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

> **Tip:** If you published your own version from this template, replace `@bobcgn/skill-central` with your own npm package name. If you linked the repo locally, use `skill-central mcp` as the command.

### Cursor

`.cursor/mcp.json`:

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

### Windsurf

`.windsurf/mcp_config.json`:

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

### Claude Code

```bash
claude mcp add skill-central -- npx -y @bobcgn/skill-central mcp
```

---

## Custom Skill Development

### Option A — `add` (recommended)

```bash
skill-central add typescript-conventions \
  --name "TypeScript Conventions" \
  --description "Coding standards for this project" \
  --tags "typescript,lang-ts" \
  --prompt-file ./ts-conventions.md
```

Layer inference picks `04-tech-stack/languages/` from the `typescript` tag. Verify with:

```bash
skill-central show typescript-conventions
```

### Option B — write YAML by hand

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

### Verify and use

```bash
skill-central doctor                      # catch parse errors + collisions
skill-central show typescript-conventions  # inspect the rendered result
```

Refer to `.skills/04-tech-stack/_template.yaml` for a complete annotated example.

---

## Deployment & Troubleshooting

> **This section is critical.** MCP clients (Cursor, Windsurf, Claude Code, etc.) communicate with the server process over **stdio (standard input/output)**. stdout is the exclusive JSON-RPC data channel. Any non-protocol data on stdout causes the connection to fail silently — no error, no warning, just an empty tool list. The following two issues are the most common "invisible killers."

### Issue 1: `npx` Interactive Prompt Blocks Startup

#### Symptom

When you start the server with `npx @bobcgn/skill-central mcp` in your MCP config, `npx` may print an interactive prompt on **stdout** if the package isn't cached locally:

```
Need to install the following packages:
  @bobcgn/skill-central@0.3.0
Ok to proceed? (y)
```

#### Why It's Fatal

This prompt appears on **stdout**. The MCP client is waiting for a valid JSON-RPC response but receives plain text instead. Strict parsers (used by Claude Code, Cursor, etc.) immediately判定 the connection as failed and **silently discard the entire tool list** — your IDE won't show any error, it just sees "no tools available."

#### Solution

**Option A (Recommended): Add `-y` to args**

The `-y` flag tells `npx` to auto-confirm installation, bypassing the interactive prompt:

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

> ⚠️ **Note:** `-y` must be the first element in the args array, before the package name.

**Option B (Recommended for production): Run directly with node**

Bypass `npx` entirely to eliminate the possibility of interactive prompts:

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "node",
      "args": ["/absolute/path/to/skill-central/dist/index.js", "mcp"]
    }
  }
}
```

Find the absolute path:

```bash
# Global install path
npm root -g
# Or find the specific package
npm list -g @bobcgn/skill-central --depth=0
```

**Option C: Pre-install globally**

```bash
npm install -g @bobcgn/skill-central
```

Then use `skill-central mcp` directly as the command in your config — no `npx` needed.

---

### Issue 2: `console.log` Pollutes stdout (Strictly Prohibited)

#### Symptom

Developers instinctively add debug logging:

```typescript
// ❌ NEVER do this
console.log("Starting MCP server...");
console.log("Loaded 12 skills");
console.log("Connection established");
```

#### Why It's Fatal

In MCP stdio mode, **stdout is a pure JSON-RPC channel**. The client reads every line from stdout expecting valid JSON-RPC messages. A single line of non-JSON text (like `"Starting MCP server..."`) immediately breaks the protocol frame, causing:

- JSON parser throws an exception
- Client disconnects
- Tool list returns empty
- In some implementations, previously valid messages are also discarded

#### Solution

**Hard rule: ALL debug/status output MUST use `console.error()` — never output non-protocol data to stdout.**

```typescript
// ✅ Correct: output to stderr, does not affect JSON-RPC channel
console.error("[skill-central] Starting MCP server...");
console.error("[skill-central] Loaded 12 skills");

// ❌ Wrong: pollutes stdout, breaks JSON-RPC protocol
console.log("Starting MCP server...");
```

**Third-party libraries using `console.log` are equally dangerous.** If a dependency you import uses `console.log` internally, it will also pollute stdout. `skill-central` includes built-in protection in MCP mode (redirecting `console.log` to `stderr`), but if you build on this project for二次开发, you must be vigilant about this risk.

---

### Architecture: Why stdio Mode Is So Fragile

```
┌──────────────────────────────────────────────────────────┐
│              MCP Client (Cursor / Windsurf / Claude)      │
│                                                          │
│  Read stdout  ──→ JSON Parser  ──→ Tool / Prompt List    │
│  Write stdin  ──→ JSON-RPC Request                       │
└──────────────┬───────────────────────┬───────────────────┘
               │ stdin                 │ stdout
               ▼                       ▲
┌──────────────────────────────────────────────────────────┐
│              MCP Server Process                           │
│                                                          │
│  stdin  ──→ Protocol Handler ──→ JSON-RPC Response ──→ stdout
│                                                          │
│  ⚠️ Any console.log / process log / npx prompt           │
│     will leak into stdout and break the protocol frame   │
└──────────────────────────────────────────────────────────┘
```

**The core constraint:** stdio is a **byte stream channel** with no message boundaries. The JSON-RPC protocol uses newlines to delimit messages, and the client parses line by line. Once a single line is not valid JSON, all subsequent messages will be misaligned or discarded outright. That's why a single `console.log` can kill an entire connection.

**Contrast with HTTP mode:** If MCP ever supports HTTP/SSE transport, this problem is greatly mitigated (HTTP has natural message boundaries and multiplexing). But under the current stdio mode, this is an iron rule every MCP service developer must strictly follow.

---

### Quick Diagnostic Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Server starts but no response / empty tool list | stdout contaminated with non-JSON data | Check all `console.log` calls — change to `console.error()`. Confirm `-y` is in npx args. |
| IDE can't connect | Wrong command in MCP config | Use `npx -y @bobcgn/skill-central mcp` or specify an absolute path. |
| First connection works, fails on restart | npx cache exists but package version updated | Clear npx cache: `npx clear-npx-cache`, or use `-y` to force update. |
| Skills not loading | YAML syntax error | Run `skill-central doctor` to see parse errors with file paths. |
| Tag composition returns empty | Tags missing or mismatched | Verify skill YAML has `tags:`. Use `list --tag X` to confirm. Pass comma-separated: `"tags":"kmp,android"`. |
| Tool call returns error | Missing or invalid arguments | Check the skill's `inputSchema.required` field. Arguments are validated against declared types. |
| Web board refuses to bind 0.0.0.0 | Footgun guard | Pass `--i-understand-nonlocal` if you really mean it. |
| `install github:...` returns 404 | Wrong path / branch | Verify the path exists on the remote at that ref. |
| `Package X has no "skill-central.paths"` | npm package author omitted the manifest field | Author must declare `"skill-central": { "paths": [...] }` in package.json. |
| Web board shows "web assets not found" | Forgot `npm run build:web` | Run the build step, then retry `board`. |

---

## Documentation

Detailed reference pages live under [`docs/`](./docs/):

- [`docs/en/cli-reference.md`](./docs/en/cli-reference.md) / [`docs/ch/cli-reference.md`](./docs/ch/cli-reference.md) — every command, every flag
- [`docs/en/web-board.md`](./docs/en/web-board.md) / [`docs/ch/web-board.md`](./docs/ch/web-board.md) — web dashboard walkthrough + API
- [`docs/en/remote-sources.md`](./docs/en/remote-sources.md) / [`docs/ch/remote-sources.md`](./docs/ch/remote-sources.md) — source URL grammar + manifest
- [`docs/en/skill-schema.md`](./docs/en/skill-schema.md) / [`docs/ch/skill-schema.md`](./docs/ch/skill-schema.md) — `SkillSchema` field reference
- [`docs/en/layered-override.md`](./docs/en/layered-override.md) / [`docs/ch/layered-override.md`](./docs/ch/layered-override.md) — layer mechanics
- [`docs/en/mcp-protocol.md`](./docs/en/mcp-protocol.md) / [`docs/ch/mcp-protocol.md`](./docs/ch/mcp-protocol.md) — JSON-RPC examples

Release history in [`CHANGELOG.md`](./CHANGELOG.md). Pre-publish verification checklist: [`docs/en/release-testing.md`](./docs/en/release-testing.md) / [`docs/ch/release-testing.md`](./docs/ch/release-testing.md). Recommended release path (tag push → npm publish with provenance + GitHub Release, all automated): [`docs/en/trusted-publishing.md`](./docs/en/trusted-publishing.md) / [`docs/ch/trusted-publishing.md`](./docs/ch/trusted-publishing.md). Fallback if Trusted Publishing is not yet configured: [`docs/en/manual-publishing.md`](./docs/en/manual-publishing.md) / [`docs/ch/manual-publishing.md`](./docs/ch/manual-publishing.md).

---

## Development

```bash
# Clone and set up
git clone https://github.com/BobcGn/skill-central.git
cd skill-central
npm install

# Dev commands
npm run dev:mcp       # MCP server in watch mode
npm run dev:board     # web board dashboard
npm run dev:init      # (re)generate sample skills

# Build
npm run build         # tsc → dist/
npm run build:web     # copy static frontend to dist/web/

# Type-check only
npx tsc --noEmit
```

### Tech Stack

| Component | Choice |
|-----------|--------|
| **Runtime** | Node.js 22+ (ESM) |
| **Language** | TypeScript 5.8 (ES2022, NodeNext) |
| **MCP SDK** | `@modelcontextprotocol/sdk` ^1.9.0 |
| **CLI** | `commander` ^14.0.0 |
| **YAML** | `js-yaml` ^4.1.1 |
| **Web server** | `hono` ^4.12 + `@hono/node-server` ^2.0 |
| **Tarball** | `tar-stream` ^3.2 (npm install support) |
| **Dev Runner** | `tsx` ^4.19.3 |

---

## License

MIT

---

## Use as a Template

You can use this repository as a template to create your own skill repository. Click the "Use this template" button at the top of the repository page to get started.