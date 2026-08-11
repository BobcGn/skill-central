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
import type { RuleEngine } from "../core/rule-engine.js";
import { loadConfig, type SkillCentralConfig } from "../storage/config.js";
import { ReverseOutputService } from "../reverse-output/service.js";
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
  ruleEngine: RuleEngine,
  options: { config?: SkillCentralConfig; projectRoot?: string } = {},
): void {
  const projectRoot = options.projectRoot ?? process.cwd();
  const reverseOutput = new ReverseOutputService({
    config: options.config ?? loadConfig(projectRoot),
    projectRoot,
    engine,
  });

  // ── Prompts ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, buildListPromptsHandler(engine, ruleEngine));
  server.setRequestHandler(GetPromptRequestSchema, buildGetPromptHandler(engine, ruleEngine));

  // ── Tools ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, buildListToolsHandler(engine, ruleEngine, reverseOutput));
  server.setRequestHandler(CallToolRequestSchema, buildCallToolHandler(engine, ruleEngine, reverseOutput));

  // ── Resources ─────────────────────────────────────────────────────────
  // Resource handlers are read-only evidence surfaces. Workflow/session URIs
  // are parsed in one place but intentionally fail until Phase 5B+ storage
  // exists, so clients never receive synthetic orchestration state.
  server.setRequestHandler(ListResourcesRequestSchema, buildListResourcesHandler(engine, ruleEngine));
  server.setRequestHandler(ReadResourceRequestSchema, buildReadResourceHandler(engine, ruleEngine));
}
