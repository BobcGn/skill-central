// ============================================================================
// Connect Command
// ----------------------------------------------------------------------------
// `skill-central connect --target <ide>`
//
// Design intent:
// - CLI connect is the reusable backend for future desktop one-click connect.
// - The command always prints the plan. Writes require the absence of
//   `--dry-run`; verification is explicit via `--verify`.
// - Rollback consumes a previously printed backup path instead of guessing.
// ============================================================================

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { isIdeTarget, SUPPORTED_IDES } from "../ide-detection/registry.js";
import type { IdeTarget } from "../ide-detection/types.js";
import {
  applyConnectPlan,
  buildConnectPlan,
  rollbackConnectPlan,
  verifyConnectPlan,
  type BuildConnectPlanOptions,
} from "../connect/connect-plan.js";
import type { OneClickConnectPlan } from "../connect/types.js";

export interface ConnectOptions {
  target?: string;
  configPath?: string;
  dryRun?: boolean;
  verify?: boolean;
  json?: boolean;
  rollback?: boolean;
  backupPath?: string;
}

export async function cmdConnect(opts: ConnectOptions): Promise<void> {
  const target = parseTarget(opts.target);

  if (opts.rollback) {
    const plan = await buildConnectPlan(target, { configPath: opts.configPath });
    const rolledBack = await rollbackConnectPlan({
      ...plan,
      backupPath: opts.backupPath,
    });
    printOrJson(rolledBack, !!opts.json);
    return;
  }

  const plan = await buildConnectPlan(target, toBuildOptions(opts));
  if (opts.dryRun) {
    printOrJson(plan, !!opts.json);
    return;
  }

  let applied = await applyConnectPlan(plan);
  if (opts.verify) {
    const config = loadConfig();
    const engine = new SkillEngine();
    await engine.reload(config.layers);
    applied = await verifyConnectPlan(applied, engine);
  }
  printOrJson(applied, !!opts.json);
}

function printOrJson(plan: OneClickConnectPlan, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  printPlan(plan);
}

function printPlan(plan: OneClickConnectPlan): void {
  console.log("");
  console.log("▸ One-click connect plan");
  console.log("  " + "-".repeat(72));
  console.log(`  Target : ${plan.target}`);
  console.log(`  Config : ${plan.configPath}`);
  console.log(`  Server : ${plan.desiredServer.command} ${(plan.desiredServer.args ?? []).join(" ")}`);
  console.log(`  Backup : ${plan.backupPath ?? "(new file)"}`);
  console.log("");
  console.log("▸ Steps");
  for (const step of plan.steps) {
    console.log(`  • ${step.status} ${step.kind}: ${step.title}`);
    console.log(`    ${step.detail}`);
  }
  console.log("");
  console.log("▸ Diff preview");
  console.log(plan.diffPreview.split("\n").map((line) => `  ${line}`).join("\n"));
  if (plan.health) {
    console.log("");
    console.log(`▸ Verification: ${plan.health.status}`);
    console.log(`  loaded=${plan.health.loadedSkillCount} prompts=${plan.health.promptCount} tools=${plan.health.toolCount}`);
  }
  console.log("");
}

function toBuildOptions(opts: ConnectOptions): BuildConnectPlanOptions {
  return {
    configPath: opts.configPath,
    dryRun: opts.dryRun,
  };
}

function parseTarget(value: string | undefined): IdeTarget {
  if (!value) throw new Error("Missing required option: --target");
  const target = value.toLowerCase();
  if (!isIdeTarget(target)) {
    throw new Error(`Unsupported IDE: ${value}. Supported IDEs: ${SUPPORTED_IDES.join(", ")}`);
  }
  return target;
}

function requireString(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}
