// ============================================================================
// Storage / Layers
// ----------------------------------------------------------------------------
// Layer configuration schema, legacy promotion, and deterministic resolution.
//
// Design intent:
// - A layer is an asset governance boundary, not a hard-coded directory name.
//   The old 01-global/02-workflows/03-domains/04-tech-stack directories are
//   still supported, but their meaning is now expressed as layer metadata.
// - Legacy three-field layer configs are promoted here so every downstream
//   module can depend on complete SkillLayer objects.
// - Conflict resolution is centralized here. If two candidates cannot be
//   distinguished by priority or scope distance, callers must mark a conflict
//   instead of letting map insertion order pick a winner.
// ============================================================================

import { homedir } from "node:os";
import path from "node:path";
import type {
  LayerProvenance,
  LayerScope,
  LayerTrust,
  LayerVisibility,
  SkillLayer,
} from "../schema/universal-skill.js";

export interface RawLayerConfig {
  id?: unknown;
  name?: unknown;
  path?: unknown;
  scope?: unknown;
  priority?: unknown;
  writable?: unknown;
  trust?: unknown;
  sync?: unknown;
  visibility?: unknown;
  activation?: unknown;
}

export interface LayerValidationIssue {
  fieldPath: string;
  reason: string;
}

export interface LayerParseResult {
  layers: SkillLayer[];
  issues: LayerValidationIssue[];
}

const VALID_SCOPES = new Set<LayerScope>([
  "user",
  "workspace",
  "repo",
  "team",
  "org",
  "session",
]);

const VALID_TRUST = new Set<LayerTrust>(["local", "remote", "org", "verified"]);
const VALID_VISIBILITY = new Set<LayerVisibility>(["private", "team", "public"]);

const LEGACY_LAYER_DEFAULTS: Record<
  string,
  Pick<SkillLayer, "scope" | "writable" | "trust" | "sync" | "visibility">
> = {
  "01-global": {
    scope: "user",
    writable: true,
    trust: "local",
    sync: { enabled: true },
    visibility: "private",
  },
  "02-workflows": {
    scope: "workspace",
    writable: true,
    trust: "local",
    sync: { enabled: false },
    visibility: "private",
  },
  "03-domains": {
    scope: "workspace",
    writable: true,
    trust: "local",
    sync: { enabled: false },
    visibility: "private",
  },
  "04-tech-stack": {
    scope: "workspace",
    writable: true,
    trust: "local",
    sync: { enabled: false },
    visibility: "private",
  },
};

export const DEFAULT_LEGACY_LAYERS: SkillLayer[] = [
  promoteLayer({ name: "01-global", path: ".skills/01-global", priority: 10 }, 0).layer,
  promoteLayer({ name: "02-workflows", path: ".skills/02-workflows", priority: 20 }, 1).layer,
  promoteLayer({ name: "03-domains", path: ".skills/03-domains", priority: 30 }, 2).layer,
  promoteLayer({ name: "04-tech-stack", path: ".skills/04-tech-stack", priority: 40 }, 3).layer,
];

export function parseLayerConfigs(rawLayers: unknown): LayerParseResult {
  const issues: LayerValidationIssue[] = [];
  if (!Array.isArray(rawLayers)) {
    return {
      layers: [],
      issues: [{ fieldPath: "layers", reason: "expected array" }],
    };
  }

  const layers: SkillLayer[] = [];
  rawLayers.forEach((raw, index) => {
    if (!isPlainObject(raw)) {
      issues.push({ fieldPath: `layers[${index}]`, reason: "expected object" });
      return;
    }
    const result = promoteLayer(raw, index);
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        issues.push({
          fieldPath: `layers[${index}].${issue.fieldPath}`,
          reason: issue.reason,
        });
      }
      return;
    }
    layers.push(result.layer);
  });

  return { layers, issues };
}

