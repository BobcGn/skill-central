# Trusted Publishing (npm OIDC)

> **Audience:** the project owner. Use this guide to wire npm Trusted Publishing to GitHub Actions for `@bobcgn/skill-central`. After the one-time setup, every `v*` tag push runs `.github/workflows/release.yml`, which publishes to npm and creates a GitHub Release — **no manual `npm publish`, no long-lived token in repo secrets**.
>
> **Scope:** applies from v0.2.1 onward (when `release.yml` was added). v0.2.0 was published manually before this flow existed; cross-reference [`CHANGELOG.md`](../CHANGELOG.md) if you need to reconstruct it.

## When to use this

Set up Trusted Publishing if **any** of the following is true:

- You want `git push --tags` to ship a release end-to-end with no further action.
- You want every published tarball to carry a **Sigstore-signed provenance attestation** verifiable via `npm view <pkg> --json | jq .dist.attestations`.
- You're tired of minting Granular Access Tokens for each release and revoking them after.

If you specifically need to publish **without** configuring OIDC (e.g. forking the project under a different npm scope), use [`docs/manual-publishing.md`](./manual-publishing.md) instead — that guide is the long-lived-token fallback.

## Prerequisites

- [ ] You own (or have admin access to) [`@bobcgn/skill-central`](https://www.npmjs.com/package/@bobcgn/skill-central) on npmjs.com
- [ ] You have admin access to [`BobcGn/skill-central`](https://github.com/BobcGn/skill-central) on GitHub
- [ ] The `.github/workflows/release.yml` file exists in `main` (it does as of v0.2.1)
- [ ] You have read [`docs/manual-publishing.md`](./manual-publishing.md) at least once, so you know what the workflow is automating

---

## 1. Register the workflow as a Trusted Publisher on npm

This step happens once, on npmjs.com, and creates the OIDC trust anchor.

1. Open <https://www.npmjs.com/package/@bobcgn/skill-central/settings>.
2. Scroll to **Publishing access** → **Trusted Publishers** → **Add GitHub Actions**.
3. Fill in:

   | Field | Value | Why |
   |---|---|---|
   | Owner | `BobcGn` | The GitHub org / user that owns this repo |
   | Repository | `skill-central` | The repo name |
   | Workflow filename | `release.yml` | **Must match** the basename of `.github/workflows/release.yml`. If you ever rename the workflow, you must update this field — there's no auto-detection. |
   | Environment name | *(leave blank)* | Optional. Setting one here gates the OIDC token to a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) with its own protection rules. Recommended for high-stakes repos; skip for solo projects. |

4. Click **Add**. The new entry appears in the Trusted Publishers list with a truncated hash of its config — that hash is what npm checks on every publish, so **do not edit the workflow filename after this step without also updating the entry**.

> **Why not an npm Granular Access Token?** Tokens are bearer secrets: they outlive the workflow run, they can leak in logs, they have to be rotated. OIDC tokens are short-lived (a few minutes), tied to a specific workflow run, and never appear in logs as a usable secret. The npmjs.com docs call this "the recommended approach for npm publishing from CI" as of 2024.

---

## 2. Sanity-check the workflow configuration

Open `.github/workflows/release.yml` and confirm three things:

- [ ] `permissions.id-token: write` is present (mandatory for `--provenance`)
- [ ] `setup-node` step has `registry-url: 'https://registry.npmjs.org'` (this is what wires the OIDC token into npm's auth flow)
- [ ] `npm publish` step uses `--provenance --access public`

If any of these are missing, `npm publish` will fail with one of:

- `npm error code EUNSUPPORTEDPROTOCOL` (no `registry-url`)
- `npm error code E403` (no `id-token: write`)
- `npm notice provenance attestation not generated` (no `--provenance`)

---

## 3. Dry-run the workflow without actually publishing

Before you push a real tag, you can validate that the OIDC handshake works without burning a release attempt:

1. In a throwaway branch, edit `release.yml` to comment out the `npm publish` step and the `Create GitHub Release` step, leaving only the build + checks.
2. Push the branch. The workflow **will not run** (it only triggers on `v*` tags).
3. Create a dummy tag: `git tag -a v0.0.0-test -m "OIDC handshake probe" && git push origin v0.0.0-test`.
4. Watch the Actions tab — the build + version checks should pass.
5. If `npm view` step is reached at the end (it now is, since the publish step is commented out — wait, it's also gated on `if: success()` after the publish), it will skip because the publish step did succeed (`if: success()` evaluates the upstream step's status, which is "skipped" = success). Skip this dry-run entirely; just push a real `v0.0.0-test.1` tag with a pre-release suffix and accept the throwaway publish.

Actually, a cleaner approach: **publish a real pre-release**. npm accepts and propagates `v0.0.0-trusted-publishing-test.1` as a `next` tag without disturbing `latest`:

```bash
git tag -a v0.0.0-trusted-publishing-test.1 -m "OIDC handshake probe — not a real release"
git push origin v0.0.0-trusted-publishing-test.1
```

Wait for the workflow to finish, then:

```bash
# Confirm provenance
npm view "@bobcgn/skill-central@0.0.0-trusted-publishing-test.1" --json | jq .dist.attestations
# Deprecate so users get a warning if they ever hit this version
npm deprecate "@bobcgn/skill-central@0.0.0-trusted-publishing-test.1" "OIDC handshake probe, not a real release."
# Delete the tag on both sides
git push origin :v0.0.0-trusted-publishing-test.1
git tag -d v0.0.0-trusted-publishing-test.1
```

> **You cannot unpublish a published version after 72 hours.** The deprecate step above adds an `npm WARN deprecated` line to anyone who installs, but does not remove the version. Pick your probe tag accordingly (e.g. `0.0.0-trusted-publishing-test.<date>`).

---

## 4. The actual release flow

Once § 1–§ 2 are done, every release is:

```bash
# On main, with a clean tree, after the changelog + package.json bump are committed:
git checkout main && git pull --ff-only
git status                     # nothing uncommitted
git log --oneline -3           # confirm you're where you think you are

# Tag — the workflow does the rest.
git tag -a v0.X.Y -m "v0.X.Y — <one-line summary>"
git push origin v0.X.Y
```

The workflow will:

1. Build the project (tsc + build:web) on a fresh Ubuntu runner.
2. Verify the built artifacts (`dist/index.js`, `dist/web/index.html`).
3. Verify `package.json#version` matches the tag.
4. Verify `CHANGELOG.md` has a `## [<version>]` section.
5. Run `npm publish --provenance --access public` via OIDC. npm records the Sigstore provenance attestation.
6. Extract the matching CHANGELOG section and create the GitHub Release with it as the body.
7. Run a best-effort `npm view` against the new version to confirm registry propagation (warns, does not fail).

You can watch progress in the **Actions** tab on GitHub. Successful run looks like:

```
✓ Publish to npm
✓ Extract CHANGELOG section for release notes
✓ Create GitHub Release
✓ Verify npm registry propagation
```

A failed run shows up as a red ❌ on the first failed step with a direct link to the relevant log lines.

---

## 5. After the workflow succeeds

The same checks that the manual flow runs are still useful:

```bash
# 5.1 Confirm the new version is on the registry
npm view "@bobcgn/skill-central@0.X.Y" version

# 5.2 Confirm the dist-tag moved
npm view "@bobcgn/skill-central" dist-tags

# 5.3 Confirm provenance attestation is present
npm view "@bobcgn/skill-central@0.X.Y" --json | jq .dist.attestations

# 5.4 Smoke test in a clean dir
mkdir -p /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null
npm install "@bobcgn/skill-central@0.X.Y"
npx skill-central --version
npx skill-central --help | head -8
npx skill-central init
npx skill-central board --cli | head -5
cd / && rm -rf /tmp/sc-smoke
```

The GitHub Release is created automatically by the workflow — no need to run `gh release create` by hand. You can find it at <https://github.com/BobcGn/skill-central/releases/tag/v0.X.Y>.

---

## 6. Troubleshooting

### `npm error code EUNSUPPORTEDPROTOCOL` or `E403` on `npm publish`

The OIDC handshake failed. Most likely causes, in order of frequency:

1. **The Trusted Publisher entry on npmjs.com doesn't exist yet**, or the workflow filename doesn't match `release.yml` exactly. Re-check § 1.
2. **`id-token: write` is missing** from `.github/workflows/release.yml#permissions`. Re-check § 2.
3. **`registry-url` is missing** from the `setup-node` step. Re-check § 2.
4. **The tag was pushed to a fork**. OIDC tokens carry the repo they were minted for. A `git push origin vX.Y` from a fork goes to *your* fork's origin, not the trusted `BobcGn/skill-central`. Push from a clone of the upstream repo, or update the Trusted Publisher entry to include the fork.

### `npm error code EPUBLISHCONFLICT — Cannot publish over existing version`

The version is already on the registry. Most likely cause: a previous workflow run succeeded but the later steps (release creation, post-publish) failed, and you're re-running the job. **Do not re-run** — instead:

- Confirm the version is on npm (`npm view @bobcgn/skill-central versions`).
- If yes: skip the publish and only re-run the GitHub Release creation manually with `gh release create`.
- If no (registry cache lag, usually <5 min): wait and try `gh release create` without re-running the workflow.

### `gh release create` fails with "Release with the same tag name already exists"

A previous run created the release but failed later. Delete it and re-run, or just edit the existing release body via the web UI.

### "Provenance attestation not generated" (warning, not error)

`npm publish` succeeded but didn't attach a Sigstore attestation. Causes:

- `--provenance` flag missing — re-check § 2.
- npm ran in a context where OIDC isn't supported (e.g. a self-hosted runner with old `npm`). The hosted runners (`ubuntu-latest` etc.) all support it.

The published tarball is still usable; it just won't have the provenance attestation. Fix before the next release.

### A pre-release tag accidentally became `latest`

Happens when the tag's semver doesn't carry a pre-release suffix. For example, `v0.2.1` (no suffix) → `latest`. `v0.2.1-rc.1` → `next` (or whatever you pass via `--tag`). Fix:

```bash
npm dist-tag add @bobcgn/skill-central@<previous-stable> latest
# e.g. if 0.2.0 was the previous stable:
npm dist-tag add @bobcgn/skill-central@0.2.0 latest
```

Then deprecate the offending version: `npm deprecate @bobcgn/skill-central@<bad> "wrong dist-tag"`.

### I lost the GitHub Release

Re-create it from the existing CHANGELOG entry:

```bash
VERSION="0.X.Y"
START=$(grep -n "^## \[$VERSION\]" CHANGELOG.md | head -1 | cut -d: -f1)
END=$(awk -v s="$START" 'NR>s && /^## \[/ {print NR; exit}' CHANGELOG.md)
END=${END:-$(($(wc -l < CHANGELOG.md) + 1))}
sed -n "${START},$((END-1))p" CHANGELOG.md > /tmp/notes.md
gh release create "v$VERSION" --title "v$VERSION" --notes-file /tmp/notes.md
```

(Same awk idiom the workflow uses, copied out for manual recovery.)

---

## 7. Rolling back a bad release

Trusted Publisher doesn't change the rollback story much — npm's 72-hour unpublish window still applies. The sequence:

1. Within 72 hours of publish: `npm unpublish @bobcgn/skill-central@0.X.Y --force`. Permanent removal.
2. After 72 hours, or if the version has dependents: bump to the next patch, publish that, then `npm deprecate @bobcgn/skill-central@0.X.Y "reason"`. Users who upgrade past the deprecation warning will not be affected.
3. Either way, delete the GitHub Release: `gh release delete v0.X.Y --yes`. If the version was already yanked, the release tarball will 404; deleting it removes the misleading UI.

For a hotfix that can't wait for Trusted Publisher to be configured (e.g. the workflow itself is broken), fall back to [`docs/manual-publishing.md`](./manual-publishing.md). Do **not** add a `NPM_TOKEN` secret to bypass — that defeats the OIDC trust model and the next `git push` could publish anything.

---

## 8. Quick reference (one-screen version)

**Setup (one time):**

```bash
# 1. On https://www.npmjs.com/package/@bobcgn/skill-central/settings
#    → Publishing access → Trusted Publishers → Add GitHub Actions
#    Owner=BobcGn, Repo=skill-central, Workflow filename=release.yml
# 2. Confirm `.github/workflows/release.yml` has:
#       permissions: { contents: write, id-token: write }
#       setup-node:  { registry-url: 'https://registry.npmjs.org', ... }
#       publish step: npm publish --provenance --access public
```

**Release:**

```bash
git checkout main && git pull --ff-only
# ... edit CHANGELOG.md, package.json, code ...
git commit -m "chore(release): bump to 0.X.Y"
git push origin main
git tag -a v0.X.Y -m "v0.X.Y — <summary>"
git push origin v0.X.Y
# → watch https://github.com/BobcGn/skill-central/actions
```

**Verify:**

```bash
npm view "@bobcgn/skill-central@0.X.Y" version
npm view "@bobcgn/skill-central" dist-tags
npm view "@bobcgn/skill-central@0.X.Y" --json | jq .dist.attestations
```

**Rollback:**

```bash
# Within 72h:
npm unpublish "@bobcgn/skill-central@0.X.Y" --force
# Otherwise:
npm deprecate "@bobcgn/skill-central@0.X.Y" "reason"
gh release delete v0.X.Y --yes
```