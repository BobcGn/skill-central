# Skill Schema

A skill is one YAML (or JSON) file in a layer directory. The schema is small and strictly validated at load time.

## Minimal example

```yaml
id: review-pr
name: PR Review
description: Review pull requests against team conventions
type: prompt
tags:
  - review
  - workflow
  - git
prompt: |
  You are a code reviewer. Be specific, not vague.
  Flag: security issues, missing tests, breaking changes.
```

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | **yes** | Globally unique. Kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`). Used as the prompt/tool name in MCP. |
| `name` | string | **yes** | Human-readable label. |
| `description` | string | **yes** | One sentence. Surfaced in MCP `ListPrompts` / `ListTools` output. |
| `type` | `"prompt"` \| `"tool"` | **yes** | Discriminator: `prompt` → instructions sent to AI; `tool` → callable function. |
| `tags` | string[] | no | Used for tag-based composition (`GetPrompt("skills:compose", { tags: "kmp,android" })`) and layer auto-inference in `add` / `install`. |
| `prompt` | string | required when `type: prompt` | Multi-line string. `{{handlebars}}` placeholders are interpolated from MCP `GetPrompt` arguments. |
| `inputSchema` | object | required when `type: tool` | JSON Schema for the tool's arguments. Validated at `CallTool` time. |
| `arguments` | object[] | no | Informational metadata for IDE UI. Same shape as MCP `Prompt.arguments`. |
| `version` | string | no | Free-form version string. Defaults to `"0.1.0"` when missing. |

## Tool example

```yaml
id: commit-conventions
name: Commit Conventions
description: Generate or validate git commit messages following Conventional Commits
type: tool
tags:
  - git
  - workflow
  - commit
inputSchema:
  type: object
  properties:
    type:
      type: string
      description: 'Commit type (feat, fix, chore, docs, refactor, test, style)'
    scope:
      type: string
      description: 'Scope of the change (e.g. api, cli, core)'
    summary:
      type: string
      description: Short imperative description
    body:
      type: string
      description: Longer description with motivation
  required:
    - type
    - summary
arguments:
  - name: type
    description: Commit type
    required: true
  - name: summary
    description: Short imperative description
    required: true
prompt: |
  Generate a Conventional Commit message:
  {{type}}({{scope}}): {{summary}}
  {{body}}
```

## Validation

Validation lives in `src/storage/parser.ts` and is shared by the engine and the CLI:

- `id` must be a non-empty string
- `type` must be `"prompt"` or `"tool"`
- `tags` is normalised: a single string becomes `["that-string"]`; non-string entries are dropped

`skill-central validate <file…>` runs the same checks from the command line and exits 1 on any failure. `skill-central doctor` runs them across every loaded layer and reports errors with file paths.

## Filename convention

Files are named `<id>.yaml` (or `.yml`, `.json`). The engine ignores files that start with `_` (treated as templates) or `.` (hidden). See `src/storage/reader.ts`.

## How the schema flows through the system

```
.skills/04-tech-stack/languages/python-code-review.yaml
        │
        │  parseSkillFile()  (js-yaml + validateSkill)
        ▼
SkillSchema  { id, name, type, ... }
        │
        │  OverrideTree.insert()   (per-layer)
        ▼
ResolvedSkill { ...schema, source, priority }
        │
        │  ListPrompts / ListTools / GetPrompt / CallTool
        ▼
IDE (Cursor, Windsurf, Claude Code, ...)
```

The schema is the contract between skill authors and the engine; if you change it, update both `src/storage/schemas.ts` and the validator in `parser.ts`.