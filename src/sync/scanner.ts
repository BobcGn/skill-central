// ============================================================================
// Sync / Remote Registry Scanner
// ----------------------------------------------------------------------------
// Dry-run scanner for a local checkout of a remote registry repo.
//
// Design intent:
// - Before sync apply exists, users need a safe way to inspect a registry repo
//   layout and see what would be importable.
// - The scanner does not write and does not require GitHub; it works on a local
//   directory so tests and desktop previews are deterministic.
// ============================================================================

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import {
  validateRegistryManifest,
  type RegistryManifest,
  type SyncValidationIssue,
} from "./manifest.js";
import { validateWorkspaceProfile } from "./workspace-profile.js";

export interface RemoteRegistryScanReport {
  root: string;
  manifestPath: string;
  manifestOk: boolean;
  manifest?: RegistryManifest;
  importableFiles: string[];
  workspaceProfiles: Array<{
    path: string;
    ok: boolean;
  }>;
  unknownFiles: string[];
  issues: SyncValidationIssue[];
}

const KNOWN_ROOT_FILES = new Set(["manifest.yaml", "manifest.yml", "lockfile.yaml", "lockfile.yml"]);
const SKILL_FILE_RE = /\.(ya?ml|json)$/;

export async function scanRemoteRegistry(rootDir: string): Promise<RemoteRegistryScanReport> {
  const root = resolveRegistryRoot(rootDir);
  const rootIssue = await validateRegistryRoot(root);
  const manifestPath = await findManifestPath(root);
  const issues: SyncValidationIssue[] = [];
  let manifestOk = false;
  let manifest: RegistryManifest | undefined;
  if (rootIssue) {
    issues.push({ filePath: root, fieldPath: "(root)", reason: rootIssue });
  }
  if (!manifestPath) {
    issues.push({ filePath: path.join(root, "manifest.yaml"), fieldPath: "(file)", reason: "manifest not found" });
  } else {
    try {
      const result = validateRegistryManifest(await parseYamlFile(manifestPath), manifestPath);
      manifestOk = !rootIssue && result.ok;
      if (manifestOk && result.value) manifest = result.value;
      issues.push(...result.issues);
    } catch (err) {
      issues.push({ filePath: manifestPath, fieldPath: "(file)", reason: `cannot parse manifest: ${errorMessage(err)}` });
    }
  }

  const importableFiles: string[] = [];
  const workspaceProfiles: RemoteRegistryScanReport["workspaceProfiles"] = [];
  const unknownFiles: string[] = [];
  await walk(root, async (filePath) => {
    const rel = toPosix(path.relative(root, filePath));
    if (isKnownRootFile(rel) || rel.startsWith("audit/")) return;
    if (rel.startsWith("layers/") && SKILL_FILE_RE.test(rel)) {
      importableFiles.push(rel);
      return;
    }
    if (rel.startsWith("workspaces/") && /\.profile\.ya?ml$/.test(rel)) {
      const result = validateWorkspaceProfile(await parseYamlFile(filePath), filePath);
      workspaceProfiles.push({ path: rel, ok: result.ok });
      issues.push(...result.issues);
      return;
    }
    unknownFiles.push(rel);
  });

  return {
    root,
    manifestPath: manifestPath ?? path.join(root, "manifest.yaml"),
    manifestOk,
    manifest,
    importableFiles: importableFiles.sort(),
    workspaceProfiles: workspaceProfiles.sort((a, b) => a.path.localeCompare(b.path)),
    unknownFiles: unknownFiles.sort(),
    issues,
  };
}

export function resolveRegistryRoot(rootDir: string, home: string = homedir()): string {
  const input = rootDir.trim();
  if (!input) throw new Error("registry directory must be a non-empty path");
  if (input === "~") return path.resolve(home);
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.resolve(home, input.slice(2));
  }
  const normalized = input.replace(/\\/g, "/");
  if (/^(?:[A-Za-z]:)?\/~(?:\/|$)/.test(normalized)) {
    throw new Error(`invalid registry path ${input}; use ~/.skill-central without a leading slash`);
  }
  return path.resolve(input);
}

async function validateRegistryRoot(root: string): Promise<string | undefined> {
  try {
    const rootStat = await stat(root);
    return rootStat.isDirectory() ? undefined : "registry root is not a directory";
  } catch {
    return "registry root does not exist or is not readable";
  }
}

async function findManifestPath(root: string): Promise<string | undefined> {
  for (const name of ["manifest.yaml", "manifest.yml"]) {
    const candidate = path.join(root, name);
    try {
      const st = await stat(candidate);
      if (st.isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

async function parseYamlFile(filePath: string): Promise<unknown> {
  return parseYaml(await readFile(filePath, "utf-8"));
}

async function walk(dir: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, visit);
    } else if (entry.isFile()) {
      await visit(full);
    }
  }
}

function isKnownRootFile(relativePath: string): boolean {
  return !relativePath.includes("/") && KNOWN_ROOT_FILES.has(relativePath);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
