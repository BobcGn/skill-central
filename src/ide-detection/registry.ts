// ============================================================================
// IDE Detection / Registry
// ----------------------------------------------------------------------------
// Known IDE MCP configuration paths and registration helpers.
// ============================================================================

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { IdeTarget, IdeTargetDefinition, McpServerConfig } from "./types.js";

export const SUPPORTED_IDES: IdeTarget[] = ["codex", "claude", "trae", "cursor", "windsurf", "cline"];

export const SKILL_CENTRAL_MCP_SERVER_NAME = "skill-central";

export const DEFAULT_MCP_SERVER_CONFIG: McpServerConfig = {
  command: "skill-central",
  args: ["mcp"],
};

const DEFINITIONS: Record<IdeTarget, IdeTargetDefinition> = {
  codex: {
    target: "codex",
    label: "Codex",
    description: "OpenAI Codex shared MCP config at project or user scope.",
    configFormat: "toml",
    docsUrl: "https://developers.openai.com/codex/mcp/",
  },
  claude: {
    target: "claude",
    label: "Claude",
    description: "Claude Code user config or Claude Desktop MCP config.",
    configFormat: "json",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/mcp",
  },
  trae: {
    target: "trae",
    label: "Trae",
    description: "Trae global MCP configuration, including international and China editions.",
    configFormat: "json",
    docsUrl: "https://docs.trae.ai/ide/add-mcp-servers",
  },
  cursor: {
    target: "cursor",
    label: "Cursor",
    description: "Cursor global MCP configuration.",
    configFormat: "json",
    docsUrl: "https://docs.cursor.com/context/model-context-protocol",
  },
  windsurf: {
    target: "windsurf",
    label: "Windsurf",
    description: "Windsurf global MCP configuration.",
    configFormat: "json",
    docsUrl: "https://docs.windsurf.com/windsurf/cascade/mcp",
  },
  cline: {
    target: "cline",
    label: "Cline",
    description: "Cline MCP settings stored by the VS Code extension.",
    configFormat: "json",
    docsUrl: "https://docs.cline.bot/mcp/configuring-mcp-servers",
  },
};

export function isIdeTarget(value: string): value is IdeTarget {
  return SUPPORTED_IDES.includes(value as IdeTarget);
}

export function getIdeDefinition(target: IdeTarget): IdeTargetDefinition {
  return DEFINITIONS[target];
}

export function listIdeDefinitions(): IdeTargetDefinition[] {
  return SUPPORTED_IDES.map((target) => ({ ...DEFINITIONS[target] }));
}

export function defaultIdeConfigPath(target: IdeTarget): string {
  const candidates = ideConfigPathCandidates(target);
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (existing) return existing;
  // Codex discovery prefers an existing trusted project config, but a new
  // connection should default to user scope rather than creating repo state.
  if (target === "codex") return candidates[1];
  return candidates[0];
}

export function ideConfigPathCandidates(target: IdeTarget): string[] {
  const home = homedir();
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");

  if (target === "codex") {
    return [
      path.resolve(process.cwd(), ".codex", "config.toml"),
      path.join(home, ".codex", "config.toml"),
    ];
  }
  if (target === "claude") {
    const claudeCode = path.join(home, ".claude.json");
    if (isWin) return [claudeCode, path.join(appData, "Claude", "claude_desktop_config.json")];
    if (isMac) {
      return [
        claudeCode,
        path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      ];
    }
    return [claudeCode, path.join(configHome, "Claude", "claude_desktop_config.json")];
  }
  if (target === "trae") {
    const root = isWin
      ? appData
      : isMac
        ? path.join(home, "Library", "Application Support")
        : configHome;
    return [
      path.join(root, "Trae", "User", "mcp.json"),
      path.join(root, "Trae CN", "User", "mcp.json"),
      path.join(root, "TRAE", "User", "mcp.json"),
    ];
  }
  if (target === "cursor") return [path.join(home, ".cursor", "mcp.json")];
  if (target === "windsurf") return [path.join(home, ".codeium", "windsurf", "mcp_config.json")];
  if (isWin) {
    return [path.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")];
  }
  if (isMac) {
    return [path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")];
  }
  return [path.join(configHome, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")];
}
