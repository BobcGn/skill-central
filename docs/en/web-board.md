# Web Board

> **Default since v0.2.0.** `skill-central board` now opens a local Hono dashboard instead of printing a terminal table. Use `board --cli` (or `--no-web`) for the v0.1.0 behaviour.

The web board is a single-page vanilla-JS dashboard served from your machine. It does **not** require any external service, build step, or network access beyond `127.0.0.1`.

## Quick start

```bash
# Launch on default port
npx @bobcgn/skill-central board

# Custom port
npx @bobcgn/skill-central board --port 8080

# Auto-fallback to terminal
npx @bobcgn/skill-central board --cli
```

Output:

```
  ✓ skill-central web board
    http://127.0.0.1:5417/

  Press Ctrl+C to stop.
```

The browser shows a sidebar grouped by layer (01-global → 04-tech-stack) and a detail pane with the full prompt body on click.

## What you can do

| Action | UI affordance |
|---|---|
| Browse skills | Click a skill in the sidebar |
| Read the prompt | Detail pane renders `<pre>` with `white-space: pre-wrap` |
| Edit a skill | Click **Edit** → textarea opens with raw YAML → **Save** |
| See backups | Click **Backups** → list of `.bak.<ts>` siblings with restore buttons |
| Audit conflicts | Concurrent edits are caught by sha256 mismatch |

## Edit flow with sha256-conflict detection

```
1. GET /api/skills/:id         → returns rawYaml + sha256
2. User edits textarea
3. PUT /api/skills/:id         body: { rawYaml, expectedSha256 }
   - parse YAML → validate → reject if id changed → backup existing file → write
   - return { ok: true, sha256 }
4. If expectedSha256 doesn't match current file → 409 + currentRawYaml
   - frontend shows "File changed on disk since you loaded it"
   - both versions are presented for manual merge
```

Each successful save moves the previous content to `<file>.bak.<ISO-no-colons>`. Backups are **never** auto-deleted; `doctor` lists them and you remove them by hand.

## Security model

- **Bind address.** Default `127.0.0.1`. The `--host` flag accepts any address, but **non-loopback hosts require `--i-understand-nonlocal`** — a footgun guard. The web board has no authentication: anyone with network access to the port can edit your skills.
- **No auth, no CORS.** Same-origin only. If you bind to `0.0.0.0` (against recommendation) you must opt in with the explicit flag.
- **Static asset path traversal.** Every `GET /*` resolves under `dist/web/`; `..` and absolute paths return 404.
- **Skill id pattern.** `:id` in routes is regex-checked to `[a-z0-9]+(-[a-z0-9]+)*`. Anything else returns 400.
- **Write scope.** `PUT /api/skills/:id` only writes to the resolved source path that `GET` reported. A skill can never be moved across layers via the web UI (use `remove` + `add` for that, which makes the move auditable).

## HTTP API reference

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ ok, version, skills }` |
| `GET` | `/api/layers` | — | `[{ name, path, priority, fileCount }]` |
| `GET` | `/api/skills` | — | `[SkillDto]` sorted by layer priority then id |
| `GET` | `/api/skills/:id` | — | `SkillDto & { rawYaml, sha256 }` |
| `PUT` | `/api/skills/:id` | `{ rawYaml, expectedSha256? }` | `{ ok, sha256 }` / `409` on conflict |
| `GET` | `/api/skills/:id/backups` | — | `[{ file, createdAt, size }]` |
| `POST` | `/api/skills/:id/restore` | `{ backupFile }` | `{ ok }` |

`SkillDto` fields: `id, name, description, type, tags, layer, priority, source`.

## Implementation notes

- Frontend: vanilla JS + a single `index.html` + `style.css` + `app.js`. No build step. Assets are bundled at `dist/web/` by `npm run build:web` (just `cp -R`).
- Server: Hono 4 with `@hono/node-server`. Static middleware is hand-rolled to avoid `hono/serve-static`'s `getContent` requirement on this Hono version.
- Backup convention: `<filePath>.bak.<ISO-no-colons>` (e.g. `…/foo.yaml.bak.2026-06-15T09-11-08-835Z`).