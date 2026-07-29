// ============================================================================
// Sync / Workspace Profile
// ----------------------------------------------------------------------------
// Runtime validation for workspace profile files stored in a remote registry.
//
// Design intent:
// - Workspace profiles may describe enabled layers and approved repo identity,
//   but must not leak local absolute paths or session history by default.
// - Validation is deliberately strict around privacy fields because these files
//   are intended to sync across devices.
// ============================================================================

import type { SyncValidationIssue, SyncValidationResult } from "./manifest.js";

export const WORKSPACE_PROFILE_SCHEMA_VERSION = "skillcentral.dev/workspace-profile/v1" as const;

export interface WorkspaceProfile {
  schemaVersion: typeof WORKSPACE_PROFILE_SCHEMA_VERSION;
  id: string;
  name: string;
  repo?: {
    provider: "github";
    owner: string;
    name: string;
    visibility: "private" | "team" | "public";
  };
  privacy: {
    persistRepoIdentity: "user-approved" | "disabled";
  };
  layers: {
    enabled: string[];
  };
  sync: {
    includeProjectRules: boolean;
    includeSessionState: false;
  };
}

export function validateWorkspaceProfile(
  value: unknown,
  filePath: string,
): SyncValidationResult<WorkspaceProfile> {
  const issues: SyncValidationIssue[] = [];
  const issue = (fieldPath: string, reason: string) => issues.push({ filePath, fieldPath, reason });

  if (!isRecord(value)) {
    issue("(root)", "expected object");
    return { ok: false, issues };
  }

  if (value.schemaVersion !== WORKSPACE_PROFILE_SCHEMA_VERSION) {
    issue("schemaVersion", `expected ${WORKSPACE_PROFILE_SCHEMA_VERSION}`);
  }
  if (!nonEmptyString(value.id)) issue("id", "required non-empty string");
  if (!nonEmptyString(value.name)) issue("name", "required non-empty string");
  validateRepo(value.repo, issue);
  validatePrivacy(value.privacy, issue);
  validateLayers(value.layers, issue);
  validateSync(value.sync, issue);

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: value as unknown as WorkspaceProfile, issues };
}

function validateRepo(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issue("repo", "expected object");
    return;
  }
  if (value.provider !== "github") issue("repo.provider", "expected github");
  if (!nonEmptyString(value.owner)) issue("repo.owner", "required non-empty string");
  if (!nonEmptyString(value.name)) issue("repo.name", "required non-empty string");
  if (!isOneOf(value.visibility, ["private", "team", "public"])) {
    issue("repo.visibility", "expected private, team, or public");
  }
}

function validatePrivacy(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (!isRecord(value)) {
    issue("privacy", "required object");
    return;
  }
  if (!isOneOf(value.persistRepoIdentity, ["user-approved", "disabled"])) {
    issue("privacy.persistRepoIdentity", "expected user-approved or disabled");
  }
}

function validateLayers(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (!isRecord(value)) {
    issue("layers", "required object");
    return;
  }
  if (!Array.isArray(value.enabled) || !value.enabled.every(nonEmptyString)) {
    issue("layers.enabled", "expected array of non-empty strings");
  }
}

function validateSync(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (!isRecord(value)) {
    issue("sync", "required object");
    return;
  }
  if (typeof value.includeProjectRules !== "boolean") {
    issue("sync.includeProjectRules", "expected boolean");
  }
  if (value.includeSessionState !== false) {
    issue("sync.includeSessionState", "must be false");
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && looksAbsolutePath(entry)) {
      issue(`sync.${key}`, "absolute paths are not allowed in workspace profiles");
    }
  }
}

function looksAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
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
