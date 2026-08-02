# Skill Central

Local-first MCP hub for distributing reusable AI skills across IDEs.

[简体中文](./README.zh-CN.md)

> Current release: `1.0.0-alpha.2`. This is an alpha build. Keep backups of important skill registries and review every sync or IDE connection plan before applying it.

Skill Central gives Codex, Claude, Trae, Cursor, Windsurf, and Cline a shared skill library. It includes a desktop application, a browser-based local board, a CLI, an MCP server, transactional IDE configuration, GitHub registry sync, and workflow/session primitives.

## Highlights

- One local skill library with layered precedence and conflict visibility.
- Desktop/Web Board navigation for Skills, Rules, IDE Connections, Sync, and Runtime.
- Personal settings for GitHub Device Flow, system/light/dark themes, and English/Chinese.
- IDE detection and MCP registration for Codex, Claude, Trae, Cursor, Windsurf, and Cline.
- Preview, backup, apply, verify, and rollback for IDE configuration writes.
- GitHub registry sync plans with conflict choices, audit records, and backups.
- MCP prompts, tools, resources, sessions, blackboard topics, and workflow scheduling.
- macOS Homebrew Cask installation with pinned SHA-256; macOS/Windows desktop updates check GitHub Releases in app.

## Install

### macOS: DMG

Download the `.dmg` for your Mac from [GitHub Releases](https://github.com/BobcGn/skill-central/releases), open it, and drag **Skill Central** into **Applications**.

The macOS alpha has no Developer ID signature and is not notarized because the project does not currently use an Apple Developer Program certificate. If Gatekeeper blocks the first launch, first verify that the DMG came from the official `BobcGn/skill-central` Release, then use **System Settings > Privacy & Security > Open Anyway**. You can also Control-click the application in Finder, choose **Open**, and confirm.

Only if macOS still reports that the app is damaged and offers no exception, use this last resort:

```bash
xattr -r -d com.apple.quarantine /Applications/"Skill Central".app
```

Then launch Skill Central again from **Applications**. This command removes the quarantine attribute only from the app at the exact path shown above and weakens Gatekeeper protection for that App Bundle. Do not run it against another path or an unverified artifact. Developer ID signing and Apple notarization remain the proper fix.

`1.0.0-alpha.2` publishes the repaired desktop update route. Existing `1.0.0-alpha.1` installations contain the old updater, so they need the one-time upgrade step documented in [Release and Updates](./docs/en/release-and-updates.md).

### macOS: Homebrew

The public Homebrew route installs the desktop application at `/Applications/Skill Central.app`:

```bash
brew tap bobcgn/skill-central https://github.com/BobcGn/skill-central
brew trust bobcgn/skill-central
brew install --cask --require-sha bobcgn/skill-central/skill-central
open -a "Skill Central"
```

Homebrew 6 requires explicit trust before it loads this third-party Tap. Review the repository and `Casks/skill-central.rb` before running `brew trust`. Installation does not launch the app; `open -a` starts the packaged Electron desktop program. Maintainers can run `npm run homebrew:diagnose` from a source checkout to audit Tap ownership, versions, process count, and the loopback listener.

This alpha has no Developer ID signature and is not notarized. If macOS blocks first launch, verify the repository, Release asset, and pinned checksum, then prefer **Open Anyway** in System Settings. Use the exact-path `xattr` command in the DMG section only when macOS offers no exception. Signing and notarization are required before this workaround can be removed.

After `1.0.0-alpha.2` is installed, closing the red window button leaves one local process and Board server running. Reopen it from the Dock, the application menu, or the menu bar icon. Use **Quit Skill Central** or `Command-Q` to stop the process fully.

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
| Rules | Search and inspect rules independently, and manage project scope for Rules and Skills |
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

GitHub authentication uses OAuth Device Flow. Official desktop packages embed the project OAuth App's public Client ID, so users only click **Connect GitHub** and authorize on GitHub; they do not create an OAuth App or enter a Client ID. Source checkouts and CLI development can configure the same public identifier through `SKILL_CENTRAL_GITHUB_CLIENT_ID`.

```bash
skill-central sync status --json
SKILL_CENTRAL_GITHUB_CLIENT_ID=<oauth-client-id> skill-central sync login --poll
skill-central sync plan --registry-dir ./skill-central-registry --direction both
```

`1.0.0-alpha.2` desktop packages contain the project Client ID and support GitHub Device Flow from the Personal settings view. The public `1.0.0-alpha.1` package does not contain that Client ID, so GitHub connection fails there; upgrade to `1.0.0-alpha.2` before testing GitHub sync.

Remote writes require an explicit plan and confirmation. Sync operations preserve audit and backup evidence. Tokens are never returned by the Web API or written to browser storage.

Official desktop packages encrypt GitHub tokens through macOS Keychain or Windows DPAPI and never fall back to plaintext when system secure storage is unavailable. Legacy plaintext development tokens are deleted rather than migrated, so login is required again. CLI login remains for source development only, and the Windows DPAPI route must pass a real packaged-app test before it is marked verified.

## Automatic Updates

- **macOS:** packaged desktop builds check GitHub Releases in app and no longer require a trusted Homebrew Tap or Cask ownership before update checks. The current alpha remains unsigned, so automatic installation requires real package validation; use the Release DMG manually if installation fails. Homebrew remains available as an installation route with pinned checksums.
- **Windows:** packaged NSIS builds check GitHub Releases, download the update and blockmap automatically, then expose **Install and restart** when ready.
- **CLI/Web-only mode:** reports the updater as unavailable and never tries to mutate an installation.
- Prereleases are enabled while the installed app version is an alpha.

## Security Boundaries

- The board listens on loopback by default. Non-loopback binding requires explicit acknowledgement.
- IDE writes use preview, backup, verification, and rollback stages.
- Sync requires explicit plans and confirmation for remote writes.
- Device codes and access tokens are kept out of browser responses and Web Storage.
- The macOS package is unsigned. The `xattr` command above removes quarantine from the installed app, so verify the repository and release source first.

## Technical Documentation

The public technical documentation starts at [docs/en/README.md](./docs/en/README.md). It covers the system architecture, Skills and Layers, IDE integration, local data and security boundaries, development workflows, and release/update behavior.

Simplified Chinese documentation is available at [docs/ch/README.md](./docs/ch/README.md). The two language trees describe the same public contract and must be updated together.

## Contributing

External contributions use a fork-and-pull-request workflow. Read [CONTRIBUTING.md](./CONTRIBUTING.md) or the [Chinese guide](./CONTRIBUTING.zh-CN.md) before starting. Use the structured issue forms for bugs, features, and questions.

Report vulnerabilities privately according to [SECURITY.md](./SECURITY.md), never in a public issue.

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
export SKILL_CENTRAL_GITHUB_CLIENT_ID="<project OAuth App public Client ID>"
npm run package:mac
npm run package:win
```

Release artifacts are written to `release-artifacts/`. Tagged releases are built by GitHub Actions for macOS x64/arm64 and Windows x64.

## License

[MIT](./LICENSE)
