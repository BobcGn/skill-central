// ============================================================================
// IDE Detection / Types
// ----------------------------------------------------------------------------
// Shared IDE registration model for register, health, and future connect flows.
//
// Design intent:
// - Phase 3 must not let CLI, Web Board, and desktop shell each guess IDE
//   config locations differently. This module is the first stable seam for
//   target IDE discovery.
// - Config path overrides are explicit because hard-coded OS paths are a known
//   roadmap返工 trigger.
// ============================================================================

export type IdeTarget = "codex" | "claude" | "trae" | "cursor" | "windsurf" | "cline";

export type IdeConfigFormat = "json" | "toml";

export interface IdeTargetDefinition {
  target: IdeTarget;
  label: string;
  description: string;
  configFormat: IdeConfigFormat;
  docsUrl: string;
  supportTier: "supported" | "experimental";
}

export interface McpServerConfig {
  /** Required by Claude Code for HTTP entries; omitted by Codex and Cursor. */
  type?: "http" | "stdio";
  /** Local stdio transport. Mutually exclusive with `url`. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Shared Streamable HTTP transport. Mutually exclusive with `command`. */
  url?: string;
  headers?: Record<string, string>;
}

export function isStdioMcpServerConfig(
  server: McpServerConfig | undefined,
): server is McpServerConfig & { command: string } {
  return typeof server?.command === "string" && server.command.length > 0;
}

export function isHttpMcpServerConfig(
  server: McpServerConfig | undefined,
): server is McpServerConfig & { url: string } {
  return typeof server?.url === "string" && server.url.length > 0;
}

export function mcpServerConfigForTarget(
  target: IdeTarget,
  server: McpServerConfig | undefined,
): McpServerConfig | undefined {
  if (!server || !isHttpMcpServerConfig(server) || target !== "claude") return server;
  return { ...server, type: "http" };
}

export interface IdeDetectionOptions {
  configPath?: string;
}

export interface IdeRegistration {
  target: IdeTarget;
  configPath: string;
  configFormat: IdeConfigFormat;
  configExists: boolean;
  configReadable: boolean;
  registered: boolean;
  server?: McpServerConfig;
  error?: string;
}
