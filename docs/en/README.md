# Skill Central Documentation

[简体中文](../ch/README.md)

This directory contains the public technical documentation for Skill Central. It describes behavior implemented on the current `main` branch. Product installation and first-run guidance remain in the root [README](../../README.md), while contribution rules remain in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Documentation Map

| Document | Audience | Contents |
| --- | --- | --- |
| [Architecture](./architecture.md) | Contributors and maintainers | Runtime surfaces, module boundaries, data flows, and architectural invariants |
| [Skills and Layers](./skills-and-layers.md) | Skill authors and contributors | Skill schema, layer governance, resolution, compilation, and MCP exposure |
| [IDE Integration](./ide-integration.md) | Users and integration contributors | Supported IDEs, configuration discovery, connection transactions, and health checks |
| [Startup Recognition](./startup-agent-recognition.md) | Users and integration contributors | Boundaries, flow, and work plan for making Skill Central discoverable by Coding Agents after startup |
| [Data and Security](./data-and-security.md) | Users, reviewers, and security contributors | Local data locations, trust boundaries, credentials, backups, and current limitations |
| [Development](./development.md) | Contributors | Repository map, local workflows, tests, and change-specific requirements |
| [Release and Updates](./release-and-updates.md) | Maintainers and packaging contributors | Release invariants, artifacts, update providers, and platform limitations |

## Source of Truth

The implementation is authoritative when documentation and code disagree. In particular:

- CLI flags are defined in [`src/index.ts`](../../src/index.ts).
- Skill and layer contracts are defined in [`src/schema/`](../../src/schema) and [`src/storage/`](../../src/storage).
- Reverse-output behavior is defined in [`src/reverse-output/service.ts`](../../src/reverse-output/service.ts),
  with CLI and focused integration coverage in [`scripts/test-reverse-output.mjs`](../../scripts/test-reverse-output.mjs).
- IDE targets and paths are defined in [`src/ide-detection/registry.ts`](../../src/ide-detection/registry.ts).
- Board APIs are defined in [`src/web/server.ts`](../../src/web/server.ts).
- Packaging and release behavior is defined in [`electron-builder.yml`](../../electron-builder.yml) and [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

These documents do not promise roadmap work. Experimental or incomplete behavior is labeled explicitly.

## Documentation Policy

- English and Simplified Chinese documents must change together when behavior changes.
- Public documentation belongs in `docs/en/` and `docs/ch/`.
- `docs/dev/` is the maintainer's private development-record directory and is intentionally ignored by Git.
- `logs/` contains private execution evidence and is also intentionally ignored.
- Do not publish credentials, private paths, incident evidence, or speculative internal plans in public documentation.

Documentation corrections use the same fork-and-pull-request workflow as code changes.
