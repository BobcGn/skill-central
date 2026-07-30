// ============================================================================
// Connect / Connect Plan
// ----------------------------------------------------------------------------
// Builds, applies, verifies, and rolls back IDE MCP registration transactions.
//
// Design intent:
// - Config writes use the target codec (JSON or TOML). Existing user MCP
//   servers are preserved; only the `skill-central` entry is replaced.
// - Apply always creates a backup of an existing config before writing. New
//   files do not need backups because rollback can remove the created file.
// - Rollback is explicit and backup-based; no destructive recovery is hidden
//   behind connect apply.
// ============================================================================

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  emptyIdeConfig,
  isConnectCreatedConfig,
  mergeSkillCentralServerConfig,
} from "../ide-detection/config-codec.js";
import { detectIdeRegistration } from "../ide-detection/detect.js";
import {
  DEFAULT_MCP_SERVER_CONFIG,
  defaultIdeConfigPath,
  SKILL_CENTRAL_MCP_SERVER_NAME,
} from "../ide-detection/registry.js";
import type { IdeTarget } from "../ide-detection/types.js";
import { checkIdeConnectionHealth } from "../health/ide-connection.js";
import type { SkillEngine } from "../core/engine.js";
import type { OneClickConnectPlan } from "./types.js";

export interface BuildConnectPlanOptions {
  configPath?: string;
  force?: boolean;
  dryRun?: boolean;
  backupStamp?: string;
}

export async function buildConnectPlan(
  target: IdeTarget,
  options: BuildConnectPlanOptions = {},
): Promise<OneClickConnectPlan> {
  const configPath = resolve(options.configPath ?? defaultIdeConfigPath(target));
  const registration = await detectIdeRegistration(target, { configPath });
  if (registration.configExists && !registration.configReadable) {
    throw new Error(
      `Cannot build connect plan: IDE config is not readable ${registration.configFormat.toUpperCase()} at ${configPath}. ` +
        `Fix the file or restore a backup before skill-central writes to it. ` +
        `Parse error: ${registration.error ?? "unknown error"}`,
    );
  }
  const currentConfig = await readConfig(configPath, registration.configFormat);
  const nextConfig = mergeSkillCentralServerConfig(currentConfig, registration.configFormat);
  const backupPath = registration.configExists
    ? `${configPath}.bak.${options.backupStamp ?? timestamp()}`
    : undefined;

  return {
    target,
    configPath,
    configFormat: registration.configFormat,
    serverName: SKILL_CENTRAL_MCP_SERVER_NAME,
    desiredServer: DEFAULT_MCP_SERVER_CONFIG,
    currentRegistered: registration.registered,
    configExists: registration.configExists,
    dryRun: !!options.dryRun,
    force: !!options.force,
    backupPath,
    diffPreview: buildDiffPreview(currentConfig, nextConfig),
    steps: [
      {
        kind: "detect",
        status: "applied",
        title: "Detect IDE config",
        detail: registration.configExists ? `Found ${configPath}` : `Will create ${configPath}`,
      },
      {
        kind: "preview",
        status: "applied",
        title: "Preview MCP config merge",
        detail: `Set mcpServers.${SKILL_CENTRAL_MCP_SERVER_NAME} to ${DEFAULT_MCP_SERVER_CONFIG.command} ${(DEFAULT_MCP_SERVER_CONFIG.args ?? []).join(" ")}`,
      },
      {
        kind: "backup",
        status: registration.configExists ? "pending" : "skipped",
        title: "Backup existing config",
        detail: backupPath ?? "No existing config; rollback will remove the created file.",
      },
      {
        kind: "write",
        status: "pending",
        title: "Write merged config",
        detail: "Preserve existing MCP servers and update only skill-central.",
      },
      {
        kind: "verify",
        status: "pending",
        title: "Verify MCP connection",
        detail: "Run initialize, prompts/list, and tools/list against the configured command.",
      },
      {
        kind: "rollback",
        status: "pending",
        title: "Rollback from backup",
        detail: backupPath ?? "Remove the newly created config if rollback is requested.",
      },
    ],
  };
}

export async function applyConnectPlan(plan: OneClickConnectPlan): Promise<OneClickConnectPlan> {
  const currentConfig = await readConfig(plan.configPath, plan.configFormat);
  const nextConfig = mergeSkillCentralServerConfig(currentConfig, plan.configFormat);
  await mkdir(dirname(plan.configPath), { recursive: true });
  if (plan.configExists && plan.backupPath) {
    await writeFile(plan.backupPath, currentConfig, "utf-8");
  }
  await writeFile(plan.configPath, nextConfig, "utf-8");
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.kind === "backup" && plan.configExists
        ? { ...step, status: "applied" }
        : step.kind === "write"
          ? { ...step, status: "applied" }
          : step,
    ),
  };
}

export async function verifyConnectPlan(
  plan: OneClickConnectPlan,
  engine: SkillEngine,
): Promise<OneClickConnectPlan> {
  const health = await checkIdeConnectionHealth(plan.target, engine, {
    configPath: plan.configPath,
    verify: true,
  });
  return {
    ...plan,
    health,
    steps: plan.steps.map((step) =>
      step.kind === "verify" ? { ...step, status: "applied", detail: `Health status: ${health.status}` } : step,
    ),
  };
}

export async function rollbackConnectPlan(plan: OneClickConnectPlan): Promise<OneClickConnectPlan> {
  if (plan.backupPath) {
    await rename(plan.backupPath, plan.configPath);
  } else {
    // A plan without backupPath means connect created the config file. Removing
    // that file restores the pre-connect state; writing "{}" would leave a
    // synthetic user config behind and hide what actually happened.
    const currentConfig = await readConfig(plan.configPath, plan.configFormat);
    if (!isConnectCreatedConfig(currentConfig, plan.configFormat)) {
      throw new Error(
        "Refusing rollback without backup: config contains data beyond the skill-central MCP entry.",
      );
    }
    await unlinkIfExists(plan.configPath);
  }
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.kind === "rollback" ? { ...step, status: "applied" } : step,
    ),
  };
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return;
    throw err;
  }
}

async function readConfig(
  configPath: string,
  format: OneClickConnectPlan["configFormat"],
): Promise<string> {
  try {
    return await readFile(configPath, "utf-8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return emptyIdeConfig(format);
    }
    throw err;
  }
}

function buildDiffPreview(before: string, after: string): string {
  if (before === after) return "(no changes)";
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const lines: string[] = [];
  for (let i = 0; i < max && lines.length < 20; i += 1) {
    if (beforeLines[i] === afterLines[i]) continue;
    if (beforeLines[i] !== undefined) lines.push(`- ${beforeLines[i]}`);
    if (afterLines[i] !== undefined) lines.push(`+ ${afterLines[i]}`);
  }
  return lines.join("\n");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
