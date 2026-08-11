// ============================================================================
// Storage / Config
// ----------------------------------------------------------------------------
// Loads layered skill source configuration from disk.
//
// Design intent:
// - Config loading should only parse and promote layer metadata. It should not
//   infer behavior from directory names after this point.
// - Project configs remain an explicit governed override. Otherwise every
//   process uses the initialized `~/.skill-central/{skills,rules}` library.
// - Invalid layer blocks are skipped with field-level warnings so one bad layer
//   does not prevent local-first usage of the remaining layers.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import type { SkillLayer } from "./schemas.js";
import { DEFAULT_LEGACY_LAYERS, parseLayerConfigs } from "./layers.js";
import {
  resolveAssetLibrary,
  type AssetLibraryContext,
  type ResolveAssetLibraryOptions,
} from "./asset-library.js";

export const USER_SKILLS_DIR_ENV = "SKILL_CENTRAL_USER_SKILLS_DIR";

export function resolveUserSkillsDir(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return path.resolve(environment[USER_SKILLS_DIR_ENV] ?? path.join(home, ".skill-central", "skills"));
}

export interface SkillCentralConfig {
  layers: SkillLayer[];
  assetLibrary: AssetLibraryContext;
  layerPresets?: {
    active?: string;
  };
}

interface ParsedSkillCentralConfig {
  layers: SkillLayer[];
  layerPresets?: SkillCentralConfig["layerPresets"];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Read the one explicit asset source from disk.
 *
 * The fallback is the legacy four-layer preset, promoted to full layer
 * metadata. This preserves old installs while giving Phase 1B+ one complete
 * shape to reason about.
 */
export function loadConfig(
  projectRoot?: string,
  assetLibraryOptions: ResolveAssetLibraryOptions = {},
): SkillCentralConfig {
  const root = path.resolve(projectRoot ?? process.cwd());
  const assetLibrary = resolveAssetLibrary(root, assetLibraryOptions);
  if (assetLibrary.mode !== "project") {
    return {
      assetLibrary,
      layers: [{
        id: `${assetLibrary.mode}-library`,
        name: `${assetLibrary.mode}/library`,
        path: assetLibrary.skillsDir,
        scope: "user",
        priority: 10,
        writable: true,
        trust: "local",
        sync: { enabled: true },
        visibility: "private",
      }],
    };
  }

  const layers: SkillLayer[] = [];
  let layerPresets: SkillCentralConfig["layerPresets"];
  let configuredLayerCount = 0;

  // A project config is an explicit override of the cross-project default.
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

  // Fallback default
  if (configuredLayerCount === 0) {
    layers.push(...DEFAULT_LEGACY_LAYERS.map((layer) => ({ ...layer, sync: { ...layer.sync } })));
  }

  return { layers: resolveLayerPaths(layers, root), assetLibrary, layerPresets };
}

// ── Internals ──────────────────────────────────────────────────────────────

function readConfigFile(filePath: string): ParsedSkillCentralConfig {
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
