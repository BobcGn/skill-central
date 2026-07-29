# CLI 参考

skill-central 通过一个二进制文件暴露所有功能。运行 `npx @bobcgn/skill-central <command> --help` 可获取实时的 flag 文档；此页面是规范性参考。

| 命令 | 用途 |
|---|---|
| `mcp` | 启动 Stdio MCP 服务器（用于 IDE 集成） |
| `board` | 打开 Web 看板（默认）或打印终端表格（`--cli`） |
| `init` | 生成 `.skills/` + `skill-central.yaml` |
| `add` | 创建一个新的技能定义文件（自动选择层） |
| `list` | 列出已加载的技能（过滤器：`--layer`, `--tag`, `--type`） |
| `show <id>` | 打印完整的技能详情 + prompt 正文 |
| `remove <id>` | 删除一个技能定义文件 |
| `validate <files…>` | 解析并校验一个或多个文件 |
| `doctor` | 扫描各层以查找缺失目录、解析错误、冲突、备份 |
| `install <source>` | 从 `github:` 或 `npm:` 安装技能 |
| `update [id]` | 从其来源重新获取已安装的技能 |
| `uninstall <id>` | 删除一个已安装的技能（文件 + 锁条目） |
| `compile` | 预览目标 IDE 产物，不写入文件 |
| `export` | 带冲突检测和备份地写入编译产物 |
| `connect` | 预览、应用、验证或回滚 IDE MCP 注册 |
| `sync` | 查看 local-first 同步状态和 app state / token 边界 |
| `session` | 创建、查看和更新持久化 workflow session 状态 |
| `workflow` | 启动、推进、发布和汇总 workflow 控制面状态 |
| `capabilities` | 打印目标端 adapter 能力支持 |

## 全局标志

所有命令都从 `commander` 继承了这些标志：

```
-h, --help     显示命令的帮助信息
-V, --version  显示 skill-central 版本
```

## `mcp`

```
skill-central mcp
```

启动 Stdio MCP 服务器。供 IDE（Cursor / Windsurf / Claude Code）通过 `mcpServers` 配置使用。所有 `console.log` 输出都被抑制（stdout 是 JSON-RPC 通道）；诊断信息输出到 stderr。

Phase 5I 起，MCP server 同时声明 `resources` capability。当前 Resource 路由只暴露只读证据：

| URI | 内容 |
|---|---|
| `skill://registry` | 当前 registry resolution records，包含 effective/conflicted 候选与 layer provenance |
| `skill://skill/{skillId}` | 单个 effective skill 的规范化 JSON |
| `skill://bundle/{target}/{intent}` | 复用 `compile --dry-run --json` 的 `CompiledSkillBundle` |
| `skill://workflow/{workflowId}/plan` | 只读 workflow definition plan，包含 step 依赖、topic 边界和 `workflow.*` 控制面工具 |

`skill://session/{sessionId}/context` 会读取 app state 中真实持久化 session。`skill://session/{sessionId}/topic/{topic}` 会读取真实 blackboard topic。`skill://workflow/{workflowId}/plan` 只解释 workflow 定义，不创建 session、不读取 blackboard live state。

## `board`

```
skill-central board [options]

选项:
  --cli, --no-web           强制使用终端表格输出
  --port <port>             Web 看板端口（默认为 5417；冲突时自动 +1）
  --host <addr>             绑定的地址（默认为 127.0.0.1）
  --i-understand-nonlocal   非环回地址 --host 需要此选项
```

默认行为是启动一个绑定到 `127.0.0.1:5417` 的 Hono 服务器并打印 URL。使用 `--cli` (或 `--no-web`) 可回退到 v0.1.0 的终端表格输出。参见 [`docs/web-board.md`](./web-board.md)。

端口会尝试 `<port>`，然后是 `<port>+1` … 直到 `<port>+10`，如果都失败则报错。非环回地址保护机制会拒绝 `--host 0.0.0.0`（或任何非 `127.0.0.0/8` 的地址），除非设置了 `--i-understand-nonlocal`，因为看板没有身份验证，仅供本地使用。

## `init`

```
skill-central init
```

在项目根目录生成 `.skills/`（包含四个子目录：`01-global`、`02-workflows`、`03-domains`、`04-tech-stack/{languages,frameworks}`）和一个 `skill-central.yaml`。该操作是幂等的：现有文件不会被覆盖。

## `add`

