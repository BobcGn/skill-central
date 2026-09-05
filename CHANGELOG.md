# 更新日志

本文件记录 `skill-central` 的重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

## [1.1.2] - 2026-09-05

### 修复

- **Coding Agent 后台进程累积**：桌面应用改为在现有 Board 回环服务中提供共享的
  Streamable HTTP MCP 端点，并将 Codex、Claude Code、Cursor 等检测到的 Agent 注册到该
  端点；多个 Agent 会话不再分别常驻一个 `skill-central mcp` stdio 子进程。健康探测会显式
  终止临时 HTTP 会话，切换工作区、重载资产库和退出桌面应用时也会回收所有共享会话。
- **生产依赖安全公告**：将 `fast-uri` 与 `qs` 约束到已修复版本，确保正式版生产依赖审计
  不包含已知高危或中危项。

### 兼容性说明

- 独立 CLI、源码开发和手工集成继续支持 `skill-central mcp` stdio 模式。升级桌面应用后需
  重启或重新加载已打开的 Coding Agent，使其读取更新后的本地 HTTP MCP 配置；升级前已经
  启动的 stdio 子进程仍由原 Agent 会话负责退出。

## [1.1.1] - 2026-09-01

### 修复

- **macOS/Windows MCP 轻量进程**：打包应用写入 IDE、桌面 Runtime 和健康探测的 MCP
  启动项统一使用 `ELECTRON_RUN_AS_NODE=1` 执行内置 CLI；macOS 不再为每个 MCP 连接
  创建第二棵 Electron/Chromium Helper 进程树，Windows 保持可靠的 stdio stdout。
- **后台空闲内存**：桌面 Board 不再自动启动仅供 Runtime 控制台使用的本地 MCP；需要时
  可从 Runtime 页面手动启动，未启动时不会占用额外常驻进程。
- **子进程泄漏与竞争**：Runtime 启停/重配改为单实例生命周期，POSIX 按进程组、Windows
  按进程树清理；健康探测超时会主动关闭 transport 并等待子进程回收，启动识别改为顺序探测，
  避免长期运行或重复检查后累积进程。

### 兼容性说明

- stdio MCP 继续由每个活跃 Coding Agent 分别持有一个轻量 Node 进程；本版本不引入共享
  daemon。升级后请重新加载 Agent 的 MCP 连接，使 1.1.0 写入的旧启动项刷新为 Node 模式。

## [1.1.0] - 2026-08-11

### 新增

- **跨平台默认资产库**：首次启动自动创建 `<home>/.skill-central/skills` 与 `rules`；Board、
  CLI 和 MCP 默认共享该根目录，同时保留 `skill-central.yaml` 作为显式项目 Layer 覆盖。
- **显式统一资产库**：个人设置与 Sync 页均可选择一个同时包含 `skills/`、`rules/` 的自定义
  根目录；选择持久化，并可直接恢复默认隐藏目录而无需在 Finder/Explorer 中手工展开。
- **目录语义分离**：Sync 页分别展示本地 Asset Library 与 Registry checkout，后者只用于同步
  计划，不再让“选择 Registry”看起来像已经切换 Skill/Rule 来源。
- **资产库边界测试**：覆盖空 Home 初始化、幂等启动、目录合法性、取消、Same-Origin、持久化、
  恢复默认、CLI/MCP 同源发现、`add --user` 写入与备份/模板忽略行为。

### 修复

- **危险同步删除**：Registry 缺失、不可读、manifest 无效、Layer 路径越界或本地 Layer
  物理路径重叠时，计划与应用会在任何资产写入前失败；`/~/.skill-central` 不再被误解为 Home。
- **缺失不再等于删除**：Registry v1 没有 tombstone 删除证据，因此 pull 中远端缺失会保留
  本地文件，push 中本地缺失会保留远端文件；旧版 `delete-local/delete-remote` 计划即使带
  `--force` 也会被预检阻断。
- **层级目录回归**：默认/自定义资产库专项测试使用多层 `skills/**` 与 `rules/**`，并通过
  Board/CLI/MCP 同源加载门禁；真实用户设置不再污染集成测试。
- **macOS 退出残留进程**：`Command+Q` 现在会等待本地 MCP Runtime 与 Board listener 完整
  关闭后再退出；SIGTERM 无响应的子进程会被可靠 SIGKILL 并回收，不再因误读 `child.killed`
  而留在活动监视器中。
