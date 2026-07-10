# Layered Override

Skills live in **layers** — directories with an associated **priority** number. When two layers define the same `id`, the higher-priority layer wins. This enables progressive override: global defaults that any project can shadow without modifying upstream files.

## The four project layers

After `skill-central init`, your project has:

```
.skills/
├── 01-global/                priority 10
├── 02-workflows/             priority 20
├── 03-domains/               priority 30
└── 04-tech-stack/
    ├── languages/            priority 40
    └── frameworks/           priority 40
```

| Layer | Purpose | Example tags |
|---|---|---|
| `01-global` | Universal context — applies to every interaction | `global`, `mindset`, `system` |
| `02-workflows` | Cross-cutting workflow patterns | `review`, `debug`, `commit`, `test`, `lint` |
| `03-domains` | Domain-specific knowledge | `docker`, `nginx`, `database`, `security` |
| `04-tech-stack/languages` | Language conventions | `typescript`, `python`, `kotlin` |
| `04-tech-stack/frameworks` | Framework conventions | `react`, `vue`, `nextjs`, `spring` |

The priority numbers are not magic — they're just an ordering. Higher = wins. The actual content of each layer is up to you; the names are convention.

## `skill-central.yaml`

Layers are declared in `skill-central.yaml` at the project root:

```yaml
layers:
  - name: "01-global"
    path: ".skills/01-global"
    priority: 10
  - name: "02-workflows"
    path: ".skills/02-workflows"
    priority: 20
  - name: "03-domains"
    path: ".skills/03-domains"
    priority: 30
  - name: "04-tech-stack"
    path: ".skills/04-tech-stack"
    priority: 40
```

This is the exact output of `skill-central init`. You can add, remove, or reorder entries — the only constraint is that priorities must be unique within a config (the loader overwrites on name collision, not priority).

`loadConfig()` resolves layers in this order:

1. `~/.skill-central/config.yaml` (user-level, future use)
2. `<project-root>/skill-central.yaml` (project-level)
3. Built-in fallback `{ name: "project", path: ".skills", priority: 100 }` when neither file exists

## User-level layer (since v0.2.0)

`skill-central add --user` and `skill-central install` (default scope) write to `~/.skill-central/skills/`:

```
~/.skill-central/
├── config.yaml           # optional: explicit user layers
├── skills/
│   ├── 01-global/
│   ├── 02-workflows/
│   ├── 03-domains/
│   └── 04-tech-stack/
│       ├── languages/
│       └── frameworks/
└── lock.json             # installed-from-where record
```

User-level skills are at **priorities 5 / 15 / 25 / 35** (below project), so a project can always shadow them. This mirrors the `npm global vs local` model: global is a baseline; project overrides.

The four sub-directories mirror the project's 1:1 so that layer-inference rules (which are layered-name based) work uniformly across scopes.

## Override semantics

```
Layer A (priority 10) defines id=review-pr (lenient)
Layer B (priority 40) defines id=review-pr (strict)

Resolved id=review-pr = Layer B's version
```

In the engine (`src/core/override-tree.ts`), `insert()` keeps the higher-priority entry when two layers declare the same id. The losing entry is silently overwritten — use `skill-central doctor` to surface collisions when you want to know.

```bash
$ skill-central doctor
...
▸ ⚠ Id collisions (1)
  (same id defined in multiple layers — higher priority wins)
  id: review-pr
    • [priority 20] 02-workflows → .skills/02-workflows/review-pr.yaml
    • [priority 40] 04-tech-stack/frameworks → .skills/04-tech-stack/frameworks/review-pr.yaml
```

## Tag-based composition

In addition to id-based override, the IDE can request skills by tag:

```json
GetPrompt({ name: "skills:compose", arguments: { tags: "kmp,android" } })
```

The engine (`getSkillsByTags`) returns every skill whose tags overlap the requested set, ordered by ascending layer priority, and the composer concatenates them with a `---` separator. This produces a layered prompt: low-priority context first, high-priority specifics last. See `src/core/composer.ts`.

## Why four layers?

The split is **scope-based, not tech-based**. v0.1.0 used 9 layers (one per tech stack) which forced you to repeat the same workflow skills across stacks. The 4-layer model says:

- if it's about how you think about code → `01-global`
- if it's about a process (review, debug, commit) → `02-workflows`
- if it's about a domain (Docker, security, data) → `03-domains`
- if it's about a specific language or framework → `04-tech-stack`

This keeps the workflow layer small and reusable across tech stacks. Add more layers in your `skill-central.yaml` if your project needs them — the engine doesn't care.