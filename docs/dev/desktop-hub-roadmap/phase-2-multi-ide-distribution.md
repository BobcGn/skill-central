# Phase 2: 多端分发

## 1. 阶段目标

将 Universal Skill 编译为不同 IDE 可消费的静态产物。这个阶段的重点是证明“同一份 Skill 源格式，多端转译”成立，并建立 capability check 与 graceful degradation 的基础。

Phase 2 完成后，用户应能运行 dry-run 查看某个 Skill / intent 会为 Cursor、Windsurf 或 Generic MCP 生成什么内容，以及目标端能力不足时如何降级。

## 2. 范围

包含：

- Compiler 抽象。
- Target Adapter 接口。
- Cursor / Windsurf / Generic MCP 首批 Adapter。
- layer-aware 编译输入与报告。
- Capability matrix。
- Degradation 编译。
- `compile --dry-run` 和 `export` CLI。

不包含：

- 桌面端 UI。
- GitHub 登录。
- 云端同步。
- 实时 Workflow 调度。

## 3. 任务拆解

### 3.1 Compiler 核心

任务：

- 实现 `compileSkill()` 和 `compileIntent()`。
- 输入 Universal Skill、target、capabilities、context。
- 输出 `CompiledSkillBundle` 和 `AdapterArtifact[]`。
- 编译报告必须展示 Skill 来源 layer、是否覆盖其他 Skill、是否来自只读或远程 layer。
- 编译过程不直接写文件。

产出：

- `src/compiler/compiler.ts`
- `src/compiler/prompt-bundle.ts`
- `src/compiler/degradation.ts`

检查点：

- 编译同一个 Skill 多次输出稳定。
- dry-run 能展示选择了哪些技能和原因。
- dry-run 能展示 layer 解析链：selected、shadowed、conflict。
- 编译结果包含降级说明和目标端约束。

返工触发：

- compiler 直接依赖具体 IDE 文件路径。
- 编译过程产生副作用，无法 dry-run。
- Prompt 拼接仍然是无结构字符串拼接，无法注入策略、上下文和输出 schema。
- 编译结果无法解释为什么选中了某个 layer 中的 Skill。

### 3.2 Target Adapter

任务：

- 定义 `TargetAdapter` 接口。
- 实现 `generic-mcp` adapter。
- 实现 `cursor` adapter。
- 实现 `windsurf` adapter。
- Adapter 输出统一 `AdapterArtifact`。

产出：

- `src/adapters/types.ts`
- `src/adapters/generic-mcp.ts`
- `src/adapters/cursor.ts`
- `src/adapters/windsurf.ts`

检查点：

- 同一 Skill 可输出至少两个目标端产物。
- Adapter snapshot 测试稳定。
- Adapter 不读取项目业务文件。
- Adapter 输出包含来源注释或 metadata，便于用户追踪产物来自哪个 Skill / layer。

返工触发：

- Adapter 中充满针对单个 Skill 的硬编码。
- Adapter 之间无法共享 Prompt Bundle。
- 目标端产物不可预览或不可审计。

### 3.3 Capability Matrix

任务：

- 建立目标端能力声明文件。
- 支持 `supported`、`partial`、`unavailable`、`unknown`、`requires-user-approval`。
- 编译前执行 capability check。

产出：

- `src/adapters/capabilities/*.yaml`
- `skill-central capabilities --target <target>`

检查点：

- CLI 能打印目标端能力矩阵。
- required capability 缺失时进入降级或 unavailable。
- unknown 能力默认保守处理。

返工触发：

- capability 只用 boolean，无法表达需要用户确认或部分支持。
- 缺失 required capability 时仍然生成自动化指令。
- 目标端能力写死在 compiler 内部。

### 3.4 Graceful Degradation

任务：

- 实现 `manual-instructions`、`prompt-only`、`omit-step`、`ask-user`、`static-export`、`unavailable`。
- 每次降级写入编译报告。
- 降级结果必须是 IDE 可消费的产物。

产出：

- `DegradationReport`
- 编译报告 schema。
- 降级测试用例。

检查点：

- 不支持 Bash 的目标端会生成手动执行指南。
- 不支持 MCP Tool 的目标端可以退化为 Prompt。
- 无法降级时返回明确不可用原因和替代路径。

返工触发：

- 能力不足导致 CLI 抛异常退出。
- 降级后产物缺少用户下一步动作。
- 降级没有审计记录。

### 3.5 CLI 下发

任务：

- 新增 `compile --target ... --dry-run`。
- 新增 `export --target ... --out ...`。
- 写入前做冲突检测和备份。
- 支持只输出到 stdout 供用户检查。

产出：

- `src/commands/compile.ts`
- `src/commands/export.ts`

检查点：

- dry-run 不写任何文件。
- export 会列出将写入的文件。
- 如果目标文件已存在且内容不同，默认不覆盖。

返工触发：

- export 静默覆盖用户文件。
- dry-run 与实际 export 结果不一致。
- CLI 输出无法解释编译决策。

## 4. 可观测指标

| 指标 | 目标 |
|---|---|
| 首批 Adapter 数量 | 至少 3 个：generic-mcp、cursor、windsurf |
| 编译可复现性 | 同输入输出 hash 一致 |
| dry-run 副作用 | 0 文件写入 |
| 降级覆盖 | required / optional / unknown 能力均有测试 |
| layer provenance | 100% 编译产物可追踪到 Skill id 和 layer |

## 5. 阶段验收命令

```bash
npm test
npm run build
skill-central compile --target cursor --intent review-pr --dry-run
skill-central compile --target windsurf --intent review-pr --dry-run
skill-central capabilities --target cursor
```

## 6. 阶段决策

可以进入 Phase 3 的条件：

- Universal Skill 可以被静态编译到至少两个 IDE。
- capability check 和 degradation 行为可测试、可审计。
- dry-run 与 export 产物一致。
- 编译报告能解释 layer 覆盖链和 shadowed Skill。
- 不发生静默覆盖。

必须返工的条件：

- Adapter 设计无法支持第三个 IDE。
- 编译产物与 Skill 源格式强耦合，无法维护。
- 降级策略只是错误提示，不能给用户可执行路径。
- 编译过程绕过 layer 冲突结果，导致 CLI / UI / MCP 看到不同 Skill。
