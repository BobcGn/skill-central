# Remote Sources

`skill-central install <source>` fetches a skill from a remote URL and writes it into a layer. This page documents the supported source grammar, the manifest convention, and the security model.

## Source URL grammar

Two prefixes are supported:

```
github:<user>/<repo>/<path/to/file.yaml>[@<ref>]
npm:<pkg>[@<version>]
```

### GitHub

`<ref>` defaults to `main`. `<path>` must end in `.yaml`, `.yml`, or `.json`. The fetcher issues:

```
GET https://raw.githubusercontent.com/<user>/<repo>/<ref>/<path>
```

Examples:

```bash
skill-central install github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml
skill-central install github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml@v1.0.0
skill-central install github:my-org/private-repo/skills/review.yaml@feat/auth
```

### npm

The package **must** declare a `skill-central` field in its `package.json`:

```json
{
  "name": "@bobcgn/some-skills",
  "version": "1.0.0",
  "skill-central": {
    "paths": ["./skills/review-pr.yaml", "./skills/commit-msg.yaml"]
  }
}
```

- `paths` is an array of file paths **inside the tarball**. Each path becomes one installed skill.
- If `paths` is absent or empty, install fails with: `Package X has no "skill-central.paths" in its package.json.`
- The fetcher does `https://registry.npmjs.org/<pkg>` (or `/<pkg>/<version>`) to discover the tarball URL, then extracts via `node:zlib` + `tar-stream`.
- `<version>` defaults to `latest`. Scoped packages use `npm:@scope/pkg`.

```bash
skill-central install npm:@bobcgn/some-skills
skill-central install npm:@bobcgn/some-skills@1.2.3
```

## Lock file

Every successful install writes an entry to `~/.skill-central/lock.json`:

```json
{
  "version": 1,
  "entries": {
    "review-pr": {
      "id": "review-pr",
      "source": "github:BobcGn/skill-central/.skills/02-workflows/review-pr.yaml@main",
      "version": "main",
      "sha256": "2e9897a8819c996f6bb677a4731626bd414f1008da1f93f3958a2a3391b77568",
      "installedAt": "2026-06-15T09:11:08.835Z",
      "layer": "02-workflows",
      "filePath": "/home/you/.skill-central/skills/02-workflows/review-pr.yaml"
    }
  }
}
```

- `source` — canonical raw form used by `update` to re-fetch
- `sha256` — sha256 of the on-disk file at install time; used for drift detection
- `layer` — display name of the layer where the file was written
- `filePath` — absolute path; `update` and `uninstall` trust this verbatim

## Security model

### HTTPS only

Both GitHub and npm paths are downloaded over HTTPS. The fetcher explicitly rejects:

- any URL whose `URL.protocol !== "https:"`
- any URL whose host is `localhost`, `127.0.0.0/8`, `::1`, or `0.0.0.0` (tar-slip / SSRF mitigation)
- any response whose `content-type` doesn't match `text/yaml`, `text/x-yaml`, `application/json`, or `text/plain`

### Tar-slip defence

For npm tarballs, every entry is checked before extraction:

```ts
if (!name.startsWith("package/")) return;     // not under expected prefix
if (name.includes("..") || name.includes("\\")) return;  // tar-slip attempt
```

Only `package/...` paths are kept. The `..` and `\` checks reject path-traversal payloads.

### sha256 verification

The lock file records the sha256 of the file at install time. `update` re-fetches, computes the new sha256, and only reports drift when they differ. There is **no signature verification** — we trust the source (GitHub repo, npm package). If you need stronger guarantees, pin to a git tag or npm version with `@v1.2.3`.

### Confirmation prompt

First-time install (without `--yes`) prints the id, name, tags, source, version, and sha256 before writing. Pass `--yes` in scripts.

## Versioning & drift

`update [id]` re-fetches and overwrites. There is no automatic update — `update` always requires a manual invocation. If the upstream file changed:

```
  ✓ Updated user:02-workflows/review-pr.yaml
    old sha: 2e9897a8819c996f…
    new sha: a4f00c813f9b27bd…
```

If unchanged, update reports `0 of N updated`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `HTTP 404` | Source path doesn't exist on remote (typo, missing file, or wrong branch) |
| `Package X has no "skill-central.paths"` | npm package author forgot the manifest field |
| `Refusing non-HTTPS URL` | You prefixed a source with `http://` — change to `https://` |
| `Refusing to fetch loopback host` | Source URL points to `localhost` / `127.0.0.1` — likely a misconfiguration; contact the package author |
| `Tarball missing package/package.json` | npm registry served a malformed tarball; retry, then file an issue upstream |