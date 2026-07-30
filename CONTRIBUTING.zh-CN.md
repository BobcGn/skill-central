# 为 Skill Central 贡献

[English](./CONTRIBUTING.md)

感谢你的贡献。Skill Central 目前处于 Alpha 阶段，它会写入 IDE 配置、管理本地 Skill，并可能同步 Registry 数据。小错误也可能影响用户凭据或配置，因此所有贡献都必须保持聚焦、可测试，并明确说明边界。

## 开始之前

- 创建 Issue 前先搜索已有内容。
- 使用 Bug、Feature 或 Question 表单，不使用空白 Issue。
- 按 [SECURITY.md](./SECURITY.md) 私密报告漏洞。禁止在公开 Issue 中发布利用细节或凭据。
- 大型功能、schema/protocol 变更、新依赖、认证流程、更新器改动或前端框架迁移，应先创建 Issue 并确认范围。
- 小型错误修复、测试和文档修正通常可以直接提交 PR。

## 开发环境

要求：

- Node.js 22 或 24
- 所选 Node.js 版本附带的 npm
- 仅在测试桌面包时需要对应平台工具链

```bash
git clone https://github.com/<your-account>/skill-central.git
cd skill-central
npm ci
npm run lint
npm test
```

常用开发命令：

```bash
npm run dev:board
npm run dev:desktop
npm run dev:mcp
npm run build:desktop
```

## 仓库结构

| 范围 | 位置 |
| --- | --- |
| CLI 命令 | `src/commands/` |
| Skill 引擎、Schema、编译器 | `src/core/`、`src/schema/`、`src/compiler/` |
| IDE 检测与连接事务 | `src/ide-detection/`、`src/connect/`、`src/health/` |
| MCP 协议与 Workflow 状态 | `src/protocol/`、`src/scheduler/`、`src/state/` |
| GitHub 认证与同步 | `src/auth/`、`src/sync/` |
| 桌面应用与软件更新 | `src/desktop/`、`src/update/` |
| 本地 Web Board | `src/web/`、`src/web/static/` |
| 集成测试 | `scripts/test.sh` |
| CI 与发布自动化 | `.github/workflows/` |

## 贡献流程

1. Fork 仓库。外部贡献者不会获得直接写权限。
2. 从最新 `main` 创建聚焦分支，例如 `fix/ide-detection` 或 `feat/skill-filter`。
3. 行为变更需要关联 Issue；大型改动应在编码前确认范围。
4. 遵循现有实现模式，不混入无关清理。
5. 根据风险补充或更新测试。
6. 在本地运行必需检查，并在 PR 中记录准确结果。
7. 将分支推送到自己的 fork，向 `BobcGn/skill-central:main` 创建 PR。
8. 解决 review 对话，并在最后一次推送后重新运行检查。

## 项目边界

- `docs/` 与 `logs/` 是维护者本地资料，已明确从公开分支排除，不得加入 PR。公开说明应放在根目录 README、贡献/安全文档、Issue 模板或必要的代码注释中。
- 禁止提交 `node_modules/`、`dist/`、`release-artifacts/`、本地 `.skills/`、真实 IDE 配置、token、OAuth secret 或私有仓库路径。
- IDE 配置写入必须继续经过 plan、preview、backup、apply、verify、rollback 阶段，不得为了方便绕过事务。
- 浏览器触发的高权限操作必须保持 loopback 边界，适用时校验 Origin，且不得接收任意命令文本。
- 新增 IDE 支持必须端到端完成：registry metadata、候选路径、config codec、检测、连接计划、应用/验证/回退、UI metadata 和回归测试。
- 前端工作必须保持原生 HTML/CSS/JavaScript 架构、中英文词典、system/light/dark 主题、键盘焦点和桌面/移动布局；框架迁移需提前批准。
- 新增或升级依赖必须说明明确需求、生产/完整审计结果和打包影响。
- Release、tag、签名、包发布和仓库权限变更仅由维护者执行。
- 禁止“顺手重构”。一个 PR 应只有一个可审查目标和清晰的回退单元。

## 验证要求

所有代码改动都必须通过：

```bash
npm run lint
npm test
```

还应根据改动执行对应检查：

- Web 静态资源：`npm run build:web`，检查桌面/移动布局、溢出、控制台错误，以及 loading、empty、success、error 状态。
- Registry 性能：query、resolution 或索引行为变化时运行 `npm run test:registry-perf`。
- 桌面改动：运行 `npm run build:desktop`；打包或更新器变化时，在受影响平台完成打包与真实启动。
- 文档/模板：运行 `git diff --check`，检查 Markdown 链接、YAML 解析和中英文一致性。
- 安全敏感改动：加入负向测试，证明受保护边界无法绕过。

不要声称执行了实际未运行的平台测试。缺失覆盖及原因必须明确写出。

## PR 审查

`main` 已受保护。PR 必须通过配置的 CI checks，获得维护者/Code Owner 批准，并解决所有 review 对话。新 commit 会使旧批准失效，最后一次推送的作者不能提供最终批准。

当 PR 包含无关修改、大量生成差异或多个风险范围，导致审查不可靠时，维护者可以要求拆分。CI 通过不能替代对行为、安全边界和用户文案的人工审查。

## 许可

提交贡献即表示你同意按仓库的 [MIT License](./LICENSE) 提供该贡献。当前不要求签署 Contributor License Agreement。
