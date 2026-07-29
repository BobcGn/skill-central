# Web 看板

> **自 v0.2.0 起为默认设置。** `skill-central board` 现在会打开一个本地的 Hono 仪表盘，而不是打印一个终端表格。使用 `board --cli` (或 `--no-web`) 可恢复到 v0.1.0 的行为。

Web 看板是一个从您的机器上提供的单页原生 JS 仪表盘。它**不**需要任何外部服务、构建步骤或超出 `127.0.0.1` 的网络访问。

## 快速开始

```bash
# 在默认端口上启动
npx @bobcgn/skill-central board

# 自定义端口
npx @bobcgn/skill-central board --port 8080

# 自动回退到终端
npx @bobcgn/skill-central board --cli
```

输出:

```
  ✓ skill-central web board
    http://127.0.0.1:5417/

  按 Ctrl+C 停止。
```

浏览器会显示一个按层 (01-global → 04-tech-stack) 分组的侧边栏，点击后在详情窗格中显示完整的 prompt 正文。

## 你可以做什么

| 操作 | UI 功能 |
|---|---|
| 浏览技能 | 点击侧边栏中的一个技能 |
| 阅读 prompt | 详情窗格以 `white-space: pre-wrap` 的 `<pre>` 标签渲染 |
| 编辑技能 | 点击 **Edit** → 打开带有原始 YAML 的文本区域 → **Save** |
| 查看备份 | 点击 **Backups** → 显示带有恢复按钮的 `.bak.<ts>` 同级文件列表 |
| 审查冲突 | 并发编辑通过 sha256 不匹配被捕获 |
| 预览编译产物 | 点击本地控制台面板中的 **Compile Preview** |
| 检查 IDE 健康 | 点击 **IDE Health**，复用 `doctor --ide` 健康检查 API |
| 预览 IDE 连接 | 点击 **Connect Plan** 查看 JSON merge 和备份路径 |
| 应用 IDE 连接 | 点击 **Apply Connect** 写入配置并执行 MCP 连接验证 |
| 回滚 IDE 连接 | 点击 **Rollback**，从备份恢复或删除 connect 新建的配置文件 |
| 查看 layer 解析 | 在技能详情中点击 **Resolution**，查看 effective / shadowed / conflicted 候选链 |
| 管理本地 MCP runtime | 点击 **Runtime** / **Start MCP** / **Stop MCP** 查看、启动或停止本地 MCP 子进程 |
| 查看同步状态 | 点击 **Sync Status**，查看 app state、audit 目录和 layer sync policy |
| 预览同步计划 | 输入本地 registry checkout 路径后点击 **Sync Plan**，展示 Phase 4 dry-run 统计 |
| 应用同步计划 | 输入 registry 路径、方向和确认短语 `APPLY SYNC` 后点击 **Apply Sync**；conflict 可查看 diff 并逐项选择 `use remote`、`use local` 或 `skip` |
| 查看同步审计 | 点击 **Sync Audit**，打开独立审计视图；可按 outcome、direction、layer、时间范围组合筛选，并打开 audit JSON 或被 audit 引用的 backup 文件 |

## 带有 sha256 冲突检测的编辑流程

```
1. GET /api/skills/:id         → 返回 rawYaml + sha256
2. 用户编辑文本区域
3. PUT /api/skills/:id         正文: { rawYaml, expectedSha256 }
   - 解析 YAML → 验证 → 如果 id 更改则拒绝 → 备份现有文件 → 写入
   - 返回 { ok: true, sha256 }
4. 如果 expectedSha256 与当前文件不匹配 → 409 + currentRawYaml
   - 前端显示 "文件自您加载以来已在磁盘上更改"
   - 两个版本都会呈现以供手动合并
```

每次成功保存都会将先前的内容移动到 `<file>.bak.<ISO-no-colons>`。备份**永远不会**自动删除；`doctor` 会列出它们，您可以手动删除。

## 安全模型

- **绑定地址。** 默认为 `127.0.0.1`。`--host` 标志接受任何地址，但**非环回主机需要 `--i-understand-nonlocal`**——这是一个防止误用的保护措施。Web 看板没有身份验证：任何有权访问该端口网络的人都可以编辑您的技能。
- **无认证，无 CORS。** 仅限同源。如果您绑定到 `0.0.0.0` (不推荐)，您必须使用显式标志选择加入。
- **静态资源路径遍历。** 每个 `GET /*` 都在 `dist/web/` 下解析；`..` 和绝对路径返回 404。
- **技能 id 模式。** 路由中的 `:id` 通过正则表达式检查为 `[a-z0-9]+(-[a-z0-9]+)*`。任何其他内容都返回 400。
- **写入范围。** `PUT /api/skills/:id` 仅写入 `GET` 报告的已解析源路径。技能永远不能通过 Web UI 在层之间移动 (为此请使用 `remove` + `add`，这使得移动可审计)。
- **同步写入确认。** `POST /api/sync/apply` 必须输入确认短语 `APPLY SYNC`。该接口先复用 Phase 4 的 `SyncPlan` 和 preflight；如果存在未解决的 conflict 或未使用 `force` 的 update/delete，会返回 `409 + report`，并写入 app state audit，不会执行部分写入。
- **冲突显式选择。** Web apply 可携带 `resolutions`，逐项把 conflict 转换为 `update-local`、`update-remote` 或 `noop`。每项 resolution 可带上预览时的 local/remote hash，服务端会复核 hash，防止基于过期计划执行。
- **冲突 diff 预览。** Web `Sync Plan` 会为 conflict 附加本地/远端文本 diff。diff 只是 UI 决策证据，不参与 `SyncPlan` hash，也不会改变 Phase 4F apply/audit 合约。
- **审计文件读取边界。** `GET /api/sync/audit-file` 只能读取 app state audit 目录下的 `sync-apply.*.json`；`GET /api/sync/backup-file` 只能读取最近 sync audit report 中出现过的 `backupPath`。Web Board 不提供任意本地文件读取。

