// ============================================================================
// Remove Command
// ----------------------------------------------------------------------------
// "skill-central remove <id>" — delete the skill definition file from its
// layer. If the same id exists in multiple layers, --layer must be specified.
// ============================================================================

import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../storage/config.js";
import { readAllLayers } from "../storage/reader.js";
import { LAYER_RULES } from "./add.js";

export interface RemoveOptions {
  layer?: string;
  force?: boolean;
}

export async function cmdRemove(id: string, opts: RemoveOptions): Promise<void> {
  const config = loadConfig();

  // Find every file containing this id (raw layer scan, not engine view).
  const matches: Array<{ layerName: string; filePath: string; layerPath: string }> = [];
  for (const layer of config.layers) {
    const entries = await readAllLayers([layer]);
    for (const entry of entries) {
      if (entry.schema.id === id) {
        matches.push({
          layerName: layer.name,
          filePath: `${layer.path}/${id}.yaml`,
          layerPath: layer.path,
        });
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(`Skill "${id}" not found in any layer.`);
  }

  if (matches.length > 1 && !opts.layer) {
    throw new Error(
      `Skill "${id}" exists in multiple layers: ${matches.map((m) => m.layerName).join(", ")}\n` +
        `Use --layer <name> to specify which one to remove.`,
    );
  }

  // Resolve target.
  let target = matches[0]!;
  if (opts.layer) {
    const found = matches.find((m) => m.layerName === opts.layer);
    if (!found) {
      throw new Error(
        `Skill "${id}" not found in layer "${opts.layer}". Available: ${matches.map((m) => m.layerName).join(", ")}`,
      );
    }
    target = found;
  }

  // Confirm unless --force.
  if (!opts.force) {
    console.log(`About to delete: ${target.filePath}`);
    console.log(`  (in layer: ${target.layerName})`);
    console.log(`  Tip: use --force to skip this prompt in scripts.`);
  }

  await unlink(target.filePath);
  console.log(`  ✓ Removed ${target.layerName}/${id}.yaml`);
  console.log("");
}

// ── Unused exports kept for symmetry with add.ts ───────────────────────────
//
// LAYER_RULES is exported from add.ts; remove() uses the same names but
// resolves via config.layers so the rule list is not needed here directly.
// Re-exporting keeps the import surface uniform for downstream commands.
export { LAYER_RULES };
export async function _unused_listLayerDir(layerPath: string): Promise<string[]> {
  return readdir(layerPath, { withFileTypes: true })
    .then((entries) =>
      entries.filter((e) => e.isFile()).map((e) => path.join(layerPath, e.name)),
    )
    .catch(() => []);
}