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
  const root = path.resolve(rootDir);
  const manifestPath = await findManifestPath(root);
  const issues: SyncValidationIssue[] = [];
  let manifestOk = false;
  let manifest: RegistryManifest | undefined;
  if (!manifestPath) {
    issues.push({ filePath: path.join(root, "manifest.yaml"), fieldPath: "(file)", reason: "manifest not found" });
  } else {
    const result = validateRegistryManifest(await parseYamlFile(manifestPath), manifestPath);
    manifestOk = result.ok;
    if (result.value) manifest = result.value;
    issues.push(...result.issues);
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
