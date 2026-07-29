# 可信发布 (npm OIDC)

> **受众：** 项目所有者。使用本指南将 npm 可信发布与 GitHub Actions 关联，用于 `@bobcgn/skill-central`。一次性设置后，每次 `v*` 标签推送都会运行 `.github/workflows/release.yml`，该工作流会发布到 npm 并创建一个 GitHub Release — **无需手动 `npm publish`，也无需在仓库 secret 中存储长期令牌**。
>
> **范围：** 适用于 v0.2.1 及之后版本 (此时添加了 `release.yml`)。v0.2.0 是在该流程存在前手动发布的；如果需要重构，请交叉参考 [`CHANGELOG.md`](../CHANGELOG.md)。

## 何时使用

如果以下**任何**一项为真，请设置可信发布：

- 您希望 `git push --tags` 能够端到端地发布一个版本，无需进一步操作。
- 您希望每个发布的 tarball 都带有一个**经 Sigstore 签名的来源证明**，可通过 `npm view <pkg> --json | jq .dist.attestations` 进行验证。
- 您厌倦了为每个版本铸造粒度访问令牌并在之后撤销它们。

如果您特别需要**不**配置 OIDC 进行发布 (例如，在不同的 npm scope 下 fork 项目)，请改用 [`docs/manual-publishing.md`](./manual-publishing.md) — 该指南是长期令牌的后备方案。

## 先决条件

