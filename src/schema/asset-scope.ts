// ============================================================================
// Schema / Shared Asset Scope
// ----------------------------------------------------------------------------
// Defines the project applicability contract shared by Skills and Rules.
//
// Design intent:
// - Missing `appliesTo` remains equivalent to `global`, preserving every
//   pre-scope asset without requiring a migration.
// - Project ids are stable, serialisable identities. Git remotes are preferred
//   across clones; absolute path ids provide a deterministic local fallback.
// - Validation and normalisation live here so storage, CLI, and query surfaces
//   cannot interpret project scope differently.
// ============================================================================

import path from "node:path";

export type AssetScope = "global" | ProjectAssetScope;

export interface ProjectAssetScope {
  projects: string[];
}

export interface AssetScopeContext {
  projectIds: string[];
}

export interface AssetScopeValidationIssue {
  fieldPath: string;
  reason: string;
}

export function validateAssetScope(
  value: unknown,
  fieldPath = "appliesTo",
): AssetScopeValidationIssue[] {
  if (value === undefined || value === "global") return [];
  if (!isPlainObject(value)) {
    return [{ fieldPath, reason: 'expected "global" or an object with projects' }];
  }
  for (const key of Object.keys(value)) {
    if (key !== "projects") {
      return [{ fieldPath: `${fieldPath}.${key}`, reason: "unknown scope field" }];
    }
  }
  if (!Array.isArray(value.projects) || value.projects.length === 0) {
    return [{ fieldPath: `${fieldPath}.projects`, reason: "expected non-empty array" }];
  }

  const issues: AssetScopeValidationIssue[] = [];
  const seen = new Set<string>();
  value.projects.forEach((projectId, index) => {
    const projectPath = `${fieldPath}.projects[${index}]`;
    if (typeof projectId !== "string" || projectId.trim().length === 0) {
      issues.push({ fieldPath: projectPath, reason: "expected non-empty project id" });
      return;
    }
    let normalised: string;
    try {
      normalised = normaliseProjectId(projectId);
    } catch (err) {
      issues.push({
        fieldPath: projectPath,
        reason: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (seen.has(normalised)) {
      issues.push({ fieldPath: projectPath, reason: `duplicate project id: ${normalised}` });
    }
    seen.add(normalised);
  });
  return issues;
}

export function normaliseAssetScope(value: unknown): AssetScope {
  // Backward compatibility is deliberate: all assets written before the
  // appliesTo field existed must continue to load in every project.
  if (value === undefined || value === "global") return "global";
  const issues = validateAssetScope(value);
  if (issues.length > 0) {
    throw new Error(`${issues[0]!.fieldPath}: ${issues[0]!.reason}`);
  }
  const projects = (value as { projects: string[] }).projects.map(normaliseProjectId);
  return { projects: [...new Set(projects)].sort((a, b) => a.localeCompare(b)) };
}

export function assetAppliesTo(
  scope: AssetScope | undefined,
  context: AssetScopeContext,
): boolean {
  const normalisedScope = scope ?? "global";
  if (normalisedScope === "global") return true;
  // The context can contain both the canonical git id and a path alias. A
  // match against either keeps a scoped asset usable before/after a remote is
  // configured, while persisted scopes still prefer the stable git identity.
  const current = new Set(context.projectIds.map(normaliseProjectId));
  return normalisedScope.projects.some((projectId) => current.has(normaliseProjectId(projectId)));
}

export function normaliseProjectId(input: string): string {
  const value = input.trim();
  if (value.startsWith("git:")) {
    const remote = value.slice(4).replace(/\/+$/, "").replace(/\.git$/i, "");
    const slash = remote.indexOf("/");
    if (slash <= 0 || slash === remote.length - 1 || /\s/.test(remote)) {
      throw new Error("invalid git project id; expected git:<host>/<owner>/<repo>");
    }
    const host = remote.slice(0, slash).toLowerCase();
    // GitHub owner/repository paths are case-insensitive. Other hosts retain
    // path casing because the same guarantee is not universal.
    const repositoryPath = host === "github.com"
      ? remote.slice(slash + 1).toLowerCase()
      : remote.slice(slash + 1);
    return `git:${host}/${repositoryPath}`;
  }
  if (value.startsWith("path:")) {
    const projectPath = value.slice(5);
    // A leading slash is absolute in both path implementations. Prefer POSIX
    // first so macOS/Linux identities never acquire Windows separators; only
    // explicit drive-letter or UNC forms enter the Windows normalizer.
    const isPosixPath = path.posix.isAbsolute(projectPath);
    const isWindowsPath = !isPosixPath && path.win32.isAbsolute(projectPath);
    if (!isPosixPath && !isWindowsPath) {
      throw new Error("invalid path project id; expected path:<absolute-path>");
    }
    return `path:${isWindowsPath ? path.win32.normalize(projectPath) : path.posix.normalize(projectPath)}`;
  }
  throw new Error("invalid project id; expected git:<host>/<owner>/<repo> or path:<absolute-path>");
}

export function formatAssetScope(scope: AssetScope | undefined): string {
  const normalised = scope ?? "global";
  return normalised === "global" ? "global" : normalised.projects.join(", ");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
