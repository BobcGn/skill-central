# 手动发布指南

> **受众：** 项目所有者。当您想手动发布 `@bobcgn/skill-central` 的新版本时使用本指南。如果您可以在 CI 中集成发布作业（通过 OIDC 的可信发布，或仓库 secret 中的长期自动化令牌），请优先选择该方式——本指南仅适用于 CI 发布不可行的情况。
>
> **范围：** v0.2.0 及之后的所有版本。v0.1.0 使用了不同的流程；如果需要重构，请交叉参考 [`CHANGELOG.md`](../CHANGELOG.md)。
>
> **推荐路径：** 参见 [`docs/trusted-publishing.md`](./trusted-publishing.md) 进行一次性 OIDC 设置，这将把 `git push --tags` 变为完全自动化的发布 + GitHub Release。仅在可信发布者不可用时（例如，在 npmjs.com 配置完成前发布热修复，或从不同 scope 的 fork 发布）才使用本手动指南作为后备方案。

## 何时使用本指南

如果以下**任何**一项为真，请使用本指南：

- CI 流水线没有自动运行 `npm publish` 的发布作业。
- 您想在发布前在本地验证版本。
- CI 发布作业损坏，您需要发布一个热修复。
- 您正在从一个不同的 scope 发布一个私有 fork。

如果您已配置可信发布（GitHub Actions 和 npm 之间的 OIDC），请优先选择该路径；本指南的目的是作为后备。一次性设置请参见 [`docs/trusted-publishing.md`](./trusted-publishing.md)。

## 先决条件

