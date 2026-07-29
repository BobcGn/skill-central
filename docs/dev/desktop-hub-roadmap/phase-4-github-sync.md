# Phase 4: GitHub 登录与云同步

## 1. 阶段目标

引入 GitHub 登录、个人远程 Skill 库、跨设备同步、备份和共享能力。这个阶段必须保持 local-first：未登录用户仍能使用本地功能，登录只增强同步和协作。

Phase 4 完成后，用户可以用 GitHub 身份同步自己的 Skill、Prompt Template、Rule 和配置元数据，并能处理本地与远端冲突。

## 2. 范围

包含：

- GitHub OAuth 登录。
- 本地 token 安全存储。
- 远程 registry 绑定。
- Skill 同步。
- layer 同步策略。
- 冲突检测和合并策略。
- 私有 / 公开 Skill 发布基础。

不包含：

- 组织级权限治理的完整后台。
- 商业化计费。
- 全量项目上下文上传。
- 云端执行 Agent。

## 3. 身份与存储模型

建议支持两种远程存储路径：

| 模式 | 说明 | 适用 |
|---|---|---|
| GitHub repo 同步 | 用户指定一个 GitHub repo 作为 Skill 库 | 开发者个人和团队 |
| 托管 registry | 未来由 skill-central 提供托管注册表 | 市场、组织治理 |

Phase 4 MVP 优先 GitHub repo sync，因为它符合开发者习惯，也降低后端复杂度。

默认策略：

- 每个 GitHub 用户默认绑定一个私有 registry repo，例如 `skill-central-registry`。
- workspace 不单独创建仓库，而是在 registry repo 内保存 workspace profile。
- layer 是同步边界，决定哪些 Skill 可以上传、下载、只读或仅本地保存。
- 默认私有：新建 repo 默认私有，新建 layer 默认不公开。

本地需要保存：

- GitHub user id。
- access token 或 device flow token。
- 远端 repo。
- 本地 revision。
- 远端 revision。
- 上次同步时间。
- 每个 skill 的同步状态。
- 每个 layer 的同步策略。
- workspace profile 绑定。

不得上传：

- 项目源代码。
- IDE 当前上下文。
- Workflow 运行时详细日志，除非用户明确开启。
- 用户未选择同步的本地 Skill。
- `sync.enabled: false` 的 layer 内容。
- workspace 绝对路径，除非用户明确选择。

### 3.1 GitHub Registry 持久化结构

建议远程仓库使用一个稳定根目录，避免污染用户仓库根部：

```text
skill-central-registry/
  manifest.yaml
  lockfile.yaml
  layers/
    personal/
    packages/
    project-templates/
  workspaces/
    workspace_01HY.profile.yaml
  audit/
    sync-log.jsonl
```

`manifest.yaml` 记录 registry 级元数据：

```yaml
schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: octocat
defaults:
  visibility: private
  syncMode: bidirectional
layers:
  - id: personal
    path: layers/personal
    scope: user
    sync:
      enabled: true
      direction: bidirectional
    visibility: private
  - id: project-templates
    path: layers/project-templates
    scope: workspace
    sync:
      enabled: true
      direction: bidirectional
    visibility: private
```

Workspace profile 只保存“启用关系”和可同步元数据，不保存项目源码、会话历史或 IDE 当前上下文：

```yaml
schemaVersion: skillcentral.dev/workspace-profile/v1
id: workspace_01HY
name: my-react-app
repo:
  provider: github
  owner: octocat
  name: my-react-app
  visibility: private
privacy:
  persistRepoIdentity: user-approved
layers:
  enabled:
    - personal
    - react-stack
    - review-workflows
sync:
  includeProjectRules: false
  includeSessionState: false
```

如果用户不希望泄露项目身份，`repo` 可以省略或使用本地 hash 标识。MVP 中应优先让用户显式选择是否保存 repo owner/name。

## 4. 任务拆解

### 4.1 GitHub OAuth

任务：

- 实现 GitHub Device Flow 或 OAuth Web Flow。
- token 存入系统安全凭据存储。
- UI 展示登录状态、账号和同步仓库。

产出：

- `src/auth/github.ts`
- 登录 / 登出 UI。
- token 存储抽象。

检查点：

- 用户可登录、退出、重新登录。
- token 不写入普通明文配置文件。
- 未登录不影响本地功能。

返工触发：

- token 明文落盘。
- 登录失败导致本地应用不可用。
- OAuth scope 超出同步所需范围。

### 4.2 远端 Registry

任务：

