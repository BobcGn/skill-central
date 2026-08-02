# IDE Integration

[简体中文](../ch/ide-integration.md) | [Documentation index](./README.md)

## Integration Model

Skill Central connects to IDEs as a local stdio MCP server:

```json
{
  "command": "skill-central",
  "args": ["mcp"]
}
```

The executable must be available in the environment used by the IDE. The MCP process loads the same configured skill layers as the CLI and exposes prompts, tools, and read-only resources.

When one-click connection is run from the packaged desktop app, Skill Central writes the absolute executable path of the current App Bundle and starts that executable with the `mcp` argument. The IDE therefore does not need to find `skill-central` on the shell `PATH`. Source CLI `connect` and `register` still write the generic command shown above.

## Covenant and IDE-Native Rules

The project `.rules/` directory is the Skill Central covenant for cross-IDE and cross-person
business and engineering constraints. IDE-native files such as `AGENT.md`, `AGENTS.md`, and
`CLAUDE.md` are environment adapters for the current IDE or machine; they describe startup,
invocation, and local execution.

They are not two copies of one rule set:

- The covenant defines What, Why, terminology, architecture boundaries, quality floors, and gates.
- IDE-native rules define local How, such as startup commands, IDE-specific capabilities, and
  bootloader instructions.
- IDE-native rules must not remove or weaken the covenant. Mixed content must be split.
- When an IDE cannot satisfy the covenant, report the incompatibility or explicitly degrade; do
  not silently override the covenant.

## IDE Reverse Output

After the MCP connection is verified, an IDE can use the `reverse_output` tool to propose
durable library content discovered during work. The request must identify the source, context,
asset type, operation, target library, explicit `placement`/`placementReason`, and explicit
`appliesTo` scope. Skills target a configured writable Skill Layer, commonly under `.skills/`;
Rules target a directory under `.rules/` and must pass the covenant placement checklist.

The safe sequence is:

1. Call `reverse_output` with `action: "preview"`.
2. Review placement, schema, scope, duplicate, conflict, target, and diff checks.
3. Call `action: "apply"` with exactly one decision: `promote`, `defer`, or `discard`.
4. For an update, provide the SHA-256 returned by the current source inspection. Successful
   updates return a sibling backup path and an App State audit path.
5. Use `action: "rollback"` with the target path, backup path, and current expected SHA-256
   when restoration is required.

The same service is available for local verification through
`skill-central reverse-output preview|apply|rollback`. The current Alpha MVP does not expose
these proposal and promotion controls in the Web Board yet; the Board's existing Skill/Rule
management remains a separate surface.

## Supported Connection Targets

| Target | Format | Default candidates |
| --- | --- | --- |
| Codex | TOML | Existing project `.codex/config.toml`, then `~/.codex/config.toml` |
| Claude | JSON | `~/.claude.json`, then the platform Claude Desktop configuration |
| Trae | JSON | Platform application-data paths for Trae, Trae CN, and TRAE variants |
| Cursor | JSON | `~/.cursor/mcp.json` |
| Windsurf | JSON | `~/.codeium/windsurf/mcp_config.json` |
| Cline | JSON | VS Code global storage for the Cline extension |

For Codex, detection may report an existing trusted project configuration, but creation defaults to the user configuration. Other targets select the first existing candidate or their first default candidate.

Candidate paths are centralized in [`src/ide-detection/registry.ts`](../../src/ide-detection/registry.ts). Platform path changes must be made there and covered by tests instead of duplicated in commands or UI code.

## Commands

Register one target:

```bash
skill-central register codex
skill-central register claude
skill-central register trae
```

Search existing known configurations and register detected targets:

```bash
skill-central register
```

Build a visible connection plan without writing:

```bash
skill-central connect --target codex --dry-run
```

Apply and probe the MCP server:

```bash
skill-central connect --target codex --verify
skill-central doctor --ide codex --verify
```

Use `--config-path <path>` when a supported IDE stores its configuration in a nonstandard location.

## Connection Transaction

A connection plan is structured data shared by CLI and Board. It contains:

1. Target and resolved configuration path
2. Existing registration state
3. Desired server entry
4. A bounded diff preview
5. Backup path for an existing file
6. Detect, preview, backup, write, verify, and rollback steps

Apply parses the current JSON or TOML, preserves unrelated settings and MCP servers, and adds or replaces only the `skill-central` entry. An existing file is copied to a timestamped `.bak.*` sibling before writing.

The current implementation writes the merged file directly after creating the backup; it does not yet use a temporary-file-and-rename atomic replacement. The backup is therefore a required recovery boundary.

## Rollback

If the transaction changed an existing configuration, rollback restores the recorded backup. If it created a new configuration, rollback removes it only when the current file still contains exactly the entry created by Skill Central. It refuses deletion if unrelated data has appeared.

Keep the backup path shown by the plan. Rollback does not guess among multiple backup files.

## Health States

Detection alone can report `registered` without starting a process. Verification executes a bounded stdio probe and checks:

1. Process spawn
2. MCP initialize handshake
3. `prompts/list`
4. `tools/list`
5. Visible skill IDs against the Registry baseline

Possible states include:

| State | Meaning |
| --- | --- |
| `connected` | Probe succeeded and visible IDs match the Registry |
| `connected-with-drift` | MCP works, but visible IDs differ |
| `registered` | Configuration exists; no live probe was requested |
| `not-registered` | The server entry is absent |
| `server-stopped` | The configured process could not start or exited |
| `handshake-failed` | Initialize/list protocol checks failed |
| `permission-blocked` | Configuration or process access was denied |
| `unknown-error` | Failure could not be classified safely |

Health results include the failure stage, diagnostic text, and suggested next actions. The default probe timeout is eight seconds.

The Board Runtime view is a separate local smoke surface. In the desktop app it should already
show a running MCP stdio process after startup, using the same executable path that one-click
connection writes into IDE configuration. A stopped Board Runtime does not by itself prove that
an IDE config is broken, but it does indicate the packaged MCP launcher cannot stay alive and must
be fixed before relying on IDE health results. On macOS the runtime child process hides its Dock
icon (`app.dock.hide()`), so the Dock shows a single icon for the main application.

## Adding an IDE

An IDE is not complete when only its label appears in the UI. A contribution must cover:

- target type and shared registry metadata;
- official documentation link;
- macOS, Windows, and Linux candidate paths as applicable;
- configuration shape and structured codec behavior;
- detection of existing registrations;
- plan, backup, apply, verification, and rollback;
- Board localization and state rendering;
- path, preservation, malformed-config, and rollback tests.

Do not add silent fallback writes to guessed paths. Unsupported or ambiguous cases must remain visible to the user.

## Connection Targets vs Compile Targets

The six targets above describe where Skill Central can register its MCP server. Compiler adapters describe target-specific preview artifacts and currently support only generic MCP, Cursor, and Windsurf. These registries serve different purposes and must not be presented as equivalent coverage.
