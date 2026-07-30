# Data and Security

[简体中文](../ch/data-and-security.md) | [Documentation index](./README.md)

## Security Posture

Skill Central is local-first, but it is not a security sandbox. It reads and writes files selected by layer and IDE configuration, can start a local MCP process, and can synchronize with a user-selected GitHub registry. Users should review plans and backups before privileged operations.

Report vulnerabilities through the private process in [SECURITY.md](../../SECURITY.md). Do not include tokens, private repository contents, or exploit details in a public issue.

## Data Boundaries

| Data | Default location | Purpose | Deleting it affects |
| --- | --- | --- | --- |
| User layer config | `~/.skill-central/config.yaml` | User-level layer definitions | Which layers load |
| Project config | `<project>/skill-central.yaml` | Project layer definitions | Which project layers load |
| Skill sources | Configured layer paths, commonly `.skills/` and `~/.skill-central/skills/` | Durable skill definitions | The actual skill library |
| App state on macOS | `~/Library/Application Support/skill-central/` | State, audit, cache, sync, tokens, sessions | Derived/local application state |
| App state on Windows | `%APPDATA%/skill-central/` | Same as above | Derived/local application state |
| App state on Linux | `~/.local/share/skill-central/` | Same as above | Derived/local application state |
| IDE backups | Next to the IDE config as `.bak.<timestamp>` | Connection rollback | Recovery evidence for that config |
| Skill edit backups | Next to the skill source as `.bak.<timestamp>` | Board edit/restore | Recovery evidence for that skill |

`SKILL_CENTRAL_APP_STATE_DIR` can override the application-state root for tests or controlled deployments. Application state intentionally does not contain the governed skill source layers.

## Browser-Local Preferences

The Board stores theme, locale, current preferences, and the GitHub OAuth App Client ID in browser `localStorage`. The Client ID identifies an OAuth application and is not an access token, but it should still be treated as configuration rather than a credential.

GitHub access tokens and device codes are not returned in normal browser status responses and are not stored in browser storage.

## GitHub Authentication

Authentication uses GitHub OAuth Device Flow:

1. The Board or CLI supplies an OAuth App Client ID.
2. Skill Central requests a device code and returns only the user-facing code, verification URL, timing, and an opaque local flow ID.
3. The local server polls GitHub after user authorization.
4. The returned access token is written through the `TokenStore` interface.

The requested scope is currently `repo`, which can grant access to private repositories authorized for the account. Use a dedicated, revocable OAuth grant and avoid high-value credentials during the Alpha.

The current implementation uses `DevelopmentFileTokenStore`. It writes a JSON token file with mode `0600` under the app-state token directory. It is explicitly marked as not production-ready; OS keychain integration is still required. Logout removes the local token file but does not revoke the grant on GitHub. Revoke it separately in GitHub settings when compromise is suspected.

## Web Board Boundary

The Board binds to `127.0.0.1` by default and has no user authentication. Binding to a non-loopback address requires `--i-understand-nonlocal`, but that flag is only acknowledgement; it does not add authentication or encryption.

Do not expose the Board to a LAN, shared host, reverse proxy, or public interface. Its API can edit skills, write IDE configurations, apply sync plans, and control the local runtime. Some sensitive endpoints, including updater actions, enforce same-origin browser requests, but the Board must still be treated as an unauthenticated local administration API.

The Electron renderer uses context isolation, disables Node integration, and enables Chromium sandboxing. External links are denied in the window and opened through the operating system.

## File Mutation Controls

### Skill edits

Board edits enforce:

- kebab-case route IDs;
- optimistic concurrency through an expected SHA-256;
- YAML parsing and skill validation;
- rejection of in-place ID changes;
- backup before write;
- engine reload after a successful write.

### IDE configuration

IDE writes parse structured JSON or TOML, preserve unrelated entries, create a backup when a file exists, and support explicit rollback. Malformed existing configuration blocks the write instead of being replaced.

### Sync

Sync planning compares SHA-256 hashes without writes. Disabled layers remain excluded. Apply requires explicit conflict choices and produces audit reports and backup references. Audit and backup API reads are constrained to the app-state audit boundary or to paths referenced by recent audit records.

## Network Activity

Skill Central can contact:

- GitHub OAuth and API endpoints for Device Flow and user/registry operations;
- GitHub Releases through the Windows updater;
- Homebrew commands on macOS when the app is Homebrew-managed;
- GitHub or npm sources selected by install/update commands.

The Board itself is served locally. No telemetry pipeline is documented or implemented in the current codebase.

## Packaging Limitations

- macOS artifacts are unsigned and not notarized. The documented `xattr` workaround removes quarantine and should only be used for artifacts verified to come from the official release.
- Windows NSIS update metadata and binaries are downloaded from GitHub Releases. Code-signing guarantees are not currently documented.
- Homebrew Cask uses `sha256 :no_check` in the current Alpha, so it does not provide a pinned artifact checksum.
- The macOS Homebrew updater exists but has not passed the current end-to-end user test.

These are release risks, not installation conveniences. Changes that claim to improve them require real packaged-platform verification.

## Contributor Security Checklist

- Never log or return access tokens, device codes, or authorization headers.
- Keep privileged browser operations loopback-scoped and add negative tests for origin/path checks.
- Resolve paths before authorization checks and verify containment using path boundaries.
- Preserve backup and conflict evidence for file writes.
- Do not broaden OAuth scopes without an approved design and migration note.
- Do not weaken Electron isolation settings to simplify renderer development.
- State clearly which operating systems and package formats were actually tested.
