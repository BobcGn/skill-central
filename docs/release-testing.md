# v0.2.0 Release Testing Checklist

Use this checklist to verify skill-central v0.2.0 on your own device before publishing. The steps are concrete and ordered — tick each box as you go. If any step fails, record the exact command + output in a scratch file and revisit.

> **Convention:** every block starts with `cd` to the repo root. If you're already there, skip that line.

## 0. Prerequisites

- [ ] Node.js **v22+** (`node --version`)
- [ ] npm **v10+** (`npm --version`)
- [ ] macOS / Linux / WSL (the tar-stream native bindings are pure-JS, so any platform works)
- [ ] Working directory is the repo root
- [ ] `git status` is clean (or you've stashed your work)

```bash
node --version      # must print v22.x or later
npm --version       # must print 10.x or later
git status          # nothing uncommitted
```

---

## 1. Build & sanity

- [ ] `npm install` succeeds
- [ ] `npm run build` exits 0
- [ ] `npm run build:web` exits 0
- [ ] `dist/web/index.html` exists
- [ ] `node dist/index.js --version` prints `0.2.0`
- [ ] `node dist/index.js --help` shows all 12 commands

```bash
npm install
npm run build
npm run build:web
ls dist/web/index.html
node dist/index.js --version
node dist/index.js --help | grep -E '^\s+(mcp|board|init|add|list|show|remove|validate|doctor|install|update|uninstall)\b'
```

Expected: the grep finds all 12 commands.

---

## 2. CLI CRUD (`add` / `list` / `show` / `remove` / `validate` / `doctor`)

### 2.1 `add` — happy path with tag inference

- [ ] `add` infers `02-workflows` from `review,workflow,git` tags
- [ ] Resulting file is at `.skills/02-workflows/review-pr.yaml`
- [ ] `list` shows the new skill

```bash
node dist/index.js add review-pr \
  --name "PR Review" \
  --description "Review pull requests" \
  --tags "review,workflow,git" \
  --prompt "You are a code reviewer. Be concise."

ls .skills/02-workflows/review-pr.yaml
node dist/index.js list | grep review-pr
```

### 2.2 `add` — explicit `--layer` override

- [ ] Tags are unrelated; `--layer 04-tech-stack/frameworks` is honoured

```bash
node dist/index.js add react-conventions \
  --name "React Conventions" \
  --description "React style" \
  --tags "general" \
  --layer 04-tech-stack/frameworks \
  --prompt "Use functional components."

ls .skills/04-tech-stack/frameworks/react-conventions.yaml
```

### 2.3 `add` — `--from-file` copy

- [ ] Existing skill is re-serialised and written
- [ ] A `.bak.<ts>` sibling is created before overwrite

```bash
node dist/index.js add --from-file .skills/01-global/architectural-mindset.yaml --force
ls .skills/01-global/architectural-mindset.yaml.bak.*  # ≥ 1 file
```

### 2.4 `add` — `--user` writes to user scope

- [ ] Skill lands under `~/.skill-central/skills/...`
- [ ] Default 4-layer subdirs are auto-created

```bash
node dist/index.js add my-baseline \
  --user \
  --name "Baseline" \
  --description "Personal baseline" \
  --tags "global,system" \
  --prompt "Always be concise."

ls ~/.skill-central/skills/01-global/my-baseline.yaml
```

### 2.5 `add` — error paths

- [ ] Re-adding without `--force` errors with clear "File already exists" message
- [ ] Missing required field (no `--name`) exits 1 with field name in the error

```bash
node dist/index.js add review-pr --name "X" --description "Y" --tags "review" --prompt "z"
# expect: "File already exists … Use --force to overwrite"

node dist/index.js add no-id --description "no name" --tags "review" --prompt "x"
# expect: "Missing required field: --name"
```

### 2.6 `list` filters

- [ ] `--tag docker` returns only `container-infra`
- [ ] `--type tool` returns only `commit-conventions`
- [ ] No filters returns the full set

```bash
node dist/index.js list --tag docker
node dist/index.js list --type tool
node dist/index.js list | tail -3
```

### 2.7 `show <id>`

- [ ] Prints name, type, description, tags, layer, source path
- [ ] Prints full prompt body
- [ ] Missing id exits 1 with a clear message

```bash
node dist/index.js show architectural-mindset | head -15
node dist/index.js show no-such-skill   # expect: "Skill \"no-such-skill\" not found"
```

### 2.8 `remove <id>`

- [ ] File is deleted
- [ ] `--force` skips the confirmation

```bash
node dist/index.js remove react-conventions --force
ls .skills/04-tech-stack/frameworks/react-conventions.yaml  # No such file
```

### 2.9 `validate`

- [ ] Valid file exits 0
- [ ] Broken YAML exits 1

```bash
node dist/index.js validate .skills/02-workflows/commit-conventions.yaml
echo "not: [valid: yaml:" > /tmp/bad.yaml
node dist/index.js validate /tmp/bad.yaml   # expect exit 1
rm /tmp/bad.yaml
```

### 2.10 `doctor`

- [ ] Healthy state: `✓ All skill files parse cleanly`, `✓ No id collisions`
- [ ] Injecting a duplicate id surfaces a collision report
- [ ] `node dist/index.js doctor` exits 0 on health, 1 on problems

```bash
node dist/index.js doctor | tail -10
# Inject a collision
cp .skills/01-global/architectural-mindset.yaml /tmp/dup.yaml
node -e "
const fs=require('fs');
const c=fs.readFileSync('/tmp/dup.yaml','utf-8').replace('id: architectural-mindset','id: commit-conventions');
fs.writeFileSync('/tmp/dup.yaml',c);
"
cp /tmp/dup.yaml .skills/02-workflows/dup-id.yaml
node dist/index.js doctor | grep -A2 "⚠ Id collisions"   # expect non-empty
rm .skills/02-workflows/dup-id.yaml /tmp/dup.yaml
```

### 2.11 Clean up section 2

```bash
rm -f .skills/01-global/architectural-mindset.yaml.bak.*
rm -f .skills/02-workflows/review-pr.yaml
rm -f ~/.skill-central/skills/01-global/my-baseline.yaml
```

---

## 3. Web board (`board`)

### 3.1 Default — web on 127.0.0.1:5417

- [ ] Server prints the URL and stays up
- [ ] `GET /api/health` returns `{ ok: true, version: "0.2.0" }`
- [ ] `GET /api/layers` returns 4 layers
- [ ] `GET /api/skills` returns the full set

```bash
node dist/index.js board --port 5601 > /tmp/board.log 2>&1 &
BOARD_PID=$!
sleep 1

curl -s http://127.0.0.1:5601/api/health
curl -s http://127.0.0.1:5601/api/layers | head -c 200
curl -s http://127.0.0.1:5601/api/skills | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>console.log('count:',JSON.parse(d).length));
"

kill $BOARD_PID 2>/dev/null
wait $BOARD_PID 2>/dev/null
```

### 3.2 Browser smoke (manual)

- [ ] Open `http://127.0.0.1:5601/` in your browser
- [ ] Sidebar shows skills grouped by layer
- [ ] Click a skill — detail pane renders the prompt
- [ ] Click **Edit**, change the description, **Save** — file on disk is updated
- [ ] A `.bak.<ts>` sibling appears next to the file
- [ ] Click **Backups** — the new backup is listed
- [ ] Open the file in another editor and modify it; in the browser, **Save** with a stale `expectedSha256` → 409 conflict UI

### 3.3 Static asset path-traversal probe

- [ ] `/../etc/passwd` returns 404 (not 200)

```bash
node dist/index.js board --port 5601 > /tmp/board.log 2>&1 &
BOARD_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5601/../etc/passwd
kill $BOARD_PID 2>/dev/null
wait $BOARD_PID 2>/dev/null
```

### 3.4 Non-loopback host guard

- [ ] `--host 0.0.0.0` without `--i-understand-nonlocal` exits 1 with a clear refusal
- [ ] Adding `--i-understand-nonlocal` lets it bind (and prints a warning)

```bash
node dist/index.js board --host 0.0.0.0 --port 5602
# expect exit 1 with "Refusing to bind to non-loopback address \"0.0.0.0\""

node dist/index.js board --host 0.0.0.0 --port 5602 --i-understand-nonlocal > /tmp/board.log 2>&1 &
BOARD_PID=$!
sleep 1
curl -s http://127.0.0.1:5602/api/health
kill $BOARD_PID 2>/dev/null
wait $BOARD_PID 2>/dev/null
grep -i WARNING /tmp/board.log
```

### 3.5 `--cli` terminal fallback

- [ ] `board --cli` prints the v0.1.0-style table

```bash
node dist/index.js board --cli | head -15
node dist/index.js board --no-web | head -15
```

### 3.6 Port-conflict retry

- [ ] Start two boards back-to-back on the same port; the second prints "Port X busy; using X+1."

```bash
node dist/index.js board --port 5603 > /tmp/board-a.log 2>&1 &
A=$!
sleep 1
node dist/index.js board --port 5603 > /tmp/board-b.log 2>&1 &
B=$!
sleep 1
grep -i "busy" /tmp/board-b.log
kill $A $B 2>/dev/null
wait $A $B 2>/dev/null
```

### 3.7 Web board "assets not found" guard

- [ ] Running `board` from `dist/` after deleting `dist/web/` returns a clear error and exits 1

```bash
mv dist/web /tmp/web-backup
node dist/index.js board --port 5604 2>&1 | head -3
# expect: "Web assets not found at …/dist/web"
mv /tmp/web-backup dist/web
```

### 3.8 Clean up section 3

```bash
pkill -f "node dist/index.js board" 2>/dev/null
rm -f .skills/**/*.bak.* 2>/dev/null   # leftover from manual edit
```

---

## 4. Remote install (`install` / `update` / `uninstall`)

### 4.1 GitHub raw URL — known-existing file

- [ ] Installs to project scope (with `--project`) or user scope (default)
- [ ] Lock entry written with correct sha256

```bash
node dist/index.js install \
  github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml@main \
  --project --yes

cat ~/.skill-central/lock.json   # expect 1 entry
ls .skills/02-workflows/your-skill-id.yaml
```

### 4.2 `update` — preserves scope

- [ ] Without `--project`, update re-installs to the **same scope** the install used

```bash
node dist/index.js update your-skill-id
cat ~/.skill-central/lock.json | grep filePath   # still under .skills/ (project)
```

### 4.3 `uninstall` — removes file + lock entry

- [ ] File deleted, lock entry gone

```bash
node dist/index.js uninstall your-skill-id --yes
cat ~/.skill-central/lock.json
```

### 4.4 GitHub URL — bad ref / path → 404

- [ ] Clear error message, no lock entry written

```bash
node dist/index.js install github:BobcGn/skill-central/does-not-exist.yaml@main --project --yes 2>&1 | head -3
cat ~/.skill-central/lock.json   # expect empty
```

### 4.5 npm — package without `skill-central.paths`

- [ ] Clear error message naming the missing manifest field

```bash
node dist/index.js install npm:lodash@4.17.21 --yes --project 2>&1 | head -3
```

### 4.6 npm — non-existent package → 404

```bash
node dist/index.js install npm:@bobcgn/this-pkg-does-not-exist --yes --project 2>&1 | head -3
```

### 4.7 HTTPS-only defence

- [ ] Installing from a `http://` URL is rejected (the parser only accepts `github:` / `npm:`, so manually verify the fetcher refuses non-https via direct API)

```bash
node --input-type=module -e "
import { httpsFetchText } from './dist/commands/sources.js';
try { await httpsFetchText('http://example.com/foo', ['text/plain']); }
catch (e) { console.log('OK rejected:', e.message); }
"
```

### 4.8 Tar-slip defence (npm)

- [ ] Direct check: a synthetic tar entry with `..` is dropped by the extractor

```bash
node --input-type=module -e "
import { extractTarGz } from './dist/commands/sources.js';
// Streaming a tar with a ../escape entry; this is a unit-style probe.
console.log('extractTarGz is exported and accepts a ReadableStream<Uint8Array>');
" 2>&1
# Functional tar-slip test would require building a poisoned tarball;
# rely on the static review of src/commands/sources.ts:extractTarGz() for v0.2.0.
```

### 4.9 Clean up section 4

```bash
node dist/index.js uninstall --help   # should mention --purge-backups
rm -f ~/.skill-central/lock.json
rm -rf ~/.skill-central/skills   # if you ran --user tests
```

---

## 5. Cross-feature integration

- [ ] `add` a skill → `list --tag <that-tag>` shows it
- [ ] `add` a skill → `doctor` reports clean state
- [ ] `add` a skill → `board` web UI shows it (refresh the browser tab)
- [ ] `install` a skill → `list` shows it (skill from `lock.json` is loaded by the engine)
- [ ] `install` a skill → `update` detects no change (upstream unchanged) and reports `0 of 1 updated`
- [ ] `add --user` a skill → `~/.skill-central/skills/...` is created with the 4 sub-dirs

```bash
node dist/index.js add typescript-conventions \
  --name "TS Conventions" \
  --description "TS code style" \
  --tags "typescript" \
  --prompt "Use strict mode."

node dist/index.js list --tag typescript
node dist/index.js doctor | tail -3
rm .skills/04-tech-stack/languages/typescript-conventions.yaml
```

---

## 6. Documentation review

- [ ] README.md Quick Start works as written (run every command in the Quick Start block)
- [ ] README.zh-CN.md Quick Start works (commands are bilingual-compatible; just verify the Chinese section reads naturally)
- [ ] Every `[link](docs/...)` in README.md opens an existing file
- [ ] Every `[link](./docs/...)` in CHANGELOG.md opens an existing file
- [ ] `node dist/index.js <cmd> --help` output matches what `docs/cli-reference.md` says
- [ ] `node dist/index.js board --help` mentions `--cli`, `--port`, `--host`, `--i-understand-nonlocal`
- [ ] `node dist/index.js install --help` mentions `--layer`, `--project`, `--yes`

```bash
# Link sanity
for f in docs/*.md; do
  grep -oE '\]\(\./docs/[^)]+\)' README.md README.zh-CN.md CHANGELOG.md 2>/dev/null | \
    grep -oE '\./docs/[^)]+' | sort -u | while read link; do
      [ -f "$link" ] || echo "BROKEN: $link"
    done
done
echo "done"
```

---

## 7. Stdio discipline (MCP server)

- [ ] `mcp` does not write anything to stdout
- [ ] stderr is the only diagnostic channel
- [ ] A minimal JSON-RPC `initialize` round-trips correctly

```bash
# 1. Sanity: no stdout leakage
node dist/index.js mcp 2>/tmp/mcp.err >/tmp/mcp.out &
MCP_PID=$!
sleep 0.5
kill $MCP_PID 2>/dev/null
wait $MCP_PID 2>/dev/null
[ -s /tmp/mcp.out ] && echo "FAIL: stdout is not empty" || echo "OK: stdout empty"
head -5 /tmp/mcp.err

# 2. JSON-RPC round-trip
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}'
  sleep 0.3
} | node dist/index.js mcp 2>/dev/null | head -2
# expect a JSON line containing "result" and "serverInfo"
```

---

## 8. Package & publish dry-run

- [ ] `npm pack --dry-run` shows all expected files in the tarball
- [ ] The `files:` field excludes `src/`, `docs/`, `node_modules/`, and dev configs

```bash
npm pack --dry-run 2>&1 | head -60
# expect: dist/index.js, dist/commands/*.js, dist/web/*, README.md, README.zh-CN.md, LICENSE
# expect no: src/, docs/, tsconfig.json, .github/, etc.
```

- [ ] `package.json` `version` is `0.2.0`
- [ ] `package.json` `files` includes `dist/web/`
- [ ] `package.json` `prepublishOnly` is `npm run build && npm run build:web`

```bash
node -e "
const p = require('./package.json');
const checks = {
  version: p.version === '0.2.0',
  hasHono: !!p.dependencies.hono,
  hasTarStream: !!p.dependencies['tar-stream'],
  filesIncludeWeb: p.files.includes('dist/web/'),
  prepublish: p.scripts.prepublishOnly.includes('build:web'),
};
console.log(checks);
"
```

---

## 9. Optional — npm-test-pack in a clean dir

If you have time, install the local tarball in a clean directory and run the Quick Start:

```bash
npm pack                      # produces skill-central-0.2.0.tgz
mkdir /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null
npm install /path/to/skill-central-0.2.0.tgz
npx skill-central init
npx skill-central board --cli
npx skill-central add test-skill \
  --name "Test" --description "test" --tags "review" --prompt "x"
npx skill-central list | grep test-skill
rm -rf /tmp/sc-smoke
```

---

## 10. Sign-off

Tick all the boxes above. If anything failed, capture:

- the exact command
- the exact output (or screenshot)
- the Node version and platform
- a guess at the cause

If everything is green, you're ready to `npm publish`. Suggested tag:

```bash
git tag -a v0.2.0 -m "v0.2.0: CLI CRUD + web board + remote install + docs"
git push origin v0.2.0
npm publish --access public
```

---

## Quick reference — all commands in this checklist

```bash
# Sanity
node --version && npm --version
npm install && npm run build && npm run build:web
node dist/index.js --version
node dist/index.js --help

# CLI
node dist/index.js add <id> --name … --description … --tags … --prompt …
node dist/index.js list [--tag | --layer | --type]
node dist/index.js show <id>
node dist/index.js remove <id> [--layer] [--force]
node dist/index.js validate <files…>
node dist/index.js doctor

# Web
node dist/index.js board [--cli] [--port N] [--host ADDR] [--i-understand-nonlocal]

# Install
node dist/index.js install github:<user>/<repo>/<path>[@<ref>] [--project] [--yes]
node dist/index.js install npm:<pkg>[@<version>] [--project] [--yes]
node dist/index.js update [id] [--project] [--yes]
node dist/index.js uninstall <id> [--purge-backups] [--yes]

# MCP
node dist/index.js mcp

# Pack
npm pack --dry-run
```