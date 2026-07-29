// ============================================================================
// IDE Detection / Registry
// ----------------------------------------------------------------------------
// Known IDE MCP configuration paths and registration helpers.
// ============================================================================

import { homedir } from "node:os";
import path from "node:path";
import type { IdeTarget, McpServerConfig } from "./types.js";

export const SUPPORTED_IDES: IdeTarget[] = ["claude", "cursor", "windsurf", "cline"];

export const SKILL_CENTRAL_MCP_SERVER_NAME = "skill-central";

export const DEFAULT_MCP_SERVER_CONFIG: McpServerConfig = {
  command: "skill-central",
  args: ["mcp"],
};

export function isIdeTarget(value: string): value is IdeTarget {
  return SUPPORTED_IDES.includes(value as IdeTarget);
}

export function defaultIdeConfigPath(target: IdeTarget): string {
  const home = homedir();
  const isWin = process.platform === "win32";
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

  if (target === "claude") {
    return isWin
      ? path.join(appData, "Claude", "claude_desktop_config.json")
      : path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (target === "cursor") return path.join(home, ".cursor", "mcp.json");
  if (target === "windsurf") return path.join(home, ".codeium", "windsurf", "mcp_config.json");
  return isWin
    ? path.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
    : path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
}
