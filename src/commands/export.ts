// ============================================================================
// Export Command
// ----------------------------------------------------------------------------
// `skill-central export --target <target> --intent <intent> --out <dir>`
//
// Design intent:
// - Export is a transaction over compiler artifacts, not a second compiler.
//   The command first plans all writes from the dry-run bundle, then applies
//   only when no unapproved conflict exists.
// - Default behavior is conservative: different existing files block export.
// - `--stdout` is a review surface for automation and does not write files.
// ============================================================================

import { resolve } from "node:path";
import { isCompileTarget, listTargetNames } from "../adapters/registry.js";
import type { CompileTarget } from "../adapters/types.js";
import { compileIntentDryRun } from "../compiler/compiler.js";
import {
  applyExportPlan,
  exportPlanHasConflicts,
  planExport,
  type ExportPlan,
} from "../compiler/export-transaction.js";
import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";

export interface ExportOptions {
  target?: string;
  intent?: string;
  out?: string;
  dryRun?: boolean;
  force?: boolean;
  stdout?: boolean;
  json?: boolean;
}

export async function cmdExport(opts: ExportOptions): Promise<void> {
  const target = parseTarget(opts.target);
  const intent = requireString(opts.intent, "--intent");
  const outDir = resolve(requireString(opts.out, "--out"));

  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers);

  const bundle = compileIntentDryRun(engine.listResolutionRecords(), { target, intent });
  const plan = await planExport(bundle, outDir, {
    force: !!opts.force,
  });

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (opts.stdout) {
    printArtifactsToStdout(plan);
    return;
  }

  printPlan(plan);
  if (opts.dryRun) return;

  if (exportPlanHasConflicts(plan)) {
    throw new Error("Export has conflicts; no files were written.");
  }

  await applyExportPlan(plan);
  console.log(`\n✓ Export complete: ${plan.operations.filter((operation) => operation.status !== "skip-identical").length} file operation(s)`);
}

function printPlan(plan: ExportPlan): void {
  console.log("");
  console.log(`▸ Export plan`);
  console.log("  " + "-".repeat(72));
  console.log(`  Target : ${plan.target}`);
  console.log(`  Intent : ${plan.intent}`);
  console.log(`  Out    : ${plan.outDir}`);
  console.log(`  Hash   : ${plan.bundleHash}`);
  console.log(`  Force  : ${plan.force ? "yes" : "no"}`);
  console.log("");

  for (const operation of plan.operations) {
    console.log(`  • ${operation.status} ${operation.relativePath} (${operation.bytes} bytes)`);
    if (operation.backupPath) console.log(`    backup: ${operation.backupPath}`);
    if (operation.diffPreview) {
      console.log("    diff preview:");
      console.log(operation.diffPreview.split("\n").map((line) => `      ${line}`).join("\n"));
    }
  }

  console.log("");
  if (exportPlanHasConflicts(plan)) {
    console.log("  Conflicts block export by default. Re-run with --force only after reviewing the diff.");
  }
}

function printArtifactsToStdout(plan: ExportPlan): void {
  for (const operation of plan.operations) {
    console.log(`--- ${operation.relativePath}`);
    console.log(operation.artifact.preview);
    console.log("");
  }
}

function parseTarget(value: string | undefined): CompileTarget {
  if (!value) throw new Error("Missing required option: --target");
  if (!isCompileTarget(value)) {
    throw new Error(`Unsupported target "${value}". Valid targets: ${listTargetNames().join(", ")}`);
  }
  return value;
}

function requireString(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}
