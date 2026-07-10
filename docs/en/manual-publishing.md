# Manual Publishing Guide

> **Audience:** the project owner. Use this when you want to publish a new version of `@bobcgn/skill-central` by hand. If you can wire a release job into CI (Trusted Publishing via OIDC, or a long-lived Automation Token in a repo secret), do that instead — this guide exists for the case when that's not viable.
>
> **Scope:** every release from v0.2.0 onward. For v0.1.0 you used a different procedure; cross-reference [`CHANGELOG.md`](../CHANGELOG.md) if you need to reconstruct it.
>
> **Recommended path:** see [`docs/trusted-publishing.md`](./trusted-publishing.md) for the one-time OIDC setup that turns `git push --tags` into a fully automated publish + GitHub Release. Use this manual guide only as a fallback when Trusted Publisher is unavailable (e.g. shipping a hotfix before the npmjs.com config is wired up, or publishing from a fork under a different scope).

## When to use this

Use this guide if **any** of the following is true:

- The CI pipeline does not have a release job that runs `npm publish` automatically.
- You want to verify a release locally before announcing it.
- The CI release job is broken and you need to ship a hotfix.
- You are publishing a private fork under a different scope.

If you have Trusted Publishing configured (OIDC between GitHub Actions and npm), prefer that path; this guide's purpose is the fallback. See [`docs/trusted-publishing.md`](./trusted-publishing.md) for the one-time setup.

## Prerequisites

