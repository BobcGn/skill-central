# Skill Central

Local-first MCP hub for distributing reusable AI skills across IDEs.

[简体中文](./README.zh-CN.md)

> Current release: `1.0.0-alpha.1`. This is an alpha build. Keep backups of important skill registries and review every sync or IDE connection plan before applying it.

Skill Central gives Codex, Claude, Trae, Cursor, Windsurf, and Cline a shared skill library. It includes a desktop application, a browser-based local board, a CLI, an MCP server, transactional IDE configuration, GitHub registry sync, and workflow/session primitives.

## Highlights

- One local skill library with layered precedence and conflict visibility.
- Desktop/Web Board navigation for Skills, IDE Connections, Sync, and Runtime.
- Personal settings for GitHub Device Flow, system/light/dark themes, and English/Chinese.
- IDE detection and MCP registration for Codex, Claude, Trae, Cursor, Windsurf, and Cline.
- Preview, backup, apply, verify, and rollback for IDE configuration writes.
- GitHub registry sync plans with conflict choices, audit records, and backups.
- MCP prompts, tools, resources, sessions, blackboard topics, and workflow scheduling.
- In-app updates through GitHub Release/NSIS on Windows; macOS updates are manual in this release.

## Install

### macOS: DMG

Download the `.dmg` for your Mac from [GitHub Releases](https://github.com/BobcGn/skill-central/releases), open it, and drag **Skill Central** into **Applications**.

The macOS alpha is not signed or notarized because the project does not currently use an Apple Developer Program certificate. On first launch, macOS may report that the app is damaged. Click **Cancel** in that dialog, open Terminal, and run:

```bash
sudo xattr -r -d com.apple.quarantine /Applications/"Skill Central".app
```

Then launch Skill Central again from **Applications**. This command removes the quarantine attribute only from the app at the exact path shown above. Verify that the DMG came from the official `BobcGn/skill-central` release before running a command with `sudo`.

The Homebrew download and in-app update path did not work in current user testing and is not recommended for `1.0.0-alpha.1`. macOS users should update manually from GitHub Releases for now. The Homebrew flow is scheduled for another end-to-end test with `1.0.0-alpha.2`.

### Windows

Download the NSIS `.exe` from the [GitHub Releases](https://github.com/BobcGn/skill-central/releases) page. The NSIS installation receives later prereleases through the in-app updater and restarts after the update is installed.

The `.msi` and `.zip` assets remain available for manual deployment, but the NSIS `.exe` is the supported automatic-update path.

### CLI

Node.js 22 or newer is recommended.

```bash
npx @bobcgn/skill-central init
npx @bobcgn/skill-central board
```

For a global command:

```bash
npm install -g @bobcgn/skill-central
skill-central init
skill-central board
```

## First Run

Initialize a project:

```bash
skill-central init
```

This creates `skill-central.yaml` plus a layered `.skills/` directory and attempts to register Skill Central with detected IDEs.

Open the local board:

```bash
skill-central board
```

The board binds to `127.0.0.1:5417` by default. If the port is occupied it tries the next ten ports. Updater availability depends on the platform and installation method.

Start the stdio MCP server:

```bash
skill-central mcp
```

Protocol responses use stdout; diagnostics use stderr so MCP JSON-RPC remains clean.

## Desktop Board

The main navigation is organized around repeatable work:

| Area | Purpose |
| --- | --- |
| Skills | Search, inspect, edit, compile, restore, and review resolution provenance |
| IDE Connections | Detect IDEs and preview/apply/verify/rollback MCP configuration |
| Sync | Inspect local state, build GitHub registry plans, resolve conflicts, and review evidence |
| Runtime | Inspect, start, and stop the local MCP runtime |
| Personal settings | GitHub login, theme, language, and packaged-app updates |

The interface is responsive and uses a bottom navigation bar on narrow screens. Theme, locale, current view, and non-secret preferences remain local to the board.

## IDE Connections

```bash
skill-central register
skill-central register codex
skill-central register claude
skill-central register trae
```

| Target | Configuration |
| --- | --- |
| Codex | Project `.codex/config.toml` when present, otherwise `~/.codex/config.toml` |
| Claude | Claude Code and Claude Desktop JSON configuration candidates |
| Trae | International and China edition `mcp.json` candidates |
| Cursor | Cursor MCP JSON configuration |
| Windsurf | Windsurf MCP JSON configuration |
| Cline | Cline MCP settings JSON configuration |

Codex configuration is parsed and validated as TOML. Other targets use structured JSON handling. Existing unrelated entries are preserved. Apply operations create backup evidence and can be rolled back.

## Core CLI

```text
skill-central mcp                 Start the stdio MCP server
skill-central board               Open the local Web Board
skill-central board --cli         Print the terminal board
skill-central init                Create local layers and detect/register IDEs
skill-central register [ide]      Register one or all supported IDEs
skill-central add <id>             Create a skill
skill-central list                 Query loaded skills
skill-central show <id>            Show one resolved skill
skill-central validate <files...> Validate skill files
skill-central doctor               Diagnose layers, conflicts, and backups
skill-central install <source>     Install a skill from GitHub or npm
skill-central update [id]          Update installed skills
skill-central uninstall <id>       Remove an installed skill
skill-central sync <action>        GitHub login, registry, plan, and apply actions
skill-central workflow <action>    Start and advance workflow sessions
skill-central session <action>     Inspect sessions and blackboard topics
```

Run `skill-central <command> --help` for the current flags.

## Skill Format

Skills are YAML documents. A minimal prompt skill looks like this:

```yaml
schemaVersion: skillcentral.dev/v1
id: review-pr
name: PR Review
description: Review changes against project conventions
type: prompt
tags: [review, workflow]
prompt: |
  Review the current change. Prioritize correctness, regressions,
  security boundaries, and missing tests.
```

Layers have explicit priorities. When IDs collide, the higher-priority valid skill becomes effective while the complete resolution chain remains inspectable.

## GitHub Sync

GitHub authentication uses OAuth Device Flow. A GitHub OAuth App Client ID must currently be supplied in Personal settings or through `SKILL_CENTRAL_GITHUB_CLIENT_ID`.

```bash
skill-central sync status --json
skill-central sync login --client-id <oauth-client-id> --poll
skill-central sync plan --registry-dir ./skill-central-registry --direction both
```

Remote writes require an explicit plan and confirmation. Sync operations preserve audit and backup evidence. Tokens are never returned by the Web API or written to browser storage.

The current alpha still uses a development file-backed TokenStore outside a completed OS-keychain integration. Treat GitHub login as experimental and do not reuse a high-value credential.

## Automatic Updates

- **macOS:** use manual DMG updates for `1.0.0-alpha.1`. The Homebrew download and in-app update flow remains experimental and will be retested with `1.0.0-alpha.2`.
- **Windows:** packaged NSIS builds check GitHub Releases, download the update and blockmap automatically, then expose **Install and restart** when ready.
- **CLI/Web-only mode:** reports the updater as unavailable and never tries to mutate an installation.
- Prereleases are enabled while the installed app version is an alpha.

## Security Boundaries

- The board listens on loopback by default. Non-loopback binding requires explicit acknowledgement.
- IDE writes use preview, backup, verification, and rollback stages.
- Sync requires explicit plans and confirmation for remote writes.
- Device codes and access tokens are kept out of browser responses and Web Storage.
- The macOS package is unsigned. The `xattr` command above removes quarantine from the installed app, so verify the repository and release source first.

## Development

```bash
npm ci
npm run lint
npm test
npm run dev:board
npm run dev:desktop
```

Build release packages:

```bash
npm run package:mac
npm run package:win
```

Release artifacts are written to `release-artifacts/`. Tagged releases are built by GitHub Actions for macOS x64/arm64 and Windows x64.

## License

[MIT](./LICENSE)
