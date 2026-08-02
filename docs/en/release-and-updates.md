# Release and Updates

[简体中文](../ch/release-and-updates.md) | [Documentation index](./README.md)

Release creation, tags, package publication, signing, and repository permission changes are maintainer-only operations. Contributors may improve implementation and tests, but must not create a project Release without explicit authorization.

## Current Release Candidate

`1.0.0-rc.2` is the current release candidate and is intended to be published as a public GitHub prerelease after the workflow stages the draft artifacts. Public prerelease publication is required before Homebrew and in-app update checks can download `latest-mac.yml`, `latest.yml`, and installer assets. RC.2 contains the macOS Dock single-icon fix for the local MCP Runtime child process, automatic cleanup of unpacked app bundles after packaging, and the unpacked-build-location launch warning. It remains unsigned and not notarized on macOS, and Windows packaged behavior still requires real machine verification before `1.0.0`.

The already published `alpha.1` application contains the broken updater and cannot be fixed retroactively. Upgrading an existing `alpha.1` installation to `alpha.2` therefore requires one Terminal operation or a manual DMG replacement. Later packaged desktop releases can use the repaired in-app updater.

## Version Invariants

The release version must agree across:

- the Git tag, formatted as `v<version>`;
- `package.json` and lockfile package metadata;
- the matching `## [<version>]` entry in `CHANGELOG.md`;
- generated package metadata, artifact filenames, and the generated Cask.

The runtime version is sourced from package metadata during the build. A version containing a prerelease suffix is a GitHub prerelease.

## Release Pipeline

A pushed `v*` tag starts the Release workflow only after candidate validation has completed:

1. Validate the version and changelog, then run lint and the complete integration suite.
2. Build the source archive and macOS/Windows desktop artifacts.
3. Generate a Cask from the actual arm64/x64 DMGs and their SHA-256 digests.
4. Open a Cask update pull request against `main` but leave it unmerged.
5. Assemble the artifacts as a draft GitHub Release.
6. Inspect and publish the draft manually only after every release gate passes.
7. Immediately merge the generated Cask PR, then test the public Homebrew install and upgrade routes.

The workflow never makes the Release public automatically. Do not merge a generated Cask while its target assets are still private in a draft; doing so would make the public Tap point at inaccessible files. Publishing the Release before merging the Cask produces a short interval where Homebrew still reports the previous version, which is recoverable and does not break the existing route.

## Artifacts

| Platform | Architectures | Artifacts |
| --- | --- | --- |
| macOS | x64, arm64 | DMG, ZIP, `latest-mac.yml` |
| Windows | x64 | NSIS EXE, MSI, ZIP, blockmap, `latest.yml` |
| Source | platform-neutral | Version-prefixed ZIP from `git archive` |
| Homebrew | arm64, x64 | Generated `skill-central.rb` with per-architecture SHA-256 |

Desktop filenames use `Skill-Central-<version>-<os>-<arch>.<ext>`. Local artifacts are generated under `release-artifacts/` and are not committed.

After a successful packaging run, the intermediate unpacked app bundles that
electron-builder leaves in the output directory (`mac/`, `mac-arm64/`, `win-unpacked/`,
`__msi-*`) are removed automatically. `release-artifacts/` therefore contains only final
artifacts — never a second runnable copy of the application next to the installed one.

## macOS Homebrew Installation

The supported Tap currently uses the application repository as an explicit custom remote; there is no separate `homebrew-skill-central` repository. Homebrew 6 requires trust before loading this third-party Tap:

