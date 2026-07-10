# 层级覆写

技能存在于 **层 (layers)** 中——这些是关联了**优先级**数字的目录。当两个层定义了相同的 `id` 时，优先级较高的层会胜出。这实现了渐进式覆写：任何项目都可以覆盖全局默认值，而无需修改上游文件。

## 四个项目层

运行 `skill-central init` 后，您的项目将包含：

```
.skills/
├── 01-global/                优先级 10
├── 02-workflows/             优先级 20
├── 03-domains/               优先级 30
└── 04-tech-stack/
    ├── languages/            优先级 40
    └── frameworks/           优先级 40
```

| 层 | 用途 | 示例标签 |
|---|---|---|
| `01-global` | 通用上下文 — 适用于所有交互 | `global`, `mindset`, `system` |
| `02-workflows` | 跨领域的工作流模式 | `review`, `debug`, `commit`, `test`, `lint` |
| `03-domains` | 领域特定知识 | `docker`, `nginx`, `database`, `security` |
| `04-tech-stack/languages` | 语言约定 | `typescript`, `python`, `kotlin` |
| `04-tech-stack/frameworks` | 框架约定 | `react`, `vue`, `nextjs`, `spring` |

优先级数字本身没有特殊含义——它们只是一个排序依据。数字越大 = 优先级越高。每个层的实际内容由您决定；这些名称是约定俗成的。

## `skill-central.yaml`

层在项目根目录的 `skill-central.yaml` 中声明：

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

这正是 `skill-central init` 命令的输出。您可以添加、删除或重新排序条目——唯一的约束是，在单个配置中，优先级必须是唯一的（加载器在遇到名称冲突时会覆盖，而不是优先级冲突）。

`loadConfig()` 按以下顺序解析层：

1. `~/.skill-central/config.yaml` (用户级别，未来使用)
2. `<project-root>/skill-central.yaml` (项目级别)
3. 当两个文件都不存在时，使用内置的后备配置 `{ name: "project", path: ".skills", priority: 100 }`

## 用户级别层 (自 v0.2.0 起)

`skill-central add --user` 和 `skill-central install` (默认范围) 会写入 `~/.skill-central/skills/`：

```
~/.skill-central/
├── config.yaml           # 可选：显式用户层
├── skills/
│   ├── 01-global/
│   ├── 02-workflows/
│   ├── 03-domains/
│   └── 04-tech-stack/
│       ├── languages/
│       └── frameworks/
└── lock.json             # 记录安装来源
```

用户级别的技能优先级为 **5 / 15 / 25 / 35**（低于项目），因此项目总是可以覆盖它们。这反映了 `npm global vs local` 的模型：全局是基线；项目可覆写。

这四个子目录与项目 1:1 对应，以便层推断规则（基于层名称）在不同范围内统一工作。

## 覆写语义

```
层 A (优先级 10) 定义了 id=review-pr (宽松)
层 B (优先级 40) 定义了 id=review-pr (严格)

解析后的 id=review-pr = 层 B 的版本
```

在引擎 (`src/core/override-tree.ts`) 中，当两个层声明相同的 id 时，`insert()` 会保留优先级较高的条目。失败的条目会被静默覆盖——当您想知道冲突情况时，请使用 `skill-central doctor` 来发现它们。

```bash
$ skill-central doctor
...
▸ ⚠ Id collisions (1)
  (same id defined in multiple layers — higher priority wins)
  id: review-pr
    • [priority 20] 02-workflows → .skills/02-workflows/review-pr.yaml
    • [priority 40] 04-tech-stack/frameworks → .skills/04-tech-stack/frameworks/review-pr.yaml
```

## 基于标签的组合

除了基于 id 的覆写，IDE 还可以通过标签请求技能：

```json
GetPrompt({ name: "skills:compose", arguments: { tags: "kmp,android" } })
```

引擎 (`getSkillsByTags`) 返回所有其标签与请求集合有重叠的技能，按层优先级升序排列，然后组合器用 `---` 分隔符将它们连接起来。这会产生一个分层的提示：低优先级的上下文在前，高优先级的具体细节在后。参见 `src/core/composer.ts`。

## 为什么是四个层？

这种划分是**基于范围，而非技术**。v0.1.0 版本使用了 9 个层（每个技术栈一个），这迫使您在不同技术栈中重复相同的工作流技能。四层模型则表明：

- 如果是关于您如何思考代码 → `01-global`
- 如果是关于一个流程（审查、调试、提交）→ `02-workflows`
- 如果是关于一个领域（Docker、安全、数据）→ `03-domains`
- 如果是关于一种特定的语言或框架 → `04-tech-stack`

这使得工作流层保持小巧，并可在不同技术栈之间重用。如果您的项目需要更多层，可以在 `skill-central.yaml` 中添加——引擎并不关心。