- **默认来源缺失**：修复桌面应用从普通工作区启动时回退项目 `.skills/.rules`、导致
  `~/.skill-central/{skills,rules}` 无法显示的问题。
- **选择目录不刷新**：资产库选择现在会重载 Skills/Rules 并重配本地 MCP Runtime；Registry
  目录选择继续保持独立，不会静默覆盖资产源。
- **双栏滚动**：Skills 与 Rules 的左侧索引、右侧详情改为独立滚动容器；选择列表末尾条目时，
  详情从顶部打开且列表位置保持不变。
- **不可见用户资产**：`skill-central add --user` 写入选中的自定义库或默认 Home 资产库；普通
  `add` 在非项目配置模式下跟随当前资产库，避免创建后无法被 Board/MCP 发现。

### 兼容性说明

- 1.0.0 的 Home 目录结构继续作为跨项目默认来源，但不再解析旧 `config.yaml` 来隐式合并任意
  Layer；默认只递归读取固定的 `skills/`、`rules/` 子目录。
- 已有内容不会被删除或迁移；`*.bak.*` 与 `_` 前缀模板仍不作为生效资产。自定义根也必须使用
  相同的两个子目录，且 Board、CLI、MCP 始终共享选择结果。
- Asset Library 与 Registry checkout 必须是两个目录。Registry 必须含有效 `manifest.yaml`
  和受限于 `layers/` 的唯一 Layer 路径；普通资产库根不能直接作为同步 Registry。
- 正式平台与 Agent 范围保持不变：macOS x64/arm64、Windows x64；Codex、Claude Code、Cursor。

## [1.0.0] - 2026-08-11

### 新增

- **正式 Agent 支持范围**：首个正式版支持 Codex、Claude Code 与 Cursor；Trae、
  Windsurf、Cline 保留实验性注册能力并明确标记为未完整验证。
- **全局技能与规则消费**：自动加载 `~/.skill-central/skills` 用户全局技能层；MCP
  通过 Resources、Prompts 与 Tools 直接暴露全局/项目 Rules，并保持项目同 ID 覆盖
  全局规则的确定性优先级。
- **启动识别与修复**：桌面启动时检测正式 Agent 的 MCP 配置，安全刷新漂移项，并在
  Agent 配置已经存在时自动补登记 Skill Central；不会为未安装的 Agent 创建配置。
- **正式发布门禁**：新增独立 MCP 协议消费测试、发布风险检查、生产/完整依赖审计，
  并由原生 macOS 与 Windows GitHub Actions 构建安装包。

### 修复

- **健康检查一致性**：Rule Prompt/Tool 不再被误判为 Skill 漂移；MCP 探测子进程会继承
  `SKILL_CENTRAL_*` 运行时覆盖，避免父子进程加载不同资产根目录造成假告警。
- **供应链风险**：升级 Hono、js-yaml 及受影响的传递依赖，消除发布依赖树的已知
  npm audit 漏洞。

### 兼容性与限制

- 桌面正式发布目标为 macOS x64/arm64 与 Windows x64；Linux 留待后续版本。
- macOS 当前使用 ad-hoc 签名且未公证。推荐通过 Homebrew 安装；直接下载被
  Gatekeeper 阻止时，按 README 中的校验与 quarantine 处理步骤操作。
- IDE 反向输出保留为可用的实验性控制面，1.0.0 的首要保证是 Agent 能发现并消费
  Skills 与 Rules。

## [1.0.0-rc.3] - 2026-08-02

### 修复

- **macOS 应用内更新安装签名校验**：`mac.identity: null` 会保留 Electron 模板的失效
  ad-hoc 签名（seal 与替换后的内容不一致），导致 electron-updater 安装更新时
  `SecStaticCodeCheckValidity` 失败（"代码不含资源，但签名指示这些资源必须存在"）。
  改为对整个 bundle 做 ad-hoc 签名（`identity: "-"`）并关闭 hardened runtime，重新
  seal 后严格签名校验通过；仍未公证，Gatekeeper/quarantine 行为保持不变。
