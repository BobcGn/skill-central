# 本地 App State 与 Token 边界

## 目标

Phase 4 引入 GitHub 登录和同步前，必须先固定本地状态边界。核心规则是：**skill source layers 与 app state 分离**。

- Skill source layers：`.skills`、`~/.skill-central/skills`、团队包或其他可配置 layer。
- App state：桌面应用状态、审计日志、cache、sync metadata、token metadata。

删除 app state 不应删除任何 skill source file；删除 `.skills` 也不应清掉登录状态或同步审计。

## 默认路径

`src/local-store/paths.ts` 按平台解析默认根目录：

| 平台 | 默认根目录 |
|---|---|
| macOS | `~/Library/Application Support/skill-central` |
| Windows | `%APPDATA%/skill-central` |
| Linux | `~/.local/share/skill-central` |

测试和桌面 shell 可以通过 `SKILL_CENTRAL_APP_STATE_DIR` 或 `--app-state-dir` 覆盖根目录。

## 子目录

| 子目录 | 用途 |
|---|---|
| `state` | app state manifest 和后续桌面状态 |
| `audit` | sync、connect、workflow 等审计日志 |
| `cache` | 可删除缓存 |
| `sync` | local/remote revision、sync plan metadata |
| `tokens` | development token fallback 的存储边界 |
| `sessions` | Phase 5 workflow session 状态和状态变化审计 |

## TokenStore

`src/auth/token-store.ts` 暴露 `TokenStore` interface。当前实现 `DevelopmentFileTokenStore` 只用于开发和测试：

- token 文件写入 app state 的 `tokens` 子目录。
- 不写入项目配置。
- 不写入 `.skills`。
- `NODE_ENV=production` 时默认拒绝构造。

TODO：`.msi` / `.dmg` 发布前必须提供 OS keychain 实现，替换 development fallback。

## 可观测入口

```bash
skill-central sync status
skill-central sync status --json
skill-central sync status --app-state-dir <dir> --json
```

`sync status` 会确保 app state 目录存在，并输出 token store 类型、路径和 production readiness。

## GitHub Device Flow

Phase 4B 引入 GitHub Device Flow 的 CLI 核心：

```bash
skill-central sync login --client-id <github-oauth-client-id>
skill-central sync login --client-id <github-oauth-client-id> --poll
skill-central sync logout
```

- `sync login` 会请求 GitHub `device_code`，显示 `verification_uri` 和 `user_code`。
- `--poll` 会轮询 access token，并通过 `TokenStore` 保存。
- 不提供 `--client-id` 且未设置 `SKILL_CENTRAL_GITHUB_CLIENT_ID` 时，命令会失败，避免误用无效内置凭据。
- `sync logout` 只清理 TokenStore 中的 GitHub token，不影响本地 skill source layers。

## GitHub Registry Repo 预览

```bash
skill-central sync repo --owner <owner> --dry-run
skill-central sync repo --owner <owner> --repo skill-central-registry --dry-run --json
```

当前只生成 dry-run 计划：

- 默认 repo 名称为 `skill-central-registry`。
- 默认 visibility 为 `private`。
- 未登录状态也可以生成计划。
- 不创建 GitHub repo，不 push 文件，不写远端状态。

TODO：Phase 4C/4D 冻结 remote registry manifest 和 sync plan 后，再实现 repo apply。

## Remote Registry Layout

Phase 4C 冻结以下远端 registry layout：

```text
manifest.yaml
lockfile.yaml
layers/
  personal/
workspaces/
  workspace_01.profile.yaml
audit/
```