- [ ] `node --version` 为 **v22+** (项目目标为 Node 22 ESM)
- [ ] `npm --version` 为 **v10+**
- [ ] 您位于一个干净工作树的 **`main` 分支** (`git status` 显示无未提交的更改)
- [ ] 您可以运行 `npm whoami` 并返回您的 npm 用户名 (例如 `bobcgn`)
- [ ] 您已端到端完成 [`docs/release-testing.md`](./release-testing.md) 并勾选了所有项目
- [ ] 您拥有一个**粒度访问令牌 (Granular Access Token)** 或**自动化令牌 (Automation Token)**，具有 `@bobcgn/*` 的发布权限 (见下文 [§ 1](#1-获取发布令牌))
- [ ] 您打算发布的版本**尚未在 npm 上** (通过 `npm view @bobcgn/skill-central versions` 验证)

> **关于令牌的提醒。** 本指南中有两个操作需要新的凭据：
> 1. `npm publish` 本身 (粒度/自动化令牌 — 无需 OTP)。
> 2. 发布后的清理工作，如 `npm token revoke` 和 `git tag --delete` (因为它们会修改账户或仓库状态，需要 2FA OTP)。
>
> 如果您的账户强制执行了 2FA，请为第二类操作准备好您的身份验证器。

---

## 1. 获取发布令牌

> **关键。** 您需要的令牌**不是** npm 网页界面中的 "Publish token" 选项。那个只适用于网站。对于 CLI 发布，您需要一个**粒度访问令牌 (Granular Access Token)** (推荐) 或一个**自动化令牌 (Automation Token)**。

### 方案 A — 粒度访问令牌 (推荐)

1. 前往 <https://www.npmjs.com/settings/~/tokens>。
2. 点击 **"Generate New Token"** → **"Granular Access Token"** (不要选择 "Classic Token" 或 "Publish token")。
3. **令牌名称：** 起一个容易记住的名字，例如 `skill-central-publish-2026-06`。
4. **过期时间：** 选择您能容忍的最短窗口。对于一次性发布，**1 天**即可。
5. **包和范围：** 选择 **"Read and write"**；然后在 "Select packages" 下选择 **Only `@bobcgn`** (如果您需要灵活性，可以选择 "All packages")。
6. **其他权限：** 保留默认值。
7. 点击 **"Generate token"**。npm 将**只显示一次**令牌——立即复制并存入密码管理器。该字符串将以 `npm_` 开头，看起来像 `npm_XXXXXXXXXXXXXXXXXXXX`。
8. 验证令牌：运行 `NPM_CONFIG_TOKEN=npm_xxx npm whoami` — 应该会打印您的用户名，而不会要求 OTP。

### 方案 B — 自动化令牌

1. 相同 URL → **"Generate New Token"** → **"Automation Token"**。
2. 为 `@bobcgn/*` 选择 "Publish" 范围。
3. 过期时间 1 天。
4. 按上述方法复制和验证。

### 如果您需要撤销泄露的令牌

- 在网站上：Settings → Tokens → 点击该行的垃圾桶图标。
- 或通过 CLI (需要 2FA OTP)：`npm token revoke <id>` — `<id>` 是您在 `npm token list` 中看到的十六进制值。

---

## 2. 发布前验证

按顺序运行这些命令。在第一个失败处停止并修复。

```bash
# 0. 确认您在 main 分支，工作树干净，且 v0.X.0 版本领先。
git checkout main
git pull --ff-only
git status                     # 无未提交的更改
git log --oneline -5

# 1. 确认 Node + npm 版本
node --version
npm --version

# 2. 确认您已登录 (通过现有的 ~/.npmrc)
npm whoami                     # 打印您的 npm 用户名

# 3. 确认 v0.X.0 尚未在 npm 上 (否则会 409)
npm view @bobcgn/skill-central@0.X.0 version
# 期望: "npm error 404 No match found for version 0.X.0"

# 4. 运行发布预演
npm publish --dry-run --access public
# 期望: 119 个文件, ~78 kB 的 tarball, "Publishing to ... with tag latest and public access (dry-run)"
```

如果本节中的任何步骤失败，**请停止并调查**。最常见的失败模式和修复方法在 [§ 6](#6-故障排除) 中。

---

## 3. 提升版本

为变更集选择正确的版本提升：

| 变更类型 | 提升 | 示例 |
|---|---|---|
| 破坏性 API 更改或新功能集 | **minor** | `0.1.0` → `0.2.0` |
|向后兼容的错误修复或文档更新|**patch**| `0.2.0` → `0.2.1` |
| 预发布渠道 | **pre-release** | `0.2.0` → `0.3.0-rc.1` |

在三个地方保持一致地更新：

```bash
# 使用 npm version — 它会更新 package.json 并创建一个 git 标签。
# 选择一个:
npm version minor -m "chore(release): %s"
npm version patch -m "chore(release): %s"
npm version prerelease --preid=rc -m "chore(release): %s"

# (替代方案: 手动编辑 package.json, 然后 `git tag -a v0.X.0 -m "..."`)
```

`npm version` 也会提交更改；如果您希望将版本提升与代码更改放在同一个发布提交中，请手动编辑 `package.json` 并单独打标签。

推送新标签和提交：

```bash
git push origin main
git push origin v0.X.0
```

---

## 4. 发布

以下脚本使用一个**临时 `.npmrc`**，这样发布令牌就不会覆盖您的日常 `~/.npmrc` (它可能带有一个会触发 2FA 的旧版 auth 令牌)。

```bash
cd /path/to/skill-central

# 替换您在 § 1 中生成的令牌。
export NPM_PUBLISH_TOKEN='npm_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

# 构建一个只使用发布令牌的临时 .npmrc。
TMP_NPMRC="$(mktemp -t npmrc.XXXXXX)"
cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org
//registry.npmjs.org/:_authToken=${NPM_PUBLISH_TOKEN}
EOF
chmod 600 "$TMP_NPMRC"
trap "rm -f '$TMP_NPMRC'" EXIT

# 健康检查: 使用发布令牌运行 whoami (不应提示 OTP)。
npm whoami --userconfig "$TMP_NPMRC"

# 发布。package.json 中的 prepublishOnly 脚本会先运行 `npm run build`
# 和 `npm run build:web`，所以 dist/ 树总是最新的。
npm publish --access public --tag latest --userconfig "$TMP_NPMRC"
unset NPM_PUBLISH_TOKEN
```

预期输出 (最后几行):

```
+ @bobcgn/skill-central@0.X.0
```

如果您没有看到 `+ @bobcgn/skill-central@0.X.0`，说明发布失败了。**不要**盲目重试——参见 [§ 6](#6-故障排除)。

> **关于 `--tag latest`。** npm 标签独立于 semver。默认情况下，一个新的最高范围版本会被标记为 `latest`，因此 `npm install @bobcgn/skill-central` 会解析到它。如果您想继承 npm 的默认行为，可以省略 `--tag latest`，但显式形式更明确。对于预发布版本，最好使用 `--tag next`，以便 `latest` 始终指向稳定版本。

---

## 5. 发布后验证

发布成功后立即运行这些命令。它们确认包是可访问的，并且内容与您预期的一致。

```bash
# 5.1 确认新版本已在注册表上
npm view @bobcgn/skill-central@0.X.0 version
# 期望: 0.X.0

# 5.2 确认 dist-tag 已移动
npm view @bobcgn/skill-central dist-tags
# 期望: { "latest": "0.X.0", ... }

# 5.3 确认 tarball 包含 web 资源
npm view @bobcgn/skill-central@0.X.0 dist
# 期望: integrity sha512-..., tarball URL 带有版本 0.X.0

# 5.4 冒烟测试：在一个干净的目录中安装并运行
mkdir -p /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null
npm install @bobcgn/skill-central@0.X.0
npx skill-central --version
npx skill-central --help | head -8
npx skill-central init
npx skill-central board --cli | head -5
cd / && rm -rf /tmp/sc-smoke

# 5.5 GitHub release (可选但推荐)
gh release create v0.X.0 \
  --title "v0.X.0" \
  --notes-file - <<'EOF'
## v0.X.0 中的内容

- …
- …

**安装:** `npm install @bobcgn/skill-central@0.X.0`
EOF
```

如果 5.1–5.3 中有任何一项失败，说明发布实际上并未成功登陆注册表——在宣布前请进行调查。

---

## 6. 故障排除

### `npm error 401 Unauthorized`

`npm` 找不到任何可用的身份验证。要么 `~/.npmrc` 缺失/错误，要么您的令牌已被撤销。重新运行 § 1 获取一个新的粒度/自动化令牌，然后重新运行 § 4。

### `npm error EOTP — This operation requires a one-time password`

两件不同的事情可能触发此错误：

- **您使用了错误的令牌类型调用 `npm publish`** (来自 web UI 的 "Publish token")。它能通过身份验证但无法执行发布。修复方法是使用粒度或自动化令牌——参见 § 1。
- **您的账户强制执行了 2FA 并且您没有使用令牌。** 使用 `--userconfig "$TMP_NPMRC"` 重新运行，指向一个包含粒度/自动化令牌的 `.npmrc`。基于令牌的身份验证会绕过发布的 2FA。

快速诊断：

```bash
# 正在使用哪个令牌?
npm token list --userconfig "$TMP_NPMRC"
# 每行的 "type" 列应该是 "Granular" 或 "Automation"，而不是 "Publish"。
```

### `npm error 403 — You may not perform that action with these credentials`

令牌有效，但缺少此包的发布权限。最常见的原因：

- 令牌的包范围设置成了不同的 scope (例如 `@other-org` 而不是 `@bobcgn`)。
- 令牌是一个 **"Publish token"** (web UI 类型) — 参见 § 1。
- 令牌是一个只读的粒度令牌。

重新生成具有正确权限的令牌，并重新运行 § 4。

### `npm error code E404 — No match found for version 0.X.0`

您尝试查看一个尚不存在的版本。**这是 § 2 步骤 3 中“是否已发布？”检查的预期输出。** 不要将其视为失败。

如果它在成功发布 *之后* 出现，说明发布本身没有成功——重新运行 § 2 和 § 4。

### `npm error code EPUBLISHCONFLICT — Cannot publish over existing version`

有人（或 CI 运行）已经发布了 `0.X.0`。可能是：

- 您在另一台机器上操作的——用 `git log --all` 验证并确认您没有在两个克隆中工作。
- 这是一个未被禁用的 CI 发布作业。检查 `.github/workflows/ci.yml` 中的 `release` 作业，并移除它或进行协调。

修复：提升到 `0.X.1` (patch) 并从 § 2 重新运行。

### Tarball 大小错误 / `dist/web/` 缺失

`package.json` 中的 `files:` 字段控制包含哪些内容。验证：

```bash
npm pack --dry-run | grep -E "dist/web|index.html|app.js|style.css"
```

您应该至少看到 `dist/web/index.html`、`dist/web/app.js`、`dist/web/style.css`，以及所有的 `dist/commands/*.js`、`dist/storage/*.js`、`dist/protocol/*.js`。如果 `dist/web/` 缺失，请检查：

- `npm run build:web` 已运行 (它将 `src/web/static/` 复制到 `dist/web/`)
- `package.json` 中的 `files:` 数组包含 `"dist/web/"`
- `dist/web/index.html` 在本地存在

修复根本问题，重新运行 `npm run build:web`，然后重新运行 § 4。

### `npm error EACCES` 或 `EPERM` 写入文件时出错

工作树的权限问题。检查 `ls -la dist/`，修复所有权，或重新克隆仓库。

### "我忘了提升版本，将 0.1.0 覆盖了现有的 0.1.0"

您无法取消发布单个版本。选项：

- **弃用该版本**：`npm deprecate @bobcgn/skill-central@0.1.0 "reason"`。这是正确的做法——保留已发布的版本但警告用户不要使用。
- **取消发布整个包**：`npm unpublish @bobcgn/skill-central --force`。仅在发布后的 **72 小时**内可用，且如果包有依赖项则不允许。仅作为最后手段使用。

如果您真的需要“移除”一个错误的发布，请提升到下一个补丁版本，发布，然后弃用那个损坏的版本。

---

## 7. 快速参考 (单屏版本)

```bash
# 0. 飞行前检查
git checkout main && git pull --ff-only && git status
node --version && npm --version && npm whoami

# 1. 确认尚未发布
npm view @bobcgn/skill-central@0.X.0 version
npm publish --dry-run --access public

# 2. 提升版本 + 打标签 + 推送
npm version minor -m "chore(release): %s"
git push origin main
git push origin v0.X.0

# 3. 发布
export NPM_PUBLISH_TOKEN='npm_xxx'
TMP_NPMRC="$(mktemp -t npmrc.XXXXXX)"
cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org
//registry.npmjs.org/:_authToken=${NPM_PUBLISH_TOKEN}
EOF
chmod 600 "$TMP_NPMRC"
trap "rm -f '$TMP_NPMRC'" EXIT
npm publish --access public --tag latest --userconfig "$TMP_NPMRC"
unset NPM_PUBLISH_TOKEN

# 4. 验证
npm view @bobcgn/skill-central@0.X.0 version
npm view @bobcgn/skill-central dist-tags

# 5. 冒烟安装
mkdir -p /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null && npm install @bobcgn/skill-central@0.X.0
npx skill-central --version && npx skill-central --help | head -3
cd / && rm -rf /tmp/sc-smoke

# 6. 撤销发布令牌 (现在在聊天/历史记录中是公开的)
#    — 手动在 https://www.npmjs.com/settings/~/tokens
#    — 或 `npm token revoke <id>` (需要 2FA OTP)
```

---

## 8. 发布后做什么

- [ ] 在您的追踪器中将 v0.X.0 的待办事项标记为完成
- [ ] 更新任何依赖的项目 (这里没有，但如果您有下游消费者)
- [ ] 发布一个简短的公告 (项目 README 徽章、社交媒体等)，链接到 GitHub release
- [ ] 如果您使用里程碑，请在 GitHub 上关闭它
- [ ] 如果存在 CI 发布作业，请确保将其配置为跳过此版本 (这样它就不会尝试重新发布并因 EPUBLISHCONFLICT 而失败)
