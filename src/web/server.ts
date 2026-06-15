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

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { Hono } from "hono";
import { serve } from "@hono/node-server";

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { readAllLayers } from "../storage/reader.js";
import type { SkillCentralConfig } from "../storage/config.js";

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
 * style.css). Tries a list of candidates — production build puts them at
 * `<dist>/web/`, dev (tsx) at `src/web/static/`. The first existing one wins.
 */
export function resolveWebRoot(): string | undefined {
  const candidates = [
    process.env.SC_WEB_ROOT,
    path.join(process.cwd(), "dist", "web"),
    path.join(process.cwd(), "src", "web", "static"),
    // When running from compiled dist/web/../web/server.js, walk up.
    path.resolve(process.cwd(), "dist", "web"),
  ].filter((x): x is string => typeof x === "string" && x.length > 0);

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) {
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

// ── Helpers ────────────────────────────────────────────────────────────────

async function sha256Of(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

// ── Server bootstrap ───────────────────────────────────────────────────────

/**
 * Start the Hono server. Returns the chosen port (may differ from the
 * requested one if port-in-use retry is enabled at the caller).
 */
export function startBoardServer(opts: BoardOptions = {}): { port: number; host: string } {
  const config = loadConfig();
  const engine = new SkillEngine();
  const version = "0.2.0"; // bumped from 0.1.0; see CHANGELOG
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