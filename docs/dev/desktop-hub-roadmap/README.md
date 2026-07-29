# skill-central 桌面 Hub 改造路线总览

## 1. 最终形态

`skill-central` 的最终形态建议定义为一个 local-first 的桌面端 AI 技能管理 Hub：

- 本地桌面应用负责管理 Skill、Prompt Template、Rule、Workflow、IDE Adapter 和本机 MCP Server。
- GitHub 登录负责身份、云端同步、备份、共享、发布和团队协作。
- IDE / Agent 仍然负责数据面能力，包括文件读写、终端命令、LSP、代码搜索、Diff 应用和用户确认。
- `skill-central` 作为控制面，负责技能资产治理、Prompt 组装、多端转译、动态注入、多 Agent 工作流调度和上下文路由。

核心原则是：**本地可独立运行，登录后增强同步与协作能力**。GitHub 登录不应成为本地使用的前置条件。

## 2. Layer System 总体原则

当前默认的 `01-global`、`02-workflows`、`03-domains`、`04-tech-stack` 可以继续作为入门 preset，但不能成为架构约束。升级后的层级系统应从“固定目录模板”演进为“可配置解析图”：

- 默认提供简单 preset，保证新用户开箱即用。
- 高级用户和团队可以自定义 layer、scope、priority、sync、trust、writable。
- 冲突解析必须确定、可解释、可审计。
- UI 默认隐藏 priority 数字，用“生效中 / 被覆盖 / 冲突 / 来源 / 可编辑性”解释结果。
- 同步和发布必须尊重 layer 的 visibility 与 sync policy。

Layer 描述的不是目录名，而是资产治理边界：

| 维度 | 说明 |
|---|---|
| `scope` | 影响范围：`user`、`workspace`、`repo`、`team`、`org`、`session` |
| `priority` | 冲突覆盖顺序 |
| `trust` | 来源信任级别：`local`、`remote`、`org`、`verified` |
| `writable` | 是否允许本地编辑 |
| `sync` | 是否参与 GitHub 同步 |
| `visibility` | `private`、`team`、`public` |
| `activation` | 自动启用条件 |

推荐默认体验收敛为三层：

| 默认层 | 面向用户含义 |
|---|---|
| Personal | 用户长期偏好 |
| Project | 当前项目规则 |
| Packages | 已安装的第三方或团队技能包 |

高级配置再展开为 Global、Personal、Team、Organization、Project、Tech Stack、Workflow、Session、Marketplace 等更多层级。

## 3. 阶段拆分

| 阶段 | 名称 | 目标 | 主要产物 |
|---|---|---|---|
| Phase 1 | 资产统一 | 建立 Universal Skill Schema、可配置 Layer System 与统一 Registry | v1 schema、legacy 兼容、layer config、校验、资产查询 |
| Phase 2 | 多端分发 | 将统一资产静态编译为各 IDE 方言 | compiler、adapter、dry-run、export、layer-aware 编译报告 |
| Phase 3 | 本地桌面 Hub | 将 CLI/Web Board 产品化为本地桌面控制台 | desktop shell、本地守护进程、MCP 管理、IDE 检测、一键连接、连接健康检查、layer UI |
| Phase 4 | GitHub 登录与云同步 | 引入身份、备份、跨设备同步和共享 | OAuth、sync engine、remote registry、layer sync policy、冲突处理 |
| Phase 5 | 动态调度 | 基于 MCP Resource / Tool 实现实时编排 | session、blackboard、workflow scheduler、动态注入 |

阶段顺序不是简单功能堆叠，而是风险递进：

1. 先稳定数据契约。
2. 再验证跨端输出是否成立。
3. 再把本地运行体验产品化。
4. 再引入远端状态。
5. 最后进入多 Agent 动态调度。

## 4. 阶段闸门

每个阶段都必须有可观测检查点。阶段结束时只能做三个决策：

| 决策 | 含义 |
|---|---|
| `Continue` | 关键验收全部通过，可以进入下一阶段 |
| `Continue with debt` | 主路径可用，但存在明确登记的非阻塞债务 |
| `Rework` | 核心假设失败或关键指标未达标，必须返工 |

不得用“基本可用”替代验收。每个阶段都要留下：

- 可运行命令。
- 可查看产物。
- 可复现测试。
- 已知问题清单。
- 是否进入下一阶段的判定记录。

## 5. 文档索引

- [Phase 1: 资产统一](./phase-1-asset-unification.md)
- [Phase 2: 多端分发](./phase-2-multi-ide-distribution.md)
- [Phase 3: 本地桌面 Hub](./phase-3-desktop-local-hub.md)
- [Phase 4: GitHub 登录与云同步](./phase-4-github-sync.md)
- [Phase 5: 动态调度](./phase-5-dynamic-orchestration.md)
- [Phase 4/5 执行规划：桌面优先的同步与编排](./phase-4-5-execution-plan.md)
- [执行规划](./execution-plan.md)

## 6. 总体验收指标

项目完成到 Phase 5 后，应满足：

- 用户可以在不登录的情况下管理本地技能库并注册到至少一个 IDE。
- 用户登录 GitHub 后，可以同步个人 Skill、Prompt Template 和 Rule。
- 用户可以从默认 layer preset 起步，也可以自定义 layer；冲突解析结果可解释。
- 用户可以对支持的 IDE 执行一键连接；无法全自动时退化为 guided connect，并保留配置预览、备份和回滚。
- 用户可以在桌面端测试 IDE 与 `skill-central` 的 MCP 连接状态；连通时显示已加载 Skill 数量，且与主看板一致。
- 同一份 Universal Skill 可以编译到至少两个 IDE 目标端。
- IDE 能力不足时系统能降级，而不是崩溃。
- 多 Agent Workflow 不依赖全量历史上下文，而是通过 Blackboard topic 路由关键信息。
- 所有 Skill 安装、编译、同步、降级和 Workflow 状态变化都有可审计记录。