- 定义远程 Skill repo 目录结构。
- 登录后检测默认 registry repo 是否存在；不存在时引导创建 private repo。
- 支持绑定已有 repo，要求 dry-run 扫描并展示将导入的内容。
- 支持 pull、push、list remote。
- 记录远程 commit hash。
- 支持私有 repo。

建议目录：

```text
skill-central-registry/
  skills/
  prompts/
  rules/
  workflows/
  layers/
  workspaces/
  manifest.yaml
  lockfile.yaml
```

产出：

- `src/sync/remote-registry.ts`
- repo 初始化命令。
- manifest schema。

检查点：

- 新用户可以创建或绑定一个 repo。
- 已有 repo 可以被扫描并导入。
- 私有 repo 同步可用。
- workspace profile 可以保存 layer 启用关系，但不保存项目绝对路径。

返工触发：

- 远程目录无法表达 Skill 类型和来源。
- repo 初始化会覆盖用户已有内容。
- 无法追踪远程版本。
- 每个 workspace 都强制创建一个独立 repo，导致用户资产分散且难以治理。

### 4.3 同步引擎

任务：

- 实现本地与远端双向同步。
- 使用 content hash 和 revision 判断变化。
- 支持新增、修改、删除。
- 同步前按 layer 的 `sync.enabled`、`visibility`、`writable` 判断是否允许上传、下载或覆盖。
- 冲突时进入人工处理，不静默覆盖。

产出：

- `src/sync/sync-engine.ts`
- 同步状态 UI。
- 冲突模型。

检查点：

- 本地新增 Skill 可以 push。
- 远程新增 Skill 可以 pull。
- 双端同时修改同一 Skill 会产生 conflict。
- `sync.enabled: false` 的 Project layer 不会被上传。
- 只读 Team / Organization layer 不会被本地编辑覆盖。
- workspace profile 只同步用户确认的字段。
- conflict 不会丢数据。

返工触发：

- 同步以文件时间戳作为唯一依据。
- 冲突被静默覆盖。
- 忽略 layer sync policy，上传了用户标记为本地私有的内容。
- 删除操作无法区分用户删除和同步缺失。
- workspace 同步包含绝对路径、会话历史或项目上下文。

### 4.4 共享与发布

任务：

- 支持将某个 Skill 标记为 private / public。
- 支持导出发布包。
- 支持生成 README 摘要和 metadata。
- 为未来 marketplace 预留 index。

产出：

- publish metadata。
- `skill-central publish --dry-run`。
- UI 发布预览。

检查点：

- 发布前能看到将公开的字段和文件。
- private Skill 不会被 publish。
- 发布包包含 schemaVersion、license、owner、source hash。

返工触发：

- 发布行为默认公开所有本地 Skill。
- 用户无法确认公开内容。
- 缺少来源和 license 信息。

## 5. 可观测指标

| 指标 | 目标 |
|---|---|
| 未登录本地功能 | 100% 可用 |
| token 明文落盘 | 0 |
| 同步冲突丢失率 | 0 |
| sync report | 每次同步都有新增、修改、删除、冲突统计 |
| layer sync policy | 100% 同步操作遵守 layer policy |
| registry repo 默认隐私 | 新建 GitHub registry repo 默认 private |

## 6. 阶段验收

验收路径：

1. 未登录启动应用，确认本地功能可用。
2. 使用 GitHub 登录。
3. 绑定或创建默认 private registry repo。
4. 本地新增 Skill 后 push。
5. 在 `sync.enabled: false` 的 Project layer 新增 Skill，确认不会上传。
6. 创建 workspace profile，确认只保存 layer 启用关系和用户批准的 repo 元数据。
7. 在远端修改 Skill 后 pull。
8. 制造同一 Skill 双端修改，确认进入 conflict。
9. 登出后确认本地功能仍可用。

## 7. 阶段决策

可以进入 Phase 5 的条件：

- GitHub 登录只是增强能力，不破坏离线本地模式。
- 双向同步可复现，冲突处理不丢数据。
- 远程 Skill 来源、版本、hash 可审计。
- 同步严格遵守 layer sync policy 和 visibility。
- 默认 registry repo 为 private，workspace profile 不泄露未授权项目元数据。
- 用户能明确控制哪些内容会被同步或发布。

必须返工的条件：

- 本地功能依赖登录。
- 同步会静默覆盖。
- token 存储不安全。
- 上传范围包含项目上下文或未经选择的私有内容。
- 同步忽略 layer 边界，导致本地私有或项目专属 Skill 被上传。
