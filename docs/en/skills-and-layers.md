# Skills and Layers

[简体中文](../ch/skills-and-layers.md) | [Documentation index](./README.md)

## Domain Model

A skill is a YAML source asset. A layer is the governance boundary that gives a group of skills scope, priority, write policy, trust, sync policy, and visibility. The engine normalizes source files, resolves repeated IDs, and exposes only deterministic winners to ordinary consumers.

Skill source files and application state are separate. Moving or deleting app-state data does not move or delete configured layer files.

## Configuration Loading

Configuration is merged in this order:

1. User configuration: `~/.skill-central/config.yaml`
2. Project configuration: `skill-central.yaml` or `skill-central.yml`
3. Built-in legacy-compatible defaults when neither source defines a layer

An incoming layer replaces an earlier layer with the same `id`, or the same `name` for legacy compatibility. Invalid layer blocks are skipped with field-level warnings; other valid layers can still load.

A complete layer declaration looks like this:

```yaml
layers:
  - id: team-workflows
    name: Team Workflows
    path: .skills/team-workflows
    scope: workspace
    priority: 30
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private
```

Accepted governance values:

| Field | Values | Meaning |
| --- | --- | --- |
| `scope` | `user`, `workspace`, `repo`, `team`, `org`, `session` | Distance from the current workspace context |
| `trust` | `local`, `remote`, `org`, `verified` | Provenance classification; not an automatic cryptographic guarantee |
| `visibility` | `private`, `team`, `public` | Intended distribution boundary |
| `sync.enabled` | Boolean | Whether the layer may participate in registry sync |
| `writable` | Boolean | Whether callers should treat the layer as editable |

The generated four-layer preset remains supported. Its increasing priorities are `01-global` (10), `02-workflows` (20), `03-domains` (30), and `04-tech-stack` (40).

## Resolution Rules

For each repeated skill ID, the override tree compares candidates as follows:

1. Higher `priority` wins.
2. If priorities match, the closest scope wins: `session`, then `workspace`/`repo`, then `user`, `team`, and `org`.
3. If both priority and scope distance match, the record is `conflicted`. No candidate becomes effective.

Non-winning candidates remain visible as `shadowed`, with provenance that identifies the winner. Conflicted and shadowed records remain available to diagnostics, the Board, and compile previews. Ordinary MCP prompt/tool listings expose effective records only.

## Universal Skill v1

The current public schema version is `skillcentral.dev/v1`. A minimal prompt skill is:

```yaml
schemaVersion: skillcentral.dev/v1
id: review-pr
name: PR Review
description: Review a change against project constraints
type: prompt
tags: [review, workflow]
prompt: |
  Review correctness, regressions, security boundaries, and tests.
```

The ID must be stable and should use lowercase kebab case. Required base fields are `schemaVersion`, `id`, `name`, `description`, and `type`.

Supported types are:

| Type | Current role |
| --- | --- |
| `prompt` | Exposed as an MCP prompt and composed into user messages |
| `tool` | Exposed as an MCP tool with lightweight argument validation |
| `workflow` | Defines workflow steps and orchestration metadata |
| `policy` | Carries policy prompt and capability constraints |
| `context-router` | Declares context subscriptions and publications |

The schema can also express:

- `activation.intents`, `filePatterns`, `repoSignals`, and priority
- required, optional, and denied capabilities
- target-specific metadata
- context topics to subscribe to or publish
- degradation rules for missing capabilities
- workflow strategy, dependencies, roles, and output topics
- English `prompt` and Simplified Chinese `prompt_zh`

Legacy prompt/tool files without `schemaVersion` continue to normalize into the current internal view. New public examples and features should use Universal Skill v1.

## Asset Scope

Skills and rules share the `appliesTo` field. It is separate from layer `scope`: layer `scope` participates in candidate precedence, while asset `appliesTo` decides whether the current project may load that asset. The default is global:

```yaml
appliesTo: global
```

Bind an asset to one or more projects:

```yaml
appliesTo:
  projects:
    - git:github.com/acme/service-a
    - git:github.com/acme/service-b
```

