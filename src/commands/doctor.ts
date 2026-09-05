// ============================================================================
// Doctor Command
// ----------------------------------------------------------------------------
// "skill-central doctor" — scan every configured layer and report:
//   • missing layer directories
//   • parse errors in skill files
//   • id collisions (same id present in multiple layers)
//   • orphan backup files (older .bak.* siblings)
//
// Phase 1B intent:
// Doctor is the human-facing audit surface for layer resolution. It should
// explain effective, shadowed, and conflicted skills using the same engine
// records that MCP/UI will consume, rather than re-deriving override behavior.
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
import { SkillEngine } from "../core/engine.js";
import { checkIdeConnectionHealth } from "../health/ide-connection.js";
import type { IdeConnectionHealth } from "../health/ide-connection.js";
import { isIdeTarget, SUPPORTED_IDES } from "../ide-detection/registry.js";
import type { IdeTarget } from "../ide-detection/types.js";

export interface DoctorOptions {
  ide?: string;
  configPath?: string;
  verify?: boolean;
  json?: boolean;
}

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
  resolution: Array<{
    id: string;
    status: "effective" | "conflicted";
    reason: string;
    candidates: Array<{
      layer: string;
      layerId: string;
      scope: string;
      priority: number;
      status: string;
      sourceFormat: string;
      shadowedBy?: string;
      conflictWith?: string[];
    }>;
  }>;
  formatCounts: {
    legacy: number;
    universal: number;
    invalid: number;
  };
  orphans: OrphanEntry[];
  ideHealth?: IdeConnectionHealth;
}

export async function cmdDoctor(opts: DoctorOptions = {}): Promise<void> {
  const config = loadConfig();
  const report: DoctorReport = {
    layers: [],
    parseErrors: [],
    collisions: [],
    resolution: [],
    formatCounts: {
      legacy: 0,
      universal: 0,
      invalid: 0,
    },
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
        report.formatCounts.invalid++;
        report.parseErrors.push({
          file,
          error: "validation failed (see warnings above)",
        });
      } else if (parsed.sourceFormat === "legacy") {
        report.formatCounts.legacy++;
      } else {
        report.formatCounts.universal++;
      }
    }

    // Orphan backups (sibling .bak.* files at this layer root and sub-dirs).
    await collectBackups(layer.path, report.orphans);
  }

  // ── 2. Collision detection (raw layer scan, not engine) ────────────────
  const idMap = new Map<string, CollisionEntry[]>();
  const allEntries = await readAllLayers(config.layers);
  for (const { schema, layer, filePath } of allEntries) {
    if (!idMap.has(schema.id)) idMap.set(schema.id, []);
    idMap.get(schema.id)!.push({
      layer: layer.name,
      filePath,
      priority: layer.priority,
    });
  }
  for (const [id, occurrences] of idMap) {
    if (occurrences.length > 1) {
      report.collisions.push({ id, occurrences });
    }
  }

  // ── 3. Engine resolution audit ─────────────────────────────────────────
  const engine = new SkillEngine();
  await engine.reload(config.layers);
  report.resolution = engine
    .listResolutionRecords()
    .filter((record) => record.status === "conflicted" || record.candidates.length > 1)
    .map((record) => ({
      id: record.id,
      status: record.status,
      reason: record.reason,
      candidates: record.candidates.map((candidate) => ({
        layer: candidate.layer.name,
        layerId: candidate.layer.id,
        scope: candidate.layer.scope,
        priority: candidate.priority,
        status: candidate.status,
        sourceFormat: candidate.sourceFormat,
        shadowedBy: candidate.shadowedBy?.name,
        conflictWith: candidate.conflictWith?.map((layer) => layer.name),
      })),
    }));

  if (opts.ide) {
    const target = parseIdeTarget(opts.ide);
    report.ideHealth = await checkIdeConnectionHealth(target, engine, {
      configPath: opts.configPath,
      verify: opts.verify,
    });
  }

  // ── 4. Print ───────────────────────────────────────────────────────────
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
  printReport(report);
  }

  // ── 5. Exit code ───────────────────────────────────────────────────────
  const problems =
    report.layers.filter((l) => !l.exists).length +
    report.parseErrors.length +
    report.resolution.filter((r) => r.status === "conflicted").length;
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
      Id: l.layer.id,
      Path: l.layer.path,
      Scope: l.layer.scope,
      Priority: l.layer.priority,
      Writable: l.layer.writable ? "✓" : "✗",
      Sync: l.layer.sync.enabled ? "on" : "off",
      Visibility: l.layer.visibility,
      Exists: l.exists ? "✓" : "✗ MISSING",
      Files: l.fileCount,
    })),
  );

  // ── Schema formats ──
  console.log("▸ Skill formats");
  console.log(
    `  legacy=${r.formatCounts.legacy} universal=${r.formatCounts.universal} invalid=${r.formatCounts.invalid}`,
  );
  if (r.formatCounts.legacy > 0) {
    console.log("  Legacy skills are loaded through the v1 compatibility upgrade path.");
  }
  console.log("");

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
    console.log("  (same id defined in multiple layers; see resolution audit below)");
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

  // ── Resolution audit ──
  if (r.resolution.length > 0) {
    console.log(`▸ Layer resolution audit (${r.resolution.length})`);
    for (const record of r.resolution) {
      const marker = record.status === "conflicted" ? "✗ conflict" : "resolved";
      console.log(`  id: ${record.id}  [${marker}]`);
      console.log(`    reason: ${record.reason}`);
      for (const candidate of record.candidates) {
        const details = [
          `status=${candidate.status}`,
          `layer=${candidate.layer}`,
          `scope=${candidate.scope}`,
          `priority=${candidate.priority}`,
          `format=${candidate.sourceFormat}`,
        ];
        if (candidate.shadowedBy) details.push(`shadowedBy=${candidate.shadowedBy}`);
        if (candidate.conflictWith?.length) details.push(`conflictWith=${candidate.conflictWith.join(",")}`);
        console.log(`    • ${details.join(" ")}`);
      }
    }
    console.log("");
  } else {
    console.log("▸ ✓ No layer shadowing or conflicts");
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

  if (r.ideHealth) {
    printIdeHealth(r.ideHealth);
  }
}

