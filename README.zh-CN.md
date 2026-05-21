# skill-central

**跨 IDE 的 AI 技能分发中心 · 本地 MCP 服务器**

skill-central 是一个本地 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 服务器，通过 Stdio 协议与各类 AI IDE（Cursor、Windsurf、Claude Code 等）通信，实现**跨 IDE 的 AI 技能（Prompt/Tools）分发与复用**。

> **技能（Skill）** 是一段结构化的提示词或工具定义，按主题组织、按层级管理、按标签匹配。你可以像管理代码一样管理 AI 的能力边界。

---

## 目录

- [快速开始](#快速开始)
- [架构](#架构)
- [CLI 命令](#cli-命令)
- [JSON-RPC 接口](#json-rpc-接口)
- [技能文件格式](#技能文件格式)
- [标签组合](#标签组合)
- [层级覆写](#层级覆写)
- [配置加载顺序](#配置加载顺序)
- [IDE 集成](#ide-集成)
- [自定义技能开发](#自定义技能开发)
- [故障排查](#故障排查)
- [开发指南](#开发指南)
- [许可](#许可)

---

## 快速开始

### 安装

```bash
npx @bobcgn/skill-central init
```

这将创建一个 `.skills/` 目录（包含 4 层层级文件夹）和一个 `skill-central.yaml` 配置文件。

```bash
# 验证技能加载成功
npx @bobcgn/skill-central board
```

预期输出 — 4 层配置，含一个 tool 类型示例：

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

### 启动 MCP Server

```bash
npx @bobcgn/skill-central mcp
```

服务器通过 **stdin** 监听 JSON-RPC 消息，将响应写入 **stdout**。所有诊断日志走 **stderr**，保障协议通道纯净。

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

### 默认技能层级

| 层 | 优先级 | 作用域 |
|----|--------|--------|
| `01-global` | 10 | 全局上下文 — 适用于所有交互 |
| `02-workflows` | 20 | 跨领域工作流（排错、审查、规划） |
| `03-domains` | 30 | 领域知识（基础设施、安全、数据） |
| `04-tech-stack` | 40 | 技术栈专项 — 语言和框架 |

---

## CLI 命令

```bash
npx @bobcgn/skill-central <command>
```

| 命令 | 说明 |
|------|------|
| `mcp` | 启动 Stdio MCP Server（静默模式，日志仅输出到 stderr）。供 IDE 调用。 |
| `board` | 终端看板 — 以表格形式打印所有已加载的层和技能。 |
| `init` | 生成 `.skills/` 示例目录和层级配置。 |

全局安装：

```bash
npm install -g @bobcgn/skill-central
skill-central init
skill-central board
skill-central mcp
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

支持占位符插值：`{{name}}` 会被替换为参数值：

```json
{"method":"prompts/get","params":{"name":"my-skill","arguments":{"name":"Alice"}}}
```

### `prompts/get` (skills:compose) — 标签组合

```json
{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"global,debug,docker"}}}
```

> `tags` 为逗号分隔的字符串。MCP 规范约束 arguments 类型为 `Record<string, string>`，不支持 JSON 数组。

### `tools/list` / `tools/call` — 工具调用

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"commit-conventions","arguments":{"type":"feat","summary":"add login page"}}}
```

工具参数会根据 `inputSchema` 进行校验 — 缺少必填字段或类型不匹配会返回 `isError: true`。

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
| `prompt` | string | prompt 必填 | 发送给 AI 的 Markdown 指令，支持 `{{占位符}}` 插值 |
| `inputSchema` | object | tool 必填 | JSON Schema 输入定义，调用 tool 时会校验 |
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
      "args": ["@bobcgn/skill-central", "mcp"]
    }
  }
}
```

### Windsurf — `.windsurf/mcp_config.json`

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
npx @bobcgn/skill-central board
```

### 第三步 — 使用

```json
// 直接获取
{"method":"prompts/get","params":{"name":"typescript-conventions"}}
// 或标签组合
{"method":"prompts/get","params":{"name":"skills:compose","arguments":{"tags":"typescript"}}}
```

参考 `.skills/04-tech-stack/_template.yaml` 获取完整的注释模板。

---

## 故障排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| Server 启动但无响应 | stdout 被污染 | 检查第三方库的 `console.log`。MCP 模式已重定向，但仍有遗漏。 |
| IDE 无法连接 | MCP 配置命令错误 | 使用 `npx @bobcgn/skill-central mcp` 作为命令。 |
| 技能未加载 | YAML 语法错误 | 运行 `board` 查看加载状态。确认 `id` 和 `type` 字段存在。 |
| 标签组合无返回 | 标签缺失或不匹配 | 确认技能 YAML 中有 `tags` 字段，board 中可见。传参使用逗号字符串。 |
| 工具调用返回错误 | 参数缺失或类型错误 | 检查 `inputSchema.required`。参数会按声明类型校验。 |

---

## 开发指南

```bash
# 克隆项目
git clone https://github.com/BobcGn/skill-central.git
cd skill-central
npm install

# 开发命令
npm run dev:mcp       # MCP Server（watch 模式）
npm run dev:board     # 技能看板
npm run dev:init      # （重新）生成示例技能
npm run build         # tsc 编译 → dist/
npx tsc --noEmit      # 仅类型检查
```

### 技术栈

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
