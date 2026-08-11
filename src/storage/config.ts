// ============================================================================
// Storage / Config
// ----------------------------------------------------------------------------
// Loads layered skill source configuration from disk.
//
// Design intent:
// - Config loading should only parse and promote layer metadata. It should not
//   infer behavior from directory names after this point.
// - Global and project configs still merge by layer id/name for compatibility,
//   but every returned layer is a full governance object.
// - Invalid layer blocks are skipped with field-level warnings so one bad layer
//   does not prevent local-first usage of the remaining layers.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import type { SkillLayer } from "./schemas.js";
import { DEFAULT_LEGACY_LAYERS, parseLayerConfigs } from "./layers.js";

export const USER_SKILLS_DIR_ENV = "SKILL_CENTRAL_USER_SKILLS_DIR";

export function resolveUserSkillsDir(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return path.resolve(environment[USER_SKILLS_DIR_ENV] ?? path.join(home, ".skill-central", "skills"));
}

export interface SkillCentralConfig {
  layers: SkillLayer[];
  layerPresets?: {
    active?: string;
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Read config from disk, merging global → project → defaults.
 *
 * The fallback is the legacy four-layer preset, promoted to full layer
 * metadata. This preserves old installs while giving Phase 1B+ one complete
 * shape to reason about.
 */
export function loadConfig(projectRoot?: string): SkillCentralConfig {
  const layers: SkillLayer[] = [];
  let layerPresets: SkillCentralConfig["layerPresets"];
  let configuredLayerCount = 0;

  // 0) User-global layers are always available in every project. They use
  // lower priorities than the legacy project layers so project decisions can
  // override shared defaults without hiding their provenance.
  mergeLayers(layers, defaultUserLayers());

  // 1) Global config
  const globalPath = path.join(homedir(), ".skill-central", "config.yaml");
  const globalConfig = readConfigFile(globalPath);
  configuredLayerCount += globalConfig.layers.length;
  mergeLayers(layers, globalConfig.layers);
  layerPresets = globalConfig.layerPresets ?? layerPresets;

  // 2) Project-level config
  const root = projectRoot ?? process.cwd();
  for (const name of ["skill-central.yaml", "skill-central.yml"]) {
    const projectPath = path.join(root, name);
    if (existsSync(projectPath)) {
      const projectConfig = readConfigFile(projectPath);
      configuredLayerCount += projectConfig.layers.length;
      mergeLayers(layers, projectConfig.layers);
      layerPresets = projectConfig.layerPresets ?? layerPresets;
      break;
    }
  }

  // 3) Fallback default
  if (configuredLayerCount === 0) {
    layers.push(...DEFAULT_LEGACY_LAYERS.map((layer) => ({ ...layer, sync: { ...layer.sync } })));
  }

  return { layers: resolveLayerPaths(layers, root), layerPresets };
}

function defaultUserLayers(): SkillLayer[] {
  const root = resolveUserSkillsDir();
  if (!existsSync(root)) return [];
  return [
    userLayer("user-01-global", "user/01-global", path.join(root, "01-global"), 1),
    userLayer("user-02-workflows", "user/02-workflows", path.join(root, "02-workflows"), 2),
    userLayer("user-03-domains", "user/03-domains", path.join(root, "03-domains"), 3),
    userLayer("user-04-tech-stack", "user/04-tech-stack", path.join(root, "04-tech-stack"), 4),
  ].filter((layer) => existsSync(layer.path));
}

function userLayer(id: string, name: string, layerPath: string, priority: number): SkillLayer {
  return {
    id,
    name,
    path: layerPath,
    scope: "user",
    priority,
    writable: true,
    trust: "local",
    sync: { enabled: true },
    visibility: "private",
  };
}

// ── Internals ──────────────────────────────────────────────────────────────

function readConfigFile(filePath: string): SkillCentralConfig {
  if (!existsSync(filePath)) {
    return { layers: [] };
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(raw);
    if (!isPlainObject(parsed)) {
      warnConfig(filePath, "(root)", "expected object");
      return { layers: [] };
    }

    const result = parsed.layers === undefined
      ? { layers: [], issues: [] }
      : parseLayerConfigs(parsed.layers);

    for (const issue of result.issues) {
      warnConfig(filePath, issue.fieldPath, issue.reason);
    }

    return {
      layers: result.layers,
      layerPresets: isPlainObject(parsed.layerPresets)
        ? { active: typeof parsed.layerPresets.active === "string" ? parsed.layerPresets.active : undefined }
        : undefined,
    };
  } catch (err) {
    warnConfig(filePath, "(root)", `YAML parse error: ${(err as Error).message}`);
    return { layers: [] };
  }
}

/**
 * Merge `incoming` layers into `target`, overwriting by id. Falling back to
 * name keeps old configs merge-compatible before users add explicit ids.
 */
function mergeLayers(target: SkillLayer[], incoming: SkillLayer[]): void {
  for (const layer of incoming) {
    const idx = target.findIndex((l) => l.id === layer.id || l.name === layer.name);
    if (idx !== -1) {
      target[idx] = layer;
    } else {
      target.push(layer);
    }
  }
}

function warnConfig(filePath: string, fieldPath: string, reason: string): void {
  console.warn(`[skill-central] ${filePath}: ${fieldPath}: ${reason}`);
}

function resolveLayerPaths(layers: SkillLayer[], root: string): SkillLayer[] {
  return layers.map((layer) => ({
    ...layer,
    path: path.isAbsolute(layer.path) ? layer.path : path.resolve(root, layer.path),
  }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
