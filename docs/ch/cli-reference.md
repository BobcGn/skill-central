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

如果一切正常，退出码为 0，否则为 1。如果在手动编辑了 `.skills/` 后，建议在 `git commit` 之前运行此命令。

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
