// ============================================================================
// Adapters / Capability Loader
// ----------------------------------------------------------------------------
// Loads target capability declarations from adapter-owned YAML files.
//
// Design intent:
// - Capability matrices are data, not compiler branches. Keeping them in YAML
//   makes target differences auditable and lets docs/tests inspect the same
//   declarations used at runtime.
// - Missing capabilities default to `unknown`, which is conservative: required
//   unknown capabilities must degrade instead of being treated as usable.
// ============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { CapabilitySupport, CompileTarget, TargetCapability } from "./types.js";

const SUPPORT_VALUES = new Set<CapabilitySupport>([
  "supported",
  "partial",
  "unavailable",
  "unknown",
  "requires-user-approval",
]);

interface RawCapabilityEntry {
  support?: unknown;
  description?: unknown;
}

interface RawCapabilityFile {
  target?: unknown;
  capabilities?: unknown;
}

const cache = new Map<CompileTarget, TargetCapability[]>();

export function loadTargetCapabilities(target: CompileTarget): TargetCapability[] {
  const cached = cache.get(target);
  if (cached) return cached;

  const filePath = join(dirname(fileURLToPath(import.meta.url)), "capabilities", `${target}.yaml`);
  const raw = yaml.load(readFileSync(filePath, "utf-8")) as RawCapabilityFile;
  if (!raw || raw.target !== target || !isRecord(raw.capabilities)) {
    throw new Error(`Invalid capability matrix for target ${target}`);
  }

  const capabilities = Object.entries(raw.capabilities)
    .map(([name, value]) => normaliseCapability(name, value))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache.set(target, capabilities);
  return capabilities;
}

export function supportFromCapabilities(
  capabilities: TargetCapability[],
  capability: string,
): CapabilitySupport {
  return capabilities.find((entry) => entry.name === capability)?.support ?? "unknown";
}

function normaliseCapability(name: string, value: unknown): TargetCapability {
  if (typeof value === "string") {
    return { name, support: normaliseSupport(name, value) };
  }

  if (!isRecord(value)) {
    throw new Error(`Invalid capability entry ${name}; expected string or object`);
  }

  const entry = value as RawCapabilityEntry;
  return {
    name,
    support: normaliseSupport(name, entry.support),
    description: typeof entry.description === "string" ? entry.description : undefined,
  };
}

function normaliseSupport(name: string, value: unknown): CapabilitySupport {
  if (typeof value !== "string" || !SUPPORT_VALUES.has(value as CapabilitySupport)) {
    throw new Error(`Invalid support value for capability ${name}`);
  }
  return value as CapabilitySupport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