Project identity prefers a stable `git:<host>/<owner>/<repo>` ID derived from Git `origin`. Without a supported remote it falls back to a canonical real path, `path:<absolute-path>`. GitHub project IDs are case-insensitive. Invalid, empty, or duplicate IDs produce field-level validation errors.

Skills are filtered before entering the override tree, so non-matching candidates cannot affect conflict resolution and do not reach MCP, compiler, or ordinary CLI queries. User-global Skills under `~/.skill-central/skills/` load at lower priority in every project. Rules use the same scope matcher and load from `~/.skill-central/rules/` plus the project `.rules/`; a same-ID project rule overrides the global rule. Coding Agents can consume Rules through `rule://registry` and `rule://rule/<id>` resources, `rules:all` and `rule:<id>` prompts, or the `rules.list` and `rules.get` tools.

## Reverse Output

Reverse output means the IDE, Board, or workflow has produced content that is not yet
represented in the current skill or rule library, and the result should be preserved as a
durable digital asset rather than left in chat, notes, or a one-off export.

Terminology:

- Skill: a reusable, evolving asset that should be continuously cultivated and written back
  into `.skills/` once it proves stable.
- Skill Central covenant: the shared rule assets in `.rules/`. It carries cross-IDE,
  cross-person business terminology, architecture boundaries, style, quality floors, and
  gates. `appliesTo` may make a covenant global or project-scoped.
- Rule: a stable, reusable constraint, review, or governance asset. Only content that
  belongs to the Skill Central covenant should be promoted into `.rules/`.
- IDE-native rule: an environment file such as `AGENT.md`, `AGENTS.md`, or `CLAUDE.md`.
  It describes the current IDE, machine, startup path, and local execution method; it does
  not carry business policy.
- Project-local guidance: content that only applies to one project. Keep it in work records or
  temporary output by default instead of promoting it into the rule library.

### Rule Placement Checklist

The rule library and IDE-native rules are not two copies of one instruction set. They are a
covenant and an environment adapter. When deciding where reverse output belongs, apply these
checks in order:

1. **Business domain versus runtime environment**
   - Cross-IDE, cross-person business terminology, architecture boundaries, and code quality
     floors belong in the Skill Central covenant.
   - Machine-specific startup commands such as `./gradlew run`, IDE-specific capabilities
     such as Cursor `@` retrieval syntax, and bootloader instructions that tell an agent to
     fetch rules remotely belong in the IDE-native rule.
2. **Strategic constraint versus tactical execution**
   - What, Why, and absolute prohibitions belong in the Skill Central covenant.
   - How to click, invoke, or execute a command in the local environment belongs in the
     IDE-native rule.
3. **Dynamic evolution versus relative stability**
   - Frequently recurring, reusable development lessons belong in Skills or Rules and should
     be cultivated through reverse output.
   - Low-frequency bootstrap configuration that is established by an engineering template
     belongs in the IDE-native rule.

### Covenant and IDE-Native Conflicts

- `.rules/` defines cross-IDE What, Why, and gates; IDE-native rules translate those
  requirements into local How.
- An IDE-native rule may add execution detail, but must not redefine covenant terminology,
  remove a quality gate, or weaken an architecture boundary.
- When one document mixes covenant policy and local execution detail, split it instead of
  copying the whole document into both locations.
- If the current IDE cannot satisfy the covenant, record the incompatibility and stop or
  explicitly degrade the workflow. Do not silently let the IDE-native rule override it.
- Do not promote `AGENT.md`, `AGENTS.md`, `CLAUDE.md`, or equivalent bootloader text into
  `.rules/` merely because it is convenient to load.

Required checkpoints before promoting reverse output:

1. Source and context are identified.
2. The asset type and intended target library are explicit.
3. The placement classification and reason are explicit; the boundary checklist, duplicate
   check, and conflict check are recorded.
4. Scope and `appliesTo` are explicit.
5. Schema validation passes.
6. If an existing asset is edited, diff preview, backup, and rollback path are recorded.
7. Verification and tests are completed, or the output is explicitly marked unverified.
8. The decision is recorded as promote, defer, or discard.

### Current MVP Surface

The current experimental implementation exposes one shared reverse-output control plane:

