# Changelog

All notable changes to skill-central are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).


## [0.3.0] - 2026-07-18

### Fixed

- **MCP Stdio Protocol**: Redirected `console.info` and `console.debug` to `stderr` to prevent JSON-RPC stdout pollution.
- **MCP Tool Discovery**: Ensured `inputSchema` format strictly adheres to JSON schema requirements (removed empty arrays for `required`, strictly enforced `type: "object"`).
- **MCP Async Timing**: Added `waitForReady` lock in prompt and tool handlers to prevent returning empty lists before the engine finishes initializing.
- **MCP Descriptor Strictness**: Provided reliable fallback descriptions for tools and prompts to ensure full LLM compatibility.

## [0.2.5] - 2026-06-16

### Added

- **`lint` script** (`tsc --noEmit`) — TypeScript 类型检查作为发布门禁，防止类型错误进入发布包。
- **`test` script** (`scripts/test.sh`) — CLI 集成测试脚本，覆盖 `add`、`list`、`doctor` 核心命令，通过 `pretest` 钩子自动构建后执行。
- **`pretest` script** — 确保 `npm test` 在任何环境下"开箱即用"（自动执行 `npm run build && npm run build:web`）。

### Changed

- **Release 流水线重构** (`release.yml`)：
  - 双触发器机制（`push: tags` + `release: published`），内置幂等性保护。
  - 标准化 CI 步骤：`checkout → npm ci → lint → build+test → verify → publish → GitHub Release`。
  - `--provenance` CLI 标志 + `NPM_CONFIG_PROVENANCE=true` 环境变量 + `publishConfig.provenance` 三重保障。
  - 预发布版本自动使用 `--tag next`（如 `v1.0.0-beta.1` 不会覆盖 `latest`）。
  - 权限配置新增 `attestations: write`。

## [0.2.4] - 2026-06-16

### Changed

- **Retry OIDC publish via release.yml** — Trusted Publisher re-configured on npmjs.com. This release attempts the OIDC `npm publish --provenance` path again.

## [0.2.3] - 2026-06-16

### Changed

- **First release published via Trusted Publisher OIDC** — v0.2.3 is the first version published through `.github/workflows/release.yml` with npm Trusted Publishing (OIDC). Each `npm publish --provenance` in this workflow attaches a Sigstore-signed provenance attestation to the tarball, verifiable via `npm view @bobcgn/skill-central@0.2.3 --json | jq .dist.attestations`.

### Notes

- v0.2.2 was published manually (without provenance) because the Trusted Publisher had not been configured on npmjs.com at release time. From v0.2.3 onward, all releases go through the OIDC workflow.

## [0.2.2] - 2026-06-16

### Changed

- **All 16 project skill files are now fully bilingual.** Each YAML carries both `prompt:` (English) and `prompt_zh:` (Chinese). Previously, 7 large skills (`backend-code-review`, `frontend-vue-review`, `readme-writer`, `database-review`, `ai-model-agent`, `kotlin-multiplatform`, `python-code-review`) carried only a partial English translation; they now have complete translations matching the depth and length of the Chinese original (1085 lines for kotlin-multiplatform, 1338 for ai-model-agent, etc.). Generated via parallel sub-agents and merged back via a small Node script.

### Notes

- During the merge, 7 affected YAML files needed 2-space indentation inside the `prompt: |` block (js-yaml literal-block fragility at column 0). All skills now follow the same indent convention as the working `error-handling-patterns.yaml`.

## [0.2.1] - 2026-06-16

### Added

