# 层级覆写

技能存在于 layer 中。layer 不再只是带 priority 的目录，而是资产治理边界，包含 scope、trust、writable、sync policy 和 visibility。

旧的四层布局仍然可用。现有 `skill-central.yaml` 会被自动提升为完整 layer 配置。

## 旧四层 Preset

运行 `skill-central init` 后，项目包含：

```text
.skills/
├── 01-global/                priority 10
├── 02-workflows/             priority 20
├── 03-domains/               priority 30
└── 04-tech-stack/
    ├── languages/            priority 40
    └── frameworks/           priority 40
```

| Layer | 用途 | 提升后的 scope | Sync |
|---|---|---|---|
| `01-global` | 通用上下文 | `user` | on |
| `02-workflows` | 跨领域工作流模式 | `workspace` | off |
| `03-domains` | 领域知识 | `workspace` | off |
| `04-tech-stack` | 语言/框架约定 | `workspace` | off |

## 配置 Schema

旧配置仍然有效：

```yaml
layers:
  - name: "01-global"
    path: ".skills/01-global"
    priority: 10
```

新配置可以描述完整治理边界：

```yaml
layerPresets:
  active: default

layers:
  - id: personal
    name: Personal
    path: ~/.skill-central/skills/personal
    scope: user
    priority: 10
    writable: true
    trust: local
    sync:
      enabled: true
    visibility: private

  - id: project
    name: Project
    path: .skills/project
    scope: workspace
    priority: 50
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private

  - id: packages
    name: Packages
    path: .skills/packages
    scope: workspace
    priority: 30
    writable: false
    trust: remote
    sync:
      enabled: true
    visibility: private
```

| 字段 | 说明 |
|---|---|
| `id` | 稳定 layer id。legacy 配置缺失时从 `name` 推导。 |
| `name` | 人类可读名称。 |
| `path` | Skill 目录。支持展开 `~`。 |
| `scope` | `user`、`workspace`、`repo`、`team`、`org` 或 `session`。 |
| `priority` | 主要覆写顺序。数字越大优先级越高。 |
| `writable` | 是否允许本地编辑。 |
| `trust` | `local`、`remote`、`org` 或 `verified`。 |
| `sync.enabled` | 是否参与后续同步。 |
| `visibility` | `private`、`team` 或 `public`。 |
| `activation` | 可选的未来激活元数据。 |

## 解析规则

当多个 layer 定义同一个 skill `id` 时，`OverrideTree` 按以下顺序解析：

1. 更高 `priority` 胜出。
2. priority 相同时，scope distance 更小者胜出。
3. priority 和 scope distance 都相同时，进入 `conflicted`。

当前 scope distance 以 workspace 执行上下文为基准：

| Scope | Distance |
|---|---:|
| `session` | 0 |
| `workspace` / `repo` | 1 |
| `user` | 2 |
| `team` | 3 |
| `org` | 4 |

Conflicted skill 不会出现在 effective skill list 或 MCP prompt/tool handler 中。这样可以避免两个候选无法消歧时产生随机行为。

## Doctor 输出

`skill-central doctor` 是 layer resolution 的审计入口。它会报告：

- layer 治理元数据
- legacy/universal/invalid skill 数量
- id collision
- effective 与 shadowed 覆盖链
- 显式 conflict 原因

示例：

```text
▸ Layer resolution audit (1)
  id: review-pr  [resolved]
    reason: resolved by priority or scope distance
    • status=effective layer=Project scope=workspace priority=50 format=legacy
    • status=shadowed layer=Personal scope=user priority=10 format=legacy shadowedBy=Project
```

Conflict 示例：

```text
id: review-pr  [✗ conflict]
  reason: same priority (50) and same scope distance (1)
```

## 基于标签的组合

基于 tag 的组合仍然返回 effective prompt skills，并按 priority 升序拼接 prompt section。Shadowed 和 conflicted 候选会被排除，因为 `engine.listSkills()` 只返回 effective records。

TODO: Phase 1C 会把 id/type/tag/intent/capability 过滤移动到共享 Registry Query API。
