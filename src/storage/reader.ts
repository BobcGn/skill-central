// ============================================================================
// Storage / Reader
// ----------------------------------------------------------------------------
// Responsible for discovering and reading Skill Schema files from layered
// directories on the local filesystem.
// ============================================================================

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { SkillLayer, SkillSchema } from "./schemas.js";
import { parseSkillFile } from "./parser.js";

const ALLOWED_EXTENSIONS = new Set([".json", ".json5", ".yaml", ".yml", ".md"]);

/**
 * Walk each layer directory and collect all raw skill schemas found.
 * Returns an array tagged with the layer they came from so the caller
 * can perform conflict resolution later.
 */
export async function readAllLayers(
  layers: SkillLayer[],
): Promise<Array<{ schema: SkillSchema; layer: SkillLayer }>> {
  const results: Array<{ schema: SkillSchema; layer: SkillLayer }> = [];

  for (const layer of layers) {
    const files = await discoverSkillFiles(layer.path);
    for (const filePath of files) {
      const schema = await parseSkillFile(filePath);
      if (schema) {
        results.push({ schema, layer });
      }
    }
  }

  return results;
}

/**
 * Recursively list skill definition files under `dirPath`.
 */
async function discoverSkillFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      // Skip hidden files and files prefixed with _ (templates/references)
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await discoverSkillFiles(fullPath)));
      } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }

    return files;
  } catch {
    // Layer directory doesn't exist yet — treat as empty.
    return [];
  }
}
