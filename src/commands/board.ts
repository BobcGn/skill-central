// ============================================================================
// Board Command
// ----------------------------------------------------------------------------
// "skill-central board" — developer dashboard.
//   --cli / --no-web   terminal table (default in v0.1.x; opt-in fallback here)
//   (default)          Hono web dashboard on http://127.0.0.1:<port>/
//   --port N           override default port (5417); auto +1..+10 on conflict
//   --host ADDR        bind address (default 127.0.0.1; non-loopback needs
//                      --i-understand-nonlocal — defence against accidental
//                      LAN exposure)
// ============================================================================

import { existsSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:net";

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { startBoardServer } from "../web/server.js";

const DEFAULT_PORT = 5417;
const MAX_PORT_TRIES = 10;

export interface BoardOptions {
  /** Force terminal-table output even when web is available. */
  cli?: boolean;
  /** Listen port (default 5417). */
  port?: number;
  /** Bind address (default 127.0.0.1). */
  host?: string;
  /** Acknowledgement required for non-loopback --host. */
  iUnderstandNonlocal?: boolean;
}

// ── Public dispatch ────────────────────────────────────────────────────────

export async function runBoard(opts: BoardOptions = {}): Promise<void> {
  if (opts.cli) {
    await showBoard();
    return;
  }
  await boardWeb(opts);
}

// ── Terminal output (preserved from v0.1.0) ────────────────────────────────

export async function showBoard(): Promise<void> {
  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers);
  const skills = engine.listSkills();

  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║              skill-central  Skill Board                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("▸ Layers");
  console.log("  " + "-".repeat(60));
  console.table(
    config.layers.map((l) => ({
      Name: l.name,
      Path: l.path,
      Priority: l.priority,
    })),
  );

  console.log("");
  console.log(`▸ Skills (${skills.length} total)`);
  console.log("  " + "-".repeat(60));
  if (skills.length === 0) {
    console.log("  (no skills loaded — run `skill-central init` to seed samples)");
  } else {
    console.table(
      skills.map((s) => ({
        ID: s.id,
        Name: s.name.substring(0, 30),
        Type: s.type,
        Tags: (s.tags ?? []).join(", "),
      })),
    );
  }
  console.log("");
}

// ── Web board ──────────────────────────────────────────────────────────────

export async function boardWeb(opts: BoardOptions): Promise<void> {
  const host = opts.host ?? "127.0.0.1";

  // Defensive: refuse non-loopback hosts unless the user explicitly accepts
  // the risk. The board has zero authentication and serves files writable
  // from a browser; exposing it on a LAN is a real footgun.
  if (!isLoopback(host)) {
    if (!opts.iUnderstandNonlocal) {
      throw new Error(
        `Refusing to bind to non-loopback address "${host}".\n` +
          `The web board has no authentication and is meant for local use only.\n` +
          `If you really mean to expose it on a network, re-run with --i-understand-nonlocal.`,
      );
    }
    console.error(
      `[skill-central] WARNING: binding to non-loopback ${host}; ensure your network is trusted.`,
    );
  }

  // Verify the static asset directory exists before binding. Without it the
  // user would see a confusing "web assets not found" page in the browser.
  const webRoot = path.join(process.cwd(), "dist", "web");
  if (!existsSync(path.join(webRoot, "index.html"))) {
    console.error(
      `[skill-central] Web assets not found at ${webRoot}.\n` +
        `  Run \`npm run build:web\` first, then retry.`,
    );
    throw new Error("web assets missing");
  }

  const requestedPort = opts.port ?? DEFAULT_PORT;

  // Pick the actual port: try the requested one, then +1..+MAX_PORT_TRIES.
  const port = await findAvailablePort(host, requestedPort);

  // Bind via Hono (server.ts).
  startBoardServer({ host, port });

  console.log("");
  console.log(`  ✓ skill-central web board`);
  console.log(`    http://${host}:${port}/`);
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.log(`    (LAN-accessible — anyone on the network can edit skills)`);
  }
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isLoopback(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  // 127.0.0.0/8
  if (host.startsWith("127.")) return true;
  return false;
}

/**
 * Try `start` then `start+1..start+MAX_PORT_TRIES`. Returns the first
 * available port. Throws if all attempts fail.
 */
async function findAvailablePort(host: string, start: number): Promise<number> {
  for (let offset = 0; offset <= MAX_PORT_TRIES; offset++) {
    const port = start + offset;
    if (await canBind(host, port)) {
      if (offset > 0) {
        console.error(`[skill-central] Port ${start} busy; using ${port}.`);
      }
      return port;
    }
  }
  throw new Error(
    `No available port in range ${start}..${start + MAX_PORT_TRIES}.`,
  );
}

function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}