- [ ] `node --version` is **v22+** (the project targets Node 22 ESM)
- [ ] `npm --version` is **v10+**
- [ ] You are on the **`main` branch** in a clean working tree (`git status` reports no uncommitted changes)
- [ ] You can run `npm whoami` and it returns your npm username (e.g. `bobcgn`)
- [ ] You have completed [`docs/release-testing.md`](./release-testing.md) end-to-end and ticked every box
- [ ] You have **a Granular Access Token** or **Automation Token** with publish scope for `@bobcgn/*` (see [§ 1](#1-get-a-publishing-token) below)
- [ ] The version you intend to publish is **not yet on npm** (verified by `npm view @bobcgn/skill-central versions`)

> **Heads-up about tokens.** Two operations in this guide require fresh credentials:
> 1. The `npm publish` itself (Granular / Automation token — no OTP).
> 2. Post-publish cleanup like `npm token revoke` and `git tag --delete` (require a 2FA OTP because they modify account or repo state).
>
> If your account has 2FA enforced, have your authenticator ready for the second category.

---

## 1. Get a publishing token

> **Critical.** The token you need is **not** the "Publish token" option in the npm web UI. That one is for the website only. For CLI publish you need a **Granular Access Token** (recommended) or an **Automation Token**.

### Option A — Granular Access Token (recommended)

1. Go to <https://www.npmjs.com/settings/~/tokens>.
2. Click **"Generate New Token"** → **"Granular Access Token"** (do not pick "Classic Token" or "Publish token").
3. **Token name:** something memorable, e.g. `skill-central-publish-2026-06`.
4. **Expiration:** pick the shortest window you can tolerate. For a one-time publish, **1 day** is fine.
5. **Packages and scopes:** choose **"Read and write"**; then under "Select packages" pick **Only `@bobcgn`** (or "All packages" if you want flexibility).
6. **Other permissions:** leave the defaults.
7. Click **"Generate token"**. npm will show the token **once** — copy it immediately and store it in a password manager. The string will start with `npm_` and look like `npm_XXXXXXXXXXXXXXXXXXXX`.
8. Verify the token: run `NPM_CONFIG_TOKEN=npm_xxx npm whoami` — should print your username without asking for an OTP.

### Option B — Automation Token

1. Same URL → **"Generate New Token"** → **"Automation Token"**.
2. Choose "Publish" scope for `@bobcgn/*`.
3. Expiration 1 day.
4. Copy and verify as above.

### If you need to revoke a leaked token

- In the website: Settings → Tokens → click the row's trash icon.
- Or via CLI (requires 2FA OTP): `npm token revoke <id>` — the `<id>` is the hex you see in `npm token list`.

---

## 2. Pre-publish verification

Run these in order. Stop at the first failure and fix it.

```bash
# 0. Confirm you're on main, in a clean tree, with v0.X.0 ahead.
git checkout main
git pull --ff-only
git status                     # nothing uncommitted
git log --oneline -5

# 1. Confirm Node + npm versions
node --version
npm --version

# 2. Confirm you're logged in (existing ~/.npmrc)
npm whoami                     # prints your npm username

# 3. Confirm v0.X.0 is NOT on npm yet (would 409 otherwise)
npm view @bobcgn/skill-central@0.X.0 version
# expect: "npm error 404 No match found for version 0.X.0"

# 4. Run the pre-publish dry-run
npm publish --dry-run --access public
# expect: 119 files, ~78 kB tarball, "Publishing to ... with tag latest and public access (dry-run)"
```

If any step in this section fails, **stop and investigate**. The most common failure modes and fixes are in [§ 6](#6-troubleshooting).

---

## 3. Bump the version

Choose the right bump for the change set:

| Change shape | Bump | Example |
|---|---|---|
| Breaking API change or new feature set | **minor** | `0.1.0` → `0.2.0` |
| Backward-compatible bug fix or doc update | **patch** | `0.2.0` → `0.2.1` |
| Pre-release channel | **pre-release** | `0.2.0` → `0.3.0-rc.1` |

Update three places consistently:

```bash
# Use npm version — it updates package.json AND creates a git tag.
# Pick one:
npm version minor -m "chore(release): %s"
npm version patch -m "chore(release): %s"
npm version prerelease --preid=rc -m "chore(release): %s"

# (Alternative: edit package.json by hand, then `git tag -a v0.X.0 -m "..."`)
```

`npm version` also commits the change; if you prefer to keep the version bump in the same release commit as other code, edit `package.json` by hand and tag separately.

Push the new tag and the commit:

```bash
git push origin main
git push origin v0.X.0
```

---

## 4. Publish

The script below uses a **temporary `.npmrc`** so the publish token does not overwrite your everyday `~/.npmrc` (which may carry a legacy auth token that triggers 2FA).

```bash
cd /path/to/skill-central

# Substitute the token you generated in § 1.
export NPM_PUBLISH_TOKEN='npm_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

# Build a temp .npmrc that uses ONLY the publish token.
TMP_NPMRC="$(mktemp -t npmrc.XXXXXX)"
cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org
//registry.npmjs.org/:_authToken=${NPM_PUBLISH_TOKEN}
EOF
chmod 600 "$TMP_NPMRC"
trap "rm -f '$TMP_NPMRC'" EXIT

# Sanity check: whoami with the publish token (no OTP prompt expected).
npm whoami --userconfig "$TMP_NPMRC"

# Publish. The prepublishOnly script in package.json runs `npm run build`
# and `npm run build:web` first, so the dist/ tree is always fresh.
npm publish --access public --tag latest --userconfig "$TMP_NPMRC"
unset NPM_PUBLISH_TOKEN
```

Expected output (last few lines):

```
+ @bobcgn/skill-central@0.X.0
```

If you do not see `+ @bobcgn/skill-central@0.X.0`, the publish failed. Do **not** retry blindly — see [§ 6](#6-troubleshooting).

> **About `--tag latest`.** npm tags are independent of semver. By default a new top-of-range version is tagged `latest`, so `npm install @bobcgn/skill-central` resolves to it. You can omit `--tag latest` if you want to inherit npm's default, but the explicit form is less ambiguous. For pre-releases, prefer `--tag next` so `latest` keeps pointing at a stable release.

---

## 5. Post-publish verification

Run these immediately after the publish succeeds. They confirm the package is reachable and the contents match what you intended.

```bash
# 5.1 Confirm the new version is on the registry
npm view @bobcgn/skill-central@0.X.0 version
# expect: 0.X.0

# 5.2 Confirm the dist-tag moved
npm view @bobcgn/skill-central dist-tags
# expect: { "latest": "0.X.0", ... }

# 5.3 Confirm the tarball contains the web assets
npm view @bobcgn/skill-central@0.X.0 dist
# expect: integrity sha512-..., tarball URL with version 0.X.0

# 5.4 Smoke test: install in a clean dir and run
mkdir -p /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null
npm install @bobcgn/skill-central@0.X.0
npx skill-central --version
npx skill-central --help | head -8
npx skill-central init
npx skill-central board --cli | head -5
cd / && rm -rf /tmp/sc-smoke

# 5.5 GitHub release (optional but recommended)
gh release create v0.X.0 \
  --title "v0.X.0" \
  --notes-file - <<'EOF'
## What's in v0.X.0

- …
- …

**Install:** `npm install @bobcgn/skill-central@0.X.0`
EOF
```

If any of 5.1–5.3 fails, the publish did not actually land on the registry — investigate before announcing.

---

## 6. Troubleshooting

### `npm error 401 Unauthorized`

`npm` cannot find any usable auth. Either `~/.npmrc` is missing/wrong, or your token was revoked. Re-run § 1 to get a new Granular / Automation token, then re-run § 4.

### `npm error EOTP — This operation requires a one-time password`

Two different things can trigger this:

- **You invoked `npm publish` with the wrong token type** (a "Publish token" from the web UI). It authenticates but cannot perform publish. The fix is to use a Granular or Automation token — see § 1.
- **Your account has 2FA enforced AND you are not using a token.** Re-run with `--userconfig "$TMP_NPMRC"` pointing at a `.npmrc` that holds a Granular / Automation token. The token-based auth bypasses 2FA for publish.

Quick diagnosis:

```bash
# Which token is in use?
npm token list --userconfig "$TMP_NPMRC"
# Each row's "type" column should be "Granular" or "Automation", not "Publish".
```

### `npm error 403 — You may not perform that action with these credentials`

The token is valid but lacks publish scope for this package. Most common causes:

- Token's package scope is set to a different scope (e.g. `@other-org` instead of `@bobcgn`).
- Token is a **"Publish token"** (web UI type) — see § 1.
- Token is a read-only Granular token.

Re-generate with the right scope and re-run § 4.

### `npm error code E404 — No match found for version 0.X.0`

You tried to view a version that does not exist yet. **This is the expected output for the "is it published yet?" check in § 2 step 3.** Do not treat it as a failure.

If it appears *after* a successful publish, the publish itself did not land — re-run § 2 and § 4.

### `npm error code EPUBLISHCONFLICT — Cannot publish over existing version`

Someone (or a CI run) already published `0.X.0`. Either:

- They were you on another machine — verify with `git log --all` and confirm you have not been working in two clones.
- They are a CI release job that was not disabled. Check the `release` job in `.github/workflows/ci.yml` and either remove it or coordinate.

Fix: bump to `0.X.1` (patch) and re-run from § 2.

### Tarball size is wrong / `dist/web/` is missing

The `files:` field in `package.json` controls what gets included. Verify:

```bash
npm pack --dry-run | grep -E "dist/web|index.html|app.js|style.css"
```

You should see at least `dist/web/index.html`, `dist/web/app.js`, `dist/web/style.css`, plus all the `dist/commands/*.js`, `dist/storage/*.js`, `dist/protocol/*.js`. If `dist/web/` is missing, check that:

- `npm run build:web` ran (it copies `src/web/static/` to `dist/web/`)
- The `files:` array in `package.json` includes `"dist/web/"`
- `dist/web/index.html` exists locally

Fix the underlying issue, re-run `npm run build:web`, and re-run § 4.

### `npm error EACCES` or `EPERM` writing to a file

Permission issue on the working tree. Check `ls -la dist/`, fix ownership, or re-clone the repo.

### "I forgot to bump the version and published 0.1.0 over the existing 0.1.0"

You cannot unpublish a single version. Options:

- **Deprecate the version**: `npm deprecate @bobcgn/skill-central@0.1.0 "reason"`. This is the right move — leaves the version published but warns users away.
- **Unpublish the whole package**: `npm unpublish @bobcgn/skill-central --force`. Only available within **72 hours** of the publish and not allowed if the package has dependents. Use only as a last resort.

If you really need to "remove" a bad release, bump to the next patch, publish, and deprecate the broken one.

---

## 7. Quick reference (one-screen version)

```bash
# 0. Pre-flight
git checkout main && git pull --ff-only && git status
node --version && npm --version && npm whoami

# 1. Confirm not yet published
npm view @bobcgn/skill-central@0.X.0 version
npm publish --dry-run --access public

# 2. Bump + tag + push
npm version minor -m "chore(release): %s"
git push origin main
git push origin v0.X.0

# 3. Publish
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

# 4. Verify
npm view @bobcgn/skill-central@0.X.0 version
npm view @bobcgn/skill-central dist-tags

# 5. Smoke install
mkdir -p /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null && npm install @bobcgn/skill-central@0.X.0
npx skill-central --version && npx skill-central --help | head -3
cd / && rm -rf /tmp/sc-smoke

# 6. Revoke the publish token (now public in chat / history)
#    — manual at https://www.npmjs.com/settings/~/tokens
#    — or `npm token revoke <id>` (needs 2FA OTP)
```

---

## 8. What to do after publishing

- [ ] Mark the v0.X.0 todo in your tracker as done
- [ ] Update any dependent projects (none here, but if you have a downstream consumer)
- [ ] Post a short announcement (project README badge, social, etc.) linking to the GitHub release
- [ ] Close the milestone on GitHub if you use them
- [ ] If a CI release job exists, make sure it is configured to skip this version (so it does not try to re-publish and fail with EPUBLISHCONFLICT)
