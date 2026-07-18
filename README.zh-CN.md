# skill-central

**跨 IDE 的 AI 技能分发中心 · 本地 MCP 服务器**

skill-central 是一个本地 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 服务器，通过 Stdio 协议与各类 AI IDE（Cursor、Windsurf、Claude Code 等）通信，实现**跨 IDE 的 AI 技能（Prompt/Tools）分发与复用**。

> **技能（Skill）** 是一段结构化的提示词或工具定义，按主题组织、按层级管理、按标签匹配。你可以像管理代码一样管理 AI 的能力边界。

自 **v0.2.0** 起，skill-central 提供了完整的本地 CRUD 命令行、基于 Hono 的 **Web 看板**（支持浏览器内预览和编辑），以及从 GitHub raw URL 和 npm 包远程安装的能力。

---

## 目录

- [快速开始](#快速开始)
- [架构](#架构)
- [CLI 命令](#cli-命令)
- [本地 CRUD](#本地-crud)
- [Web 看板](#web-看板)
- [远程安装](#远程安装)
- [JSON-RPC 接口](#json-rpc-接口)
- [技能文件格式](#技能文件格式)
- [标签组合](#标签组合)
- [层级覆写](#层级覆写)
- [配置加载顺序](#配置加载顺序)
- [IDE 集成](#ide-集成)
- [自定义技能开发](#自定义技能开发)
- [故障排查](#故障排查)
- [参考文档](#参考文档)
- [发布前自检](#发布前自检)
- [Trusted Publishing 自动发布](./docs/ch/trusted-publishing.md) / [Trusted Publishing](./docs/en/trusted-publishing.md)
- [手动发布指南](./docs/ch/manual-publishing.md) / [Manual Publishing](./docs/en/manual-publishing.md)
- [开发指南](#开发指南)
- [许可](#许可)

---

## 快速开始

> **提示：** `skill-central` 是一个模板仓库。你可以直接使用我已经发布的服务（`@bobcgn/skill-central`），也可以使用本模板自行构建和发布你的专属版本。

### 安装与初始化

```bash
# 若使用我发布的默认服务：
npx @bobcgn/skill-central init

# 若使用你自己发布的包：
# npx your-package-name init

# 若在本地克隆代码库后使用：
# npm run build && npm link
# skill-central init
```

这将创建一个 `.skills/` 目录（包含 4 层层级文件夹）和一个 `skill-central.yaml` 配置文件。

### 打开 Web 看板

```bash
# 使用默认发布的包
npx @bobcgn/skill-central board
```

终端会打印 `http://127.0.0.1:5417/` 并启动一个 Hono 仪表盘——在浏览器中浏览、预览、编辑、恢复技能。也可以用 `board --cli`（或 `--no-web`）回到 v0.1.0 的终端表格。

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
│  │  CLI       │  │  Protocol       │  │  Core     │   │
│  │  mcp/init  │→│  handler.ts     │→│  engine   │   │
│  │  add/list  │  │  prompts.ts     │  │  override-│   │
│  │  show/...  │  │  tools.ts       │  │  tree     │   │
│  │  install   │  └─────────────────┘  │  composer │   │
│  │  board     │  ┌─────────────────┐  └─────┬─────┘   │
│  │  (Hono)    │  │  Web 看板       │        │         │
│  │            │  │  server.ts      │  ┌──────▼──────┐  │
│  │            │  │  router.ts      │  │  Storage    │  │
│  │            │  │  backup.ts      │  │  reader.ts  │  │
│  └────────────┘  └─────────────────┘  │  parser.ts  │  │
│                                       │  config.ts  │  │
│                                       └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 默认技能层级

| 层 | 优先级 | 作用域 |
|----|--------|--------|
| `01-global` | 10 | 全局上下文 — 适用于所有交互 |
| `02-workflows` | 20 | 跨领域工作流（排错、审查、规划） |
| `03-domains` | 30 | 领域知识（基础设施、安全、数据） |
| `04-tech-stack/languages` | 40 | 语言约定（TypeScript、Python、Kotlin…） |
| `04-tech-stack/frameworks` | 40 | 框架约定（React、Vue、Spring…） |

遇到 id 冲突时优先级高者胜出。详见 [层级覆写](#层级覆写)。

---

## CLI 命令

```bash
npx @bobcgn/skill-central <command>
```

| 命令 | 说明 |
|------|------|
| `mcp` | 启动 Stdio MCP Server（IDE 集成用，stdout 静默） |
| `board` | 打开 **Web 看板**（默认），或打印终端表格（`--cli`） |
| `init` | 生成 `.skills/` 示例目录和层级配置 |
| `add` | 创建新技能（基于 tags 自动推断 layer） |
| `list` | 列出已加载技能（过滤项：`--layer`、`--tag`、`--type`） |
| `show <id>` | 打印技能完整信息和 prompt 正文 |
| `remove <id>` | 删除技能文件（多 layer 时需 `--layer` 消歧） |
| `validate <files…>` | 解析并校验一个或多个技能文件 |
| `doctor` | 扫描各 layer：缺失目录、解析错误、id 冲突、孤立备份 |
| `install <source>` | 从 `github:` 或 `npm:` URL 安装技能 |
| `update [id]` | 重新拉取已安装技能，保留原始 scope |
| `uninstall <id>` | 删除已安装技能（文件 + lock 条目） |

全局安装：

```bash
npm install -g @bobcgn/skill-central
skill-central init
skill-central board          # 打开 Web 看板
skill-central mcp            # 或启动 MCP Server
```

完整 flag 参考见 [`docs/ch/cli-reference.md`](./docs/ch/cli-reference.md) / [`docs/en/cli-reference.md`](./docs/en/cli-reference.md)。

---

## 本地 CRUD

```bash
# 创建技能 — layer 由 tags 自动推断
skill-central add review-pr \
  --name "PR Review" \
  --description "Review pull requests against team conventions" \
  --tags "review,workflow,git" \
  --prompt-file ./review.md

# 查看
skill-central list --tag review
skill-central show review-pr

# 提交前校验
skill-central validate .skills/02-workflows/review-pr.yaml

# 清理
skill-central remove review-pr --force
```

`add` 按以下优先级选择目标 layer：

1. 显式 `--layer` 标志（最高优先级）
2. 同 id 已存在文件的位置（幂等 re-add）
3. tags 经 [`LAYER_RULES`](./docs/ch/cli-reference.md#layer-inference) 推断
4. 无匹配时 fallback 到 `02-workflows`

`doctor` 是诊断安全的兜底：

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

## Web 看板

`skill-central board` 启动本地 Hono 服务并打印 URL：

```
  ✓ skill-central web board
    http://127.0.0.1:5417/

  Press Ctrl+C to stop.
```

仪表盘按 layer 分组显示技能列表。点击任意技能可在右侧预览完整 prompt。点击 **Edit** 打开浏览器内 textarea；**Save** 通过 `PUT /api/skills/:id` 将变更写回磁盘。

每次保存都会把旧内容挪到 `<file>.yaml.bak.<ISO-no-colons>`。并发编辑由 sha256 冲突检测捕获——若客户端的 expected sha 与当前文件不一致，服务端返回 `409` 并附上当前内容。

### 安全模型

- **默认仅监听 loopback**。`--host 0.0.0.0` 需要加 `--i-understand-nonlocal` 因为 Web 看板没有身份验证。
- **端口冲突重试**。`+1..+10` 自动尝试。
- **静态资源路径遍历防御**。`GET /*` 解析到 `dist/web/`；`..` 一律返回 404。

完整的 HTTP API 和编辑流程见 [`docs/ch/web-board.md`](./docs/ch/web-board.md) / [`docs/en/web-board.md`](./docs/en/web-board.md)。

---

## 远程安装

从远程 URL 安装技能到本地 layer：

```bash
# 从 GitHub raw 文件（任何 branch / tag / SHA）
skill-central install \
  github:BobcGn/skill-central/.skills/02-workflows/review-pr.yaml@v1.0.0

# 从 npm 包（需要在 package.json 中声明 skill-central.paths）
skill-central install npm:@bobcgn/some-skills@1.2.3

# 按需重新拉取
skill-central update                 # 全部已安装
skill-central update review-pr       # 单个

# 卸载
skill-central uninstall review-pr --purge-backups
```

每次安装都会写入 `~/.skill-central/lock.json` 一条记录，包含 source URL、解析后的版本、sha256、layer、绝对文件路径。`update` 重新拉取后比对 sha256，仅在上游真正变化时落盘。

### 安全模型

- **HTTPS-only**。`http://` 直接拒绝。
- **禁止 loopback 主机**。tarball 来源若指向 `localhost`、`127.0.0.0/8`、`::1`、`0.0.0.0` 一律拒绝（tar-slip / SSRF 防御）。
- **Tar-slip 防御**。npm tarball 条目必须以 `package/` 开头；`..` 和 `\` 被拒绝。
- **sha256 校验**。每次 install + update 都计算并存入 sha256。

完整的 URL 语法和 manifest 约定见 [`docs/ch/remote-sources.md`](./docs/ch/remote-sources.md) / [`docs/en/remote-sources.md`](./docs/en/remote-sources.md)。

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

完整规范见 [`docs/ch/mcp-protocol.md`](./docs/ch/mcp-protocol.md) / [`docs/en/mcp-protocol.md`](./docs/en/mcp-protocol.md)。

---

## 技能文件格式

技能支持 **YAML**（推荐）和 **JSON** 两种格式。

```yaml
# .skills/04-tech-stack/languages/typescript.yaml
id: typescript-conventions
name: TypeScript Conventions
description: TypeScript 编码规范
type: prompt
tags:
  - typescript
prompt: |
  你是 TypeScript 专家，请遵守以下规范：

  ## 代码风格
  - 开启 strict 模式（tsconfig 中 `strict: true`）
  - 对象结构优先用 interface 而非 type alias
  - 公共函数必须标注显式返回类型
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 全局唯一标识符（kebab-case），作为 prompt name |
| `name` | string | ✓ | 人类可读名称 |
| `description` | string | ✓ | 简短描述 |
| `type` | "prompt"/"tool" | ✓ | 技能类型 |
| `tags` | string[] | | 分类标签，用于组合 + layer 推断 |
| `prompt` | string | prompt 必填 | 发送给 AI 的 Markdown 指令，支持 `{{占位符}}` 插值 |
| `inputSchema` | object | tool 必填 | JSON Schema 输入定义，调用 tool 时会校验 |
| `arguments` | object[] | | 声明的参数（供 IDE UI 参考） |
| `version` | string | | 版本号 |

完整 schema 参考 [`docs/ch/skill-schema.md`](./docs/ch/skill-schema.md) / [`docs/en/skill-schema.md`](./docs/en/skill-schema.md)。

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

当多层定义了**相同的 `id`**，高优先级胜出。`init` 生成的 `skill-central.yaml` 形如：

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

团队共享技能库的同时，允许个人叠加自定义覆盖——无需复制文件。

### 用户级基线（v0.2.0 起）

`add --user` 和 `install`（默认 scope）写入 `~/.skill-central/skills/`。四个子目录与项目 1:1 对应，优先级为 `5 / 15 / 25 / 35`——始终低于项目层，因此项目可以随时覆盖全局基线。详见 [`docs/ch/layered-override.md`](./docs/ch/layered-override.md) / [`docs/en/layered-override.md`](./docs/en/layered-override.md)。

---

## 配置加载顺序

```
1. ~/.skill-central/config.yaml       ← 机器级默认
2. <project>/skill-central.yaml       ← 项目级（覆盖同名 layer 的 path/priority）
3. 内置默认                           ← { name: "project", path: ".skills", priority: 100 }
```

---

## IDE 集成

将 skill-central 作为 MCP 工具接入你的 AI IDE。

> **提示：** 如果你使用了该模板自行发布，请把 `@bobcgn/skill-central` 替换成你自己的 npm 包名。如果在本地 link，可以直接填写 `skill-central mcp` 命令。

### Cursor — `.cursor/mcp.json`

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

### Windsurf — `.windsurf/mcp_config.json`

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

## 自定义技能开发

### 方案 A — 用 `add`（推荐）

```bash
skill-central add typescript-conventions \
  --name "TypeScript Conventions" \
  --description "Coding standards for this project" \
  --tags "typescript,lang-ts" \
  --prompt-file ./ts-conventions.md
```

Layer 推断会从 `typescript` tag 选择 `04-tech-stack/languages/`。验证：

```bash
skill-central show typescript-conventions
```

### 方案 B — 手写 YAML

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
  你是 TypeScript 专家...
```

### 验证 + 使用

```bash
skill-central doctor                       # 抓取解析错误 + id 冲突
skill-central show typescript-conventions  # 检查渲染结果
```

参考 `.skills/04-tech-stack/_template.yaml` 获取带完整注释的模板。

---

## 故障排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| Server 启动但无响应 | stdout 被污染 | 检查第三方库的 `console.log`。MCP 模式已重定向，但仍有遗漏。 |
| IDE 无法连接 | MCP 配置命令错误 | 使用 `npx @bobcgn/skill-central mcp` 作为命令。 |
| 技能未加载 | YAML 语法错误 | 运行 `skill-central doctor` 查看带文件路径的解析错误。 |
| 标签组合无返回 | 标签缺失或不匹配 | 确认技能 YAML 中有 `tags` 字段，用 `list --tag X` 验证。传参使用逗号字符串。 |
| 工具调用返回错误 | 参数缺失或类型错误 | 检查 `inputSchema.required`。参数会按声明类型校验。 |
| Web 看板拒绝绑定 0.0.0.0 | 防误用护栏 | 若确实需要，加 `--i-understand-nonlocal`。 |
| `install github:...` 返回 404 | 路径 / 分支错误 | 在浏览器中确认该 ref 下存在该路径。 |
| `Package X has no "skill-central.paths"` | npm 包作者漏写 manifest | 作者需在 package.json 中声明 `"skill-central": { "paths": [...] }`。 |
| Web 看板提示 "web assets not found" | 漏了 `npm run build:web` | 先执行构建步骤，再启动 `board`。 |

---

## 参考文档

详细参考页位于 [`docs/`](./docs/)：

- [`docs/ch/cli-reference.md`](./docs/ch/cli-reference.md) / [`docs/en/cli-reference.md`](./docs/en/cli-reference.md) — 每个命令、每个 flag
- [`docs/ch/web-board.md`](./docs/ch/web-board.md) / [`docs/en/web-board.md`](./docs/en/web-board.md) — Web 仪表盘使用 + API
- [`docs/ch/remote-sources.md`](./docs/ch/remote-sources.md) / [`docs/en/remote-sources.md`](./docs/en/remote-sources.md) — 源 URL 语法 + manifest
- [`docs/ch/skill-schema.md`](./docs/ch/skill-schema.md) / [`docs/en/skill-schema.md`](./docs/en/skill-schema.md) — `SkillSchema` 字段参考
- [`docs/ch/layered-override.md`](./docs/ch/layered-override.md) / [`docs/en/layered-override.md`](./docs/en/layered-override.md) — 层级机制详解
- [`docs/ch/mcp-protocol.md`](./docs/ch/mcp-protocol.md) / [`docs/en/mcp-protocol.md`](./docs/en/mcp-protocol.md) — JSON-RPC 示例

发布历史见 [`CHANGELOG.md`](./CHANGELOG.md)。发布前自检清单：[`docs/ch/release-testing.md`](./docs/ch/release-testing.md) / [`docs/en/release-testing.md`](./docs/en/release-testing.md)。推荐的发布路径（tag push → 自动 npm publish + provenance + 自动 GitHub Release）：[`docs/ch/trusted-publishing.md`](./docs/ch/trusted-publishing.md) / [`docs/en/trusted-publishing.md`](./docs/en/trusted-publishing.md)。若 Trusted Publishing 尚未配置，回退到：[`docs/ch/manual-publishing.md`](./docs/ch/manual-publishing.md) / [`docs/en/manual-publishing.md`](./docs/en/manual-publishing.md)。

---

## 开发指南

```bash
# 克隆项目
git clone https://github.com/BobcGn/skill-central.git
cd skill-central
npm install

# 开发命令
npm run dev:mcp       # MCP Server（watch 模式）
npm run dev:board     # Web 看板
npm run dev:init      # （重新）生成示例技能

# 构建
npm run build         # tsc → dist/
npm run build:web     # 拷贝前端静态资源到 dist/web/

# 仅类型检查
npx tsc --noEmit
```

### 技术栈

| 组件 | 选型 |
|------|------|
| **运行时** | Node.js 22+ (ESM) |
| **语言** | TypeScript 5.8 (ES2022, NodeNext) |
| **MCP SDK** | `@modelcontextprotocol/sdk` ^1.9.0 |
| **CLI** | `commander` ^14.0.0 |
| **YAML** | `js-yaml` ^4.1.1 |
| **Web 服务器** | `hono` ^4.12 + `@hono/node-server` ^2.0 |
| **Tarball** | `tar-stream` ^3.2（支持 npm 安装） |
| **开发运行器** | `tsx` ^4.19.3 |

---

## 许可

MIT

---

## 作为模板使用

您可以使用此仓库作为模板来创建您自己的技能仓库。点击仓库页面顶部的 “Use this template” 按钮即可开始。