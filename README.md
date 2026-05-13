# skill-central

**Local MCP Server for Cross-IDE AI Skill Distribution**

[中英双语 | Bilingual]

skill-central 是一个本地 MCP (Model Context Protocol) 服务器，通过 Stdio 协议与各类 AI IDE（如 Cursor、Windsurf、Claude Code）通信，实现**跨 IDE 的 AI 技能（Prompt/Tools）分发与复用**。

> **Skill（技能）** 是一段结构化的提示词或工具定义，按主题组织、按层级管理、按标签匹配。你可以像管理代码一样管理 AI 的能力边界。

---

## 目录 / Table of Contents

- [环境要求 / Prerequisites](#环境要求--prerequisites)
- [快速安装 / Quick Install](#快速安装--quick-install)
- [本地测试指南 / Local Testing Guide](#本地测试指南--local-testing-guide)
- [CLI 命令参考 / CLI Command Reference](#cli-命令参考--cli-command-reference)
- [JSON-RPC 接口 / JSON-RPC API](#json-rpc-接口--json-rpc-api)
- [技能文件格式 / Skill File Format](#技能文件格式--skill-file-format)
- [标签组合 / Tag Composition](#标签组合--tag-composition)
- [层级覆写 / Layered Override](#层级覆写--layered-override)
- [配置加载顺序 / Config Resolution Order](#配置加载顺序--config-resolution-order)
- [IDE 集成 / IDE Integration](#ide-集成--ide-integration)
- [自定义技能开发 / Custom Skill Development](#自定义技能开发--custom-skill-development)
- [故障排查 / Troubleshooting](#故障排查--troubleshooting)
- [开发命令 / Development Commands](#开发命令--development-commands)
- [技术栈 / Tech Stack](#技术栈--tech-stack)
- [许可 / License](#许可--license)

---

## 环境要求 / Prerequisites

| Requirement | Minimum Version | 检查命令 / Check Command |
|-------------|----------------|-------------------------|
| **Node.js** | 22.x | `node --version` |
| **npm** | 10.x | `npm --version` |

> 建议使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node.js 版本：
> ```bash
> nvm install 22
> nvm use 22
> ```

---

## 快速安装 / Quick Install

### 1. 克隆并安装依赖

```bash
# 如果尚未克隆
git clone https://github.com/BobcGn/skill-central.git
cd skill-central

# 安装所有依赖
npm install
```

### 2. 初始化示例技能

```bash
npm run dev:init
```

成功后输出：

```
[skill-central] Project initialized successfully.
  ├─ .skills/              — skill definitions (3 files)
  └─ skill-central.yaml    — layer config
```

生成的文件结构：

```
skill-central/
├── .skills/
│   ├── global/
│   │   └── architecture-mindset.yaml      # 全局架构思维 (priority 10)
│   ├── languages/
│   │   └── android-foundation.yaml        # Android 基础 (priority 20)
│   └── frameworks/
│       └── compose-multiplatform.yaml     # KMP 跨平台规范 (priority 30)
├── skill-central.yaml                     # 层级配置文件
├── src/                                   # 源码
├── package.json
└── tsconfig.json
```

### 3. 验证安装

```bash
# 查看技能看板 — 确认 3 个技能已正确加载
npm run dev:board
```

预期输出应包含 3 层配置和 3 个技能，各自带有正确的标签（global / android / kmp,compose）。

---

## 本地测试指南 / Local Testing Guide

### 测试方式一：直接发送 JSON-RPC 消息（最快速）

MCP Server 使用 **stdin/stdout** 进行通信。你可以通过管道向标准输入发送 JSON-RPC 请求，从标准输出读取响应。

#### 第一步：终端窗口 A — 启动 MCP Server

```bash
npm run dev:mcp
```

服务器会在后台静默运行，不会向 stdout 输出任何内容（所有日志走 stderr）。

```
# stderr 中可以看到（需要在终端中查看）：
[skill-central] MCP server ready on stdio
```

> Server 会一直运行等待 stdin 上的 JSON-RPC 消息。按 `Ctrl+C` 停止。

---

#### 第二步：终端窗口 B — 发送测试请求

**列出所有 Prompt 技能：**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' | nc localhost 0 2>/dev/null
# 但 MCP Server 通过 stdio 通信，nc 不适用。
# 正确做法：使用 echo 管道直接发送到 MCP 进程。
```

由于 MCP Server 读取 stdin，你需要将消息写到同一个进程的 stdin。最简单的方法是在**启动时通过管道**注入：

```bash
# 单次请求测试（启动 → 发送 → 响应 → 退出）
echo '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' | npx tsx src/index.ts mcp
```

预期响应：

```json
{"result":{"prompts":[
  {"name":"architecture-mindset","description":"全局架构思维要求 — 优先考虑可靠性与高层设计"},
  {"name":"android-foundation","description":"Android 原生开发知识体系"},
  {"name":"compose-multiplatform","description":"KMP 跨平台 UI 构建规范 — 高优先级覆盖 android-foundation"}
]},"jsonrpc":"2.0","id":1}
```

**获取单个 Prompt 技能：**

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"android-foundation"}}' | npx tsx src/index.ts mcp
```

**通过标签组合技能：**

```bash
echo '{"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,android,kmp"}}}' | npx tsx src/index.ts mcp
```

响应中的 `messages[0].content.text` 会包含三个技能的合并内容，按优先级（global → android → kmp）拼接。

**列出所有 Tool 技能：**

```bash
echo '{"jsonrpc":"2.0","id":4,"method":"tools/list"}' | npx tsx src/index.ts mcp
```

---

#### 第三步：多轮测试（连续请求）

可以用 `printf` 发送多个请求到同一个 MCP 进程：

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}\n{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"android-foundation"}}\n' | npx tsx src/index.ts mcp
```

每个 JSON-RPC 消息必须由换行符 `\n` 分隔。服务器会依次响应。

---

#### 第四步：格式化查看组合结果

组合技能的返回内容较长，可以用管道配合工具提取纯文本：

```bash
echo '{"jsonrpc":"2.0","id":5,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"kmp,android"}}}' | npx tsx src/index.ts mcp 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
text = d['result']['messages'][0]['content']['text']
print(text)
"
```

---

### 测试方式二：使用 MCP Inspector（可视化调试）

MCP 官方提供了 Inspector 调试工具，可以图形化地查看所有 Prompt 和 Tool。

```bash
# 全局安装 MCP Inspector
npx @modelcontextprotocol/inspector npx tsx /absolute/path/to/skill-central/src/index.ts mcp
```

浏览器打开 Inspector 地址（通常是 `http://localhost:5173`），即可在界面上：

1. 查看 `List Prompts` 的结果
2. 选择某个 Prompt 并填写参数，点击 `Get Prompt` 查看响应
3. 测试 `List Tools` 和 `Call Tool`

---

### 测试方式三：在 Claude Code 中集成测试

```bash
# 将 skill-central 注册为 Claude Code 的 MCP Server
claude mcp add skill-central -- npx tsx /absolute/path/to/skill-central/src/index.ts mcp

# 启动 Claude Code
claude

# 在聊天中输入：
# "列出所有可用的 prompt 技能"
# "帮我组合 kmp 和 android 相关的技能"
```

---

## CLI 命令参考 / CLI Command Reference

```bash
npx tsx src/index.ts <command>
```

| Command | 用途 | 说明 |
|---------|------|------|
| `mcp` | 启动 Stdio MCP Server | **生产模式**。静默启动，所有 `console.log` 被重定向到 stderr，stdout 仅用于 JSON-RPC。供 Cursor/Windsurf/Claude Code 等 IDE 调用。 |
| `board` | 终端看板 | **开发模式**。显示当前已加载的所有技能层、优先级、以及每个技能的 ID/名称/类型/标签。验证配置是否正确加载的最佳方式。 |
| `init` | 初始化脚手架 | 生成 `.skills/` 示例目录、3 个示范技能文件、以及 `skill-central.yaml` 层级配置文件。 |

**快捷命令（通过 npm run）：**

```bash
npm run dev:mcp       # 等同 npx tsx src/index.ts mcp（watch 模式）
npm run dev:board     # 等同 npx tsx src/index.ts board
npm run dev:init      # 等同 npx tsx src/index.ts init
npm run start         # 等同 node dist/index.js mcp（需先 build）
```

---

## JSON-RPC 接口 / JSON-RPC API

skill-central 实现了以下 MCP 标准方法：

### `prompts/list`

列出所有类型为 `prompt` 的技能。

**请求：**
```json
{"jsonrpc":"2.0","id":1,"method":"prompts/list"}
```

**响应：**
```json
{"result":{"prompts":[
  {"name":"architecture-mindset","description":"...","arguments":[]}
]}}
```

---

### `prompts/get`

获取单个 Prompt 技能的内容，或通过标签组合多个技能。

**获取单个技能：**
```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"android-foundation"}}
```

**通过标签组合（特殊名称 `skills:compose`）：**
```json
{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,android,kmp"}}}
```

> `tags` 参数为逗号分隔的字符串。注意：MCP GetPrompt 的 arguments 约束为 `Record<string, string>`，因此不支持 JSON 数组格式。

**响应（单个技能）：**
```json
{"result":{"description":"Android 原生开发知识体系","messages":[{"role":"user","content":{"type":"text","text":"..."}}]}}
```

**响应（标签组合）：**
```json
{"result":{"description":"Composed prompt from tags: global, android, kmp (3 skills)","messages":[{"role":"user","content":{"type":"text","text":"## ...\n\n---\n\n## ..."}}]}}
```

组合结果按优先级升序拼接（global → android-foundation → compose-multiplatform），用 `\n\n---\n\n` 分隔。

---

### `tools/list`

列出所有类型为 `tool` 的技能。

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

---

### `tools/call`

调用一个 Tool 技能（当前为骨架实现，返回 JSON 化参数）。

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my-tool","arguments":{"key":"value"}}}
```

---

## 技能文件格式 / Skill File Format

技能支持 **YAML**（推荐）和 **JSON** 两种格式。

### 完整 YAML 示例

```yaml
# .skills/my-category/my-skill.yaml
---
id: code-reviewer
name: Code Reviewer
description: 代码审查专家 — 关注安全性、性能和可维护性
type: prompt                    # "prompt" 或 "tool"
tags:
  - review
  - security
  - performance
prompt: |
  你是一位资深的代码审查专家。请从以下几个方面进行审查：

  1. **安全性**：检查是否存在 SQL 注入、XSS、敏感信息泄露等风险。
  2. **性能**：识别可能导致性能瓶颈的模式。
  3. **可维护性**：评估代码的可读性、测试覆盖率和模块化程度。
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 全局唯一标识符。用于 prompt/get 中的 name 参数。 |
| `name` | string | ✓ | 人类可读的名称，显示在看板和 IDE 中。 |
| `description` | string | ✓ | 简短描述技能的作用。 |
| `type` | "prompt" \| "tool" | ✓ | prompt：返回格式化提示词；tool：暴露可调用的工具。 |
| `tags` | string[] | | 标签，支持按标签组合多个技能。 |
| `prompt` | string | for prompt | Markdown 格式的提示词模板。 |
| `inputSchema` | object | for tool | JSON Schema 格式的输入参数定义。 |
| `arguments` | object[] | | 声明 prompt 接受的参数（名称、描述、是否必填）。 |
| `version` | string | | 技能版本号，用于追踪变更。 |

### JSON 格式等价示例

```json
{
  "id": "code-reviewer",
  "name": "Code Reviewer",
  "description": "代码审查专家",
  "type": "prompt",
  "tags": ["review", "security"],
  "prompt": "你是一位资深的代码审查专家..."
}
```

---

## 标签组合 / Tag Composition

当 IDE 调用 `skills:compose` 时，skill-central 会按以下步骤组合技能：

1. **匹配**：找出所有带有请求标签的技能
2. **排序**：按所在层的优先级**升序**排列（低→高）
3. **拼接**：用 `---` 分隔符按顺序合并每个技能的 prompt 内容

**示例流程：**

```
请求 tags: "kmp"
↓
匹配的技能：
  1. compose-multiplatform (priority 30, tag: kmp)
↓
组合结果：
  ## Compose Multiplatform (compose-multiplatform)
  你是 Kotlin Multiplatform 专家...
```

```
请求 tags: "android,kmp"
↓
匹配的技能（按优先级排序）：
  1. android-foundation (priority 20, tag: android)
  2. compose-multiplatform (priority 30, tags: kmp, compose)
↓
组合结果：
  ## Android 原生基础 (android-foundation)
  ...
  ---
  ## Compose Multiplatform 规范 (compose-multiplatform)
  ...
```

---

## 层级覆写 / Layered Override

当多个技能目录定义了**相同的 `id`** 时，优先级最高的版本胜出：

```yaml
# skill-central.yaml
layers:
  - name: "community"    # priority: 10  — 社区共享，基础默认
  - name: "project"      # priority: 50  — 团队项目定制
  - name: "user"         # priority: 100 — 个人自定义，最高优先级
```

这允许团队复用共享技能库，同时允许个人在本地叠加个性化修改——无需复制整个文件。

---

## 配置加载顺序 / Config Resolution Order

skill-central 的配置从三层源合并：

```
1. ~/.skill-central/config.yaml        ← 用户全局配置（适用所有项目）
2. <project>/skill-central.yaml        ← 项目本地配置（覆盖全局同名层）
3. 内置默认值                           ← fallback：{ name: "project", path: ".skills", priority: 100 }
```

同名 layer 以高层为准（优先级数值和路径均可覆盖）。

---

## IDE 集成 / IDE Integration

将 skill-central 配置为 IDE 的 MCP Server，使 AI 可以自动加载你的技能定义。

### Cursor

编辑 `.cursor/mcp.json`（如文件不存在则新建）：

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

在 Cursor 中重启 MCP 连接后，AI 即可调用所有已注册的技能。

### Windsurf

编辑 `.windsurf/mcp_config.json`：

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

### VS Code (via Claude Code extension)

通过 Claude Code 扩展的内置 MCP Server 注册功能添加。

---

## 自定义技能开发 / Custom Skill Development

### 第一步：创建技能文件

在 `.skills/` 下创建新的子目录和 YAML 文件：

```bash
mkdir -p .skills/my-team
```

创建 `.skills/my-team/react-best-practices.yaml`：

```yaml
id: react-best-practices
name: React 最佳实践
description: React 组件开发规范 — 关注性能与可维护性
type: prompt
tags:
  - react
  - frontend
prompt: |
  你是一位资深 React 工程师。在编写 React 代码时请严格遵守以下规范：

  1. **组件设计**：优先使用函数组件 + Hooks，避免类组件。
  2. **状态管理**：合理使用 useState / useReducer，避免过度提升状态。
  3. **性能优化**：使用 React.memo、useMemo、useCallback 减少不必要的重渲染。
  4. **测试**：每个组件必须有对应的单元测试（React Testing Library）。
```

### 第二步：更新层级配置

在 `skill-central.yaml` 中添加新层：

```yaml
layers:
  - name: "global"
    path: ".skills/global"
    priority: 10
  - name: "languages"
    path: ".skills/languages"
    priority: 20
  - name: "frameworks"
    path: ".skills/frameworks"
    priority: 30
  - name: "my-team"               # 新增
    path: ".skills/my-team"       # 指向新目录
    priority: 40                  # 优先级高于 frameworks
```

### 第三步：验证

```bash
npm run dev:board
```

确认新技能已出现在看板中。

### 第四步：在 IDE 中使用

通过标签组合调用：

```json
{"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"react,frontend"}}}
```

或单独获取：

```json
{"method":"prompts/get","params":{"name":"react-best-practices"}}
```

---

## 故障排查 / Troubleshooting

### 1. Server 启动后无响应

**可能的原因：** stdout 被污染，破坏了 JSON-RPC 协议。

**检查方法：**
```bash
# 在 stderr 中是否有错误日志
echo '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' | npx tsx src/index.ts mcp 2>&1
# 留意 stderr 的输出，剔除后再看 stdout
```

**解决方案：** MCP 模式下 `console.log` 已被重定向到 stderr。如果还有污染，检查是否有第三方库在初始化时向 stdout 写入了内容。

### 2. IDE 无法连接

- 确认 `mcp.json` / `mcp_config.json` 中的命令路径是**绝对路径**。
- 检查 IDE 的 MCP 日志输出（Cursor: Settings → Features → MCP）。
- 确认 `skill-central.yaml` 中的 layer `path` 是相对于项目根目录的路径。

### 3. 技能没有加载

- 运行 `npm run dev:board` 查看加载状态。
- 检查 YAML 文件语法是否正确（确保 `id` 和 `type` 字段存在）。
- 检查 `skill-central.yaml` 中 layer 的 `path` 是否正确指向技能目录。

### 4. 标签组合没有任何返回

- 确认技能 YAML 文件中有 `tags` 字段。
- 运行 `npm run dev:board` 查看技能的 Tags 列。
- 传参时使用逗号分隔字符串：`"tags":"kmp,android"` 而不是 `"tags":["kmp","android"]`。

---

## 开发命令 / Development Commands

```bash
# ── 开发模式 ──
npm run dev:mcp         # 启动 MCP Server（tsx watch，文件变更自动重启）
npm run dev:board       # 查看技能加载看板
npm run dev:init        # 初始化/重置示例技能

# ── 构建 ──
npm run build           # TypeScript 编译 → dist/
npx tsc --noEmit        # 仅类型检查，不输出文件

# ── 生产运行 ──
npm run start           # node dist/index.js mcp（需先 build）
```

---

## 技术栈 / Tech Stack

| 组件 | 技术选型 |
|------|---------|
| **Runtime** | Node.js 22+ (ESM) |
| **Language** | TypeScript 5.8 (ES2022, NodeNext) |
| **MCP SDK** | `@modelcontextprotocol/sdk` ^1.9.0 |
| **CLI** | `commander` ^14.0.0 |
| **YAML** | `js-yaml` ^4.1.1 |
| **Dev Runner** | `tsx` ^4.19.3 |

---

## 许可 / License

MIT
