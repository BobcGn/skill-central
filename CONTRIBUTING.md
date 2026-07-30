# Contributing to Skill Central

[简体中文](./CONTRIBUTING.zh-CN.md)

Thank you for contributing. Skill Central is an alpha-stage local MCP hub that writes IDE configuration, manages local skills, and can synchronize registry data. Small mistakes can affect user credentials or configuration, so contributions must stay focused, testable, and explicit about boundaries.

## Before You Start

- Search existing issues before opening a new one.
- Use the Bug, Feature, or Question form instead of a blank issue.
- Report vulnerabilities privately according to [SECURITY.md](./SECURITY.md). Never publish exploit details or credentials in an issue.
- Read the public [architecture documentation](./docs/en/architecture.md) before changing a cross-module contract.
- Open an issue before implementing a large feature, schema/protocol change, new dependency, authentication flow, updater change, or frontend framework migration.
- Small bug fixes, tests, and documentation corrections can normally proceed directly to a pull request.

## Development Setup

Requirements:

- Node.js 22 or 24
- npm from the selected Node.js release
- Platform tooling only when testing desktop packages

```bash
git clone https://github.com/<your-account>/skill-central.git
cd skill-central
npm ci
npm run lint
npm test
```

Useful development commands:

```bash
npm run dev:board
npm run dev:desktop
npm run dev:mcp
npm run build:desktop
```

## Repository Map

| Area | Location |
| --- | --- |
| CLI commands | `src/commands/` |
| Skill engine, schema, compiler | `src/core/`, `src/schema/`, `src/compiler/` |
| IDE detection and connection transactions | `src/ide-detection/`, `src/connect/`, `src/health/` |
| MCP protocol and workflow state | `src/protocol/`, `src/scheduler/`, `src/state/` |
| GitHub authentication and sync | `src/auth/`, `src/sync/` |
| Desktop and software updates | `src/desktop/`, `src/update/` |
| Local Web Board | `src/web/`, `src/web/static/` |
| Public technical documentation | `docs/en/`, `docs/ch/` |
| Integration tests | `scripts/test.sh` |
| CI and release automation | `.github/workflows/` |

## Contribution Workflow

1. Fork the repository. Direct write access is not granted to external contributors.
2. Create a focused branch from the latest `main`, for example `fix/ide-detection` or `feat/skill-filter`.
3. Link an issue for behavior changes. Confirm scope before starting a large change.
4. Follow existing patterns and keep unrelated cleanup out of the change.
5. Add or update tests in proportion to the risk.
6. Run the required checks locally and record exact results in the pull request.
7. Push the branch to your fork and open a pull request against `BobcGn/skill-central:main`.
8. Resolve review conversations and rerun checks after the final push.

## Project Boundaries

- `docs/en/` and `docs/ch/` are public and must remain aligned when product behavior changes. `docs/dev/` and `logs/` are maintainer-local, intentionally ignored, and must never be force-added to a pull request.
- Do not commit `node_modules/`, `dist/`, `release-artifacts/`, local `.skills/`, real IDE configuration, tokens, OAuth secrets, or private repository paths.
- IDE configuration writes must continue to use plan, preview, backup, apply, verify, and rollback stages. Do not bypass the transaction for convenience.
- Browser-triggered privileged actions must remain loopback-scoped, validate their origin where applicable, and never accept arbitrary command text.
- New IDE support is end to end: registry metadata, candidate paths, config codec, detection, connection plan, apply/verify/rollback, UI metadata, and regression tests.
- Frontend work must preserve the native HTML/CSS/JavaScript architecture, both language dictionaries, system/light/dark themes, keyboard focus, and desktop/mobile layouts unless a framework change was approved first.
- Dependency additions or upgrades require a concrete need, production and full audit results, and packaging impact analysis.
- Releases, tags, signing, package publication, and repository permission changes are maintainer-only operations.
- Avoid drive-by refactors. A pull request should have one reviewable purpose and a clear rollback unit.

## Validation

Every code change must pass:

```bash
npm run lint
npm test
```

Also run checks appropriate to the change:

- Web assets: `npm run build:web` and inspect desktop/mobile behavior, overflow, console errors, loading, empty, success, and error states.
- Registry performance: `npm run test:registry-perf` when query, resolution, or indexing behavior changes.
- Desktop changes: `npm run build:desktop`; package and launch the affected platform when packaging or updater behavior changes.
- Documentation/templates: `git diff --check`, verify Markdown links, YAML parsing, and English/Chinese consistency.
- Security-sensitive changes: include negative tests that prove the protected boundary cannot be bypassed.

Do not claim a platform test that you did not run. State missing coverage and the reason clearly.

## Pull Request Review

`main` is protected. Pull requests require the configured CI checks, a maintainer/code-owner approval, and resolved review conversations. New commits dismiss stale approval, and the author of the latest push cannot supply the final approval.

Maintainers may ask to split a pull request when unrelated changes, large generated diffs, or multiple risk areas make review unreliable. A passing CI run does not replace review of behavior, security boundaries, or user-facing text.

## License

By submitting a contribution, you agree that it is provided under the repository's [MIT License](./LICENSE). No Contributor License Agreement is currently required.