```bash
brew tap bobcgn/skill-central https://github.com/BobcGn/skill-central
brew trust bobcgn/skill-central
brew install --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

Review the repository and `Casks/skill-central.rb` before granting trust. The Cask installs `/Applications/Skill Central.app`; it does not launch the application. `open -a` starts the packaged Electron desktop program. From a source checkout, maintainers can verify ownership and runtime state with:

```bash
npm run homebrew:diagnose
```

The macOS alpha has no Developer ID signature and is not notarized, so it cannot pass normal Gatekeeper verification. If Gatekeeper blocks the first launch, verify the official repository, Release asset, and pinned Cask SHA-256, then prefer **System Settings > Privacy & Security > Open Anyway** or Control-click the application in Finder and choose **Open**. Only if macOS still reports that the app is damaged and offers no exception, run:

```bash
xattr -r -d com.apple.quarantine /Applications/"Skill Central".app
```

This exact-path last resort removes the quarantine attribute and weakens Gatekeeper protection for that App Bundle. Do not use it for another path or an unverified artifact. Developer ID signing and Apple notarization are the proper fix. An upgrade may require another Gatekeeper decision while packages remain unsigned.

## Adopt a DMG Installation

First quit Skill Central with `Command-Q` or **Quit Skill Central**. Install and trust the Tap, then ask Homebrew to adopt the existing bundle:

```bash
brew install --cask --adopt --require-sha bobcgn/skill-central/skill-central
```

Homebrew adopts the application only when its bundle version matches the Cask artifact. If adoption refuses, preserve the existing app instead of deleting it:

```bash
mv /Applications/"Skill Central".app "$HOME/Desktop/Skill Central.app.pre-homebrew"
brew install --cask --require-sha bobcgn/skill-central/skill-central
```

This moves only the App Bundle. Skill sources under `~/.skill-central/` and application state under `~/Library/Application Support/skill-central/` remain untouched. Keep the backup until the Homebrew installation passes the smoke test. Do not use `brew uninstall --zap` for migration or routine upgrades.

## One-Time Alpha.1 Upgrade

Because the `alpha.2` Release is public and its generated Cask has been merged, an `alpha.1` user must first adopt or install the Cask as above, then run:

```bash
brew update
brew upgrade --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

This one-time Terminal step or manual DMG replacement is required because the public `alpha.1` binary does not contain the repaired updater.

## Desktop Background Contract

After launch, one Skill Central application process owns one loopback Board server. Closing the last macOS window with the red button keeps both alive. Reopening from the Dock, application menu, or menu bar icon reuses the same service instead of starting another process or port. `Command-Q` and **Quit Skill Central** stop the process and server completely.

Homebrew guarantees installation of the desktop App Bundle, not automatic launch or Login Items behavior. Skill Central does not currently start at login. The following real-app checks are required:

1. Launch the Cask-installed app and run `npm run homebrew:diagnose`.
2. Close the red window and confirm the diagnostic still reports one process and a loopback listener.
3. Reopen from the Dock and menu bar, confirming that no second process or listener appears.
4. Use the application or menu bar Quit action and confirm the process/listener disappear.
5. Launch twice and confirm the single-instance behavior restores the original window.

## Pre-Release Candidate Tap

Candidate testing uses local DMGs and a temporary Git-backed Tap. It does not require a GitHub Release. Build both architectures, then generate the Tap:

```bash
export SKILL_CENTRAL_GITHUB_CLIENT_ID="<project OAuth App public Client ID>"
npm run package:mac
CANDIDATE_TAP="$(mktemp -d /tmp/skill-central-homebrew.XXXXXX)"
npm run homebrew:candidate -- \
  --version "$(node -p "require('./package.json').version")" \
  --arm64 "release-artifacts/Skill-Central-$(node -p "require('./package.json').version")-mac-arm64.dmg" \
  --x64 "release-artifacts/Skill-Central-$(node -p "require('./package.json').version")-mac-x64.dmg" \
  --tap-dir "$CANDIDATE_TAP"
```

The generator validates artifact names, computes both hashes, commits the Cask, and prints the Tap path. It does not change Homebrew or `/Applications`. To test the hard-coded production Tap identity, temporarily replace the public Tap with this local remote:

