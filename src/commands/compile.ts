// ============================================================================
// Compile Command
// ----------------------------------------------------------------------------
// `skill-central compile --target <target> --intent <intent> --dry-run`
//
// Design intent:
// - Phase 2B compile remains a report generator only. It must not write IDE files.
// - The command uses Registry/Engine resolution records so layer provenance and
//   conflict/shadow information match CLI/MCP/UI behavior.
// - Target-specific behavior is delegated to adapters. The compiler CLI should
//   only validate inputs, load registry records, and print the adapter report.
// - `--json` exposes the same bundle used by export so automation can compare
//   hashes and artifacts before any write transaction.
// ============================================================================

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { compileIntentDryRun } from "../compiler/compiler.js";
import { isCompileTarget, listTargetNames } from "../adapters/registry.js";
import type { CompileTarget } from "../adapters/types.js";

export interface CompileOptions {
  target?: string;
  intent?: string;
  dryRun?: boolean;
  json?: boolean;
}

export async function cmdCompile(opts: CompileOptions): Promise<void> {
  const target = parseTarget(opts.target);
  const intent = requireString(opts.intent, "--intent");
  if (!opts.dryRun) {
    throw new Error("Phase 2B only supports --dry-run. Export/apply will be added later.");
  }

  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers);

  const bundle = compileIntentDryRun(engine.listResolutionRecords(), { target, intent });
  if (opts.json) {
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }
  printBundle(bundle);
}

function printBundle(bundle: ReturnType<typeof compileIntentDryRun>): void {
  console.log("");
  console.log(`▸ Compile dry-run`);
  console.log("  " + "-".repeat(72));
  console.log(`  Target : ${bundle.target}`);
  console.log(`  Intent : ${bundle.intent}`);
  console.log(`  Hash   : ${bundle.hash}`);
  console.log("");

  console.log(`▸ Selected skills (${bundle.selectedSkills.length})`);
  if (bundle.selectedSkills.length === 0) {
    console.log("  (none)");
  }
  for (const skill of bundle.selectedSkills) {
    console.log(
      `  • ${skill.id} [${skill.type}] layer=${skill.layer.name} scope=${skill.layer.scope} reason=${skill.selectionReason}`,
    );
  }
  console.log("");

  if (bundle.shadowedSkills.length > 0) {
    console.log(`▸ Shadowed skills (${bundle.shadowedSkills.length})`);
    for (const skill of bundle.shadowedSkills) {
      console.log(`  • ${skill.id} layer=${skill.layer.name} status=${skill.status}`);
    }
    console.log("");
  }

  if (bundle.conflictedSkills.length > 0) {
    console.log(`▸ Conflicted skills (${bundle.conflictedSkills.length})`);
    for (const skill of bundle.conflictedSkills) {
      console.log(`  • ${skill.id} layer=${skill.layer.name}`);
    }
    console.log("");
  }

  console.log(`▸ Capability checks (${bundle.capabilityChecks.length})`);
  if (bundle.capabilityChecks.length === 0) {
    console.log("  (none declared)");
  }
  for (const check of bundle.capabilityChecks) {
    console.log(
      `  • ${check.skillId}: ${check.requirement} ${check.capability} -> ${check.support} (${check.action})`,
    );
  }
  console.log("");

  if (bundle.degradations.length > 0) {
    console.log(`▸ Degradations (${bundle.degradations.length})`);
    for (const degradation of bundle.degradations) {
      console.log(`  • ${degradation.skillId}: ${degradation.mode} - ${degradation.message}`);
    }
    console.log("");
  }

  console.log(`▸ Artifact preview (${bundle.artifacts.length})`);
  for (const artifact of bundle.artifacts) {
    console.log(`  • ${artifact.kind} ${artifact.path ?? "(no path)"}`);
    console.log(`    skill=${artifact.skillId} layer=${artifact.metadata.sourceLayer}`);
    console.log(
      artifact.preview
        .split("\n")
        .slice(0, 6)
        .map((line) => `    ${line}`)
        .join("\n"),
    );
  }
  console.log("");
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