- **`.github/workflows/release.yml`** — automated npm publish + GitHub Release on `v*` tag push, via npm Trusted Publishing (OIDC). `npm publish --provenance` attaches a Sigstore-signed attestation to every release. See [`docs/trusted-publishing.md`](./docs/trusted-publishing.md) for the one-time setup (register the workflow on <https://www.npmjs.com/package/@bobcgn/skill-central/settings>).
- **`docs/trusted-publishing.md`** — full walkthrough of the OIDC trust handshake, including a probe-tag procedure, the four common failure modes, and a rollback recipe.

### Fixed

- **CLI `--version` reported `0.1.0`** after publishing 0.2.0 because `src/index.ts` hardcoded the version string. Now reads from a single source (`src/version.ts` → `VERSION`).
- **MCP `serverInfo.version` reported `0.1.0`** for the same reason — `src/mcp.ts` had a hardcoded `"0.1.0"` literal in the `Server` constructor. Now reads `VERSION`.
- **Web board crashed** with `Web assets not found at <cwd>/dist/web` when invoked from any directory other than the project root (e.g. `npx skill-central board`, `node_modules/.bin/skill-central board` from a sub-directory). `resolveWebRoot()` now searches script-relative candidates derived from `import.meta.url` first, with cwd-relative paths as a last-resort fallback. The pre-bind check in `src/commands/board.ts` calls the same resolver so the two stay in lock-step.

### Changed

- Added `src/version.ts` as the single source of truth for the package version (inlines `package.json` at build time via `import ... with { type: "json" }`). Eliminates the version-drift class of bugs at future releases.
- `.gitignore`: added `.ai/` and `.codex/` (sibling AI-tool dirs that should not be tracked).

## [0.2.0] - 2026-06-15

### Added

- **CLI subcommands** for the local CRUD surface that previously required hand-writing YAML:
  - `add <id> [--tags ...]` — create a skill with tag-driven layer inference
  - `list [--layer | --tag | --type]` — filtered skill inventory
  - `show <id>` — full skill details + prompt body
  - `remove <id> [--layer]` — delete a skill file (with ambiguity guard)
  - `validate <files…>` — parse + validate files outside the engine path
  - `doctor` — scan layers for missing dirs, parse errors, id collisions, orphan backups
- **Remote install** via `install <source>` with `update` and `uninstall` companions:
  - `github:<user>/<repo>/<path>[@<ref>` — direct raw-URL fetch with sha256
  - `npm:<pkg>[@<version>]` — registry + tarball extraction via `tar-stream` + `node:zlib`; requires `skill-central.paths` in the package's `package.json`
  - `~/.skill-central/lock.json` records every installed skill (source, version, sha256, layer, filePath)
  - `update [id]` re-fetches; preserves original scope (project vs user)
  - `uninstall <id>` removes file + lock entry; `--purge-backups` also clears `.bak.*` siblings
- **Web board** (`board` command now opens a local Hono dashboard by default):
  - Read + edit skills in the browser, with optimistic-concurrency (`sha256` conflict → 409 with current content)
  - Automatic `.bak.<ISO-no-colons>` backup on every save (never auto-deleted)
  - Backups pane with one-click restore
  - Default port `5417`, conflict-aware retry `+1..+10`
  - Loopback-only by default; non-loopback `--host` requires `--i-understand-nonlocal` acknowledgement
  - `--cli` / `--no-web` flags for the v0.1.0 terminal fallback
- **Docs**: new `docs/` directory with reference pages:
  - [`docs/cli-reference.md`](./docs/cli-reference.md)
  - [`docs/web-board.md`](./docs/web-board.md)
  - [`docs/remote-sources.md`](./docs/remote-sources.md)
  - [`docs/skill-schema.md`](./docs/skill-schema.md)
  - [`docs/layered-override.md`](./docs/layered-override.md)
  - [`docs/mcp-protocol.md`](./docs/mcp-protocol.md)

### Changed

- **BREAKING**: `skill-central board` now opens a web dashboard by default. The terminal-table output is reachable via `board --cli` (or `--no-web`).
- Internal functions `validateSkill` and `discoverSkillFiles` / `readAllLayers` are now exported from `src/storage/parser.ts` and `src/storage/reader.ts` for use by the CLI. Existing internal callers unchanged.
- `src/board.ts` moved into `src/commands/board.ts` and exports `runBoard()` + the legacy `showBoard()`.
- `ResolvedSkillView` now exposes `priority` so the web board can render origin metadata.

### Security

- Install: HTTPS-only URLs; sha256 verified on every install/update
- Install: tar-slip defence — npm tarball entries must start with `package/` and reject `..` / `\`
- Install: refuse loopback hosts in tarball source URLs (SSRF mitigation)
- Web board: bound to `127.0.0.1` by default; non-loopback hosts require explicit `--i-understand-nonlocal`
- Web board: PUT enforces sha256-conflict detection; rejects id changes (would orphan the original file)

### Dependencies

- New: `hono@^4.12.25`, `@hono/node-server@^2.0.4`, `tar-stream@^3.2.0`

## [0.1.0] - 2026-05-21

### Added

- Initial public release to npm
- Stdio MCP server with prompt + tool composition
- 4-layer skill directories (`.skills/01-global` … `.skills/04-tech-stack`)
- CLI: `mcp`, `board`, `init`
- 12 bundled sample skills
- Multi-skill tag composition via `GetPrompt("skills:compose", { tags })`