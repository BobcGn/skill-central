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
