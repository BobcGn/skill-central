// ============================================================================
// Reverse Output Command
// ----------------------------------------------------------------------------
// CLI companion to the IDE-facing `reverse_output` MCP tool.
//
// Asset content is read from a JSON/YAML file so the CLI exercises the same
// structured proposal path as an IDE without accepting ad-hoc shell text.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { load as parseYaml } from "js-yaml";

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { ReverseOutputService } from "../reverse-output/service.js";

export interface ReverseOutputOptions {
  action: string;
  assetType?: string;
  operation?: string;
  source?: string;
  context?: string;
  target?: string;
  placement?: string;
  placementReason?: string;
  assetFile?: string;
  decision?: string;
  expectedSha256?: string;
  appStateDir?: string;
  targetPath?: string;
  backupPath?: string;
  projectRoot?: string;
  json?: boolean;
}

export async function cmdReverseOutput(options: ReverseOutputOptions): Promise<void> {
  const action = parseEnum(options.action, ["preview", "apply", "rollback"], "action");
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const config = loadConfig(projectRoot);
  const engine = new SkillEngine();
  await engine.reload(config.layers, { projectRoot });
  const service = new ReverseOutputService({ config, projectRoot, engine });

  const input: Record<string, unknown> = {
    action,
    assetType: options.assetType,
    operation: options.operation,
    source: options.source,
    context: options.context,
    target: options.target,
    placement: options.placement,
    placementReason: options.placementReason,
    decision: options.decision,
    expectedSha256: options.expectedSha256,
    appStateDir: options.appStateDir,
    targetPath: options.targetPath,
    backupPath: options.backupPath,
  };

  if (action !== "rollback") {
    if (!options.assetFile) throw new Error(`${action} requires --asset-file <path>`);
    input.asset = await readAssetFile(options.assetFile);
  }

  const result = await service.execute(input);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
  }

  if (action === "apply" && result.status === "blocked") {
    throw new Error("reverse output apply was blocked by preflight or verification");
  }
}

function printResult(result: Awaited<ReturnType<ReverseOutputService["execute"]>>): void {
  console.log("");
  console.log(`▸ Reverse output ${result.action}`);
  console.log("  " + "-".repeat(72));
  console.log(`  Status : ${result.status}`);
  if (result.decision) console.log(`  Decision : ${result.decision}`);
  if (result.targetPath) console.log(`  Target : ${result.targetPath}`);
  if (result.backupPath) console.log(`  Backup : ${result.backupPath}`);
  if (result.auditPath) console.log(`  Audit : ${result.auditPath}`);
  if (result.verification) {
    console.log(`  Verification : ${result.verification.status} — ${result.verification.detail}`);
  }

  const proposal = result.proposal;
  if (proposal) {
    console.log(`  Proposal : ${proposal.proposalId}`);
    console.log(`  Asset : ${proposal.assetType}/${proposal.assetId}`);
    console.log(`  Can apply : ${proposal.canApply ? "yes" : "no"}`);
    console.log("");
    console.log("▸ Checks");
    for (const check of proposal.checks) {
      console.log(`  • ${check.status} ${check.id}: ${check.detail}`);
    }
    if (proposal.diffPreview) {
      console.log("");
      console.log("▸ Diff preview");
      console.log(proposal.diffPreview.split("\n").map((line) => `  ${line}`).join("\n"));
    }
  }
  console.log("");
}

async function readAssetFile(filePath: string): Promise<Record<string, unknown>> {
  const absolute = path.resolve(filePath);
  const raw = await readFile(absolute, "utf8");
  const parsed = path.extname(absolute).toLowerCase() === ".json"
    ? JSON.parse(raw)
    : parseYaml(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Asset file must contain an object: ${absolute}`);
  }
  return parsed as Record<string, unknown>;
}

function parseEnum(value: string | undefined, values: readonly string[], label: string): string {
  if (!value || !values.includes(value)) {
    throw new Error(`${label} must be one of: ${values.join(", ")}`);
  }
  return value;
}
