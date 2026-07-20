import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline/promises";

export interface RegisterOptions {
  remove?: boolean;
}

export type IdeType = "claude" | "cursor" | "windsurf" | "cline";

const IDE_PATHS: Record<IdeType, (home: string, appData: string, isWin: boolean) => string> = {
  claude: (home, appData, isWin) =>
    isWin
      ? path.join(appData, "Claude", "claude_desktop_config.json")
      : path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
  cursor: (home) => path.join(home, ".cursor", "mcp.json"),
  windsurf: (home, appData, isWin) =>
    isWin
      ? path.join(home, ".codeium", "windsurf", "mcp_config.json")
      : path.join(home, ".codeium", "windsurf", "mcp_config.json"),
  cline: (home, appData, isWin) =>
    isWin
      ? path.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
      : path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
};

const DEFAULT_MCP_CONFIG = {
  command: "skill-central",
  args: ["mcp"],
};

export async function cmdRegister(ideInput: string | undefined, opts: RegisterOptions): Promise<void> {
  const home = homedir();
  const isWin = process.platform === "win32";
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

  const availableIdes = Object.keys(IDE_PATHS) as IdeType[];

  let targets: IdeType[] = [];

  if (ideInput) {
    const ide = ideInput.toLowerCase() as IdeType;
    if (!availableIdes.includes(ide)) {
      throw new Error(`Unsupported IDE: ${ide}. Supported IDEs: ${availableIdes.join(", ")}`);
    }
    targets = [ide];
  } else {
    // If no IDE specified, we will find all existing configuration files
    console.log("No IDE specified. Searching for all known MCP configuration files...");
    for (const ide of availableIdes) {
      const configPath = IDE_PATHS[ide](home, appData, isWin);
      if (fs.existsSync(configPath)) {
        targets.push(ide);
      }
    }
    
    if (targets.length === 0) {
      console.log("No existing IDE configurations found. Please specify an IDE or create the config manually.");
      return;
    }
    console.log(`Found configurations for: ${targets.join(", ")}`);
  }

  for (const ide of targets) {
    const configPath = IDE_PATHS[ide](home, appData, isWin);
    await processIdeConfig(ide, configPath, opts.remove);
  }
}

async function processIdeConfig(ide: IdeType, configPath: string, remove?: boolean) {
  let config: any = {};
  
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to parse configuration for ${ide} at ${configPath}. Is it valid JSON?`);
      return;
    }
  } else {
    if (remove) {
      console.log(`[${ide}] Config file does not exist, nothing to remove.`);
      return;
    }
    // Create directory if it doesn't exist
    const dir = path.dirname(configPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (remove) {
    if (config.mcpServers["skill-central"]) {
      delete config.mcpServers["skill-central"];
      console.log(`[${ide}] Removed skill-central from MCP servers.`);
      saveConfig(configPath, config);
    } else {
      console.log(`[${ide}] skill-central is not registered, nothing to remove.`);
    }
  } else {
    const existing = config.mcpServers["skill-central"];
    if (existing && existing.command === DEFAULT_MCP_CONFIG.command && JSON.stringify(existing.args) === JSON.stringify(DEFAULT_MCP_CONFIG.args)) {
      console.log(`[${ide}] skill-central is already registered with the correct configuration.`);
    } else {
      config.mcpServers["skill-central"] = DEFAULT_MCP_CONFIG;
      console.log(`[${ide}] Successfully registered skill-central.`);
      saveConfig(configPath, config);
    }
  }
}

function saveConfig(filePath: string, config: any) {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
