# Release and Updates

[简体中文](../ch/release-and-updates.md) | [Documentation index](./README.md)

Release creation, tags, package publication, signing, and repository permission changes are maintainer-only operations. Contributors may improve the implementation and tests, but must not create a project release without explicit authorization.

## Version Invariants

The release version must agree across:

- the Git tag, formatted as `v<version>`;
- `package.json`;
- the matching `## [<version>]` entry in `CHANGELOG.md`;
- generated package metadata and filenames.

The runtime version is sourced from package metadata during the build. A version containing a prerelease suffix is published as a GitHub prerelease.

## Release Pipeline

A pushed `v*` tag starts the Release workflow:

1. Check out full history and install with Node.js 24.
2. Run TypeScript validation and the complete integration suite.
3. Verify tag/package/changelog version agreement.
4. Extract the matching changelog section as release notes.
5. Create or update the GitHub Release.
6. Build and upload a source archive.
7. Build macOS and Windows desktop artifacts independently.

The workflow does not cancel a release already in progress. A failing platform job must remain visible; do not publish a partial release as if every supported artifact passed.

## Artifacts

| Platform | Architectures | Artifacts |
| --- | --- | --- |
| macOS | x64, arm64 | DMG, ZIP, `latest-mac.yml` |
| Windows | x64 | NSIS EXE, MSI, ZIP, blockmap, `latest.yml` |
| Source | platform-neutral | Version-prefixed ZIP from `git archive` |

Desktop filenames use `Skill-Central-<version>-<os>-<arch>.<ext>`. Release artifacts are generated under `release-artifacts/` locally and are not committed.

## Update Architecture

The desktop creates one platform-specific `UpdateController` and exposes its snapshot through the local Board API. Supported states include idle, checking, up-to-date, available/downloading, ready, installing, unsupported, and error.

A packaged desktop starts one background check shortly after its first window loads. Development builds and unsupported platforms return an explicit unsupported snapshot instead of modifying an installation.

### Windows

Packaged Windows builds use `electron-updater` with the GitHub provider. Prereleases are allowed during the Alpha. The updater downloads automatically, installs on request or app quit as configured, and can restart the application after installation.

The NSIS EXE is the supported automatic-update installation path. MSI and ZIP assets are manual distribution formats and must not be assumed to share NSIS update behavior.

### macOS

The macOS controller invokes Homebrew only when:

- an executable exists at `/opt/homebrew/bin/brew` or `/usr/local/bin/brew`; and
- `brew list --cask --versions skill-central` confirms Cask ownership.

It runs `brew update --quiet`, inspects `brew outdated --cask --json=v2 skill-central`, and applies `brew upgrade --cask skill-central --no-ask --no-quit` before restarting.

This path is implemented but did not pass user testing for `1.0.0-alpha.1`. It remains experimental and is scheduled for end-to-end retesting with `1.0.0-alpha.2`. Current macOS users should update manually from GitHub Releases.

The macOS package has no Apple Developer identity, signing, or notarization. Follow the root README for the current quarantine-removal instructions and verify the release source first.

## Homebrew Cask

The repository contains `Casks/skill-central.rb`, but a Cask file inside the application repository is not by itself a public Homebrew distribution channel. The current Cask also uses `sha256 :no_check`, and its download/update flow has not passed the current end-to-end test.

Before declaring Homebrew supported, verify all of the following on both Apple Silicon and Intel where possible:

1. A real tap or accepted distribution location
2. Correct artifact naming and URL resolution
3. Pinned SHA-256 values for immutable release assets
4. Fresh install without an existing app bundle
5. Upgrade from the prior release
6. Application restart and reported version
7. Uninstall/zap behavior without deleting user-owned skill layers unexpectedly

## Maintainer Release Checklist

1. Confirm the target commit is on protected `main` and required CI is green.
2. Update `package.json`, lockfile metadata, runtime version expectations, changelog, and bilingual README text together.
3. Run `npm ci`, `npm run lint`, and `npm test` from a clean checkout.
4. Build and launch affected desktop packages on real supported platforms.
5. Verify no credentials, private `docs/dev/`, or `logs/` content is tracked.
6. Create and push the exact `v<version>` tag.
7. Observe every release job through completion.
8. Inspect release notes, filenames, sizes, update metadata, and downloadability.
9. Install from the public release and perform a smoke test.
10. For update changes, test an actual upgrade from the previous installed version.

## Rollback and Failed Releases

Do not silently replace release history. If an artifact is invalid, document the impact, remove or mark the broken release as appropriate, fix the source on `main`, and publish a new version. Because clients may have cached update metadata, reusing a released version can produce unverifiable state.

Source commits and changelog entries should make the recovery path auditable. Private incident evidence remains in maintainer-local records rather than the public documentation tree.
