// ============================================================================
// Startup / Connection Reconciler
// ----------------------------------------------------------------------------
// Coordinates IDE MCP registration checks for desktop startup and Board APIs.
//
// Design intent:
// - This module orchestrates existing connect transactions and health probes; it
//   never edits IDE config files directly.
// - Each target returns a structured result. One broken IDE config must not hide
//   the status of the remaining targets.
// ============================================================================

import { applyConnectPlan, buildConnectPlan, verifyConnectPlan } from "../connect/connect-plan.js";
import type { OneClickConnectPlan } from "../connect/types.js";
import type { SkillEngine } from "../core/engine.js";
import {
  defaultIdeConfigPath,
  RELEASE_SUPPORTED_IDES,
} from "../ide-detection/registry.js";
import {
  mcpServerConfigForTarget,
  type IdeTarget,
  type McpServerConfig,
} from "../ide-detection/types.js";

export type StartupRecognitionStatus =
  | "not-registered"
  | "ready"
  | "verified"
  | "drift"
  | "registered"
  | "refreshed"
  | "blocked"
  | "verify-failed";

export interface StartupRecognitionOptions {
  targets?: IdeTarget[];
  configPaths?: Partial<Record<IdeTarget, string>>;
  desiredServer?: McpServerConfig;
  applyDrift?: boolean;
  registerMissing?: boolean;
  verify?: boolean;
}

export interface StartupRecognitionTarget {
  target: IdeTarget;
  status: StartupRecognitionStatus;
  configPath: string;
  plan?: OneClickConnectPlan;
  errorSummary?: string;
  nextActions: string[];
}

export interface StartupRecognitionReport {
  checkedAt: string;
  applyDrift: boolean;
  registerMissing: boolean;
  verify: boolean;
  targets: StartupRecognitionTarget[];
}

export async function reconcileStartupConnections(
  engine: SkillEngine,
  options: StartupRecognitionOptions = {},
): Promise<StartupRecognitionReport> {
  if (options.verify) await engine.waitForReady();
  const targets = options.targets ?? RELEASE_SUPPORTED_IDES;
  const reconciledTargets: StartupRecognitionTarget[] = [];
  // Verification starts a short-lived stdio MCP process. Keep startup probes
  // sequential so opening the desktop app cannot create a burst of parallel
  // Electron/Node children on machines with several registered IDEs.
  for (const target of targets) {
    reconciledTargets.push(await reconcileTarget(engine, target, options));
  }
  return {
    checkedAt: new Date().toISOString(),
    applyDrift: !!options.applyDrift,
    registerMissing: !!options.registerMissing,
    verify: !!options.verify,
    targets: reconciledTargets,
  };
}

async function reconcileTarget(
  engine: SkillEngine,
  target: IdeTarget,
  options: StartupRecognitionOptions,
): Promise<StartupRecognitionTarget> {
  const configPath = options.configPaths?.[target] ?? defaultIdeConfigPath(target);
  try {
    let plan = await buildConnectPlan(target, {
      configPath,
      desiredServer: mcpServerConfigForTarget(target, options.desiredServer),
      dryRun: !(options.applyDrift || options.registerMissing),
    });

    if (!plan.currentRegistered) {
      if (options.registerMissing && plan.configExists) {
        plan = await applyConnectPlan(plan);
        if (!options.verify) {
          return {
            target,
            status: "registered",
            configPath: plan.configPath,
            plan,
            nextActions: ["Reload or restart the target Agent so it reads the new MCP config."],
          };
        }
        return withVerification(engine, plan, "registered");
      }
      return {
        target,
        status: "not-registered",
        configPath: plan.configPath,
        plan,
        nextActions: [
          `Run skill-central connect --target ${target} --config-path ${plan.configPath} --dry-run`,
          plan.configExists
            ? "Apply the connection plan when the target should use Skill Central."
            : "The target config was not found. Install/start the Agent first, then retry detection.",
        ],
      };
    }

    if (plan.serverDrift) {
      if (!options.applyDrift) {
        return {
          target,
          status: "drift",
          configPath: plan.configPath,
          plan,
          nextActions: [
            `Run skill-central register ${target} --config-path ${plan.configPath}`,
            "Review the plan before refreshing the existing skill-central entry.",
          ],
        };
      }

      plan = await applyConnectPlan(plan);
      if (!options.verify) {
        return {
          target,
          status: "refreshed",
          configPath: plan.configPath,
          plan,
          nextActions: ["Reload or restart the target Agent so it reads the refreshed MCP config."],
        };
      }
      return withVerification(engine, plan, "refreshed");
    }

    if (options.verify) {
      return withVerification(engine, plan, "verified");
    }

    return {
      target,
      status: "ready",
      configPath: plan.configPath,
      plan,
      nextActions: ["Run with verify=true to execute MCP initialize/prompts/list/tools/list."],
    };
  } catch (err) {
    return {
      target,
      status: "blocked",
      configPath,
      errorSummary: err instanceof Error ? err.message : String(err),
      nextActions: [
        "Fix the target MCP config parse/read error before applying startup recognition changes.",
      ],
    };
  }
}

async function withVerification(
  engine: SkillEngine,
  plan: OneClickConnectPlan,
  successStatus: "verified" | "refreshed" | "registered",
): Promise<StartupRecognitionTarget> {
  const verified = await verifyConnectPlan(plan, engine);
  const health = verified.health;
  const healthy = health?.status === "connected";
  return {
    target: plan.target,
    status: healthy ? successStatus : "verify-failed",
    configPath: plan.configPath,
    plan: verified,
    errorSummary: healthy ? undefined : health?.errorSummary,
    nextActions: healthy
      ? ["No action required."]
      : health?.nextActions ?? ["Inspect the configured MCP command and retry verification."],
  };
}
