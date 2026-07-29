// ============================================================================
// Sync / Remote Registry Manifest
// ----------------------------------------------------------------------------
// Runtime validation for the remote registry manifest.
//
// Design intent:
// - Freeze the repo-level contract before any push/pull implementation exists.
// - Return field-path issues instead of throwing so CLI/Web UI can present a
//   dry-run report with every problem at once.
// - Keep the schema independent from GitHub APIs; the same layout can be
//   scanned from a local checkout, tarball, or future remote content API.
// ============================================================================

export const REGISTRY_MANIFEST_SCHEMA_VERSION = "skillcentral.dev/registry/v1" as const;

export interface RegistryManifest {
  schemaVersion: typeof REGISTRY_MANIFEST_SCHEMA_VERSION;
  owner: {
    provider: "github";
    login: string;
  };
  defaults: {
    visibility: "private" | "team" | "public";
    syncMode: "push" | "pull" | "bidirectional";
  };
  layers: RegistryManifestLayer[];
}

export interface RegistryManifestLayer {
  id: string;
  path: string;
  scope: "user" | "workspace" | "repo" | "team" | "org" | "session";
  sync: {
    enabled: boolean;
    direction?: "push" | "pull" | "bidirectional";
  };
  visibility: "private" | "team" | "public";
}

export interface SyncValidationIssue {
  filePath: string;
  fieldPath: string;
  reason: string;
}

export interface SyncValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: SyncValidationIssue[];
}

export function validateRegistryManifest(
  value: unknown,
  filePath: string,
): SyncValidationResult<RegistryManifest> {
  const issues: SyncValidationIssue[] = [];
  const issue = (fieldPath: string, reason: string) => issues.push({ filePath, fieldPath, reason });

  if (!isRecord(value)) {
    issue("(root)", "expected object");
    return { ok: false, issues };
  }

  if (value.schemaVersion !== REGISTRY_MANIFEST_SCHEMA_VERSION) {
    issue("schemaVersion", `expected ${REGISTRY_MANIFEST_SCHEMA_VERSION}`);
  }

  if (!isRecord(value.owner)) {
    issue("owner", "required object");
  } else {
    if (value.owner.provider !== "github") issue("owner.provider", "expected github");
    if (!nonEmptyString(value.owner.login)) issue("owner.login", "required non-empty string");
  }

  if (!isRecord(value.defaults)) {
    issue("defaults", "required object");
  } else {
    if (!isOneOf(value.defaults.visibility, ["private", "team", "public"])) {
      issue("defaults.visibility", "expected private, team, or public");
    }
    if (!isOneOf(value.defaults.syncMode, ["push", "pull", "bidirectional"])) {
      issue("defaults.syncMode", "expected push, pull, or bidirectional");
    }
  }

  if (!Array.isArray(value.layers) || value.layers.length === 0) {
    issue("layers", "required non-empty array");
  } else {
    value.layers.forEach((layer, index) => validateLayer(layer, `layers[${index}]`, issue));
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: value as unknown as RegistryManifest, issues };
}

function validateLayer(
  value: unknown,
  fieldPath: string,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (!isRecord(value)) {
    issue(fieldPath, "expected object");
    return;
  }
  if (!nonEmptyString(value.id)) issue(`${fieldPath}.id`, "required non-empty string");
  if (!nonEmptyString(value.path)) issue(`${fieldPath}.path`, "required non-empty string");
  if (!isOneOf(value.scope, ["user", "workspace", "repo", "team", "org", "session"])) {
    issue(`${fieldPath}.scope`, "expected user, workspace, repo, team, org, or session");
  }
  if (!isRecord(value.sync)) {
    issue(`${fieldPath}.sync`, "required object");
  } else {
    if (typeof value.sync.enabled !== "boolean") issue(`${fieldPath}.sync.enabled`, "expected boolean");
    if (value.sync.direction !== undefined && !isOneOf(value.sync.direction, ["push", "pull", "bidirectional"])) {
      issue(`${fieldPath}.sync.direction`, "expected push, pull, or bidirectional");
    }
  }
  if (!isOneOf(value.visibility, ["private", "team", "public"])) {
    issue(`${fieldPath}.visibility`, "expected private, team, or public");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
