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
import { parseIdeMcpConfig } from "./config-codec.js";
import { defaultIdeConfigPath, getIdeDefinition } from "./registry.js";
import type { IdeDetectionOptions, IdeRegistration, IdeTarget } from "./types.js";

export async function detectIdeRegistration(
  target: IdeTarget,
  options: IdeDetectionOptions = {},
): Promise<IdeRegistration> {
  const configPath = options.configPath ?? defaultIdeConfigPath(target);
  const configFormat = getIdeDefinition(target).configFormat;
  const exists = await fileExists(configPath);
  if (!exists) {
    return {
      target,
      configPath,
      configFormat,
      configExists: false,
      configReadable: false,
      registered: false,
    };
  }

  try {
    const raw = await readFile(configPath, "utf-8");
    const server = parseIdeMcpConfig(raw, configFormat).server;
    return {
      target,
      configPath,
      configFormat,
      configExists: true,
      configReadable: true,
      registered: !!server,
      server,
    };
  } catch (err) {
    return {
      target,
      configPath,
      configFormat,
      configExists: true,
      configReadable: false,
      registered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
