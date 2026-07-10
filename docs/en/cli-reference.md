# CLI Reference

skill-central exposes every capability through one binary. Run `npx @bobcgn/skill-central <command> --help` for live flag documentation; this page is the canonical reference.

| Command | Purpose |
|---|---|
| `mcp` | Start the Stdio MCP server (for IDE integration) |
| `board` | Open the web dashboard (default) or print terminal table (`--cli`) |
| `init` | Scaffold `.skills/` + `skill-central.yaml` |
| `add` | Create a new skill definition file (auto-selects layer) |
| `list` | List loaded skills (filters: `--layer`, `--tag`, `--type`) |
| `show <id>` | Print full skill details + prompt body |
| `remove <id>` | Delete a skill definition file |
| `validate <files…>` | Parse + validate one or more files |
| `doctor` | Scan layers for missing dirs, parse errors, collisions, backups |
| `install <source>` | Install a skill from `github:` or `npm:` |
| `update [id]` | Re-fetch installed skill(s) from their source |
| `uninstall <id>` | Remove an installed skill (file + lock entry) |

## Global flags

All commands inherit these from `commander`:

```
-h, --help     display help for command
-V, --version  display skill-central version
```

## `mcp`

```
skill-central mcp
```

Starts the Stdio MCP server. Used by IDEs (Cursor / Windsurf / Claude Code) via `mcpServers` config. All `console.log` output is suppressed (stdout is the JSON-RPC channel); diagnostics go to stderr.

## `board`

```
skill-central board [options]

Options:
  --cli, --no-web           Force terminal-table output
  --port <port>             Web dashboard port (default 5417; auto +1 on conflict)
  --host <addr>             Bind address (default 127.0.0.1)
  --i-understand-nonlocal   Required for non-loopback --host
```

Default behaviour launches a Hono server bound to `127.0.0.1:5417` and prints the URL. Use `--cli` (or `--no-web`) to get the v0.1.0 terminal-table fallback. See [`docs/web-board.md`](./web-board.md).

The port tries `<port>`, then `<port>+1` … up to `<port>+10` before failing. The non-loopback guard refuses `--host 0.0.0.0` (or any non-`127.0.0.0/8` address) unless `--i-understand-nonlocal` is set, because the board has no authentication and is meant for local use.

## `init`

```
skill-central init
```

Scaffolds `.skills/` (with four sub-directories: `01-global`, `02-workflows`, `03-domains`, `04-tech-stack/{languages,frameworks}`) and a `skill-central.yaml` at the project root. Idempotent: existing files are not overwritten.

## `add`

```
skill-central add [options]

Options:
  --id <id>                 Skill id in kebab-case
  -n, --name <name>         Human-readable name
  -d, --description <text>  Short description
  -t, --type <type>         "prompt" or "tool" (default: prompt)
  --tags <tags>             Comma-separated tags (drives layer inference)
  --prompt <text>           Inline prompt content
  --prompt-file <path>      Read prompt content from a file
  --from-file <path>        Copy an existing skill file verbatim
  --layer <layer>           Force target layer (bypasses inference)
  --user                    Write to ~/.skill-central/skills/ (default: project .skills/)
  --force                   Overwrite existing file (creates .bak.<ts>)
  -y, --yes                 Skip confirmations
```

