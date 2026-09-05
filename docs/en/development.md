# Development Guide

[简体中文](../ch/development.md) | [Documentation index](./README.md) | [Contribution rules](../../CONTRIBUTING.md)

This document explains the codebase and local verification workflow. Repository policy, review requirements, and contributor conduct are defined in the root contribution and security documents.

## Requirements

- Node.js 22 or 24
- npm supplied with the selected Node.js version
- macOS or Windows packaging toolchain only when testing the corresponding desktop artifact

Install dependencies and establish a clean baseline:

```bash
npm ci
npm run lint
npm test
```

## Repository Map

| Location | Role |
| --- | --- |
| `src/index.ts` | CLI command definitions and dispatch |
| `src/storage/`, `src/schema/` | Configuration, layer loading, YAML parsing, public skill model |
| `src/core/`, `src/registry/` | Resolution engine and shared queries |
| `src/compiler/`, `src/adapters/` | Intent compilation, capabilities, target previews |
| `src/protocol/`, `src/mcp.ts` | MCP prompts, tools, resources, and stdio startup |
| `src/reverse-output/`, `src/commands/reverse-output.ts` | Shared IDE/CLI reverse-output proposal, promotion, audit, and rollback control plane |
| `src/ide-detection/`, `src/connect/`, `src/health/` | IDE metadata, codecs, connection transaction, health probe |
| `src/auth/`, `src/sync/` | GitHub Device Flow and registry synchronization |
| `src/local-store/`, `src/state/`, `src/scheduler/` | App data, sessions, blackboard, workflow scheduling |
| `src/web/server.ts` | Hono Board API and static file serving |
| `src/web/static/` | Native HTML, CSS, and JavaScript UI |
| `src/desktop/`, `src/update/` | Electron lifecycle and platform updates |
| `scripts/test.sh` | Full integration suite |
| `.github/workflows/` | Required CI and maintainer release workflow |

## Development Commands

```bash
npm run dev:mcp       # watch the TypeScript MCP entrypoint
npm run dev:board     # run the local Board from TypeScript
npm run dev:desktop   # build, copy web assets, and start Electron
npm run build         # compile TypeScript and copy adapter capabilities
npm run build:web     # copy static Board assets to dist/web
npm run build:desktop # build TypeScript plus Board assets
npm run lint          # TypeScript no-emit validation
npm run test:reverse-output # focused reverse-output control-plane matrix
npm test              # build and run the integration suite
```

`npm run package:mac` and `npm run package:win` create installable artifacts under `release-artifacts/`. Set `SKILL_CENTRAL_GITHUB_CLIENT_ID` to the project OAuth App's public Client ID first; the app must have Device Flow enabled, and no client secret belongs in a desktop build. Do not claim packaging coverage based only on `build:desktop`.

After a successful packaging run, the build script removes the intermediate unpacked app
bundles that electron-builder leaves in the output directory (`mac/`, `mac-arm64/`,
`win-unpacked/`, `__msi-*`), so `release-artifacts/` contains only final deliverables and
no second runnable copy of the application exists outside `/Applications` (macOS) or
Program Files (Windows). The desktop entry point also warns when it is launched from an
unpacked build location instead of the installed application.

## Local State During Development

The repository's `.skills/` and `skill-central.yaml` are real development fixtures. Integration tests temporarily add more fixtures and install cleanup handlers. Avoid interrupting the test script while it is manipulating fixtures; if a run is terminated externally, inspect `git status` and local skill paths before continuing.

Use `SKILL_CENTRAL_APP_STATE_DIR` to isolate app state in targeted tests. Never point cleanup code at a broad home or workspace directory.

`docs/dev/` is reserved for the maintainer's private development records and is ignored. Public architecture and operational documentation belongs in `docs/en/` and `docs/ch/`. External contributions must not force-add private records.

## Change Workflow

1. Start from current `main` in a fork and create one focused branch.
2. Reproduce the behavior or establish a failing test before changing shared logic.
3. Make changes at the owning boundary. Do not patch the same rule separately in CLI and Board.
4. Add focused tests and update both public documentation languages when the contract changes.
5. Run required validation and report exact commands in the pull request.
6. Review the diff for generated output, credentials, local paths, and unrelated cleanup.

Large features, schema/protocol changes, authentication, updater behavior, new dependencies, or framework migrations require an issue and maintainer agreement first.

## Testing Strategy

Every code change must pass:

