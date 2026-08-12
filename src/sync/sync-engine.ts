// ============================================================================
// Sync / Engine Dry-Run
// ----------------------------------------------------------------------------
// Builds deterministic sync plans from local skill layers and a scanned remote
// registry checkout.
//
// Design intent:
// - Planning is side-effect free. No local/remote file is written here.
// - Layer sync policy is enforced before hash comparison so private/local-only
//   layers never accidentally appear as upload candidates.
// - The report keeps local/remote hashes and paths so future apply/audit code
//   can prove exactly what was planned.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SkillLayer } from "../storage/schemas.js";
import { discoverSkillFiles } from "../storage/reader.js";
import { scanRemoteRegistry, type RemoteRegistryScanReport } from "./scanner.js";

export type SyncDirection = "push" | "pull" | "both";
export type SyncOperationStatus =
  | "create-local"
  | "create-remote"
  | "update-local"
  | "update-remote"
  | "delete-local"
  | "delete-remote"
  | "conflict"
  | "noop"
  | "excluded-policy";

export interface SyncPlanOperation {
  status: SyncOperationStatus;
  layerId: string;
  relativePath: string;
  localPath?: string;
  remotePath?: string;
  localHash?: string;
  remoteHash?: string;
  reason: string;
}

export interface SyncPlan {
  direction: SyncDirection;
  dryRun: true;
  remoteRoot: string;
  generatedAt: string;
  operations: SyncPlanOperation[];
  counts: Record<SyncOperationStatus, number>;
  scanner: RemoteRegistryScanReport;
}

export interface BuildSyncPlanOptions {
  direction: SyncDirection;
  registryDir: string;
  layers: SkillLayer[];
}

export class SyncPlanValidationError extends Error {
  constructor(message: string, public readonly scanner?: RemoteRegistryScanReport) {
    super(message);
    this.name = "SyncPlanValidationError";
  }
}

interface IndexedFile {
  layerId: string;
  relativePath: string;
  fullPath: string;
  hash: string;
  syncEnabled: boolean;
}