```bash
brew tap --custom-remote bobcgn/skill-central "file://$CANDIDATE_TAP"
brew trust bobcgn/skill-central
brew install --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

Use `--adopt` on the install command when testing migration from a matching DMG bundle. To test in-app updating, build a second candidate with a strictly higher package version, rerun `homebrew:candidate` with the same `--tap-dir`, then use **Check for updates** and **Install and restart** in the installed first candidate. The reported application and Cask versions must both change to the second version.

After testing, quit the app, uninstall the candidate without `--zap`, and restore the public Tap remote:

```bash
brew uninstall --cask bobcgn/skill-central/skill-central
brew tap --custom-remote bobcgn/skill-central https://github.com/BobcGn/skill-central
brew trust bobcgn/skill-central
```

Restore any `.pre-homebrew` App Bundle only after the candidate has been uninstalled. The temporary Tap directory can then be removed.

## Update Architecture

The desktop creates one platform-specific `UpdateController` and exposes its snapshot through the loopback Board API. A packaged desktop checks once shortly after first window load; development and unsupported builds do not modify an installation.

On macOS and Windows, packaged desktop builds use `electron-updater` against GitHub Release metadata. Alpha builds allow prerelease updates; checking for updates no longer depends on Homebrew Tap trust or Cask ownership. The current macOS alpha remains unsigned, so automatic installation must be validated with real packages; use the Release DMG manually if installation fails. The Homebrew Cask remains a macOS installation route with pinned SHA-256 checksums, but it is not a prerequisite for in-app update checks.

Update check failures are classified into concise, stable user-facing reasons
(release not published yet, network unreachable, server rejection, or unknown) and
rendered with localized copy in the Board. Raw request details — URLs, headers, and
stack context — never reach the client UI; they stay in the desktop diagnostic log.

On Windows, packaged NSIS builds also use `electron-updater` with GitHub. MSI and ZIP are manual deployment formats and are not assumed to have NSIS update behavior. Windows remains unverified for these changes and must be tested separately before claiming support.

## GitHub OAuth Release Configuration

Official desktop packages require a project-owned GitHub OAuth App. A maintainer creates it under GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**. Use `Skill Central` as the application name and `https://github.com/BobcGn/skill-central` as the homepage. The registration form requires an Authorization Callback URL; the same project URL is suitable because Device Flow does not use that callback. After creation, enable **Enable Device Flow** in the OAuth App settings.

Record only the public Client ID shown on the page. Do not generate, copy, or configure a client secret. Under repository **Settings → Secrets and variables → Actions → Variables**, add this repository variable:

- Name: `SKILL_CENTRAL_GITHUB_CLIENT_ID`
- Value: the Client ID shown on the OAuth App page

The Release workflow validates this variable and writes it into desktop package metadata; a missing or malformed value blocks packaging. After configuration, a real release-candidate package must still pass login, user-profile lookup, and logout testing.

## Alpha Release Gate Checklist

1. Land all English and Chinese installation, migration, update, security, and lifecycle documentation.
2. Keep package metadata at the current released version until implementation and documentation are ready for candidate packaging.
3. Run `npm ci`, `npm run lint`, `npm test`, and `npm run build:desktop` from a clean checkout.
4. Build both macOS architectures; generate the candidate Cask and run `ruby -c`, `brew style`, and offline strict Cask audit checks. Run the online `brew audit --new` only after the Release URL is public.
5. Test a fresh Homebrew install on Apple Silicon and Intel where available.
6. Test DMG adoption and the recoverable backup route without changing skill sources or application state.
7. Test red-button background behavior, Dock/menu bar restore, single instance, and full Quit.
8. Test an actual Cask upgrade between two local candidate versions, including in-app restart and version verification.
9. Restore the public Tap remote and any backed-up DMG App Bundle; rerun the read-only diagnostic.
10. Record Windows as verified or explicitly unverified; do not infer Windows success from macOS.
11. Create a maintainer-controlled GitHub OAuth App with Device Flow enabled and set its public Client ID as the `SKILL_CENTRAL_GITHUB_CLIENT_ID` repository variable. Do not configure a client secret.
12. Use a real desktop candidate containing that Client ID to complete GitHub login, user-profile lookup, application restart, and logout. Confirm that users do not enter a Client ID, login survives restart, ciphertext contains no plaintext token, logout removes ciphertext, legacy plaintext credentials are deleted without migration, and API responses and logs contain no access token, device code, authorization header, ciphertext, or raw native exception.
13. Review the final diff, confirm no private `docs/dev/` or `logs/` material is tracked, then obtain maintainer approval before changing versions or tagging.

## Rollback and Failed Releases

Do not silently replace public assets or reuse a released version. Preserve an existing DMG App Bundle by moving it aside before migration. Candidate cleanup uses ordinary Cask uninstall, never `--zap`, so user-owned skill layers and local application state are not intentionally removed.

If a draft or artifact is invalid, keep it private, fix `main`, rebuild, and repeat the checks. If a public Release is invalid, document the impact and publish a new version after fixing the source; clients may have cached old metadata.
