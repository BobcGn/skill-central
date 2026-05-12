// ============================================================================
// Protocol / Handler
// ----------------------------------------------------------------------------
// Registers all MCP request handlers (prompts + tools) on the Server
// instance. Keeps the entry file clean — it only calls this one function.
// ============================================================================

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
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
}