export async function buildSyncPlan(options: BuildSyncPlanOptions): Promise<SyncPlan> {
  let scanner: RemoteRegistryScanReport;
  try {
    scanner = await scanRemoteRegistry(options.registryDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SyncPlanValidationError(`registry directory is invalid: ${detail}`);
  }
  if (!scanner.manifestOk || !scanner.manifest) {
    const detail = scanner.issues[0];
    const suffix = detail ? `: ${detail.fieldPath}: ${detail.reason}` : "";
    throw new SyncPlanValidationError(`registry manifest is invalid${suffix}`, scanner);
  }
  assertNonOverlappingLocalLayers(options.layers);
  const localLayerRoots = indexLocalLayerRoots(options.layers);
  const remoteLayerRoots = indexRemoteLayerRoots(scanner);
  const local = await indexLocalFiles(options.layers);
  const remote = await indexRemoteFiles(scanner);
  const keys = new Set([...local.keys(), ...remote.keys()]);
  const operations: SyncPlanOperation[] = [];

  for (const key of Array.from(keys).sort()) {
    const localFile = local.get(key);
    const remoteFile = remote.get(key);
    operations.push(classify(options.direction, key, localFile, remoteFile, {
      localLayerRoots,
      remoteLayerRoots,
    }));
  }

  return {
    direction: options.direction,
    dryRun: true,
    remoteRoot: scanner.root,
    generatedAt: new Date().toISOString(),
    operations,
    counts: countOperations(operations),
    scanner,
  };
}

function indexLocalLayerRoots(layers: SkillLayer[]): Map<string, string> {
  return new Map(layers.map((layer) => [layer.id, path.resolve(layer.path)]));
}

function indexRemoteLayerRoots(scanner: RemoteRegistryScanReport): Map<string, string> {
  if (!scanner.manifest) return new Map();
  return new Map(scanner.manifest.layers.map((layer) => [
    layer.id,
    path.join(scanner.root, layer.path),
  ]));
}

async function indexLocalFiles(layers: SkillLayer[]): Promise<Map<string, IndexedFile>> {
  const out = new Map<string, IndexedFile>();
  for (const layer of layers) {
    const files = await discoverSkillFiles(layer.path);
    for (const file of files) {
      const relativePath = toPosix(path.relative(layer.path, file));
      out.set(`${layer.id}/${relativePath}`, {
        layerId: layer.id,
        relativePath,
        fullPath: path.resolve(file),
        hash: await hashFile(file),
        syncEnabled: layer.sync.enabled,
      });
    }
  }
  return out;
}

async function indexRemoteFiles(scanner: RemoteRegistryScanReport): Promise<Map<string, IndexedFile>> {
  const out = new Map<string, IndexedFile>();
  if (!scanner.manifest) return out;
  for (const file of scanner.importableFiles) {
    const layer = scanner.manifest.layers.find((candidate) => {
      const prefix = `${candidate.path.replace(/\/+$/, "")}/`;
      return file.startsWith(prefix);
    });
    if (!layer) continue;
    const relativePath = file.slice(`${layer.path.replace(/\/+$/, "")}/`.length);
    const fullPath = path.join(scanner.root, file);
    out.set(`${layer.id}/${relativePath}`, {
      layerId: layer.id,
      relativePath,
      fullPath,
      hash: await hashFile(fullPath),
      syncEnabled: layer.sync.enabled,
    });
  }
  return out;
}

function classify(
  direction: SyncDirection,
  key: string,
  local: IndexedFile | undefined,
  remote: IndexedFile | undefined,
  roots: {
    localLayerRoots: Map<string, string>;
    remoteLayerRoots: Map<string, string>;
  },
): SyncPlanOperation {
  const [layerId, ...rest] = key.split("/");
  const relativePath = rest.join("/");
  const localPath = local?.fullPath ?? targetPath(roots.localLayerRoots, layerId!, relativePath);
  const remotePath = remote?.fullPath ?? targetPath(roots.remoteLayerRoots, layerId!, relativePath);
  const base = {
    layerId: layerId!,
    relativePath,
    // Missing-side paths are intentional: apply must use the user-reviewed plan
    // destination instead of recomputing where a create should land.
    localPath,
    remotePath,
    localHash: local?.hash,
    remoteHash: remote?.hash,
  };

  if (local && !local.syncEnabled) {
    return { ...base, status: "excluded-policy", reason: "local layer sync.enabled is false" };
  }
  if (remote && !remote.syncEnabled) {
    return { ...base, status: "excluded-policy", reason: "remote manifest layer sync.enabled is false" };
  }
  if (local && remote && local.hash === remote.hash) {
    return { ...base, status: "noop", reason: "local and remote hashes match" };
  }
  if (local && remote) {
    if (direction === "push") return { ...base, status: "update-remote", reason: "local and remote differ" };
    if (direction === "pull") return { ...base, status: "update-local", reason: "local and remote differ" };
    return { ...base, status: "conflict", reason: "local and remote differ; bidirectional dry-run cannot choose a winner" };
  }
  if (local && !remote) {
    if (direction === "pull") return { ...base, status: "noop", reason: "remote absence is not deletion evidence; kept local file" };
    return { ...base, status: "create-remote", reason: "remote missing" };
  }
  if (!local && remote) {
    if (direction === "push") return { ...base, status: "noop", reason: "local absence is not deletion evidence; kept remote file" };
    return { ...base, status: "create-local", reason: "local missing" };
  }
  return { ...base, status: "noop", reason: "no local or remote file" };
}

function assertNonOverlappingLocalLayers(layers: SkillLayer[]): void {
  const roots = layers.map((layer) => ({
    layer,
    root: canonicalPath(layer.path),
  }));
  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      const a = roots[i]!;
      const b = roots[j]!;
      if (a.root === b.root || isWithin(a.root, b.root) || isWithin(b.root, a.root)) {
        throw new SyncPlanValidationError(
          `local sync layers overlap: ${a.layer.id} (${a.layer.path}) and ${b.layer.id} (${b.layer.path})`,
        );
      }
    }
  }
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function targetPath(roots: Map<string, string>, layerId: string, relativePath: string): string | undefined {
  const root = roots.get(layerId);
  return root ? path.join(root, relativePath) : undefined;
}

function countOperations(operations: SyncPlanOperation[]): Record<SyncOperationStatus, number> {
  const statuses: SyncOperationStatus[] = [
    "create-local",
    "create-remote",
    "update-local",
    "update-remote",
    "delete-local",
    "delete-remote",
    "conflict",
    "noop",
    "excluded-policy",
  ];
  return Object.fromEntries(statuses.map((status) => [
    status,
    operations.filter((operation) => operation.status === status).length,
  ])) as Record<SyncOperationStatus, number>;
}

async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
