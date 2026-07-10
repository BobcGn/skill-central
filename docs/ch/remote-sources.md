# 远程源

`skill-central install <source>` 从远程 URL 获取技能并将其写入一个层。本页记录了支持的源语法、清单约定和安全模型。

## 源 URL 语法

支持两种前缀：

```
github:<user>/<repo>/<path/to/file.yaml>[@<ref>]
npm:<pkg>[@<version>]
```

### GitHub

`<ref>` 默认为 `main`。`<path>` 必须以 `.yaml`, `.yml`, 或 `.json` 结尾。获取器会发出：

```
GET https://raw.githubusercontent.com/<user>/<repo>/<ref>/<path>
```

示例:

```bash
skill-central install github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml
skill-central install github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml@v1.0.0
skill-central install github:my-org/private-repo/skills/review.yaml@feat/auth
```

### npm

包**必须**在其 `package.json` 中声明一个 `skill-central` 字段：

```json
{
  "name": "@bobcgn/some-skills",
  "version": "1.0.0",
  "skill-central": {
    "paths": ["./skills/review-pr.yaml", "./skills/commit-msg.yaml"]
  }
}
```

- `paths` 是**在 tarball 内部**的文件路径数组。每个路径都成为一个已安装的技能。
- 如果 `paths` 不存在或为空，安装将失败并提示：`Package X has no "skill-central.paths" in its package.json.`
- 获取器会访问 `https://registry.npmjs.org/<pkg>` (或 `/<pkg>/<version>`) 来发现 tarball URL，然后通过 `node:zlib` + `tar-stream` 进行提取。
- `<version>` 默认为 `latest`。带范围的包使用 `npm:@scope/pkg`。

```bash
skill-central install npm:@bobcgn/some-skills
skill-central install npm:@bobcgn/some-skills@1.2.3
```

## 锁文件

每次成功安装都会向 `~/.skill-central/lock.json` 写入一个条目：

```json
{
  "version": 1,
  "entries": {
    "review-pr": {
      "id": "review-pr",
      "source": "github:BobcGn/skill-central/.skills/02-workflows/review-pr.yaml@main",
      "version": "main",
      "sha256": "2e9897a8819c996f6bb677a4731626bd414f1008da1f93f3958a2a3391b77568",
      "installedAt": "2026-06-15T09:11:08.835Z",
      "layer": "02-workflows",
      "filePath": "/home/you/.skill-central/skills/02-workflows/review-pr.yaml"
    }
  }
}
```

- `source` — `update` 用于重新获取的规范原始形式
- `sha256` — 安装时磁盘上文件的 sha256；用于漂移检测
- `layer` — 文件写入的层的显示名称
- `filePath` — 绝对路径；`update` 和 `uninstall` 会逐字信任此路径

## 安全模型

### 仅限 HTTPS

GitHub 和 npm 路径都通过 HTTPS 下载。获取器明确拒绝：

- 任何 `URL.protocol !== "https:"` 的 URL
- 任何主机为 `localhost`、`127.0.0.0/8`、`::1` 或 `0.0.0.0` 的 URL (tar-slip / SSRF 缓解)
- 任何 `content-type` 与 `text/yaml`, `text/x-yaml`, `application/json`, 或 `text/plain` 不匹配的响应

### Tar-slip 防御

对于 npm tarball，每个条目在提取前都会被检查：

```ts
if (!name.startsWith("package/")) return;     // 不在预期的前缀下
if (name.includes("..") || name.includes("\\")) return;  // tar-slip 攻击尝试
```

只有 `package/...` 路径会被保留。`..` 和 `\` 检查会拒绝路径遍历的载荷。

### sha256 验证

锁文件记录了安装时文件的 sha256。`update` 重新获取，计算新的 sha256，并且只有在它们不同时才报告漂移。**没有签名验证**——我们信任源（GitHub 仓库，npm 包）。如果您需要更强的保证，请固定到 git 标签或带有 `@v1.2.3` 的 npm 版本。

### 确认提示

首次安装（不带 `--yes`）会在写入前打印 id、名称、标签、源、版本和 sha256。在脚本中传递 `--yes`。

## 版本控制与漂移

`update [id]` 会重新获取并覆盖。没有自动更新——`update` 始终需要手动调用。如果上游文件已更改：

```
  ✓ Updated user:02-workflows/review-pr.yaml
    old sha: 2e9897a8819c996f…
    new sha: a4f00c813f9b27bd…
```

如果未更改，更新会报告 `0 of N updated`。

## 故障排除

| 症状 | 可能原因 |
|---|---|
| `HTTP 404` | 源路径在远程不存在（拼写错误、文件丢失或分支错误） |
| `Package X has no "skill-central.paths"` | npm 包作者忘记了清单字段 |
| `Refusing non-HTTPS URL` | 您为源添加了 `http://` 前缀——请改为 `https://` |
| `Refusing to fetch loopback host` | 源 URL 指向 `localhost` / `127.0.0.1`——可能是配置错误；请联系包作者 |
| `Tarball missing package/package.json` | npm 注册表提供了一个格式错误的 tarball；重试，然后向上游提交问题 |