- **更新错误封装**：桌面应用检查更新失败时，不再把原始 HttpError（含请求 URL、响应头、
  堆栈上下文）直接展示给用户。新增更新错误分类器，将失败映射为稳定错误码与简练原因
  （发布尚未就绪 / 网络不可达 / 服务器拒绝 / 未知错误），前端以中英文双语文案优雅
  提示；原始错误仅进入诊断日志，不进入 UI。

## [1.0.0-rc.2] - 2026-08-02

### 修复

- **macOS 双 Dock 图标**：桌面应用启动的本地 MCP Runtime 子进程（同一 App 可执行文件
  的第二个 Electron 实例）默认以 Regular 激活策略运行，会在程序坞额外生成一个图标。
  MCP 分支现在在 macOS 上显式调用 `app.dock.hide()`，使程序坞只保留主应用一个图标。
  IDE 通过一键连接写入的 `Skill Central.app/.../Skill Central mcp` 配置同样受益。

### 变更

- **打包产物清理**：`npm run package:mac|win` 打包成功后自动删除 electron-builder 在
  输出目录留下的解包应用副本（`mac/`、`mac-arm64/`、`win-unpacked/`、`__msi-*` 等），
  `release-artifacts/` 只保留最终交付物（dmg/zip/exe/msi/blockmap/yml）。系统中不再
  存在与正式安装并行的多余可运行应用副本；清理逻辑跨 macOS/Windows，目录名固定且
  绝不删除交付物文件。
- **非安装位置启动防御**：桌面应用若从构建产物/解包目录启动（如
  `release-artifacts/…`、`win-unpacked/…`），会输出警告提示安装正式版本到
  `/Applications`（macOS）或 `Program Files`（Windows）；路径检测对分隔符与大小写
  不敏感，兼容各平台。

## [1.0.0-rc.1] - 2026-08-02

### 修复

- **本地 MCP Runtime**：桌面应用启动时默认启动一个本地 MCP stdio Runtime，并使用与
  IDE 一键连接相同的打包可执行文件入口。
- **Runtime 状态保持**：`LocalRuntimeManager` 保持 stdio stdin 打开，避免 MCP Server
  空闲时立即退出并让 Board Runtime 状态从 `running` 回到 `stopped`。

### 变更

- **正式版候选验证**：rc.1 用作公开 Prerelease 测试入口，验证 Homebrew、DMG、
  应用内更新、真实 IDE 连接、GitHub 同步和 IDE 反向输出路径是否达到 `1.0.0` 正式发布条件。

## [1.0.0-alpha.3] - 2026-08-02

### 新增

- **IDE 反向输出 MVP**：新增 `reverse_output` MCP Tool 和
  `skill-central reverse-output` CLI，支持预览、Promote、Defer、Discard、
  Rollback，并将工作中沉淀的内容安全写回 Skill Layer 或 `.rules/`。
- **反向输出治理**：新增 Skill、Skill Central 公约 Rule、IDE 原生 Rule 的术语、
  边界划分法则和 Promote 检查点；Skill 作为持续演进的主要数字资产，Rule 仅在
  属于跨 IDE 公约时进入规则库。

### 修复

- **桌面更新检查**：统一 macOS 与 Windows 的 GitHub Release 检查路径，macOS
  不再因 Homebrew Tap 或 Cask 归属状态而无法检查更新。
- **IDE MCP 连接状态**：打包桌面应用连接 IDE 时使用当前 App Bundle 内的 MCP
  可执行文件，修复连接后显示 `server-stopped` 的问题。

### 变更

- **反向输出安全门禁**：增加 Schema、作用域、重复、冲突、路径遍历、SHA-256
  并发保护、原子写入、Backup、写后校验和审计记录。

## [1.0.0-alpha.2] - 2026-08-01

### 新增

- **独立 Rules 规则库**：新增 `skillcentral.dev/rule/v1` 契约、`.rules/` 独立存储与查询边界，以及 `rules`、`validate-rule` CLI；坏规则会被隔离，不影响其余规则或 Skill 加载。
- **Rule/Skill 项目作用域**：两类资产共用 `appliesTo` 契约，支持 global、单项目和多项目过滤；`scope` CLI 与 Web Board 可检测稳定项目身份，并以 Schema、Same-Origin 和 hash 并发保护原子修改源文件。Rule MCP 仍待消费模型确定。

### 修复