- The IDE-facing MCP tool is `reverse_output`.
- The equivalent CLI entry is `skill-central reverse-output <action>`.
- `preview` is side-effect free. `apply` requires an explicit `promote`, `defer`, or
  `discard` decision; only `promote` writes a source asset.
- Every proposal declares `placement` and `placementReason`. Rules must use
  `covenant-rule`; `ide-native-rule` is rejected. A `project-local` Skill must use a
  project-scoped `appliesTo`.
- Skill and Rule candidates are validated against their public schemas, require an explicit
  `appliesTo`, and are blocked on duplicate, target, or expected-SHA conflicts.
- Updates use a sibling backup and atomic replacement. Successful writes are parsed and
  validated again, and apply/rollback decisions are written to App State audit records.
- The Board can manage existing Skills and Rules, but its reverse-output proposal and
  promotion controls are not wired yet. Use the MCP tool or CLI for this MVP.

The intended first path is therefore: an IDE proposes a reusable Skill or covenant Rule,
`preview` records the boundary checks and diff, a human or workflow chooses the decision,
and only a `promote` result writes to the configured library. A Rule suggestion that only
describes `AGENT.md`, `AGENTS.md`, `CLAUDE.md`, or another local bootloader remains an
IDE-native instruction and must not be promoted into `.rules/`.

Inspect the current project identity or an asset scope:

```bash
skill-central scope current
skill-central scope show .rules/no-secrets.yaml
```

Atomically edit a Skill or Rule source file:

```bash
skill-central scope set .rules/no-secrets.yaml --global
skill-central scope set .skills/02-workflows/review.yaml --current-project
skill-central scope set .rules/no-secrets.yaml \
  --projects git:github.com/acme/service-a,git:github.com/acme/service-b
```

`scope set` reuses the matching schema validator before writing, then replaces the file atomically from a sibling temporary file. Automation can pass `--expected-sha256 <hash>` to reject an update after concurrent file changes. `list`, `show`, and `rules` accept `--project-id`/`--project-root` as explicit context overrides.

The Web Board displays Skills and Rules as independent asset types and can set either one to global scope or one/more projects. Its management index retains assets that do not match the current project, so users can restore their scope without using the CLI. Browser writes enforce Same-Origin, schema validation, and expected-SHA concurrency checks before reusing the same atomic file editor as the CLI.

## Prompt and Tool Composition

Prompt placeholders use `{{name}}` and are replaced from request arguments. If both `prompt` and `prompt_zh` exist, Skill Central emits one bilingual message with explicit language sections.

Tool inputs may use `inputSchema`. Current runtime validation checks required fields and basic JSON types. It is not a complete JSON Schema implementation, so contributors must not describe it as one.

Tag-based composition orders prompt skills from lower to higher layer priority, producing baseline context before more specific guidance.

## Registry and Queries

`SkillEngine` owns the in-memory override tree. The Registry query layer provides a shared view for CLI, MCP, Board, compiler, and health consumers. A query can filter by identifiers, type, tags, layer, source format, or status depending on the caller.

Consumers that need explanations should use resolution records rather than reconstructing provenance from an effective skill.

## Compilation

Compilation is currently a dry-run operation:

1. Match an intent against `activation.intents`, then ID or exact tag.
2. Select effective skills and retain shadowed/conflicted evidence.
3. Ask the target adapter about required, optional, and denied capabilities.
4. Produce degradation reports when required capabilities are unavailable.
5. Build preview artifacts and a deterministic hash without writing target files.

Compile adapters currently exist for `generic-mcp`, `cursor`, and `windsurf`. This list is independent of the IDE connection list.

## Authoring and Review Rules

- Keep a skill ID stable after publication. Board edits explicitly reject ID changes.
- Use a new file plus removal when changing identity or layer ownership.
- Do not rely on file discovery order for overrides.
- Declare sync and visibility policy at the layer boundary, not as an undocumented convention.
- Run `skill-central validate <files...>` for changed definitions.
- Run `skill-central doctor` after changing layers or resolving collisions.
- Treat a capability declaration as a contract that requires adapter and degradation coverage.