```
skill-central add [options]

选项:
  --id <id>                 技能 ID（kebab-case）
  -n, --name <name>         人类可读的名称
  -d, --description <text>  简短描述
  -t, --type <type>         "prompt" 或 "tool" (默认为: prompt)
  --tags <tags>             逗号分隔的标签（驱动层推断）
  --prompt <text>           内联的 prompt 内容
  --prompt-file <path>      从文件读取 prompt 内容
  --from-file <path>        逐字复制一个现有的技能文件
  --layer <layer>           强制指定目标层（绕过推断）
  --user                    写入 ~/.skill-central/skills/ (默认为: 项目的 .skills/)
  --force                   覆盖现有文件 (创建 .bak.<ts>)
  -y, --yes                 跳过确认
```

必须提供 `--id + --name + --description + (--prompt | --prompt-file)`，**或者** `--from-file`（它会逐字复制整个技能并覆盖其他内容标志）。层的选择是根据 `--tags` 通过 [`LAYER_RULES`](#layer-inference) 自动进行的；传递 `--layer` 可覆盖此行为。

示例:

```bash
# 从标志创建本地技能
skill-central add review-pr \
  --name "PR Review" \
  --description "根据团队约定审查拉取请求" \
  --tags "review,workflow,git" \
  --prompt-file ./review.md

# 复制一个现有的 YAML
skill-central add --from-file ./my-skill.yaml --force

# 全局（跨项目）安装
skill-central add --user my-baseline --tags "global" --prompt "始终保持简洁。"
```

## `list`

```
skill-central list [options]

选项:
  --layer <name>   仅显示此层的技能
  --tag <tag>      仅显示带有此标签的技能
  --type <type>    仅 "prompt" 或 "tool"
  --source         同时打印源文件路径
```

## `show <id>`

打印完整的技能元数据（名称、描述、类型、标签、层、源路径）和完整的 prompt 正文（对于工具类型的技能，则为 `inputSchema` JSON）。

## `remove <id>`

```
skill-central remove <id> [options]

选项:
  --layer <name>   指定哪个层（如果 id 跨越多个层，则为必需）
  --force          跳过确认
```

如果同一个 id 存在于多个层中，`remove` 会拒绝操作，除非使用 `--layer` 来消除歧义。幂等重新添加：使用相同的 id 重新运行 `add` 会将文件写回原始层。

## `validate <files…>`

将每个文件解析为 `SkillSchema`。如果所有文件都有效，则退出码为 0，否则为 1。

```bash
skill-central validate .skills/02-workflows/*.yaml
```

## `doctor`

```
skill-central doctor
```

报告:

- 缺失的层目录
- 技能文件中的解析错误
- id 冲突（同一个 id 在多个层中定义）
- 备份文件（`*.yaml.bak.<ts>` 同级文件）

选项:

```
--ide <target>        同时运行 IDE 连接健康检查：cursor、windsurf、claude 或 cline
--config-path <path>  覆盖 --ide 使用的 IDE MCP 配置路径
--verify             对 --ide 执行 MCP initialize/prompts/list/tools/list probe
--json               打印机器可读 doctor report
```

如果一切正常，退出码为 0，否则为 1。如果在手动编辑了 `.skills/` 后，建议在 `git commit` 之前运行此命令。

`doctor --ide` 会报告注册状态、MCP server command、Registry prompt/tool 基准数量和下一步修复建议。加上 `--verify` 后，会通过 stdio 启动配置中的 MCP server，并探测 `initialize`、`prompts/list` 和 `tools/list`。

## `install <source>`

```
skill-central install <source> [options]

选项:
  --layer <layer>   强制指定目标层（绕过推断）
  --project         安装到项目 .skills/ (默认为: 用户的 ~/.skill-central/skills/)
  -y, --yes         跳过每个技能的确认
```

来源:

```
github:<user>/<repo>/<path/to/file.yaml>[@<ref>]
npm:<pkg>[@<version>]      # 需要在 package.json 中有 skill-central.paths
```

示例:

```bash
skill-central install github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml@main
skill-central install npm:@bobcgn/some-skills@1.0.0
```

写入一个 `~/.skill-central/lock.json` 条目，映射已安装的 id → 来源 / 版本 / sha256。参见 [`docs/remote-sources.md`](./remote-sources.md)。

## `update [id]`

```
skill-central update [id] [options]

选项:
  --project   更新到项目范围（默认为：保留原始范围）
  -y, --yes   跳过每个技能的确认（默认为：非交互式）
```

从其来源重新获取每个（或单个）已安装的技能，如果 sha256 不同则替换文件。保留记录在锁文件中的原始范围（项目 vs 用户）。

## `uninstall <id>`

```
skill-central uninstall <id> [options]

选项:
  --purge-backups   同时删除 .bak.* 同级文件
  -y, --yes         跳过确认
```

同时删除磁盘上的文件和锁条目。如果 id 不在锁文件中，则拒绝操作（使用 `remove` 删除未经 `install` 添加的技能）。

## `compile`

```
skill-central compile --target <target> --intent <intent> --dry-run
```

选项：

```
--target <target>   generic-mcp、cursor 或 windsurf
--intent <intent>   activation intent、skill id 或 tag
--dry-run           Phase 2B 必需；不会写入文件
--json              打印机器可读 compile bundle
```

`compile` 会读取 Registry resolution records，选择匹配 intent 的 effective skills，报告 shadowed/conflicted 候选，通过目标端 adapter 检查 capability，并打印 artifact preview。`--json` 会打印 `export` 写入事务复用的同一份 bundle。

示例：

```bash
skill-central compile --target cursor --intent review-pr --dry-run
skill-central compile --target windsurf --intent review-pr --dry-run
skill-central compile --target generic-mcp --intent ci-workflow --dry-run
skill-central compile --target cursor --intent review-pr --dry-run --json
```

## `export`

```
skill-central export --target <target> --intent <intent> --out <dir> [options]
```

选项：

```
--target <target>   generic-mcp、cursor 或 windsurf
--intent <intent>   activation intent、skill id 或 tag
--out <dir>         输出目录
--dry-run           只打印写入计划，不写文件
--stdout            只把产物内容打印到 stdout，不写文件
--json              只打印机器可读 export plan，不写文件
--force             覆盖不同内容前创建 .bak.<timestamp> 备份
```

`export` 会编译 `compile --dry-run` 展示的同一份 artifact bundle，先生成完整写入计划，默认拒绝覆盖已有且内容不同的文件。只有在复核 diff preview 后，才应该使用 `--force`。

示例：

```bash
skill-central export --target cursor --intent review-pr --out .
skill-central export --target windsurf --intent review-pr --out . --dry-run
skill-central export --target generic-mcp --intent ci-workflow --out ./export --stdout
```

TODO: 启用更大范围 IDE auto-apply 前，继续增强 transaction diff。

## `connect`

```
skill-central connect --target <ide> [options]
```

选项：

```
--target <ide>        cursor、windsurf、claude 或 cline
--config-path <path>  覆盖 IDE MCP 配置路径
--dry-run            只打印连接计划，不写文件
--verify             写入后执行 MCP initialize/prompts/list/tools/list probe
--json               打印机器可读 connect plan
--rollback           回滚连接写入；有备份时恢复备份，无备份且是 connect 新建配置时删除文件
--backup-path <path> --rollback 要恢复的备份路径；回滚新建配置文件时可省略
```

`connect` 是一键 IDE 连接的 CLI 后端。它会预览 JSON merge，保留已有 MCP servers，写入前创建备份，并可验证写入后的 MCP 连接。若既有 IDE config 不是可解析 JSON，`connect` 会在 plan 阶段阻断，不会尝试写入；用户需要先修复文件或恢复备份。

示例：

```bash
skill-central connect --target cursor --dry-run
skill-central connect --target cursor --verify
skill-central connect --target cursor --rollback --backup-path ~/.cursor/mcp.json.bak.2026-...
skill-central connect --target cursor --config-path ./new-mcp.json --rollback
```

## `sync`

```
skill-central sync <status|login|logout|repo|scan|plan|apply> [options]
```

选项：

```
--app-state-dir <path>  覆盖本地 app state 根目录，供测试或桌面 shell 使用
--client-id <id>        GitHub OAuth App client id；也可用 SKILL_CENTRAL_GITHUB_CLIENT_ID
--poll                  login 时轮询 Device Flow 并在成功后写入 TokenStore
--owner <owner>         repo dry-run 使用的 GitHub owner
--repo <repo>           repo dry-run 使用的 repo 名称，默认 skill-central-registry
--registry-dir <path>   scan/plan dry-run 使用的本地 remote registry checkout
--direction <direction> plan dry-run 使用的方向：push、pull 或 both，默认 both
--exists                repo dry-run 按“绑定既有 repo”规划
--dry-run               repo、scan、plan 动作必需；只生成计划，不写本地或远端文件
--force                 apply 时允许 update/delete；执行前会创建 .bak.<timestamp> 备份
--json                  打印机器可读 sync 输出
```

`sync status` 是 Phase 4A 的只读入口。它会创建并展示本地 app state 边界，包括 `state`、`audit`、`cache`、`sync` 和 `tokens` 目录。该目录默认位于 OS app-data 位置；不会写入项目配置，也不会把 token 放到 `.skills` 或 `skill-central.yaml`。

当前 token store 是 development fallback，只供开发和测试使用，生产 `.msi` / `.dmg` 必须替换为 OS keychain。

`sync login` 使用 GitHub Device Flow：先返回 `verification_uri` 和 `user_code`，用户在浏览器授权后可通过 `--poll` 轮询并写入 TokenStore。该命令必须显式提供 GitHub OAuth App client id，避免使用错误的内置凭据。

`sync repo --dry-run` 只生成 GitHub registry repo 绑定/创建计划，默认 repo 为私有 `skill-central-registry`，不会创建 repo、不会 push 文件。未登录时也能生成计划，用于桌面 UI 预览。

`sync scan --dry-run` 扫描一个本地 remote registry checkout，校验 `manifest.yaml` 和 `workspaces/*.profile.yaml`，报告 `layers/` 下可导入 skill 文件和未知文件。它不写入本地或远端状态。

`sync plan --dry-run` 基于本地 layer 配置和 remote registry manifest 生成同步计划。计划只比较路径、策略和 `sha256`，不会写入本地文件、remote checkout 或 GitHub。`sync.enabled: false` 的 layer 会被标记为 `excluded-policy`；`--direction both` 遇到本地与远端 hash 不一致时会标记为 `conflict`，由后续 apply 阶段要求用户选择。

`sync apply` 会重新生成并消费同一类 `SyncPlan`，先执行 preflight，再决定是否写入本地 layer 或本地 remote registry checkout。`create-local` / `create-remote` 默认允许；`update-local`、`update-remote`、`delete-local`、`delete-remote` 默认阻断，必须显式传入 `--force`，且执行前会在原文件旁创建 `.bak.<timestamp>` 备份。`conflict` 不会被自动应用；`excluded-policy` 和 `noop` 只记录为 skipped。

如果 preflight 发现 blocked 操作，`sync apply` 会写入审计报告并以失败状态退出，但不会写任何本地 skill 文件或 registry checkout 文件。每次 `sync apply` 都会在 app state 的 `audit` 目录写入 `sync-apply.<timestamp>.json`，记录 `planHash`、方向、远端根目录、`preflightBlocked`、操作结果和备份路径。

计划操作状态：

| 状态 | 含义 |
|---|---|
| `create-local` | 远端存在、本地缺失，pull/both 会规划本地创建 |
| `create-remote` | 本地存在、远端缺失，push/both 会规划远端创建 |
| `update-local` | 双方存在但 hash 不同，pull 会规划本地更新 |
| `update-remote` | 双方存在但 hash 不同，push 会规划远端更新 |
| `delete-local` | pull 时远端缺失、本地存在，会规划本地删除 |
| `delete-remote` | push 时本地缺失、远端存在，会规划远端删除 |
| `conflict` | both 时双方 hash 不同，dry-run 不自动选择赢家 |
| `noop` | 双方内容一致 |
| `excluded-policy` | 本地或远端 layer 的 `sync.enabled` 为 `false` |

示例：

```bash
skill-central sync status
skill-central sync status --json
skill-central sync status --app-state-dir ./.skill-central-app-state-ci --json
skill-central sync login --client-id <github-oauth-client-id>
skill-central sync repo --owner octocat --dry-run --json
skill-central sync scan --registry-dir ./skill-central-registry --dry-run --json
skill-central sync plan --registry-dir ./skill-central-registry --direction both --dry-run --json
skill-central sync apply --registry-dir ./skill-central-registry --direction pull --force --json
skill-central sync logout
```

## `session`

```
skill-central session <create|list|show|status|publish|topic> [options]
```

选项：

```
--app-state-dir <path>  覆盖本地 app state 根目录，供测试或桌面 shell 使用
--workflow-id <id>      create 使用的 workflow id
--session-id <id>      show/status 使用的 session id
--status <status>      status 使用的新状态：created、running、blocked、completed、failed
--reason <text>        create/status 写入 audit event 的原因
--trigger <text>       create/status 写入 audit event 的触发来源
--topic <topic>        publish/topic 使用的 blackboard topic
--producer <id>        publish 写入的 producer
--kind <kind>          publish 写入的 entry kind
--content <json/text>  publish 写入的 content；可为 JSON 或纯文本
--summary <text>       publish 写入的摘要
--refs <uris>          publish 写入的逗号分隔引用 URI
--json                 打印机器可读 session 输出
```

`session` 是 Phase 5J/5K 的控制面入口。它把 workflow session 和 blackboard topic 写入 app state 的 `sessions` 目录，不写 `.skills`、不执行 workflow step，也不读取项目文件。每次状态变化都会追加 audit event，记录 `timestamp`、`from`、`to`、`reason` 和 `trigger`，因此桌面应用重启后仍可恢复并解释 blocked / failed / completed 状态。

Blackboard topic 按 session 隔离。`session publish` 会追加 entry，并保留 `producer`、`kind`、`content`、`summary` 和 `refs`，供后续 scheduler/compiler 只读取显式订阅 topic。

示例：

```bash
skill-central session create --workflow-id pr-review.workflow --reason "User started review"
skill-central session list --json
skill-central session show --session-id session-...
skill-central session status --session-id session-... --status blocked --reason "Waiting for diff topic"
skill-central session publish --session-id session-... --topic review.diff --producer context-analyst --kind finding --content '{"files":["src/index.ts"]}' --summary "Diff collected"
skill-central session topic --session-id session-... --topic review.diff --json
```

## `workflow`

```
skill-central workflow <start|next|publish|summarize> [options]
```

选项：

```
--app-state-dir <path>  覆盖本地 app state 根目录，供测试或桌面 shell 使用
--workflow-id <id>      start 使用的 workflow skill id
--session-id <id>      next/publish/summarize 使用的 session id
--topic <topic>        publish 使用的 blackboard topic
--producer <id>        publish 写入的 producer，默认 workflow.publish
--kind <kind>          publish 写入的 entry kind，默认 result
--content <json/text>  publish 写入的 content
--summary <text>       publish 写入的摘要
--refs <uris>          publish 写入的逗号分隔引用 URI
--json                 打印机器可读 workflow 输出
```

`workflow` 是 Phase 5L/5M 的 scheduler 控制面。`workflow start` 创建持久化 session，并返回第一批可执行的 Data Plane Task；`workflow next` 根据 blackboard topic 和 workflow step 的 `dependsOn` 推进 ready / blocked / completed 状态；`workflow publish` 复用 blackboard append-only 存储；`workflow summarize` 聚合当前 session 的 topic 摘要。

Scheduler 不执行 Bash、不读取项目文件、不写 skill source。返回的 task 包含 `stepId`、`uses`、`resources`、`publishTo` 和 `promptBundle`，由 IDE Agent 自己执行数据面动作后再 publish 结果。`promptBundle.resourceUris` 只列出当前 step 显式依赖的 `skill://session/{sessionId}/topic/{topic}`，不会把全量 session history 注入 prompt。

同一套控制面也暴露为 MCP Tools：`workflow.start`、`workflow.next`、`workflow.publish`、`workflow.summarize`。MCP 调用返回 JSON text，便于 IDE 直接读取 ready task、blocked reason 和 prompt bundle。

示例：

```bash
skill-central workflow start --workflow-id pr-review.workflow --json
skill-central workflow next --session-id session-... --json
skill-central workflow publish --session-id session-... --topic diff.summary --content '{"files":["src/index.ts"]}' --summary "Diff summarized"
skill-central workflow summarize --session-id session-... --json
```

## `capabilities`

```
skill-central capabilities --target <target>
```

选项：

```
--target <target>   generic-mcp、cursor 或 windsurf
```

打印 `compile` 实际使用的 adapter-owned capability matrix。未声明的 capability 会解析为 `unknown`，因此 required unknown capability 会进入 degradation，而不会被当作 supported。

示例：

```bash
skill-central capabilities --target cursor
```

---

## 层推断

`add` 和 `install` 的层自动选择由 `src/commands/add.ts` 中的一个标签表驱动：

| 层 | 匹配规则（任何标签） |
|---|---|
| `01-global` | `global`, `universal`, `baseline`, `system`, `mindset` |
| `02-workflows` | `workflow`, `debug`, `review`, `planning`, `commit`, `test`, `lint`, `readme`, `changelog`, `refactor`, `document`, `release`, `git` |
| `03-domains` | `docker`, `nginx`, `infra`, `devops`, `security`, `database`, `db`, `data`, `ai`, `agent`, `ml`, `kubernetes`, `k8s`, `terraform`, `aws` |
| `04-tech-stack/languages` | `typescript`, `javascript`, `python`, `kotlin`, `swift`, `java`, `go`, `rust`, `ruby`, `php`, `c++`, `c` |
| `04-tech-stack/frameworks` | `react`, `vue`, `svelte`, `nextjs`, `next`, `nuxt`, `angular`, `express`, `fastapi`, `django`, `flask`, `spring`, `rails` |

歧义处理策略:

1. 恰好一个匹配 → 使用它。
2. 多个匹配 → 使用优先级最高的层（这样覆盖语义仍然有效）。
3. 幂等重新添加：相同的 id → 相同的层。
4. `--layer` 覆盖一切。
5. 无匹配 → 默认为 `02-workflows` 并附带 stderr 提示。
