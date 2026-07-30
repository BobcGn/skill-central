import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { applyConnectPlan, buildConnectPlan } from "../connect/connect-plan.js";
import {
  emptyIdeConfig,
  removeSkillCentralServerConfig,
} from "../ide-detection/config-codec.js";
import { detectIdeRegistration } from "../ide-detection/detect.js";
import {
  defaultIdeConfigPath,
  getIdeDefinition,
  ideConfigPathCandidates,
  isIdeTarget,
  SUPPORTED_IDES,
} from "../ide-detection/registry.js";
import type { IdeTarget } from "../ide-detection/types.js";

export interface RegisterOptions {
  remove?: boolean;
}

export type IdeType = IdeTarget;

export async function cmdRegister(ideInput: string | undefined, opts: RegisterOptions): Promise<void> {
  const targets = resolveTargets(ideInput);
  for (const target of targets) {
    if (opts.remove) {
      await removeRegistration(target);
    } else {
      const plan = await buildConnectPlan(target);
      if (plan.currentRegistered) {
        console.log(`[${target}] skill-central is already registered.`);
        continue;
      }
      await applyConnectPlan(plan);
      console.log(`[${target}] Registered skill-central in ${plan.configPath}.`);
    }
  }
}

function resolveTargets(ideInput: string | undefined): IdeTarget[] {
  if (ideInput) {
    const target = ideInput.toLowerCase();
    if (!isIdeTarget(target)) {
      throw new Error(`Unsupported IDE: ${ideInput}. Supported IDEs: ${SUPPORTED_IDES.join(", ")}`);
    }
    return [target];
  }

  console.log("No IDE specified. Searching for all known MCP configuration files...");
  const detected = SUPPORTED_IDES.filter((target) =>
    ideConfigPathCandidates(target).some((candidate) => existsSync(candidate)),
  );
  if (detected.length === 0) {
    console.log("No existing IDE configurations found. Specify an IDE to create its default config.");
    return [];
  }
  console.log(`Found configurations for: ${detected.join(", ")}`);
  return detected;
}

async function removeRegistration(target: IdeTarget): Promise<void> {
  const configPath = defaultIdeConfigPath(target);
  const format = getIdeDefinition(target).configFormat;
  const registration = await detectIdeRegistration(target, { configPath });
  if (!registration.configExists) {
    console.log(`[${target}] Config file does not exist, nothing to remove.`);
    return;
  }
  if (!registration.configReadable) {
    throw new Error(`Cannot parse ${format.toUpperCase()} config at ${configPath}: ${registration.error}`);
  }
  if (!registration.registered) {
    console.log(`[${target}] skill-central is not registered, nothing to remove.`);
    return;
  }

  let raw = emptyIdeConfig(format);
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) throw err;
  }
  const next = removeSkillCentralServerConfig(raw, format);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, next, "utf-8");
  console.log(`[${target}] Removed skill-central from ${configPath}.`);
}
