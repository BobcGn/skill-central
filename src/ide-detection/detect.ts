// ============================================================================
// IDE Detection / Detect
// ----------------------------------------------------------------------------
// Reads IDE MCP configuration and determines whether skill-central is registered.
//
// Design intent:
// - Detection reports evidence, not just booleans. Health and one-click connect
//   need the exact config path, parse state, and server command to explain what
//   is wrong and how to repair it.
// - This function does not write. Installation/rollback belongs to connect
//   transactions in the next Phase 3 slice.
// ============================================================================

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { defaultIdeConfigPath, SKILL_CENTRAL_MCP_SERVER_NAME } from "./registry.js";
import type { IdeDetectionOptions, IdeRegistration, IdeTarget, McpServerConfig } from "./types.js";

export async function detectIdeRegistration(
  target: IdeTarget,
  options: IdeDetectionOptions = {},
): Promise<IdeRegistration> {
  const configPath = options.configPath ?? defaultIdeConfigPath(target);
  const exists = await fileExists(configPath);
  if (!exists) {
    return {
      target,
      configPath,
      configExists: false,
      configReadable: false,
      registered: false,
    };
  }

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    const server = normaliseServer(parsed.mcpServers?.[SKILL_CENTRAL_MCP_SERVER_NAME]);
    return {
      target,
      configPath,
      configExists: true,
      configReadable: true,
      registered: !!server,
      server,
    };
  } catch (err) {
    return {
      target,
      configPath,
      configExists: true,
      configReadable: false,
      registered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normaliseServer(value: unknown): McpServerConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.command !== "string" || candidate.command.length === 0) return undefined;
  return {
    command: candidate.command,
    args: Array.isArray(candidate.args)
      ? candidate.args.filter((arg): arg is string => typeof arg === "string")
      : undefined,
    env: isStringRecord(candidate.env) ? candidate.env : undefined,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}
