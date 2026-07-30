// ============================================================================
// IDE Detection / MCP Config Codec
// ----------------------------------------------------------------------------
// Parses and updates the two configuration shapes used by supported clients.
// JSON targets store `mcpServers`; Codex stores `mcp_servers` in TOML.
// ============================================================================

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  DEFAULT_MCP_SERVER_CONFIG,
  SKILL_CENTRAL_MCP_SERVER_NAME,
} from "./registry.js";
import type { IdeConfigFormat, McpServerConfig } from "./types.js";

export interface ParsedIdeMcpConfig {
  root: Record<string, unknown>;
  server?: McpServerConfig;
}

export function parseIdeMcpConfig(raw: string, format: IdeConfigFormat): ParsedIdeMcpConfig {
  const root = format === "json" ? parseJsonRoot(raw) : parseTomlRoot(raw);
  const serversKey = format === "json" ? "mcpServers" : "mcp_servers";
  const servers = isRecord(root[serversKey]) ? root[serversKey] : {};
  return {
    root,
    server: normaliseServer(servers[SKILL_CENTRAL_MCP_SERVER_NAME]),
  };
}

export function mergeSkillCentralServerConfig(raw: string, format: IdeConfigFormat): string {
  const parsed = parseIdeMcpConfig(raw, format);
  if (format === "json") {
    const mcpServers = isRecord(parsed.root.mcpServers) ? { ...parsed.root.mcpServers } : {};
    mcpServers[SKILL_CENTRAL_MCP_SERVER_NAME] = DEFAULT_MCP_SERVER_CONFIG;
    return stableJson({ ...parsed.root, mcpServers });
  }

  const withoutServer = stripCodexServerTables(raw);
  const serverToml = stringifyToml({
    mcp_servers: {
      [SKILL_CENTRAL_MCP_SERVER_NAME]: DEFAULT_MCP_SERVER_CONFIG,
    },
  }).trim();
  const prefix = withoutServer.trimEnd();
  const merged = prefix.length > 0 ? `${prefix}\n\n${serverToml}\n` : `${serverToml}\n`;
  parseTomlRoot(merged);
  return merged;
}

export function removeSkillCentralServerConfig(raw: string, format: IdeConfigFormat): string {
  const parsed = parseIdeMcpConfig(raw, format);
  if (format === "json") {
    if (!isRecord(parsed.root.mcpServers)) return stableJson(parsed.root);
    const mcpServers = { ...parsed.root.mcpServers };
    delete mcpServers[SKILL_CENTRAL_MCP_SERVER_NAME];
    return stableJson({ ...parsed.root, mcpServers });
  }
  const next = stripCodexServerTables(raw);
  parseTomlRoot(next);
  return next;
}

export function isConnectCreatedConfig(raw: string, format: IdeConfigFormat): boolean {
  const parsed = parseIdeMcpConfig(raw, format);
  if (!sameServer(parsed.server, DEFAULT_MCP_SERVER_CONFIG)) return false;
  if (format === "toml") return stripCodexServerTables(raw).trim().length === 0;

  const keys = Object.keys(parsed.root);
  if (keys.length !== 1 || keys[0] !== "mcpServers" || !isRecord(parsed.root.mcpServers)) return false;
  const names = Object.keys(parsed.root.mcpServers);
  return names.length === 1 && names[0] === SKILL_CENTRAL_MCP_SERVER_NAME;
}

export function emptyIdeConfig(format: IdeConfigFormat): string {
  return format === "json" ? "{}\n" : "";
}

function parseJsonRoot(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error("IDE JSON config must contain an object at the top level.");
  return parsed;
}

function parseTomlRoot(raw: string): Record<string, unknown> {
  const parsed = parseToml(raw) as unknown;
  if (!isRecord(parsed)) throw new Error("Codex TOML config must contain a table at the top level.");
  return parsed;
}

function normaliseServer(value: unknown): McpServerConfig | undefined {
  if (!isRecord(value) || typeof value.command !== "string" || value.command.length === 0) {
    return undefined;
  }
  return {
    command: value.command,
    args: Array.isArray(value.args)
      ? value.args.filter((arg): arg is string => typeof arg === "string")
      : undefined,
    env: isStringRecord(value.env) ? value.env : undefined,
  };
}

function stripCodexServerTables(raw: string): string {
  const lines = raw.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const tableName = tomlTableName(line);
    if (tableName !== undefined) {
      skipping = tableName === "mcp_servers.skill-central"
        || tableName.startsWith("mcp_servers.skill-central.");
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("").trimEnd() + (kept.length > 0 ? "\n" : "");
}

function tomlTableName(line: string): string | undefined {
  const match = line.match(/^\s*\[([^\[\]]+)]\s*(?:#.*)?(?:\r?\n)?$/);
  if (!match) return undefined;
  return match[1].replace(/[\s"']/g, "");
}

function sameServer(a: McpServerConfig | undefined, b: McpServerConfig): boolean {
  return !!a
    && a.command === b.command
    && JSON.stringify(a.args ?? []) === JSON.stringify(b.args ?? [])
    && JSON.stringify(a.env ?? {}) === JSON.stringify(b.env ?? {});
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
