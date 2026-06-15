// ============================================================================
// Web Board · Server
// ----------------------------------------------------------------------------
// Hono factory that exposes the read-only skill API and serves the bundled
// static frontend (dist/web/) over HTTP. The board CLI command wires this
// up at runtime (see src/commands/board.ts).
//
// Endpoints (P4 — read-only):
//   GET  /api/health
//   GET  /api/layers
//   GET  /api/skills
//   GET  /api/skills/:id
//
// Edit / backup endpoints land in P6.
// ============================================================================

import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { load as parseYaml } from "js-yaml";

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { readAllLayers } from "../storage/reader.js";
import { validateSkill } from "../storage/parser.js";
import { backupBeforeWrite, listBackups, restoreBackup, sha256Of } from "./backup.js";
import type { SkillCentralConfig } from "../storage/config.js";
import { VERSION } from "../version.js";

// ── Public types ───────────────────────────────────────────────────────────

export interface BoardDeps {
  config: SkillCentralConfig;
  engine: SkillEngine;
  /** Absolute path to the project root (for resolving layer file paths). */
  rootDir: string;
  /** Package version string returned by /api/health. */
  version: string;
}

export interface BoardOptions {
  host?: string;
  port?: number;
}

// ── Static asset resolution ────────────────────────────────────────────────

/**
 * Returns the directory containing the static frontend (index.html, app.js,
 * style.css). The first existing candidate wins.
 *
 * Why a fallback chain and not one canonical path:
 *   - `npm install` puts everything under `node_modules/@bobcgn/skill-central/`
 *     and the user can invoke the bin from any cwd, so cwd-relative lookup
 *     is unreliable.
 *   - `import.meta.url` is the one location guaranteed to point at *this*
 *     compiled module regardless of cwd. In production it lands inside
 *     `dist/web/` (same dir as the bundled assets). In tsx dev it lands
 *     inside `src/web/` and the assets live one step deeper at
 *     `src/web/static/`.
 *   - The cwd-relative candidates remain as a last-resort fallback for
 *     unusual layouts (e.g. someone copying `dist/web/` into a project).
 *
 * `SC_WEB_ROOT` env var always wins — useful for tests and custom deploys.
 */
