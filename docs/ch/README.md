# Skill Central 文档

[English](../en/README.md)

本目录存放 Skill Central 的公开中文技术文档，描述当前 `main` 分支已经实现的行为。产品安装与首次使用说明保留在根目录 [README](../../README.zh-CN.md)，贡献规则见[中文贡献指南](../../CONTRIBUTING.zh-CN.md)。

## 文档导航

| 文档 | 读者 | 内容 |
| --- | --- | --- |
| [系统架构](./architecture.md) | 贡献者与维护者 | 运行入口、模块边界、数据流和架构不变量 |
| [Skills 与 Layers](./skills-and-layers.md) | Skill 作者与贡献者 | Skill Schema、Layer 治理、解析、编译与 MCP 暴露 |
| [IDE 集成](./ide-integration.md) | 使用者与集成贡献者 | 支持的 IDE、配置发现、连接事务与健康检查 |
| [启动即识别](./startup-agent-recognition.md) | 使用者与集成贡献者 | 启动后让 Coding Agent 发现并使用 Skill Central 的边界、流程和任务规划 |
| [数据与安全](./data-and-security.md) | 使用者、审查者与安全贡献者 | 本地数据位置、信任边界、凭据、备份与 Alpha 限制 |
| [开发指南](./development.md) | 贡献者 | 仓库结构、本地开发、测试和变更要求 |
| [发布与更新](./release-and-updates.md) | 维护者与打包贡献者 | 发布不变量、产物、更新方式和平台限制 |

## 事实来源

当文档与代码不一致时，以实现为准。主要事实来源包括：

- CLI 参数定义在 [`src/index.ts`](../../src/index.ts)。
- Skill 与 Layer 契约定义在 [`src/schema/`](../../src/schema) 和 [`src/storage/`](../../src/storage)。
- 反向输出行为定义在 [`src/reverse-output/service.ts`](../../src/reverse-output/service.ts)，
  CLI 与专项集成覆盖在 [`scripts/test-reverse-output.mjs`](../../scripts/test-reverse-output.mjs)。
- IDE 目标及其路径定义在 [`src/ide-detection/registry.ts`](../../src/ide-detection/registry.ts)。
- Board API 定义在 [`src/web/server.ts`](../../src/web/server.ts)。
- 打包和发布行为定义在 [`electron-builder.yml`](../../electron-builder.yml) 与 [`.github/workflows/release.yml`](../../.github/workflows/release.yml)。

公开文档不承诺路线图中的工作。实验性或尚未完成的行为必须显式标注。

## 文档规则

- 行为发生变化时，英文与简体中文文档必须同步修改。
- 公开文档分别存放在 `docs/en/` 与 `docs/ch/`。
- `docs/dev/` 是维护者个人开发记录目录，由 Git 忽略。
- `logs/` 存放私有执行证据，同样由 Git 忽略。
- 不得在公开文档中发布凭据、私有路径、事故证据或推测性内部计划。

文档修正与代码变更使用相同的 Fork + Pull Request 流程。