function printIdeHealth(health: IdeConnectionHealth): void {
  console.log("▸ IDE connection health");
  console.log("  " + "-".repeat(72));
  console.log(`  Target      : ${health.target}`);
  console.log(`  Status      : ${health.status}`);
  console.log(`  Config      : ${health.configPath}`);
  console.log(`  Registered  : ${health.registered ? "yes" : "no"}`);
  if (health.serverCommand) {
    console.log(`  Command     : ${[health.serverCommand, ...(health.serverArgs ?? [])].join(" ")}`);
  }
  if (health.serverUrl) {
    console.log(`  URL         : ${health.serverUrl}`);
  }
  if (health.serverVersion) console.log(`  Server      : ${health.serverVersion}`);
  console.log(`  Prompt count: ${health.promptCount} / registry ${health.registryPromptCount}`);
  console.log(`  Tool count  : ${health.toolCount} / registry ${health.registryToolCount}`);
  console.log(`  Loaded      : ${health.loadedSkillCount} / registry ${health.registryLoadedSkillCount}`);
  console.log(`  Checked     : ${health.lastCheckedAt}`);
  if (health.missingSkillIds.length > 0) {
    console.log(`  Missing     : ${health.missingSkillIds.join(", ")}`);
  }
  if (health.extraSkillIds.length > 0) {
    console.log(`  Extra       : ${health.extraSkillIds.join(", ")}`);
  }
  if (health.errorSummary) {
    console.log(`  Error       : ${health.errorSummary}`);
  }
  console.log("  Next actions:");
  for (const action of health.nextActions) {
    console.log(`    • ${action}`);
  }
  console.log("");
}

function parseIdeTarget(value: string): IdeTarget {
  const target = value.toLowerCase();
  if (!isIdeTarget(target)) {
    throw new Error(`Unsupported IDE: ${value}. Supported IDEs: ${SUPPORTED_IDES.join(", ")}`);
  }
  return target;
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