- [ ] 您在 npmjs.com 上拥有 (或具有管理员权限) [`@bobcgn/skill-central`](https://www.npmjs.com/package/@bobcgn/skill-central)
- [ ] 您在 GitHub 上拥有 [`BobcGn/skill-central`](https://github.com/BobcGn/skill-central) 的管理员权限
- [ ] `.github/workflows/release.yml` 文件存在于 `main` 分支 (自 v0.2.1 起存在)
- [ ] 您至少读过一次 [`docs/manual-publishing.md`](./manual-publishing.md)，以便了解该工作流正在自动化什么

---

## 1. 在 npm 上注册工作流为可信发布者

此步骤在 npmjs.com 上进行一次，用于创建 OIDC 信任锚。

1. 打开 <https://www.npmjs.com/package/@bobcgn/skill-central/settings>。
2. 滚动到 **Publishing access** → **Trusted Publishers** → **Add GitHub Actions**。
3. 填写：

   | 字段 | 值 | 原因 |
   |---|---|---|
   | Owner | `BobcGn` | 拥有此仓库的 GitHub 组织/用户 |
   | Repository | `skill-central` | 仓库名称 |
   | Workflow filename | `release.yml` | **必须匹配** `.github/workflows/release.yml` 的基本名称。如果重命名工作流，必须更新此字段——没有自动检测。 |
   | Environment name | *(留空)* | 可选。在此设置会使 OIDC 令牌仅限于具有自己保护规则的 [GitHub 环境](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)。建议用于高风险仓库；个人项目可跳过。 |

4. 点击 **Add**。新条目会出现在可信发布者列表中，并带有一个其配置的截断哈希——每次发布时 npm 都会检查此哈希，所以**在此步骤后不要编辑工作流文件名而不更新此条目**。

> **为什么不使用 npm 粒度访问令牌？** 令牌是持有者秘密：它们的生命周期比工作流运行长，可能会在日志中泄露，并且必须轮换。OIDC 令牌是短暂的 (几分钟)，与特定的工作流运行相关联，并且永远不会作为可用的秘密出现在日志中。自 2024 年起，npmjs.com 文档称其为“从 CI 发布 npm 的推荐方法”。

---

## 2. 健康检查工作流配置

打开 `.github/workflows/release.yml` 并确认三件事：

- [ ] `permissions.id-token: write` 存在 (对于 `--provenance` 是强制性的)
- [ ] `setup-node` 步骤有 `registry-url: 'https://registry.npmjs.org'` (这是将 OIDC 令牌接入 npm auth 流程的关键)
- [ ] `npm publish` 步骤使用 `--provenance --access public`

如果缺少其中任何一项，`npm publish` 将失败，并出现以下错误之一：

- `npm error code EUNSUPPORTEDPROTOCOL` (无 `registry-url`)
- `npm error code E403` (无 `id-token: write`)
- `npm notice provenance attestation not generated` (无 `--provenance`)

---

## 3. 在不实际发布的情况下预演工作流

在推送真实标签之前，您可以在不消耗一次发布尝试的情况下验证 OIDC 握手是否有效：

1. 在一个一次性分支中，编辑 `release.yml`，注释掉 `npm publish` 步骤和 `Create GitHub Release` 步骤，只留下构建+检查。
2. 推送该分支。工作流**不会运行** (它只在 `v*` 标签上触发)。
3. 创建一个虚拟标签：`git tag -a v0.0.0-test -m "OIDC handshake probe" && git push origin v0.0.0-test`。
4. 观察 Actions 选项卡——构建+版本检查应该会通过。
5. 如果最后到达 `npm view` 步骤 (现在会，因为发布步骤被注释了——等等，它也在发布后的 `if: success()` 中)，它会跳过，因为发布步骤成功了 ("skipped" = success)。完全跳过此预演；直接推送一个带有预发布后缀的真实 `v0.0.0-test.1` 标签，并接受这次一次性发布。

实际上，一个更干净的方法是：**发布一个真实的预发布版本**。npm 接受并传播 `v0.0.0-trusted-publishing-test.1` 作为一个 `next` 标签，而不会干扰 `latest`：

```bash
git tag -a v0.0.0-trusted-publishing-test.1 -m "OIDC handshake probe — not a real release"
git push origin v0.0.0-trusted-publishing-test.1
```

等待工作流完成后，然后：

```bash
# 确认来源
npm view "@bobcgn/skill-central@0.0.0-trusted-publishing-test.1" --json | jq .dist.attestations
# 弃用，以便用户如果遇到此版本会收到警告
npm deprecate "@bobcgn/skill-central@0.0.0-trusted-publishing-test.1" "OIDC handshake probe, not a real release."
# 在两边删除标签
git push origin :v0.0.0-trusted-publishing-test.1
git tag -d v0.0.0-trusted-publishing-test.1
```

> **您在 72 小时后无法取消发布一个已发布的版本。** 上述的弃用步骤会向任何安装者添加一个 `npm WARN deprecated` 行，但不会移除该版本。请相应地选择您的探测标签 (例如 `0.0.0-trusted-publishing-test.<date>`)。

---

## 4. 实际的发布流程

一旦 § 1–§ 2 完成，每个版本的发布都是：

```bash
# 在 main 分支上，工作树干净，changelog + package.json 版本提升已提交后：
git checkout main && git pull --ff-only
git status                     # 无未提交的更改
git log --oneline -3           # 确认您在预期的位置

# 打标签 — 工作流会完成剩下的事情。
git tag -a v0.X.Y -m "v0.X.Y — <一行摘要>"
git push origin v0.X.Y
```

工作流将：

1. 在一个全新的 Ubuntu runner 上构建项目 (tsc + build:web)。
2. 验证构建的产物 (`dist/index.js`, `dist/web/index.html`)。
3. 验证 `package.json#version` 与标签匹配。
4. 验证 `CHANGELOG.md` 有一个 `## [<version>]` 部分。
5. 通过 OIDC 运行 `npm publish --provenance --access public`。npm 记录 Sigstore 来源证明。
6. 提取匹配的 CHANGELOG 部分，并用它作为正文创建 GitHub Release。
7. 对新版本运行一个尽力而为的 `npm view` 以确认注册表传播 (会警告，但不会失败)。

您可以在 GitHub 的 **Actions** 选项卡中观察进度。成功运行看起来像：

```
✓ Publish to npm
✓ Extract CHANGELOG section for release notes
✓ Create GitHub Release
✓ Verify npm registry propagation
```

失败的运行会在第一个失败的步骤上显示一个红色的 ❌，并有指向相关日志行的直接链接。

---

## 5. 工作流成功后

手动流程中运行的相同检查仍然有用：

```bash
# 5.1 确认新版本已在注册表上
npm view "@bobcgn/skill-central@0.X.Y" version

# 5.2 确认 dist-tag 已移动
npm view "@bobcgn/skill-central" dist-tags

# 5.3 确认来源证明存在
npm view "@bobcgn/skill-central@0.X.Y" --json | jq .dist.attestations

# 5.4 在干净目录中进行冒烟测试
mkdir -p /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null
npm install "@bobcgn/skill-central@0.X.Y"
npx skill-central --version
npx skill-central --help | head -8
npx skill-central init
npx skill-central board --cli | head -5
cd / && rm -rf /tmp/sc-smoke
```

GitHub Release 由工作流自动创建——无需手动运行 `gh release create`。您可以在 <https://github.com/BobcGn/skill-central/releases/tag/v0.X.Y> 找到它。

---

## 6. 故障排除

### `npm publish` 时出现 `npm error code EUNSUPPORTEDPROTOCOL` 或 `E403`

OIDC 握手失败。最可能的原因，按频率排序：

1. **npmjs.com 上的可信发布者条目尚不存在**，或者工作流文件名与 `release.yml` 不完全匹配。重新检查 § 1。
2. **`.github/workflows/release.yml#permissions` 中缺少 `id-token: write`**。重新检查 § 2。
3. **`setup-node` 步骤中缺少 `registry-url`**。重新检查 § 2。
4. **标签被推送到了一个 fork**。OIDC 令牌携带了它们被铸造的仓库。来自 fork 的 `git push origin vX.Y` 会推送到*您的* fork 的 origin，而不是受信任的 `BobcGn/skill-central`。从上游仓库的克隆中推送，或更新可信发布者条目以包含该 fork。

### `npm error code EPUBLISHCONFLICT — Cannot publish over existing version`

该版本已在注册表上。最可能的原因是：上一个工作流运行成功了，但后续步骤 (release 创建、发布后) 失败了，而您正在重新运行该作业。**不要重新运行**——相反：

- 确认该版本在 npm 上 (`npm view @bobcgn/skill-central versions`)。
- 如果是：跳过发布，只用 `gh release create` 手动重新运行 GitHub Release 创建。
- 如果否 (注册表缓存延迟，通常 <5 分钟)：等待并尝试 `gh release create` 而不重新运行工作流。

### `gh release create` 失败并提示 "Release with the same tag name already exists"

上一个运行创建了 release 但后来失败了。删除它并重新运行，或者直接通过 web UI 编辑现有的 release 正文。

### "Provenance attestation not generated" (警告，非错误)

`npm publish` 成功了，但没有附加 Sigstore 证明。原因：

- 缺少 `--provenance` 标志——重新检查 § 2。
- npm 在 OIDC 不受支持的环境中运行 (例如，带有旧版 `npm` 的自托管 runner)。托管的 runner (`ubuntu-latest` 等) 都支持它。

发布的 tarball 仍然可用；只是没有来源证明。在下一次发布前修复。

### 预发布标签意外地成为了 `latest`

当标签的 semver 没有预发布后缀时发生。例如，`v0.2.1` (无后缀) → `latest`。`v0.2.1-rc.1` → `next` (或您通过 `--tag` 传递的任何内容)。修复：

```bash
npm dist-tag add @bobcgn/skill-central@<previous-stable> latest
# 例如，如果 0.2.0 是上一个稳定版：
npm dist-tag add @bobcgn/skill-central@0.2.0 latest
```

然后弃用有问题的版本：`npm deprecate @bobcgn/skill-central@<bad> "wrong dist-tag"`。

### 我丢失了 GitHub Release

从现有的 CHANGELOG 条目重新创建它：

```bash
VERSION="0.X.Y"
START=$(grep -n "^## \[$VERSION\]" CHANGELOG.md | head -1 | cut -d: -f1)
END=$(awk -v s="$START" 'NR>s && /^## \[/ {print NR; exit}' CHANGELOG.md)
END=${END:-$(($(wc -l < CHANGELOG.md) + 1))}
sed -n "${START},$((END-1))p" CHANGELOG.md > /tmp/notes.md
gh release create "v$VERSION" --title "v$VERSION" --notes-file /tmp/notes.md
```

(与工作流使用的 awk 惯用法相同，为手动恢复复制出来。)

---

## 7. 回滚一个糟糕的发布

可信发布对回滚的故事没有太大改变——npm 的 72 小时取消发布窗口仍然适用。顺序：

1. 在发布后 72 小时内：`npm unpublish @bobcgn/skill-central@0.X.Y --force`。永久移除。
2. 72 小时后，或者如果版本有依赖项：提升到下一个补丁版本，发布它，然后 `npm deprecate @bobcgn/skill-central@0.X.Y "reason"`。升级并越过弃用警告的用户不会受到影响。
3. 无论哪种方式，删除 GitHub Release：`gh release delete v0.X.Y --yes`。如果版本已被撤销，release tarball 会 404；删除它会移除误导性的 UI。

对于无法等待可信发布者配置完成的热修复 (例如，工作流本身已损坏)，请回退到 [`docs/manual-publishing.md`](./manual-publishing.md)。**不要**添加 `NPM_TOKEN` secret 来绕过——这会破坏 OIDC 信任模型，下一次 `git push` 可能会发布任何东西。

---

## 8. 快速参考 (单屏版本)

**设置 (一次性):**

```bash
# 1. 在 https://www.npmjs.com/package/@bobcgn/skill-central/settings
#    → Publishing access → Trusted Publishers → Add GitHub Actions
#    Owner=BobcGn, Repo=skill-central, Workflow filename=release.yml
# 2. 确认 `.github/workflows/release.yml` 有：
#       permissions: { contents: write, id-token: write }
#       setup-node:  { registry-url: 'https://registry.npmjs.org', ... }
#       publish step: npm publish --provenance --access public
```

**发布:**

```bash
git checkout main && git pull --ff-only
# ... 编辑 CHANGELOG.md, package.json, 代码 ...
git commit -m "chore(release): bump to 0.X.Y"
git push origin main
git tag -a v0.X.Y -m "v0.X.Y — <摘要>"
git push origin v0.X.Y
# → 观察 https://github.com/BobcGn/skill-central/actions
```

**验证:**

```bash
npm view "@bobcgn/skill-central@0.X.Y" version
npm view "@bobcgn/skill-central" dist-tags
npm view "@bobcgn/skill-central@0.X.Y" --json | jq .dist.attestations
```

**回滚:**

```bash
# 72小时内:
npm unpublish "@bobcgn/skill-central@0.X.Y" --force
# 否则:
npm deprecate "@bobcgn/skill-central@0.X.Y" "reason"
gh release delete v0.X.Y --yes
```