export function resolveWebRoot(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates: Array<string | undefined> = [
    process.env.SC_WEB_ROOT,
    // Compiled: server.js sits next to index.html in dist/web/.
    here,
    // tsx dev: assets are at src/web/static/ (one step deeper than server.ts).
    path.join(here, "static"),
    // Cwd-relative fallbacks for non-standard invocations.
    path.join(process.cwd(), "dist", "web"),
    path.join(process.cwd(), "src", "web", "static"),
  ];

  for (const dir of candidates) {
    if (typeof dir === "string" && dir.length > 0 && existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return undefined;
}

// ── API helpers ────────────────────────────────────────────────────────────

interface SkillDto {
  id: string;
  name: string;
  description: string;
  type: "prompt" | "tool";
  tags: string[];
  layer: string;
  priority: number;
  source: string;
  prompt?: string;
  /** Chinese variant of the prompt. Omitted when the skill has none. */
  prompt_zh?: string;
  inputSchema?: Record<string, unknown>;
  rawYaml?: string;
  sha256?: string;
}

interface LayerDto {
  name: string;
  path: string;
  priority: number;
  fileCount: number;
}

/**
 * Build a SkillDto by combining the engine view (resolved content) with the
 * raw layer scan (source path + layer name). The engine has the priority;
 * the layer scan tells us which directory the file actually lives in.
 */
async function buildSkillDto(
  resolvedSkill: {
    id: string;
    name: string;
    description: string;
    type: "prompt" | "tool";
    tags?: string[];
    priority: number;
    prompt?: string;
    prompt_zh?: string;
    inputSchema?: Record<string, unknown>;
  },
  config: SkillCentralConfig,
  rootDir: string,
): Promise<SkillDto> {
  // Find the source layer (highest priority that contains this id).
  const sortedLayers = [...config.layers].sort((a, b) => b.priority - a.priority);
  let sourcePath = "";
  let sourceLayer = "";
  for (const layer of sortedLayers) {
    const entries = await readAllLayers([layer]);
    if (entries.some((e) => e.schema.id === resolvedSkill.id)) {
      sourceLayer = layer.name;
      const abs = path.resolve(rootDir, layer.path, `${resolvedSkill.id}.yaml`);
      sourcePath = abs;
      break;
    }
  }
  return {
    id: resolvedSkill.id,
    name: resolvedSkill.name,
    description: resolvedSkill.description,
    type: resolvedSkill.type,
    tags: resolvedSkill.tags ?? [],
    layer: sourceLayer,
    priority: resolvedSkill.priority,
    source: sourcePath,
    prompt: resolvedSkill.prompt,
    prompt_zh: resolvedSkill.prompt_zh,
    inputSchema: resolvedSkill.inputSchema,
  };
}

// ── Hono factory ───────────────────────────────────────────────────────────

/**
 * Create a Hono app exposing the read-only skill API. Pure factory — no
 * network listening happens here. The board command calls serve() on the
 * returned app.
 */
export function createBoardApp(deps: BoardDeps): Hono {
  const app = new Hono();

  // ── /api/health ────────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({ ok: true, version: deps.version, skills: deps.engine.listSkills().length }),
  );

  // ── /api/layers ────────────────────────────────────────────────────────
  app.get("/api/layers", async (c) => {
    const layers: LayerDto[] = [];
    for (const layer of deps.config.layers) {
      let count = 0;
      try {
        const st = await stat(layer.path);
        if (st.isDirectory()) {
          const entries = await readAllLayers([layer]);
          count = entries.length;
        }
      } catch {
        // layer dir missing → 0 files
      }
      layers.push({
        name: layer.name,
        path: layer.path,
        priority: layer.priority,
        fileCount: count,
      });
    }
    return c.json(layers);
  });

  // ── /api/skills ────────────────────────────────────────────────────────
  app.get("/api/skills", async (c) => {
    const resolved = deps.engine.listSkills();
    const dtos: SkillDto[] = [];
    for (const s of resolved) {
      dtos.push(await buildSkillDto(s, deps.config, deps.rootDir));
    }
    // Stable order: layer priority asc, then id asc.
    dtos.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    return c.json(dtos);
  });

  // ── /api/skills/:id ────────────────────────────────────────────────────
  app.get("/api/skills/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    // Attach raw YAML for the editor (read directly from disk).
    if (dto.source) {
      try {
        dto.rawYaml = await readFile(dto.source, "utf-8");
        dto.sha256 = await sha256Of(dto.rawYaml);
      } catch {
        // source disappeared — engine still resolves the in-memory copy
      }
    }
    return c.json(dto);
  });

  // ── PUT /api/skills/:id — edit + save ─────────────────────────────────
  app.put("/api/skills/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    let body: { rawYaml?: string; expectedSha256?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.rawYaml !== "string") {
      return c.json({ error: "rawYaml must be a string" }, 400);
    }

    // Resolve the source file path (same logic as GET).
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    if (!dto.source) {
      return c.json({ error: "source path not resolved" }, 500);
    }

    // 1. Optimistic-concurrency check.
    let currentRaw = "";
    let currentSha = "";
    try {
      currentRaw = await readFile(dto.source, "utf-8");
      currentSha = await sha256Of(currentRaw);
    } catch {
      return c.json({ error: "source file disappeared" }, 410);
    }
    if (body.expectedSha256 && body.expectedSha256 !== currentSha) {
      return c.json(
        {
          error: "sha256 conflict — file changed since you loaded it",
          currentSha256: currentSha,
          currentRawYaml: currentRaw,
        },
        409,
      );
    }

    // 2. Parse + validate.
    let parsed: unknown;
    try {
      parsed = parseYaml(body.rawYaml);
    } catch (err) {
      return c.json(
        { error: `YAML parse error: ${(err as Error).message}` },
        400,
      );
    }
    if (typeof parsed !== "object" || parsed === null) {
      return c.json({ error: "YAML did not parse to an object" }, 400);
    }
    const schemaObj = parsed as Record<string, unknown>;
    const validated = validateSkill(schemaObj, dto.source);
    if (!validated) {
      return c.json({ error: "schema validation failed" }, 400);
    }

    // 3. Reject id change (would orphan the original file).
    if (validated.id !== id) {
      return c.json(
        {
          error: `id change not allowed: original="${id}", new="${validated.id}". Use remove + add to move skills across layers.`,
        },
        400,
      );
    }

    // 4. Backup existing file (if any) before write.
    await backupBeforeWrite(dto.source);

    // 5. Write.
    await writeFile(dto.source, body.rawYaml, "utf-8");

    // 6. Reload the engine so the in-memory view reflects the new file.
    // Without this, /api/skills continues to serve the pre-edit copy and
    // the board UI looks stale immediately after Save (issue #2 — board
    // not syncing after edit). For ~16 skills × 4 layers the cost is
    // negligible; no need to surgically re-read just one file.
    try {
      await deps.engine.reload(deps.config.layers);
    } catch (err) {
      // A reload failure shouldn't fail the save — the file is on disk.
      // Log it server-side; the UI will see the stale data until the
      // user refreshes or another edit triggers another reload.
      console.error("[skill-central] post-write reload failed:", err);
    }

    // 7. New sha256.
    const newSha = await sha256Of(body.rawYaml);

    return c.json({ ok: true, sha256: newSha });
  });

  // ── GET /api/skills/:id/backups ────────────────────────────────────────
  app.get("/api/skills/:id/backups", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    if (!dto.source) return c.json([]);
    const backups = await listBackups(dto.source);
    return c.json(backups);
  });

  // ── POST /api/skills/:id/restore ──────────────────────────────────────
  app.post("/api/skills/:id/restore", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    let body: { backupFile?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.backupFile !== "string") {
      return c.json({ error: "backupFile required" }, 400);
    }
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    if (!dto.source) {
      return c.json({ error: "source path not resolved" }, 500);
    }
    try {
      await restoreBackup(dto.source, body.backupFile);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    return c.json({ ok: true });
  });

  // ── POST /api/reload — re-read all layers from disk ──────────────────
  // Without this endpoint, edits made to .yaml files outside the board
  // (e.g. in vim) don't surface until the server restarts. The board UI's
  // "↻ Refresh" button POSTs here before re-fetching the list.
  app.post("/api/reload", async (c) => {
    try {
      await deps.engine.reload(deps.config.layers);
      return c.json({ ok: true, skills: deps.engine.listSkills().length });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // ── Static assets ─────────────────────────────────────────────────────
  // Hand-rolled minimal static middleware. We deliberately do not depend on
  // hono/serve-static because its Node adapter in this Hono version requires
  // a custom getContent() callback, which is more code than this version.
  const webRoot = resolveWebRoot();
  if (webRoot) {
    app.get("*", async (c) => {
      const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
      // Path-traversal defence: resolve and ensure inside webRoot.
      const filePath = path.resolve(webRoot, "." + reqPath);
      if (!filePath.startsWith(path.resolve(webRoot))) {
        return c.text("forbidden", 403);
      }
      try {
        const st = await stat(filePath);
        if (!st.isFile()) return c.notFound();
        const content = await readFile(filePath);
        return new Response(content, {
          status: 200,
          headers: {
            "content-type": mimeFor(reqPath),
            "cache-control": "no-cache",
          },
        });
      } catch {
        return c.notFound();
      }
    });
  } else {
    app.get("/", (c) =>
      c.text(
        "skill-central web assets not found. Run `npm run build:web` first.\n",
        500,
      ),
    );
  }

  return app;
}

// ── Tiny mime map ──────────────────────────────────────────────────────────

function mimeFor(p: string): string {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

// ── Server bootstrap ───────────────────────────────────────────────────────

/**
 * Start the Hono server. Returns the chosen port (may differ from the
 * requested one if port-in-use retry is enabled at the caller).
 */
export function startBoardServer(opts: BoardOptions = {}): { port: number; host: string } {
  const config = loadConfig();
  const engine = new SkillEngine();
  const version = VERSION;
  const rootDir = process.cwd();

  // Block on initial load so /api/skills returns immediately.
  // (engine.reload is sync-ish at startup; Hono handlers are async so it's fine.)
  void engine.reload(config.layers);

  const app = createBoardApp({ config, engine, rootDir, version });

  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 5417;

  serve({ fetch: app.fetch, port, hostname: host });

  return { port, host };
}