Either `--id + --name + --description + (--prompt | --prompt-file)` is required, **or** `--from-file` (which copies the whole skill verbatim and overrides the other content flags). Layer selection is automatic from `--tags` via [`LAYER_RULES`](#layer-inference); pass `--layer` to override.

Examples:

```bash
# Local skill from flags
skill-central add review-pr \
  --name "PR Review" \
  --description "Review pull requests against team conventions" \
  --tags "review,workflow,git" \
  --prompt-file ./review.md

# Copy an existing YAML
skill-central add --from-file ./my-skill.yaml --force

# Global (cross-project) install
skill-central add --user my-baseline --tags "global" --prompt "Always be concise."
```

## `list`

```
skill-central list [options]

Options:
  --layer <name>   Only show skills from this layer
  --tag <tag>      Only show skills with this tag
  --type <type>    Only "prompt" or "tool"
  --source         Also print source file paths
```

## `show <id>`

Prints full skill metadata (name, description, type, tags, layer, source path) and the complete prompt body (or `inputSchema` JSON for tool-typed skills).

## `remove <id>`

```
skill-central remove <id> [options]

Options:
  --layer <name>   Specify which layer (required if id spans layers)
  --force          Skip confirmation
```

If the same id exists in multiple layers, `remove` refuses without `--layer` to avoid ambiguity. Idempotent re-add: re-running `add` with the same id writes back to the original layer.

## `validate <files…>`

Parse each file as a `SkillSchema`. Exit 0 if all valid, 1 if any fail.

```bash
skill-central validate .skills/02-workflows/*.yaml
```

## `doctor`

```
skill-central doctor
```

Reports:

- missing layer directories
- parse errors in skill files
- id collisions (same id defined in multiple layers)
- backup files (`*.yaml.bak.<ts>` siblings)

Exit 0 if everything is healthy, 1 otherwise. Run this before `git commit` if you've edited `.skills/` by hand.

## `install <source>`

```
skill-central install <source> [options]

Options:
  --layer <layer>   Force target layer (bypasses inference)
  --project         Install into project .skills/ (default: user ~/.skill-central/skills/)
  -y, --yes         Skip per-skill confirmation
```

Sources:

```
github:<user>/<repo>/<path/to/file.yaml>[@<ref>]
npm:<pkg>[@<version>]      # requires skill-central.paths in package.json
```

Examples:

```bash
skill-central install github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml@main
skill-central install npm:@bobcgn/some-skills@1.0.0
```

Writes a `~/.skill-central/lock.json` entry mapping the installed id → source / version / sha256. See [`docs/remote-sources.md`](./remote-sources.md).

## `update [id]`

```
skill-central update [id] [options]

Options:
  --project   Update into project scope (default: preserve original scope)
  -y, --yes   Skip per-skill confirmation (default: non-interactive)
```

Re-fetches every (or one) installed skill from its source and replaces the file if the sha256 differs. Preserves the original scope (project vs user) recorded in the lock.

## `uninstall <id>`

```
skill-central uninstall <id> [options]

Options:
  --purge-backups   Also remove .bak.* siblings
  -y, --yes         Skip confirmation
```

Removes both the on-disk file and the lock entry. Refuses if the id is not in the lock (use `remove` to delete a skill that was added without going through `install`).

---

## Layer inference

Layer auto-selection for `add` and `install` is driven by a single tag table in `src/commands/add.ts`:

| Layer | Match rule (any tag) |
|---|---|
| `01-global` | `global`, `universal`, `baseline`, `system`, `mindset` |
| `02-workflows` | `workflow`, `debug`, `review`, `planning`, `commit`, `test`, `lint`, `readme`, `changelog`, `refactor`, `document`, `release`, `git` |
| `03-domains` | `docker`, `nginx`, `infra`, `devops`, `security`, `database`, `db`, `data`, `ai`, `agent`, `ml`, `kubernetes`, `k8s`, `terraform`, `aws` |
| `04-tech-stack/languages` | `typescript`, `javascript`, `python`, `kotlin`, `swift`, `java`, `go`, `rust`, `ruby`, `php`, `c++`, `c` |
| `04-tech-stack/frameworks` | `react`, `vue`, `svelte`, `nextjs`, `next`, `nuxt`, `angular`, `express`, `fastapi`, `django`, `flask`, `spring`, `rails` |

Ambiguity policy:

1. Exactly one match → use it.
2. Multiple matches → use the highest-priority layer (so override semantics still work).
3. Idempotent re-add: same id → same layer.
4. `--layer` overrides everything.
5. No match → default to `02-workflows` with a stderr hint.