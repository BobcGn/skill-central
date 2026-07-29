import fs from "node:fs";
import path from "node:path";
import * as readline from "node:readline/promises";
import {
  DEFAULT_MCP_SERVER_CONFIG,
  defaultIdeConfigPath,
  isIdeTarget,
  SKILL_CENTRAL_MCP_SERVER_NAME,
  SUPPORTED_IDES,
} from "../ide-detection/registry.js";
import type { IdeTarget } from "../ide-detection/types.js";

export interface RegisterOptions {
  remove?: boolean;
}

export type IdeType = IdeTarget;

export async function cmdRegister(ideInput: string | undefined, opts: RegisterOptions): Promise<void> {
  let targets: IdeType[] = [];

  if (ideInput) {
    const ide = ideInput.toLowerCase() as IdeType;
    if (!isIdeTarget(ide)) {
      throw new Error(`Unsupported IDE: ${ide}. Supported IDEs: ${SUPPORTED_IDES.join(", ")}`);
    }
    targets = [ide];
  } else {
    // If no IDE specified, we will find all existing configuration files
    console.log("No IDE specified. Searching for all known MCP configuration files...");
    for (const ide of SUPPORTED_IDES) {
      const configPath = defaultIdeConfigPath(ide);
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
    const configPath = defaultIdeConfigPath(ide);
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
    if (config.mcpServers[SKILL_CENTRAL_MCP_SERVER_NAME]) {
      delete config.mcpServers[SKILL_CENTRAL_MCP_SERVER_NAME];
      console.log(`[${ide}] Removed skill-central from MCP servers.`);
      saveConfig(configPath, config);
    } else {
      console.log(`[${ide}] skill-central is not registered, nothing to remove.`);
    }
  } else {
    const existing = config.mcpServers[SKILL_CENTRAL_MCP_SERVER_NAME];
    if (
      existing &&
      existing.command === DEFAULT_MCP_SERVER_CONFIG.command &&
      JSON.stringify(existing.args) === JSON.stringify(DEFAULT_MCP_SERVER_CONFIG.args)
    ) {
      console.log(`[${ide}] skill-central is already registered with the correct configuration.`);
    } else {
      config.mcpServers[SKILL_CENTRAL_MCP_SERVER_NAME] = DEFAULT_MCP_SERVER_CONFIG;
      console.log(`[${ide}] Successfully registered skill-central.`);
      saveConfig(configPath, config);
    }
  }
}

function saveConfig(filePath: string, config: any) {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