export function promoteLayer(
  raw: RawLayerConfig,
  index: number,
): { layer: SkillLayer; issues: LayerValidationIssue[] } {
  const issues: LayerValidationIssue[] = [];
  const name = nonEmptyString(raw.name) ? raw.name : nonEmptyString(raw.id) ? raw.id : "";
  const id = nonEmptyString(raw.id) ? raw.id : slugLayerId(name || `layer-${index}`);
  const layerPath = nonEmptyString(raw.path) ? expandHome(raw.path) : "";
  const priority = typeof raw.priority === "number" ? raw.priority : Number(raw.priority);

  if (!nonEmptyString(id)) issues.push({ fieldPath: "id", reason: "required non-empty string" });
  if (!nonEmptyString(name)) issues.push({ fieldPath: "name", reason: "required non-empty string" });
  if (!nonEmptyString(layerPath)) issues.push({ fieldPath: "path", reason: "required non-empty string" });
  if (!Number.isFinite(priority)) issues.push({ fieldPath: "priority", reason: "expected number" });

  const defaults = LEGACY_LAYER_DEFAULTS[name] ?? defaultLayerGovernance(id);
  const scope = parseEnum(raw.scope, VALID_SCOPES, defaults.scope, "scope", issues);
  const trust = parseEnum(raw.trust, VALID_TRUST, defaults.trust, "trust", issues);
  const visibility = parseEnum(
    raw.visibility,
    VALID_VISIBILITY,
    defaults.visibility,
    "visibility",
    issues,
  );

  const sync = parseSync(raw.sync, defaults.sync.enabled);
  const writable = typeof raw.writable === "boolean" ? raw.writable : defaults.writable;

  return {
    layer: {
      id,
      name,
      path: layerPath,
      scope,
      priority,
      writable,
      trust,
      sync,
      visibility,
      activation: isPlainObject(raw.activation) ? raw.activation : undefined,
    },
    issues,
  };
}

export function layerProvenance(layer: SkillLayer): LayerProvenance {
  return {
    id: layer.id,
    name: layer.name,
    path: layer.path,
    scope: layer.scope,
    priority: layer.priority,
    writable: layer.writable,
    trust: layer.trust,
    sync: layer.sync,
    visibility: layer.visibility,
  };
}

export function compareLayerPrecedence(a: SkillLayer, b: SkillLayer): number {
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  const scopeDelta = scopeDistance(a.scope) - scopeDistance(b.scope);
  if (scopeDelta !== 0) {
    return scopeDelta;
  }
  return 0;
}

export function layerConflictReason(a: SkillLayer, b: SkillLayer): string {
  if (a.priority === b.priority && scopeDistance(a.scope) === scopeDistance(b.scope)) {
    return `same priority (${a.priority}) and same scope distance (${scopeDistance(a.scope)})`;
  }
  return "resolved by priority or scope distance";
}

export function scopeDistance(scope: LayerScope): number {
  // The current execution context is a workspace. Session is closest, then
  // workspace/repo, then broader user/team/org governance. This only breaks
  // ties after priority, so explicit priority remains the primary override API.
  const distances: Record<LayerScope, number> = {
    session: 0,
    workspace: 1,
    repo: 1,
    user: 2,
    team: 3,
    org: 4,
  };
  return distances[scope];
}

export function slugLayerId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "layer";
}

function defaultLayerGovernance(id: string) {
  const isPackage = id.includes("package");
  return {
    scope: "workspace" as LayerScope,
    writable: !isPackage,
    trust: isPackage ? ("remote" as LayerTrust) : ("local" as LayerTrust),
    sync: { enabled: isPackage },
    visibility: "private" as LayerVisibility,
  };
}

function parseSync(value: unknown, fallback: boolean) {
  if (isPlainObject(value) && typeof value.enabled === "boolean") {
    return { enabled: value.enabled };
  }
  return { enabled: fallback };
}

function parseEnum<T extends string>(
  value: unknown,
  valid: Set<T>,
  fallback: T,
  fieldPath: string,
  issues: LayerValidationIssue[],
): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && valid.has(value as T)) return value as T;
  issues.push({
    fieldPath,
    reason: `expected one of: ${Array.from(valid).join(", ")}`,
  });
  return fallback;
}

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
