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

## HTTP API 参考

| 方法 | 路径 | 正文 | 响应 |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ ok, version, skills }` |
| `GET` | `/api/layers` | — | `[{ name, path, priority, fileCount }]` |
| `GET` | `/api/skills` | — | `[SkillDto]` 按层优先级然后按 id 排序 |
| `GET` | `/api/skills/:id` | — | `SkillDto & { rawYaml, sha256 }` |
| `PUT` | `/api/skills/:id` | `{ rawYaml, expectedSha256? }` | 冲突时为 `{ ok, sha256 }` / `409` |
| `GET` | `/api/skills/:id/backups` | — | `[{ file, createdAt, size }]` |
| `POST` | `/api/skills/:id/restore` | `{ backupFile }` | `{ ok }` |

`SkillDto` 字段: `id, name, description, type, tags, layer, priority, source`。

## 实现说明

- 前端：原生 JS + 单个 `index.html` + `style.css` + `app.js`。无构建步骤。资源由 `npm run build:web` (只是 `cp -R`) 打包在 `dist/web/`。
- 服务器：Hono 4 与 `@hono/node-server`。静态中间件是手动实现的，以避免此 Hono 版本上 `hono/serve-static` 的 `getContent` 要求。
- 备份约定：`<filePath>.bak.<ISO-no-colons>` (例如 `…/foo.yaml.bak.2026-06-15T09-11-08-835Z`)。