- **GitHub 连接**：桌面用户不再需要自行提供 OAuth App Client ID；正式安装包从项目级公开配置读取固定 Client ID，缺失配置会阻断打包并在开发界面显示明确状态。
- **GitHub 凭据安全**：正式桌面程序通过 macOS Keychain/Windows DPAPI 加密 Token，系统安全存储不可用时阻断登录；旧明文与损坏密文会清除并要求重新登录，认证 API 与日志只暴露脱敏错误码。
- **macOS 桌面生命周期**：关闭最后一个窗口后复用同一后台 Board 服务，通过 Dock、应用菜单或菜单栏图标恢复窗口，并以单实例运行。
- **macOS Homebrew 更新**：识别 Homebrew 6 Tap 信任状态，正确处理 `brew outdated` 的更新退出码，以固定 SHA 升级并在重启前核验安装版本。
- **亮暗色主题**：补齐侧栏与输出区域的主题变量，使手动主题和系统主题保持一致。

### 变更

- **Homebrew 供应链**：Cask 固定 macOS 双架构 SHA-256；发布流水线从真实 DMG 生成 Cask 更新 PR。
- **预发布验证**：新增本地候选 Tap、只读 macOS/Homebrew 诊断和真实 GitHub Device Flow 安全验收工具。

## [1.0.0-alpha.1] - 2026-07-30

### 新增

- **桌面应用内更新**：Windows 使用 GitHub Release + NSIS 自动下载更新；macOS Homebrew Cask 安装会在应用内检查并执行升级。
- **IDE 连接扩展**：新增 Codex 与 Trae，完善 Claude，并统一 Codex/Claude/Trae/Cursor/Windsurf/Cline 的检测、计划、应用、验证与回退流程。
- **个人设置**：新增 GitHub Device Flow、system/light/dark 主题和中英文界面切换。

### 变更

- **Web Board 信息架构**：Skills、IDE Connections、Sync、Runtime 移入左侧导航，个人设置固定在左下角，并补齐移动端布局。
- **macOS 安装**：新增 Homebrew Cask；未签名构建使用 `--no-quarantine` 安装。
- **发布资产**：Windows Release 增加 NSIS、`latest.yml` 和 blockmap，macOS 增加更新元数据。
- **仓库边界**：`docs/` 与 `logs/` 改为本地资料，不再进入正式分支。

## [1.0.0-alpha.0] - 2026-07-29

### 变更

- **发布流程重构**：Release 不再发布 npm 包，只生成 GitHub Release 资产。
- **桌面安装包**：新增 macOS `.dmg`、Windows `.msi`，并同时产出程序 `.zip`。
- **源码压缩包**：Release 额外附带源代码 `.zip`，便于离线检查与测试。

## [0.4.0] - 2026-07-20

### 新增

- **`register` 命令**：新增 CLI 命令 `skill-central register [ide]`，用于把 `skill-central` 自动注入 IDE 的 MCP 配置，当前覆盖 Claude Desktop、Cursor、Windsurf 和 Cline。
- **`init` 自动注册**：`skill-central init` 现在会尝试检测本机 IDE，并自动注册 MCP Server。

## [0.3.0] - 2026-07-18

### 修复

- **MCP Stdio 协议**：将 `console.info` 和 `console.debug` 重定向到 `stderr`，避免污染 JSON-RPC 的 `stdout`。
- **MCP Tool 发现**：确保 `inputSchema` 格式严格符合 JSON Schema 要求，移除空的 `required` 数组，并严格要求 `type: "object"`。
- **MCP 异步时序**：在 prompt 和 tool handler 中加入 `waitForReady` 锁，避免引擎初始化完成前返回空列表。
- **MCP 描述符严格性**：为 tools 和 prompts 提供可靠的兜底描述，确保与 LLM 客户端兼容。

## [0.2.5] - 2026-06-16

### 新增

- **`lint` 脚本**（`tsc --noEmit`）：把 TypeScript 类型检查纳入发布门禁，防止类型错误进入发布包。
- **`test` 脚本**（`scripts/test.sh`）：新增 CLI 集成测试脚本，覆盖 `add`、`list`、`doctor` 核心命令，并通过 `pretest` 钩子自动构建后执行。
- **`pretest` 脚本**：确保 `npm test` 在任何环境下开箱即用，会自动执行 `npm run build && npm run build:web`。

### 变更

