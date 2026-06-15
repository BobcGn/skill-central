// ============================================================================
// Doctor Command
// ----------------------------------------------------------------------------
// "skill-central doctor" — scan every configured layer and report:
//   • missing layer directories
//   • parse errors in skill files
//   • id collisions (same id present in multiple layers)
//   • orphan backup files (older .bak.* siblings)
//
// Exits 0 if everything is healthy, 1 if any problem found.
// ============================================================================

import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { loadConfig } from "../storage/config.js";
import { discoverSkillFiles, readAllLayers } from "../storage/reader.js";
import { parseSkillFile } from "../storage/parser.js";
import type { SkillLayer } from "../storage/schemas.js";

interface LayerStatus {
  layer: SkillLayer;
  exists: boolean;
  fileCount: number;
}

interface CollisionEntry {
  layer: string;
  filePath: string;
  priority: number;
}

interface OrphanEntry {
  file: string;
  reason: string;
}

interface DoctorReport {
  layers: LayerStatus[];
  parseErrors: Array<{ file: string; error: string }>;
  collisions: Array<{ id: string; occurrences: CollisionEntry[] }>;
  orphans: OrphanEntry[];
}

export async function cmdDoctor(): Promise<void> {
  const config = loadConfig();
  const report: DoctorReport = {
    layers: [],
    parseErrors: [],
    collisions: [],
    orphans: [],
  };

  // ── 1. Per-layer scan ──────────────────────────────────────────────────
  for (const layer of config.layers) {
    const exists = await dirExists(layer.path);
    let fileCount = 0;
    report.layers.push({ layer, exists, fileCount });

    if (!exists) {
      continue;
    }

    const files = await discoverSkillFiles(layer.path);
    fileCount = files.length;
    report.layers[report.layers.length - 1]!.fileCount = fileCount;

    // Parse each; surface failures.
    for (const file of files) {
      const parsed = await parseSkillFile(file);
      if (!parsed) {
        report.parseErrors.push({
          file,
          error: "validation failed (see warnings above)",
        });
      }
    }

    // Orphan backups (sibling .bak.* files at this layer root and sub-dirs).
    await collectBackups(layer.path, report.orphans);
  }

  // ── 2. Collision detection (raw layer scan, not engine) ────────────────
  const idMap = new Map<string, CollisionEntry[]>();
  const allEntries = await readAllLayers(config.layers);
  for (const { schema, layer } of allEntries) {
    if (!idMap.has(schema.id)) idMap.set(schema.id, []);
    idMap.get(schema.id)!.push({
      layer: layer.name,
      filePath: `${layer.path}/${schema.id}.yaml`,
      priority: layer.priority,
    });
  }
  for (const [id, occurrences] of idMap) {
    if (occurrences.length > 1) {
      report.collisions.push({ id, occurrences });
    }
  }

  // ── 3. Print ───────────────────────────────────────────────────────────
  printReport(report);

  // ── 4. Exit code ───────────────────────────────────────────────────────
  const problems =
    report.layers.filter((l) => !l.exists).length +
    report.parseErrors.length +
    report.collisions.length;
  if (problems > 0) {
    throw new Error(`${problems} problem(s) found. See report above.`);
  }
}

function printReport(r: DoctorReport): void {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║              skill-central  Doctor                           ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  // ── Layers ──
  console.log("▸ Layers");
  console.log("  " + "-".repeat(72));
  console.table(
    r.layers.map((l) => ({
      Name: l.layer.name,
      Path: l.layer.path,
      Priority: l.layer.priority,
      Exists: l.exists ? "✓" : "✗ MISSING",
      Files: l.fileCount,
    })),
  );

  // ── Parse errors ──
  if (r.parseErrors.length > 0) {
    console.log(`▸ ✗ Parse errors (${r.parseErrors.length})`);
    for (const e of r.parseErrors) {
      console.log(`  ${e.file}`);
      console.log(`    ${e.error}`);
    }
    console.log("");
  } else {
    console.log("▸ ✓ All skill files parse cleanly");
    console.log("");
  }

  // ── Collisions ──
  if (r.collisions.length > 0) {
    console.log(`▸ ⚠ Id collisions (${r.collisions.length})`);
    console.log("  (same id defined in multiple layers — higher priority wins)");
    for (const c of r.collisions) {
      console.log(`  id: ${c.id}`);
      for (const occ of c.occurrences) {
        console.log(`    • [priority ${occ.priority}] ${occ.layer} → ${occ.filePath}`);
      }
    }
    console.log("");
  } else {
    console.log("▸ ✓ No id collisions");
    console.log("");
  }

  // ── Orphan backups ──
  if (r.orphans.length > 0) {
    console.log(`▸ Backup files (${r.orphans.length})`);
    console.log("  (manually inspect / delete with `rm <path>`; never auto-deleted)");
    for (const o of r.orphans) {
      console.log(`  ${o.file}`);
      console.log(`    ${o.reason}`);
    }
    console.log("");
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk `dirPath` recursively and collect every .bak.* backup file.
 * Each backup is reported as an orphan (never auto-deleted; user decides).
 */
async function collectBackups(dirPath: string, into: OrphanEntry[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectBackups(full, into);
    } else if (entry.isFile() && entry.name.includes(".yaml.bak.")) {
      const st = await stat(full).catch(() => null);
      if (st) {
        into.push({
          file: full,
          reason: `${st.size} bytes, mtime ${st.mtime.toISOString()}`,
        });
      }
    }
  }
}