# Changelog

All notable changes to skill-central are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

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