```bash
npm run lint
npm test
```

The integration suite covers CLI startup, Universal Skill compatibility, override/conflict behavior, MCP surfaces, compiler previews, IDE configuration and health, Board APIs, application state, GitHub flow primitives, synchronization, runtime/session behavior, and backups.

Run additional checks by risk:

| Change | Additional verification |
| --- | --- |
| Registry query or resolution | `npm run test:registry-perf` and conflict fixtures |
| Board HTML/CSS/JS | `npm run build:web`; desktop/mobile visual inspection; keyboard, overflow, loading, empty, error, and success states |
| MCP protocol | Start a real stdio client and confirm stdout contains protocol only |
| Runtime manager | Start the real `dist/index.js mcp` through `LocalRuntimeManager`, confirm stdin stays open, status remains `running`, and stop captures stderr without polluting stdout |
| Reverse output | `npm run test:reverse-output`; schema, scope, path, duplicate, SHA, backup, rollback, CLI, and MCP checks |
| IDE target | Platform path fixtures, malformed config, unrelated-entry preservation, backup, rollback, and live probe |
| Sync/auth | Negative path and credential-leak tests; dry-run/apply distinction; audit evidence |
| Desktop/updater | `npm run build:desktop`, affected package build, and real installed-app behavior |
| Documentation/templates | `git diff --check`, relative-link checks, YAML parsing where applicable, bilingual parity |

Do not silently reduce coverage because a platform is unavailable. Record the untested platform and resulting risk in the pull request.

## Boundary-Specific Rules

### Engine and schema

- Keep normalization and validation centralized.
- Preserve legacy compatibility unless a migration is approved.
- Never resolve an exact precedence tie by insertion order.
- Ensure all consumers receive the same provenance and status semantics.

### IDE integration

- Use the shared target registry and JSON/TOML codecs.
- Preserve unrelated user configuration.
- Keep plan, preview, backup, apply, verify, and rollback observable.
- Treat new target support as an end-to-end feature.

### Board and desktop

- Keep the current native HTML/CSS/JavaScript architecture unless migration is approved.
- Update both message dictionaries and both public documentation languages.
- Preserve system/light/dark themes, keyboard focus, and narrow-screen navigation.
- Keep `contextIsolation`, disabled Node integration, and sandboxing.
- The desktop Board owns one shared loopback HTTP MCP endpoint. Workspace/library changes and app
  quit must close all sessions. The optional stdio Runtime must keep stdin open from explicit start
  until explicit stop or application quit.
- On macOS, the runtime child process must hide its Dock icon (`app.dock.hide()`) in the MCP
  branch so the Dock never shows a second icon for the same App bundle.

### Authentication and sync

- Depend on interfaces such as `TokenStore`, not a concrete credential path.
- Never send secrets to browser code.
- Planning must remain side-effect free.
- Every mutation needs conflict handling and auditable evidence.

### Reverse Output

- Reverse output must state the source, asset type, target library, and applicable scope.
- Reverse output must explicitly state `placement` and `placementReason`; IDE-native rules
  cannot be promoted as covenant Rules.
- Skills should be continuously cultivated, updated, and written back into `.skills/`; rules should
  only be promoted into `.rules/` when they belong to the Skill Central covenant and are stable
  and reusable.
- `.rules/` carries cross-IDE business terminology, What/Why, architecture boundaries, style,
  quality floors, and gates. IDE-native rules such as `AGENT.md`, `AGENTS.md`, and `CLAUDE.md`
  carry only the current IDE/machine environment and local How.
- Every placement decision must check business domain versus runtime environment, strategic
  constraint versus tactical execution, and dynamic evolution versus relative stability.
- Mixed policy and local execution content must be split. An IDE-native rule must not redefine
  shared terms, remove a gate, or weaken an architecture boundary.
- Project-local guidance should not default into the rule library; keep it in work records or
  temporary output.
- Editing an existing asset requires a diff preview, backup path, and rollback plan.
- Reverse-output work must include verification results, or be explicitly marked unverified.
- The final decision must be `promote`, `defer`, or `discard`, not just "possible" or "not possible".

## Documentation Review

Public documents describe only behavior present on `main`. Use explicit labels such as "experimental", "not yet implemented", or "current limitation" for partial behavior. Do not convert private roadmaps into product commitments.

When changing one language, update its counterpart in the same commit. Keep headings and conceptual coverage aligned even when the wording is not a literal translation.
