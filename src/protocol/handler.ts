// ============================================================================
// Protocol / Handler
// ----------------------------------------------------------------------------
// Registers all MCP request handlers (prompts + tools + resources) on the Server
// instance. Keeps the entry file clean — it only calls this one function.
// ============================================================================

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillEngine } from "../core/engine.js";
import {
  buildListPromptsHandler,
  buildGetPromptHandler,
} from "./prompts.js";
import {
  buildListToolsHandler,
  buildCallToolHandler,
} from "./tools.js";
import {
  buildListResourcesHandler,
  buildReadResourceHandler,
} from "./resources.js";

/**
 * Wire up every MCP handler on the server.
 * Call this once after the Server is instantiated, before connecting
 * the transport.
 */
export function registerHandlers(
  server: Server,
  engine: SkillEngine,
): void {
  // ── Prompts ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, buildListPromptsHandler(engine));
  server.setRequestHandler(GetPromptRequestSchema, buildGetPromptHandler(engine));

  // ── Tools ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, buildListToolsHandler(engine));
  server.setRequestHandler(CallToolRequestSchema, buildCallToolHandler(engine));

  // ── Resources ─────────────────────────────────────────────────────────
  // Resource handlers are read-only evidence surfaces. Workflow/session URIs
  // are parsed in one place but intentionally fail until Phase 5B+ storage
  // exists, so clients never receive synthetic orchestration state.
  server.setRequestHandler(ListResourcesRequestSchema, buildListResourcesHandler(engine));
  server.setRequestHandler(ReadResourceRequestSchema, buildReadResourceHandler(engine));
}