- **Release 流水线重构**（`release.yml`）：
  - 使用双触发机制：`push: tags` 和 `release: published`，并内置幂等保护。
  - 标准化 CI 步骤：`checkout -> npm ci -> lint -> build+test -> verify -> publish -> GitHub Release`。
  - 通过 `--provenance` CLI 标志、`NPM_CONFIG_PROVENANCE=true` 环境变量和 `publishConfig.provenance` 三层保障发布来源证明。
  - 预发布版本自动使用 `--tag next`，例如 `v1.0.0-beta.1` 不会覆盖 `latest`。
  - 权限配置新增 `attestations: write`。

## [0.2.4] - 2026-06-16

### 变更

- **通过 `release.yml` 重试 OIDC 发布**：已在 npmjs.com 重新配置 Trusted Publisher，本版本再次尝试 OIDC 的 `npm publish --provenance` 路径。

## [0.2.3] - 2026-06-16

### 变更

- **首次通过 Trusted Publisher OIDC 发布**：v0.2.3 是第一个通过 `.github/workflows/release.yml` 和 npm Trusted Publishing（OIDC）发布的版本。该工作流中的每次 `npm publish --provenance` 都会为 tarball 附加 Sigstore 签名的 provenance attestation，可通过 `npm view @bobcgn/skill-central@0.2.3 --json | jq .dist.attestations` 验证。

### 说明

- v0.2.2 是手动发布版本，未包含 provenance，因为当时还没有在 npmjs.com 配置 Trusted Publisher。从 v0.2.3 开始，所有发布都走 OIDC 工作流。

## [0.2.2] - 2026-06-16

### 变更

- **16 个项目 skill 文件已全部双语化**：每个 YAML 同时包含 `prompt:`（英文）和 `prompt_zh:`（中文）。此前 7 个大型技能（`backend-code-review`、`frontend-vue-review`、`readme-writer`、`database-review`、`ai-model-agent`、`kotlin-multiplatform`、`python-code-review`）只有部分英文翻译；现在它们拥有与中文原文深度和长度匹配的完整翻译，例如 `kotlin-multiplatform` 为 1085 行，`ai-model-agent` 为 1338 行。翻译由并行子 Agent 生成，并通过一个小型 Node 脚本合并回仓库。

### 说明

- 合并过程中，7 个受影响的 YAML 文件需要在 `prompt: |` 块内使用 2 空格缩进，因为 `js-yaml` 的 literal block 在第 0 列较脆弱。所有技能现在都遵循与可工作的 `error-handling-patterns.yaml` 相同的缩进约定。

## [0.2.1] - 2026-06-16

### 新增

- **`.github/workflows/release.yml`**：在 `v*` tag push 时自动发布 npm 包并创建 GitHub Release，使用 npm Trusted Publishing（OIDC）。`npm publish --provenance` 会给每个发布包附加 Sigstore 签名的 attestation。一次性设置见本地 `docs/trusted-publishing.md`：需要在 <https://www.npmjs.com/package/@bobcgn/skill-central/settings> 注册该 workflow。
- **`docs/trusted-publishing.md`**：完整说明 OIDC 信任握手流程，包括探测 tag 流程、四类常见失败模式和回滚方案。

### 修复

- **CLI `--version` 发布 0.2.0 后仍显示 `0.1.0`**：原因是 `src/index.ts` 硬编码了版本字符串。现在改为从单一来源读取：`src/version.ts` -> `VERSION`。
- **MCP `serverInfo.version` 同样显示 `0.1.0`**：原因相同，`src/mcp.ts` 的 `Server` 构造函数里硬编码了 `"0.1.0"`。现在改为读取 `VERSION`。
- **Web Board 在非项目根目录调用时崩溃**：从项目根目录以外运行时，例如在子目录执行 `npx skill-central board` 或 `node_modules/.bin/skill-central board`，曾出现 `Web assets not found at <cwd>/dist/web`。现在 `resolveWebRoot()` 会优先搜索基于 `import.meta.url` 推导出的脚本相对路径，最后才回退到基于 `cwd` 的路径。`src/commands/board.ts` 中 bind 前检查也调用同一个 resolver，保证两处行为一致。

### 变更

- 新增 `src/version.ts` 作为包版本的单一事实来源，构建时通过 `import ... with { type: "json" }` 内联 `package.json`，避免后续发布再次出现版本漂移。
- `.gitignore` 新增 `.ai/` 和 `.codex/`，这些相邻 AI 工具目录不应进入版本控制。

