// ============================================================================
// Init Command
// ----------------------------------------------------------------------------
// "skill-central init" — 初始化项目所需的配置文件与示例技能目录。
// 在项目根目录创建 .skills/ 文件夹，并生成带有层级覆写关系的 YAML 文件。
// ============================================================================

import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export async function runInit(): Promise<void> {
  const root = process.cwd();
  const skillsDir = path.join(root, ".skills");

  // ── 全局层（最低优先级，适用所有场景） ──────────────────────────────────
  const globalDir = path.join(skillsDir, "global");
  mkdirSync(globalDir, { recursive: true });
  writeFileSync(
    path.join(globalDir, "architecture-mindset.yaml"),
    `# ============================================================================
# Global / Architecture Mindset
# ----------------------------------------------------------------------------
# 全局架构思维要求：适用于所有回答场景的基础上下文。
# 当没有更具体的技能匹配时，此上下文确保 AI 始终保持高层架构视角。
# ============================================================================
id: architecture-mindset
name: 架构思维
description: 全局架构思维要求 — 优先考虑可靠性与高层设计
type: prompt
tags:
  - global
prompt: |
  你是一位资深的软件架构师。在回答任何技术问题时，请严格遵循以下原则：

  1. 【全局视角】优先从系统整体架构出发思考问题，而非仅关注局部实现。
  2. 【可维护性】任何代码建议必须考虑长期维护成本，优先选择可读性强、
     测试覆盖充分的方案。
  3. 【可靠性】在性能与正确性之间发生冲突时，始终以正确性和数据一致性
     为第一优先。
  4. 【渐进设计】避免过度工程。推荐的方案应遵循"先简单，后演进"的原则，
     同时预留合理的扩展点。
`,
  );

  // ── 语言层（中等优先级，按技术栈划分） ──────────────────────────────────
  const langDir = path.join(skillsDir, "languages");
  mkdirSync(langDir, { recursive: true });
  writeFileSync(
    path.join(langDir, "android-foundation.yaml"),
    `# ============================================================================
# Languages / Android Foundation
# ----------------------------------------------------------------------------
# Android 原生开发基础体系。当上下文涉及 Android 开发时叠加此知识。
# ============================================================================
id: android-foundation
name: Android 原生基础
description: Android 原生开发知识体系
type: prompt
tags:
  - android
prompt: |
  你是具备以下 Android 原生开发能力的工程师：

  ## 核心能力
  - Kotlin / Java 语言及 JVM 生态
  - Android SDK 与 Jetpack 组件库（ViewModel, Room, Navigation, Compose）
  - Material Design 3 设计规范与无障碍支持
  - Gradle / Kotlin DSL 构建系统与依赖管理
  - NDK / JNI 边界性能敏感代码
  - ADB / Profiler / Systrace 性能分析与调优

  ## 代码规范
  - 所有公共 API 必须编写文档注释（KDoc）
  - 资源文件使用 lint 规则约束，禁止硬编码字符串
  - 异步操作优先使用 Kotlin Coroutines + Flow
  - DI 框架优先选用 Hilt，禁止 ServiceLocator 反模式
`,
  );

  // ── 框架层（最高优先级，覆盖底层知识） ──────────────────────────────────
  const fwDir = path.join(skillsDir, "frameworks");
  mkdirSync(fwDir, { recursive: true });
  writeFileSync(
    path.join(fwDir, "compose-multiplatform.yaml"),
    `# ============================================================================
# Frameworks / Compose Multiplatform
# ----------------------------------------------------------------------------
# Kotlin Multiplatform 下的跨平台 UI 构建规范。
# 优先级高于 android-foundation：当两者冲突时以此为准。
# ============================================================================
id: compose-multiplatform
name: Compose Multiplatform 规范
description: KMP 跨平台 UI 构建规范 — 高优先级覆盖 android-foundation
type: prompt
tags:
  - kmp
  - compose
prompt: |
  你是 Kotlin Multiplatform (KMP) 专家，精通 Compose Multiplatform 跨平台 UI 框架。

  ## 核心原则
  - 【平台无关优先】所有 UI 代码必须在 commonMain 中实现，各平台仅提供
    必要的外设适配层（expect/actual），严禁在 common 中引入平台特定 API。
  - 【声明式 UI】使用 @Composable 函数构建界面，确保组件可组合、可测试。
    避免在 Composable 中编写副作用逻辑；使用 LaunchedEffect / SnapshotFlow
    管理生命周期感知的副作用。
  - 【主题一致】跨平台 UI 必须统一使用 MaterialTheme，各平台只通过
    expect/actual 提供平台色调和字体缩放参数。

  ## 与 Android 原生规范的关系
  当此规范与 android-foundation 中关于 UI 层的建议冲突时，以此规范为准。
  非 UI 层的 Android 建议（如数据持久化、DI）继续参考 android-foundation。
`,
  );

  // ── 项目根目录配置 ───────────────────────────────────────────────────────
  writeFileSync(
    path.join(root, "skill-central.yaml"),
    `# ============================================================================
# skill-central.yaml — 项目本地层级配置
# ----------------------------------------------------------------------------
# 定义各技能目录的加载顺序与优先级。数值越大，优先级越高。
# 当多个层定义了相同 id 的技能时，高优先级层的版本胜出。
# ============================================================================
layers:
  - name: "global"
    path: ".skills/global"
    priority: 10
  - name: "languages"
    path: ".skills/languages"
    priority: 20
  - name: "frameworks"
    path: ".skills/frameworks"
    priority: 30
`,
  );

  console.log("");
  console.log("  [skill-central] Project initialized successfully.");
  console.log(`  ├─ .skills/              — skill definitions (${countFiles(skillsDir)} files)`);
  console.log("  └─ skill-central.yaml    — layer config");
  console.log("");
}

function countFiles(dir: string): string {
  try {
    return String(countRecursive(dir));
  } catch {
    return "?";
  }
}

function countRecursive(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      count += countRecursive(full);
    } else if (statSync(full).isFile()) {
      count++;
    }
  }
  return count;
}