`manifest.yaml` 使用 `skillcentral.dev/registry/v1`：

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
```

Workspace profile 使用 `skillcentral.dev/workspace-profile/v1`。默认规则：

- `sync.includeSessionState` 必须为 `false`。
- repo identity 只能在 `privacy.persistRepoIdentity: user-approved` 时保存。
- profile 不允许保存绝对路径。

Dry-run scanner：

```bash
skill-central sync scan --registry-dir ./skill-central-registry --dry-run --json
```

Scanner 会报告：

- manifest 是否有效。
- `layers/` 下可导入 skill 文件。
- `workspaces/*.profile.yaml` 校验结果。
- 未识别文件。
- 带 `filePath` / `fieldPath` / `reason` 的校验问题。

## Sync Engine Dry-Run

Phase 4D 冻结同步计划入口：

```bash
skill-central sync plan --registry-dir ./skill-central-registry --direction both --dry-run --json
skill-central sync plan --registry-dir ./skill-central-registry --direction push --dry-run
skill-central sync plan --registry-dir ./skill-central-registry --direction pull --dry-run
```

当前合约：

- `sync plan` 必须显式使用 `--dry-run`。
- `--registry-dir` 指向本地 remote registry checkout；当前不直接访问 GitHub API。
- 本地侧读取 `loadConfig().layers`，远端侧读取 scanner 校验后的 manifest layer layout。
- 文件 identity 为 `layerId/relativePath`，内容差异使用 `sha256` 比较。
- `sync.enabled: false` 优先产生 `excluded-policy`，不进入上传/下载候选。
- `--direction both` 遇到双方 hash 不一致时产生 `conflict`，不会自动选择本地或远端。
- 计划会保留 local/remote path 与 hash，供 Phase 4E apply、backup 和 audit log 复核。

操作状态：

| 状态 | 含义 |
|---|---|
| `create-local` | 远端存在、本地缺失，pull/both 计划创建本地文件 |
| `create-remote` | 本地存在、远端缺失，push/both 计划创建远端文件 |
| `update-local` | 双方存在但 hash 不同，pull 计划更新本地文件 |
| `update-remote` | 双方存在但 hash 不同，push 计划更新远端文件 |
| `delete-local` | pull 时远端缺失、本地存在，计划删除本地文件 |
| `delete-remote` | push 时本地缺失、远端存在，计划删除远端文件 |
| `conflict` | both 时双方 hash 不同，需要用户或策略显式选择 |
| `noop` | 双方内容一致 |
| `excluded-policy` | 本地或远端 layer 禁用 sync |

状态：Phase 4E 已实现 `sync apply`；Phase 4F 已补充 preflight 全量阻断，避免存在 blocked 操作时出现部分写入。

## Sync Apply Transaction

Phase 4E 引入受保护的写入入口：

```bash
skill-central sync apply --registry-dir ./skill-central-registry --direction both --json
skill-central sync apply --registry-dir ./skill-central-registry --direction pull --force --json
skill-central sync apply --registry-dir ./skill-central-registry --direction push --force
```

当前合约：

- `sync apply` 会先生成 Phase 4D `SyncPlan`，再消费该计划执行写入；apply 不重新分类文件。
- apply 在写文件前执行 preflight；只要存在 blocked 操作，本轮不写任何本地 skill 文件或 registry checkout 文件。
- `create-local` 与 `create-remote` 默认允许，用 plan 中记录的目标路径写入。
- `update-local`、`update-remote`、`delete-local`、`delete-remote` 默认 blocked；必须显式使用 `--force`。
- force 执行 update/delete 前会在原文件旁创建 `.bak.<timestamp>` 备份。
- `conflict` 不自动解决；`excluded-policy` 和 `noop` 会跳过。
- 每次 apply 都会写入 app state `audit/sync-apply.<timestamp>.json`，记录 `planHash`、方向、远端根目录、force 状态、`preflightBlocked`、每个操作结果和备份路径。
- 如果存在 blocked 操作，CLI 会输出审计报告并以失败状态退出；未被 blocked 的 create/update/delete 也会在本轮标记为 skipped，不会被部分执行。

TODO：后续 conflict resolution 需要引入显式选择入口，避免 `both` 方向自动选择本地或远端。

TODO：Phase 4F/5A 将 audit report 接入桌面 UI，展示 backup path、blocked reason 和下一步操作。