## [0.2.0] - 2026-06-15

### 新增

- **CLI 子命令**：为过去需要手写 YAML 的本地 CRUD 操作提供命令入口：
  - `add <id> [--tags ...]`：创建 skill，并根据 tag 推断 layer。
  - `list [--layer | --tag | --type]`：按条件筛选 skill 清单。
  - `show <id>`：展示完整 skill 详情和 prompt 正文。
  - `remove <id> [--layer]`：删除 skill 文件，并带有歧义保护。
  - `validate <files...>`：解析并校验引擎路径之外的文件。
  - `doctor`：扫描 layer，检查缺失目录、解析错误、id 冲突和孤立备份。
- **远程安装**：新增 `install <source>`，并配套 `update` 和 `uninstall`：
  - `github:<user>/<repo>/<path>[@<ref>`：通过 raw URL 直接拉取，并校验 sha256。
  - `npm:<pkg>[@<version>]`：通过 registry 和 tarball 提取安装，使用 `tar-stream` 与 `node:zlib`；包的 `package.json` 必须声明 `skill-central.paths`。
  - `~/.skill-central/lock.json` 记录每个已安装 skill 的 source、version、sha256、layer 和 filePath。
  - `update [id]` 会重新拉取，并保留原始 scope（project 或 user）。
  - `uninstall <id>` 删除文件和 lock entry；`--purge-backups` 会同时清理相邻的 `.bak.*` 文件。
- **Web Board**：`board` 命令默认打开本地 Hono Dashboard：
  - 可在浏览器中读取和编辑 skill，并通过 sha256 乐观并发控制处理冲突；冲突时返回 409 和当前内容。
  - 每次保存都会自动创建 `.bak.<ISO-no-colons>` 备份，且不会自动删除。
  - 备份面板支持一键恢复。
  - 默认端口为 `5417`，端口冲突时自动尝试 `+1..+10`。
  - 默认仅绑定 loopback；非 loopback 的 `--host` 必须显式传入 `--i-understand-nonlocal` 确认。
  - `--cli` / `--no-web` 标志保留 v0.1.0 的终端 fallback。
- **文档**：新增 `docs/` 目录和参考文档：
  - `docs/cli-reference.md`
  - `docs/web-board.md`
  - `docs/remote-sources.md`
  - `docs/skill-schema.md`
  - `docs/layered-override.md`
  - `docs/mcp-protocol.md`

### 变更

- **破坏性变更**：`skill-central board` 现在默认打开 Web Dashboard。终端表格输出可以通过 `board --cli` 或 `--no-web` 使用。
- 内部函数 `validateSkill`、`discoverSkillFiles` 和 `readAllLayers` 现在从 `src/storage/parser.ts` 与 `src/storage/reader.ts` 导出，供 CLI 使用。现有内部调用方保持不变。
- `src/board.ts` 移动到 `src/commands/board.ts`，并导出 `runBoard()` 和旧的 `showBoard()`。
- `ResolvedSkillView` 现在暴露 `priority`，Web Board 可展示来源元数据。

### 安全

- 安装：仅允许 HTTPS URL；每次 install/update 都校验 sha256。
- 安装：防御 tar-slip；npm tarball entry 必须以 `package/` 开头，并拒绝 `..` 和 `\`。
- 安装：拒绝 tarball source URL 中的 loopback host，降低 SSRF 风险。
- Web Board：默认绑定 `127.0.0.1`；非 loopback host 必须显式使用 `--i-understand-nonlocal`。
- Web Board：PUT 强制执行 sha256 冲突检测，并拒绝修改 id，避免遗留孤立原文件。

### 依赖

- 新增：`hono@^4.12.25`、`@hono/node-server@^2.0.4`、`tar-stream@^3.2.0`

## [0.1.0] - 2026-05-21

### 新增

- 首次公开发布到 npm。
- Stdio MCP Server，支持 prompt 和 tool 组合。
- 4 层 skill 目录：`.skills/01-global` 到 `.skills/04-tech-stack`。
- CLI：`mcp`、`board`、`init`。
- 12 个内置示例 skill。
- 通过 `GetPrompt("skills:compose", { tags })` 支持多 skill tag 组合。