## HTTP API 参考

| 方法 | 路径 | 正文 | 响应 |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ ok, version, skills }` |
| `GET` | `/api/layers` | — | `[{ name, path, priority, fileCount }]` |
| `GET` | `/api/skills` | — | `[SkillDto]` 按层优先级然后按 id 排序 |
| `GET` | `/api/skills/:id` | — | `SkillDto & { rawYaml, sha256 }` |
| `GET` | `/api/skills/:id/resolution` | — | `{ id, status, reason, candidates }` |
| `POST` | `/api/compile/preview` | `{ target, intent }` | `CompiledSkillBundle` |
| `GET` | `/api/ide-health?target=cursor` | — | `IdeConnectionHealth` |
| `POST` | `/api/connect/plan` | `{ target, configPath? }` | `OneClickConnectPlan` |
| `POST` | `/api/connect/apply` | `{ target, configPath?, verify? }` | `OneClickConnectPlan` |
| `POST` | `/api/connect/rollback` | `{ target, configPath?, backupPath? }` | `OneClickConnectPlan` |
| `GET` | `/api/runtime/status` | — | `RuntimeSnapshot` |
| `POST` | `/api/runtime/start` | — | `RuntimeSnapshot` |
| `POST` | `/api/runtime/stop` | — | `RuntimeSnapshot` |
| `GET` | `/api/sync/status` | — | `{ localFirst, appState, layers }` |
| `POST` | `/api/sync/plan` | `{ registryDir, direction? }` | `SyncPlan` |
| `POST` | `/api/sync/apply` | `{ registryDir, direction?, force?, confirm, resolutions? }` | `SyncApplyReport`；preflight 阻断时为 `409 + { report }` |
| `GET` | `/api/sync/audits?limit=20&outcome=applied&direction=both&layer=01-global&since=...&until=...` | — | 默认返回 `[SyncApplyReport]` |
| `GET` | `/api/sync/audits?page=true&limit=20&cursor=...` | — | `{ items, nextCursor? }` |
| `GET` | `/api/sync/audit-file?path=...` | — | `{ path, content }`；仅限 app state audit 目录 |
| `GET` | `/api/sync/backup-file?path=...` | — | `{ path, content }`；仅限最近 audit 引用的 backup |
| `PUT` | `/api/skills/:id` | `{ rawYaml, expectedSha256? }` | 冲突时为 `{ ok, sha256 }` / `409` |
| `GET` | `/api/skills/:id/backups` | — | `[{ file, createdAt, size }]` |
| `POST` | `/api/skills/:id/restore` | `{ backupFile }` | `{ ok }` |

`SkillDto` 字段: `id, name, description, type, tags, layer, priority, status, source`。

本地控制台 API 复用 CLI 使用的 compiler、health 和 connect 模块。`POST /api/connect/plan` 只做预览，不会写入 IDE 配置文件；`POST /api/connect/apply` 才会写入，并可通过 `verify: true` 复用 MCP probe。`POST /api/connect/rollback` 使用同一事务模型：有 `backupPath` 时恢复备份，没有备份且配置文件严格等于 connect 新建的 `mcpServers.skill-central` 单项配置时删除该文件。

Runtime API 管理的是 Web Board 本地控制台启动的 `skill-central mcp` 子进程，不替代 IDE 自己配置启动的 MCP 进程。子进程 stdout 属于 JSON-RPC 协议通道，只进入 bounded ring buffer 供 UI 检查，不会打印到控制台；stderr 作为诊断日志展示。

Sync API 当前进入 Phase 5H 的分页审计视图：`/api/sync/status` 会确保 app state 边界存在；`/api/sync/plan` 只生成 dry-run plan，并在 Web 层为 conflict 附加截断 diff 预览；`/api/sync/apply` 要求确认短语 `APPLY SYNC`，并复用 Phase 4F 的 preflight、备份和 audit 逻辑。`/api/sync/audits` 支持组合过滤；当提供时间窗口时，服务端会先用文件名预筛选，再读取 JSON 做最终校验。默认响应保持数组以兼容旧调用；传入 `page=true` 时返回 `{ items, nextCursor }`，前端独立审计视图通过 **Load more** 拉取后续页。TODO：桌面封装后支持通过系统文件管理器定位 audit/backup 文件。

## 实现说明

- 前端：原生 JS + 单个 `index.html` + `style.css` + `app.js`。无构建步骤。资源由 `npm run build:web` (只是 `cp -R`) 打包在 `dist/web/`。
- 服务器：Hono 4 与 `@hono/node-server`。静态中间件是手动实现的，以避免此 Hono 版本上 `hono/serve-static` 的 `getContent` 要求。
- 备份约定：`<filePath>.bak.<ISO-no-colons>` (例如 `…/foo.yaml.bak.2026-06-15T09-11-08-835Z`)。
