# skill-central

**Local MCP Server for Cross-IDE AI Skill Distribution**

skill-central 是一个本地 MCP (Model Context Protocol) 服务器，通过 Stdio 协议与各类 AI IDE（如 Cursor、Windsurf、Claude Code）通信，实现**跨 IDE 的 AI 技能（Prompt/Tools）分发与复用**。

> **Skill（技能）** 是一段结构化的提示词或工具定义，按主题组织、按层级管理、按标签匹配。  
> 你可以像管理代码一样管理 AI 的能力边界。

---

## 架构总览 / Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI IDE (Cursor / Windsurf / ...)      │
│                         │  Stdio (JSON-RPC)              │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│  skill-central          ▼                                │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────┐  │
│  │  Entry       │  │  Protocol        │  │  Core       │  │
│  │  index.ts   │→│  handler.ts      │→│  engine.ts  │  │
│  │  mcp.ts     │  │  prompts.ts      │  │  override-  │  │
│  │  board.ts   │  │  tools.ts        │  │  tree.ts    │  │
│  │  init.ts     │  │                  │  │  composer   │  │
│  └─────────────┘  └──────────────────┘  └──────┬─────┘  │
│                                                 │        │
│                                          ┌──────▼─────┐  │
│                                          │  Storage    │  │
│                                          │  reader.ts  │  │
│                                          │  parser.ts  │  │
│                                          │  config.ts  │  │
│                                          └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

| Layer | Directory | Responsibility |
|-------|-----------|---------------|
| **Entry** | `src/` | CLI routing (mcp / board / init), server lifecycle |
| **Protocol** | `src/protocol/` | MCP handler registration (ListPrompts, GetPrompt, ListTools, CallTool) |
| **Core** | `src/core/` | Skill engine, layered override tree, context composer |
| **Storage** | `src/storage/` | Config loading, skill file discovery, YAML/JSON parsing |

---

## 快速开始 / Quick Start

### 安装 / Install

```bash
npm install
```

### 初始化 / Initialize

创建示例技能定义与层级配置：

```bash
npm run dev:init
# 或
npx tsx src/index.ts init
```

这将生成：

```
.skills/
├── global/architecture-mindset.yaml        # 全局架构思维 (priority 10)
├── languages/android-foundation.yaml       # Android 基础 (priority 20)
└── frameworks/compose-multiplatform.yaml   # KMP 规范 (priority 30)
skill-central.yaml                          # 层级配置文件
```

### 启动 MCP Server / Start MCP Server

```bash
npm run dev:mcp
# 或
npx tsx src/index.ts mcp
```

服务器通过 **stdin/stdout** 接收和发送 JSON-RPC 消息。IDE 可以通过 Stdio 协议直接连接。

### 查看技能看板 / View Skill Board

```bash
npm run dev:board
# 或
npx tsx src/index.ts board
```

---

## CLI 命令 / Commands

| Command | Description |
|---------|-------------|
| `skill-central mcp` | 启动 Stdio MCP Server（静默模式，供 IDE 调用） |
| `skill-central board` | 终端看板，显示已加载的技能与层级关系 |
| `skill-central init` | 生成 `.skills/` 示例目录与配置文件 |

---

## 技能文件格式 / Skill File Format

技能可以通过 **YAML** 或 **JSON** 定义。以下是一个完整的 YAML 示例：

```yaml
# .skills/my-skill.yaml
id: my-skill
name: My Custom Skill
description: A skill that does something useful
type: prompt            # 或 "tool"
tags:
  - domain
  - specific-tag
prompt: |
  你是一个特定领域的专家。请按照以下规范行事：
  - 规则一
  - 规则二
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | 全局唯一标识符 |
| `name` | string | ✓ | 人类可读名称 |
| `description` | string | ✓ | 简短描述 |
| `type` | "prompt" \| "tool" | ✓ | 技能类型 |
| `tags` | string[] | | 标签，用于多技能组合 |
| `prompt` | string | for prompt | 提示词模板 |
| `inputSchema` | object | for tool | JSON Schema 输入定义 |
| `version` | string | | 版本号 |
| `arguments` | object[] | | 接受的参数列表 |

---

## 标签组合 / Tag Composition

skill-central 支持通过标签将多个技能合并为一个组合提示词：

```bash
# IDE 通过 MCP 请求（即通过 Stdio 协议直接发往 MCP Server）：
# Request
{"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"android,kmp"}}}

# Response — 按优先级合并：android-foundation → compose-multiplatform
{"result":{"description":"Composed from tags: android, kmp (2 skills)","messages":[...]}}
```

**合并策略**：按层优先级升序拼接（低优先级在前 → 高优先级在后），形成"基础→进阶"的叠加效果。

---

## 层级覆写 / Layered Override

当多个层定义了相同 `id` 的技能时，**高优先级的版本胜出**：

```yaml
# skill-central.yaml
layers:
  - name: "global"        # priority: 10 — 全局默认，被后续层覆盖
  - name: "project"       # priority: 50 — 项目定制，覆盖全局
  - name: "user"          # priority: 100 — 用户自定义，优先级最高
```

这允许团队成员复用共享技能库的同时，在本地叠加个性化修改——无需复制整个文件。

---

## 配置加载顺序 / Config Resolution Order

1. `~/.skill-central/config.yaml` — 用户全局配置
2. `<project>/skill-central.yaml` — 项目本地配置（合并覆盖）
3. 内置默认：`{ name: "project", path: ".skills", priority: 100 }`

---

## IDE 集成 / IDE Integration

### Cursor

在 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "npx",
      "args": ["tsx", "/path/to/skill-central/src/index.ts", "mcp"]
    }
  }
}
```

### Windsurf

在 `.windsurf/mcp_config.json` 中添加：

```json
{
  "mcpServers": {
    "skill-central": {
      "command": "npx",
      "args": ["tsx", "/path/to/skill-central/src/index.ts", "mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add skill-central -- npx tsx /path/to/skill-central/src/index.ts mcp
```

---

## 开发 / Development

```bash
npm run dev:mcp      # 启动 MCP Server（watch 模式）
npm run dev:board    # 查看技能看板
npm run dev:init     # 初始化示例技能
npm run build        # TypeScript 编译
```

---

## 技术栈 / Tech Stack

- **Runtime**: Node.js 22+ (ESM)
- **Language**: TypeScript (ES2022, NodeNext)
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.9.0
- **CLI**: `commander` ^14.0.0
- **YAML**: `js-yaml` ^4.1.0

---

## 许可 / License

MIT
