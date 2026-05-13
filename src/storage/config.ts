// ============================================================================
// Storage / Config
// ----------------------------------------------------------------------------
// Loads the layered skill source configuration from disk.
// Resolution order (later wins):
//   1. ~/.skill-central/config.yaml         — global user config
//   2. <project-root>/skill-central.yaml    — project-level config (merge)
//   3. Built-in defaults                    — fallback
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { SkillLayer } from "./schemas.js";

export interface SkillCentralConfig {
  layers: SkillLayer[];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Read config from disk, merging global → project → defaults.
 * Returns at least one layer (".skills" at priority 100).
 */
export function loadConfig(projectRoot?: string): SkillCentralConfig {
  const layers: SkillLayer[] = [];

  // 1) Global config
  const globalPath = path.join(homedir(), ".skill-central", "config.yaml");
  mergeLayers(layers, readConfigFile(globalPath));

  // 2) Project-level config
  const root = projectRoot ?? process.cwd();
  for (const name of ["skill-central.yaml", "skill-central.yml"]) {
    const projectPath = path.join(root, name);
    if (existsSync(projectPath)) {
      mergeLayers(layers, readConfigFile(projectPath));
      break;
    }
  }

  // 3) Fallback default
  if (layers.length === 0) {
    layers.push({ name: "project", path: ".skills", priority: 100 });
  }

  return { layers };
}

// ── Internals ──────────────────────────────────────────────────────────────

const YAML_LAYER_RE = /^\s*-\s+name:\s*"([^"]+)"\s*\n\s+path:\s*"([^"]+)"\s*\n\s+priority:\s*(\d+)/m;

function readConfigFile(filePath: string): SkillLayer[] {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return parseConfigYaml(raw);
  } catch {
    return [];
  }
}

/**
 * Minimal YAML list-of-maps parser for the config format.
 * Uses regex-based parsing to avoid a full YAML dependency in the config path.
 * The actual skill YAML files are parsed by the full js-yaml parser.
 */
function parseConfigYaml(raw: string): SkillLayer[] {
  const layers: SkillLayer[] = [];
  const blockPattern = /^\s*-\s+name:\s*"([^"]+)"\s*\n\s+path:\s*"([^"]+)"\s*\n\s+priority:\s*(\d+)/gm;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(raw)) !== null) {
    layers.push({
      name: match[1],
      path: match[2],
      priority: parseInt(match[3], 10),
    });
  }
  return layers;
}

/**
 * Merge `incoming` layers into `target`, overwriting by name.
 * Appends new layers; updates path/priority for existing ones.
 */
function mergeLayers(target: SkillLayer[], incoming: SkillLayer[]): void {
  for (const layer of incoming) {
    const idx = target.findIndex((l) => l.name === layer.name);
    if (idx !== -1) {
      target[idx] = layer;
    } else {
      target.push(layer);
    }
  }
}
