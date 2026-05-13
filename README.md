<p align="center">
  <a href="#english">English</a> ·
  <a href="#chinese">中文</a>
</p>

---

<a name="english"></a>

# skill-central

**Local MCP Server for Cross-IDE AI Skill Distribution**

skill-central is a local [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that communicates with AI IDEs (Cursor, Windsurf, Claude Code, etc.) via the **Stdio protocol**, enabling **cross-IDE AI skill (prompts/tools) distribution and reuse**.

> A **skill** is a structured prompt or tool definition — organised by topic, managed in layers, matched by tags. You manage your AI's capability boundaries the same way you manage code.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [JSON-RPC API](#json-rpc-api)
- [Skill File Format](#skill-file-format)
- [Tag Composition](#tag-composition)
- [Layered Override](#layered-override)
- [Config Resolution Order](#config-resolution-order)
- [IDE Integration](#ide-integration)
- [Custom Skill Development](#custom-skill-development)
- [Troubleshooting](#troubleshooting)
- [Development Commands](#development-commands)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│               AI IDE (Cursor / Windsurf / etc.)        │
│                        │  Stdio (JSON-RPC)             │
└────────────────────────┼───────────────────────── ─────┘
                         │
┌────────────────────────┼──────────────────────────────┐
│  skill-central         ▼                              │
│  ┌────────────┐  ┌─────────────────┐  ┌───────────┐   │
│  │  Entry     │  │  Protocol       │  │  Core     │   │
│  │  index.ts  │→ │  handler.ts     │→ │  engine   │   │
│  │  mcp.ts    │  │  prompts.ts     │  │  override-│   │
│  │  board.ts  │  │  tools.ts       │  │  tree     │   │
│  │  init.ts   │  │                 │  │  composer │   │
│  └────────────┘  └─────────────────┘  └─────┬─────┘   │
│                                             │         │
│                                      ┌──────▼──────┐  │
│                                      │  Storage    │  │
│                                      │  reader.ts  │  │
│                                      │  parser.ts  │  │
│                                      │  config.ts  │  │
│                                      └─────────────┘  │
└───────────────────────────────────────────────────────┘
```

| Layer | Directory | Responsibility |
|-------|-----------|---------------|
| **Entry** | `src/` | CLI routing (`mcp` / `board` / `init`), server lifecycle |
| **Protocol** | `src/protocol/` | MCP handler registration (ListPrompts, GetPrompt, ListTools, CallTool) |
| **Core** | `src/core/` | Skill engine, layered override tree, context composer |
| **Storage** | `src/storage/` | Config loading, skill file discovery, YAML/JSON parsing |

### Default Skill Layers

| Layer | Priority | Scope |
|-------|----------|-------|
| `01-global` | 10 | Universal context — applies to every interaction |
| `02-workflows` | 20 | Cross-cutting workflows (debugging, review, planning) |
| `03-domains` | 30 | Domain-specific knowledge (infra, security, data) |
| `04-tech-stack` | 40 | Tech-stack specifics — languages and frameworks |

---

## Quick Start

### Prerequisites

- **Node.js** 22+ (`node --version`)
- **npm** 10+ (`npm --version`)

```bash
# 1. Install dependencies
npm install

# 2. Scaffold sample skills & config
npm run dev:init

# 3. Verify everything loaded
npm run dev:board
```

Expected output — 4 layers, 3 active skills:

```
▸ Layers
┌─────────┬─────────────────┬─────────────────────────┬──────────┐
│ (index) │ Name            │ Path                    │ Priority │
├─────────┼─────────────────┼─────────────────────────┼──────────┤
│ 0       │ '01-global'     │ '.skills/01-global'     │ 10       │
│ 1       │ '02-workflows'  │ '.skills/02-workflows'  │ 20       │
│ 2       │ '03-domains'    │ '.skills/03-domains'    │ 30       │
│ 3       │ '04-tech-stack' │ '.skills/04-tech-stack' │ 40       │
└─────────┴─────────────────┴─────────────────────────┴──────────┘

▸ Skills (3 total)
┌─────────┬─────────────────────────┬──────────────────────────────┬──────────┬────────────────────────────────┐
│ (index) │ ID                      │ Name                         │ Type     │ Tags                           │
├─────────┼─────────────────────────┼──────────────────────────────┼──────────┼────────────────────────────────┤
│ 0       │ 'architectural-mindset' │ 'Architectural Mindset'      │ 'prompt' │ 'global'                       │
│ 1       │ 'debugging-expert'      │ 'Debugging Expert'           │ 'prompt' │ 'debug, fix, error'            │
│ 2       │ 'container-infra'       │ 'Container & Infrastructure' │ 'prompt' │ 'docker, nginx, infra, devops' │
└─────────┴─────────────────────────┴──────────────────────────────┴──────────┴────────────────────────────────┘
```

### Start the MCP Server

```bash
npm run dev:mcp
```

The server listens on **stdin** for JSON-RPC messages and writes responses to **stdout**. All diagnostic output goes to **stderr** so the protocol channel stays clean.

### Generated File Structure

After `npm run dev:init`:

```
.skills/
├── 01-global/
│   └── architectural-mindset.yaml    (priority: 10, tags: [global])
├── 02-workflows/
│   └── debugging-expert.yaml          (priority: 20, tags: [debug, fix, error])
├── 03-domains/
│   └── container-infra.yaml           (priority: 30, tags: [docker, nginx, infra, devops])
└── 04-tech-stack/
    ├── languages/
    ├── frameworks/
    └── _template.yaml                 (reference — not loaded by engine)
skill-central.yaml                     (layer configuration)
```

---

## Manual Testing

Test the MCP server directly in your terminal:

```bash
# List all prompt skills
echo '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' | npx tsx src/index.ts mcp

# Get a single skill
echo '{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"architectural-mindset"}}' \
  | npx tsx src/index.ts mcp

# Compose skills by tag (comma-separated string)
echo '{"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"debug,infra"}}}' \
  | npx tsx src/index.ts mcp
```

For formatted output:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,debug,docker"}}}' \
  | npx tsx src/index.ts mcp 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['messages'][0]['content']['text'])"
```

You can also use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for a visual interface:

```bash
npx @modelcontextprotocol/inspector npx tsx /absolute/path/to/src/index.ts mcp
```

---

## CLI Commands

```bash
npx tsx src/index.ts <command>
```

| Command | Description |
|---------|-------------|
| `mcp` | Start the Stdio MCP Server (silent mode, output on stderr only). For IDE integration. |
| `board` | Developer dashboard — print all loaded layers and skills as tables. |
| `init` | Scaffold `.skills/` directory with sample definitions and layer config. |

npm shortcuts:

```bash
npm run dev:mcp       # tsx watch src/index.ts mcp
npm run dev:board     # tsx src/index.ts board
npm run dev:init      # tsx src/index.ts init
npm run start         # node dist/index.js mcp (build first)
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

**Tag-based composition** (combine multiple skills, low→high priority):
```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,debug,docker"}}}
```

> `tags` is a comma-separated string. The MCP spec constrains arguments to `Record<string, string>`, so JSON arrays are not supported.

### `tools/list` / `tools/call`

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my-tool","arguments":{...}}}
```

---

## Skill File Format

Skills can be defined in **YAML** (recommended) or **JSON**.

```yaml
# .skills/04-tech-stack/languages/typescript.yaml
---
id: typescript-conventions
name: TypeScript Conventions
description: TypeScript coding standards for the project
type: prompt
tags:
  - typescript
  - lang-ts
prompt: |
  You are an expert TypeScript developer. Follow these conventions:

  ## Code Style
  - Use strict mode — always enable `strict: true` in tsconfig.
  - Prefer interfaces over type aliases for object shapes.
  - Use explicit return types on public functions.
  - Name files with kebab-case.

  ## Error Handling
  - Use Result/Option patterns instead of throwing exceptions for
    expected failure cases.
  - Never use `any` — use `unknown` and narrow with type guards.
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Globally unique identifier. Used as prompt `name`. |
| `name` | string | ✓ | Human-readable label. |
| `description` | string | ✓ | One-line description. |
| `type` | `"prompt"` / `"tool"` | ✓ | Skill type. |
| `tags` | string[] | | Categorisation tags for composition. |
| `prompt` | string | for prompt | Markdown instructions sent to the AI. |
| `inputSchema` | object | for tool | JSON Schema input definition. |
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
      "args": ["tsx", "/absolute/path/to/skill-central/src/index.ts", "mcp"]
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
      "args": ["tsx", "/absolute/path/to/skill-central/src/index.ts", "mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add skill-central -- npx tsx /absolute/path/to/skill-central/src/index.ts mcp
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
npm run dev:board    # confirm the new skill appears
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
| Server starts but no response | stdout pollution | Check for `console.log` in dependency code. All output must go to stderr. |
| IDE can't connect | Wrong path in MCP config | Use **absolute** paths for the `args` in `mcp.json`/`mcp_config.json`. |
| Skills not loading | YAML syntax error | Run `npm run dev:board` to see load status. Check `id` and `type` fields exist. |
| Tag composition returns empty | Tags missing or mismatched | Verify skill YAML has `tags:`. Use `board` to confirm. Pass comma-separated: `"tags":"kmp,android"`. |

---

## Development Commands

```bash
npm run dev:mcp       # MCP server in watch mode
npm run dev:board     # dashboard view
npm run dev:init      # (re)generate sample skills
npm run build         # tsc compile → dist/
npm run start         # run compiled dist/index.js mcp
npx tsc --noEmit      # type-check only
```

---

## Tech Stack

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

---

<a name="chinese"></a>

# skill-central

**跨 IDE 的 AI 技能分发中心 · 本地 MCP 服务器**

skill-central 是一个本地 MCP (Model Context Protocol) 服务器，通过 Stdio 协议与各类 AI IDE（Cursor、Windsurf、Claude Code 等）通信，实现**跨 IDE 的 AI 技能（Prompt/Tools）分发与复用**。

> **技能（Skill）** 是一段结构化的提示词或工具定义，按主题组织、按层级管理、按标签匹配。你可以像管理代码一样管理 AI 的能力边界。

---

## 目录

- [架构](#架构)
- [快速开始](#快速开始)
- [CLI 命令](#cli-命令)
- [JSON-RPC 接口](#json-rpc-接口)
- [技能文件格式](#技能文件格式)
- [标签组合](#标签组合)
- [层级覆写](#层级覆写)
- [配置加载顺序](#配置加载顺序)
- [IDE 集成](#ide-集成)
- [自定义技能开发](#自定义技能开发)
- [故障排查](#故障排查)
- [开发命令](#开发命令)
- [技术栈](#技术栈)
- [许可](#许可)

---

## 架构

```
┌────────────────────────────────────────────────────────┐
│               AI IDE (Cursor / Windsurf / 等)           │
│                        │  Stdio (JSON-RPC)              │
└────────────────────────┼──────────────────────────────┘
                         │
┌────────────────────────┼──────────────────────────────┐
│  skill-central         ▼                               │
│  ┌────────────┐  ┌─────────────────┐  ┌───────────┐   │
│  │  Entry     │  │  Protocol       │  │  Core     │   │
│  │  index.ts  │→│  handler.ts     │→│  engine   │   │
│  │  mcp.ts    │  │  prompts.ts     │  │  override-│   │
│  │  board.ts  │  │  tools.ts       │  │  tree     │   │
│  │  init.ts   │  │                 │  │  composer │   │
│  └────────────┘  └─────────────────┘  └─────┬─────┘   │
│                                              │         │
│                                       ┌──────▼──────┐  │
│                                       │  Storage    │  │
│                                       │  reader.ts  │  │
│                                       │  parser.ts  │  │
│                                       │  config.ts  │  │
│                                       └─────────────┘  │
└────────────────────────────────────────────────────────┘
```

| 层级 | 目录 | 职责 |
|------|------|------|
| **入口层** | `src/` | CLI 路由 (`mcp` / `board` / `init`)，服务生命周期 |
| **协议层** | `src/protocol/` | MCP Handler 注册 (ListPrompts, GetPrompt, ListTools, CallTool) |
| **核心层** | `src/core/` | 技能引擎、分层覆写树、上下文合成器 |
| **存储层** | `src/storage/` | 配置加载、技能文件发现、YAML/JSON 解析 |

### 默认技能层级

| 层 | 优先级 | 作用域 |
|----|--------|--------|
| `01-global` | 10 | 全局上下文 — 适用于所有交互 |
| `02-workflows` | 20 | 跨领域工作流（排错、审查、规划） |
| `03-domains` | 30 | 领域知识（基础设施、安全、数据） |
| `04-tech-stack` | 40 | 技术栈专项 — 语言和框架 |

---

## 快速开始

### 环境要求

- **Node.js** 22+ (`node --version`)
- **npm** 10+ (`npm --version`)

```bash
# 1. 安装依赖
npm install

# 2. 生成示例技能与配置
npm run dev:init

# 3. 验证加载
npm run dev:board
```

预期输出 — 4 层配置、3 个活跃技能。

### 启动 MCP Server

```bash
npm run dev:mcp
```

服务器通过 **stdin** 监听 JSON-RPC 消息，将响应写入 **stdout**。所有诊断日志走 **stderr**，保障协议通道纯净。

### 初始化后的文件结构

```
.skills/
├── 01-global/
│   └── architectural-mindset.yaml    (priority: 10, tags: [global])
├── 02-workflows/
│   └── debugging-expert.yaml          (priority: 20, tags: [debug, fix, error])
├── 03-domains/
│   └── container-infra.yaml           (priority: 30, tags: [docker, nginx, infra, devops])
└── 04-tech-stack/
    ├── languages/
    ├── frameworks/
    └── _template.yaml                 (参考模板 — 不会被引擎加载)
skill-central.yaml                     (层级配置文件)
```

---

## CLI 命令

```bash
npx tsx src/index.ts <command>
```

| 命令 | 说明 |
|------|------|
| `mcp` | 启动 Stdio MCP Server（静默模式，日志仅输出到 stderr）。供 IDE 调用。 |
| `board` | 终端看板 — 以表格形式打印所有已加载的层和技能。 |
| `init` | 生成 `.skills/` 示例目录和层级配置。 |

npm 快捷方式：

```bash
npm run dev:mcp       # tsx watch src/index.ts mcp
npm run dev:board     # tsx src/index.ts board
npm run dev:init      # tsx src/index.ts init
npm run start         # node dist/index.js mcp（需先 build）
```

---

## JSON-RPC 接口

### `prompts/list` — 列出所有 Prompt 技能

```json
{"jsonrpc":"2.0","id":1,"method":"prompts/list"}
```

### `prompts/get` — 获取单个技能

```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"container-infra"}}
```

### `prompts/get` (skills:compose) — 标签组合

```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,debug,docker"}}}
```

> `tags` 为逗号分隔的字符串。MCP 规范约束 arguments 类型为 `Record<string, string>`，不支持 JSON 数组。

---

## 技能文件格式

技能支持 **YAML**（推荐）和 **JSON** 两种格式。

```yaml
---
id: typescript-conventions
name: TypeScript Conventions
description: TypeScript 编码规范
type: prompt
tags:
  - typescript
prompt: |
  你是 TypeScript 专家，请遵守以下规范：
  - 开启 strict 模式
  - 优先使用 interface 而非 type alias
  - 公共函数必须标注显式返回类型
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 全局唯一标识符，用于 prompt name 参数 |
| `name` | string | ✓ | 人类可读名称 |
| `description` | string | ✓ | 简短描述 |
| `type` | "prompt"/"tool" | ✓ | 技能类型 |
| `tags` | string[] | | 分类标签，用于技能组合 |
| `prompt` | string | prompt 必填 | 发送给 AI 的 Markdown 指令 |
| `inputSchema` | object | tool 必填 | JSON Schema 输入定义 |
| `arguments` | object[] | | 声明的参数（供 IDE UI 参考） |
| `version` | string | | 版本号 |

参考 `.skills/04-tech-stack/_template.yaml` 获取带完整注释的模板。

---

## 标签组合

当 IDE 通过 `skills:compose` 请求时，引擎执行：

1. **匹配** — 找出所有与请求标签重叠的技能
2. **排序** — 按层优先级升序排列（低→高）
3. **拼接** — 用 `---` 分隔符合并每个技能的 prompt 内容

示例 `tags: "debug,docker"`：

```
[docker, nginx, infra, devops]  ← container-infra (priority 30)
                                   通过 "docker" 匹配
[debug, fix, error]              ← debugging-expert (priority 20)
                                   通过 "debug" 匹配
```

结果：排错指导在前，基础设施标准在后——按优先级从低到高逐层叠加。

---

## 层级覆写

当多层定义了**相同的 `id`**，高优先级胜出：

```yaml
layers:
  - name: "01-global"      # priority: 10 — 可被覆盖的基础层
  - name: "04-tech-stack"  # priority: 40 — 团队约定
  - name: "user-override"  # priority: 100 — 个人偏好，优先级最高
```

团队共享技能库的同时，允许个人叠加自定义覆盖——无需复制文件。

---

## 配置加载顺序

```
1. ~/.skill-central/config.yaml       ← 机器级默认
2. <project>/skill-central.yaml       ← 项目级（覆盖同名 layer 的 path/priority）
3. 内置默认                           ← { name: "project", path: ".skills", priority: 100 }
```

---

## IDE 集成

### Cursor — `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/src/index.ts", "mcp"]
    }
  }
}
```

### Windsurf — `.windsurf/mcp_config.json`

同上格式。

### Claude Code

```bash
claude mcp add skill-central -- npx tsx /absolute/path/to/src/index.ts mcp
```

---

## 自定义技能开发

### 第一步 — 创建技能文件

```bash
mkdir -p .skills/04-tech-stack/languages
```

`.skills/04-tech-stack/languages/typescript.yaml`：

```yaml
id: typescript-conventions
name: TypeScript Conventions
description: TypeScript 编码规范
type: prompt
tags:
  - typescript
prompt: |
  你是 TypeScript 专家。请严格遵守以下规范...
```

### 第二步 — 验证

```bash
npm run dev:board    # 确认新技能出现
```

### 第三步 — 使用

```bash
# 直接获取
{"method":"prompts/get","params":{"name":"typescript-conventions"}}
# 或标签组合
{"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"typescript"}}}
```

参考 `.skills/04-tech-stack/_template.yaml` 获取完整的注释模板。

---

## 故障排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| Server 启动但无响应 | stdout 被污染 | 检查第三方库的 console.log。MCP 模式已重定向，但仍有遗漏。 |
| IDE 无法连接 | MCP 配置路径错误 | mcp.json 中的 args 必须使用**绝对路径** |
| 技能未加载 | YAML 语法错误 | 运行 `board` 查看加载状态。确认 id 和 type 字段存在。 |
| 标签组合无返回 | 标签缺失或不匹配 | 确认技能 YAML 中有 tags 字段，board 中可见。传参使用逗号字符串。 |

---

## 开发命令

```bash
npm run dev:mcp       # MCP Server（watch 模式）
npm run dev:board     # 技能看板
npm run dev:init      # （重新）生成示例技能
npm run build         # tsc 编译 → dist/
npm run start         # 运行编译后的 dist/index.js mcp
npx tsc --noEmit      # 仅类型检查
```

---

## 技术栈

| 组件 | 选型 |
|------|------|
| **运行时** | Node.js 22+ (ESM) |
| **语言** | TypeScript 5.8 (ES2022, NodeNext) |
| **MCP SDK** | `@modelcontextprotocol/sdk` ^1.9.0 |
| **CLI** | `commander` ^14.0.0 |
| **YAML** | `js-yaml` ^4.1.1 |
| **开发运行器** | `tsx` ^4.19.3 |

---

## 许可

MIT
