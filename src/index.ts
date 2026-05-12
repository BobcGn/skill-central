// ============================================================================
// skill-central —  Local MCP Server for cross-IDE AI skill distribution
// ============================================================================
// Architecture layers:
//   Entry  (index.ts)         →  Bootstrap, transport, lifecycle
//   Protocol (protocol/)      →  MCP request/response handler registration
//   Core    (core/)           →  Engine, override tree, context composer
//   Storage (storage/)        →  File discovery, parsing, schema validation
// ============================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SkillEngine } from "./core/engine.js";
import { registerHandlers } from "./protocol/handler.js";
import type { SkillLayer } from "./storage/schemas.js";

// ── Configuration ──────────────────────────────────────────────────────────

/** Ordered list of skill source directories. Loaded from config in future. */
const SKILL_LAYERS: SkillLayer[] = [
  { name: "project", path: ".skills",   priority: 100 },
];

// ── Bootstrap ──────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "skill-central",
    version: "0.1.0",
  },
  {
    capabilities: {
      prompts: {},
      tools: {},
    },
  },
);

const engine = new SkillEngine();

// Register all MCP request handlers (prompts + tools).
registerHandlers(server, engine);

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load skills from disk before accepting requests.
  await engine.reload(SKILL_LAYERS);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[skill-central] Server ready — listening on stdio");
}

main().catch((err) => {
  console.error("[skill-central] Fatal error:", err);
  process.exit(1);
});
