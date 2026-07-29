// ============================================================================
// Sync / Apply Transaction
// ----------------------------------------------------------------------------
// Applies a Phase 4D sync plan to local skill layers and a local registry
// checkout.
//
// Design intent:
// - Apply consumes a previously generated SyncPlan shape. It must not
//   reclassify files, because the plan is the user-reviewable evidence.
// - Destructive writes are explicit: update/delete require --force and create a
//   backup before touching the destination.
// - Blocked operations are detected before any file write. This keeps users out
//   of partial-success states where creates happened but conflicts remain.
// - Every apply attempt writes an audit event under app state so desktop builds
//   can show what changed, what was skipped, and where backups live.
// ============================================================================

import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { AppStateManifest } from "../local-store/app-state.js";
import type { SyncPlan, SyncPlanOperation, SyncOperationStatus } from "./sync-engine.js";

export type SyncApplyOperationStatus =
  | "applied"
  | "skipped"
  | "blocked";

export interface SyncApplyOperationResult {
  plannedStatus: SyncOperationStatus;
  applyStatus: SyncApplyOperationStatus;
  layerId: string;
  relativePath: string;
  localPath?: string;
  remotePath?: string;
  backupPath?: string;
  reason: string;
}

export interface SyncApplyReport {
  schemaVersion: "skillcentral.dev/sync-apply/v1";
  appliedAt: string;
  planHash: string;
  direction: SyncPlan["direction"];
  remoteRoot: string;
  force: boolean;
  preflightBlocked: boolean;
  auditPath: string;
  operations: SyncApplyOperationResult[];
  counts: Record<SyncApplyOperationStatus, number>;
}

export interface ApplySyncPlanOptions {
  appState: AppStateManifest;
  force: boolean;
  backupStamp?: string;
}

const BLOCKED_STATUSES = new Set<SyncOperationStatus>(["conflict"]);
const SKIPPED_STATUSES = new Set<SyncOperationStatus>(["noop", "excluded-policy"]);
const FORCE_REQUIRED_STATUSES = new Set<SyncOperationStatus>([
  "update-local",
  "update-remote",
  "delete-local",
  "delete-remote",
]);

export async function applySyncPlan(
  plan: SyncPlan,
  options: ApplySyncPlanOptions,
): Promise<SyncApplyReport> {
  const planHash = hashPlan(plan);
  const backupStamp = options.backupStamp ?? timestamp();
  const preflight = buildPreflightReport(plan.operations, options.force);
  const preflightBlocked = preflight.some((operation) => operation.applyStatus === "blocked");

  const operations = preflightBlocked
    ? preflight
    : await applyPreflight(plan.operations, preflight, backupStamp);

  const report: SyncApplyReport = {
    schemaVersion: "skillcentral.dev/sync-apply/v1",
    appliedAt: new Date().toISOString(),
    planHash,
    direction: plan.direction,
    remoteRoot: plan.remoteRoot,
    force: options.force,
    preflightBlocked,
    auditPath: auditPath(options.appState, backupStamp),
    operations,
    counts: countApplyOperations(operations),
  };
  await writeAuditReport(report);
  if (preflightBlocked) {
    throw new SyncApplyBlockedError(report);
  }
  return report;
}

export class SyncApplyBlockedError extends Error {
  constructor(public readonly report: SyncApplyReport) {
    super("Sync apply blocked; review conflicts, policy exclusions, or rerun with --force where appropriate.");
  }
}

async function applyOperation(
  operation: SyncPlanOperation,
  backupStamp: string,
): Promise<SyncApplyOperationResult> {
  const identity = operationIdentity(operation);
  if (operation.status === "create-local") {
    await copyRequired(operation.remotePath, operation.localPath, "remotePath", "localPath");
    return { ...identity, applyStatus: "applied", reason: "created local file from remote" };
  }
  if (operation.status === "create-remote") {
    await copyRequired(operation.localPath, operation.remotePath, "localPath", "remotePath");
    return { ...identity, applyStatus: "applied", reason: "created remote file from local" };
  }
  if (operation.status === "update-local") {
    const backupPath = await backupRequired(operation.localPath, backupStamp, "localPath");
    await copyRequired(operation.remotePath, operation.localPath, "remotePath", "localPath");
    return { ...identity, applyStatus: "applied", backupPath, reason: "updated local file from remote" };
  }
  if (operation.status === "update-remote") {
    const backupPath = await backupRequired(operation.remotePath, backupStamp, "remotePath");
    await copyRequired(operation.localPath, operation.remotePath, "localPath", "remotePath");
    return { ...identity, applyStatus: "applied", backupPath, reason: "updated remote file from local" };
  }
  if (operation.status === "delete-local") {
    const backupPath = await backupRequired(operation.localPath, backupStamp, "localPath");
    await rmRequired(operation.localPath, "localPath");
    return { ...identity, applyStatus: "applied", backupPath, reason: "deleted local file after backup" };
  }
  if (operation.status === "delete-remote") {
    const backupPath = await backupRequired(operation.remotePath, backupStamp, "remotePath");
    await rmRequired(operation.remotePath, "remotePath");
    return { ...identity, applyStatus: "applied", backupPath, reason: "deleted remote file after backup" };
  }
  return { ...identity, applyStatus: "skipped", reason: `no apply behavior for ${operation.status}` };
}

function buildPreflightReport(
  operations: SyncPlanOperation[],
  force: boolean,
): SyncApplyOperationResult[] {
  const hasBlocker = operations.some((operation) => !!classifyBlocked(operation, force));
  return operations.map((operation) => {
    const blocked = classifyBlocked(operation, force);
    if (blocked) {
      return { ...operationIdentity(operation), applyStatus: "blocked", reason: blocked };
    }
    if (SKIPPED_STATUSES.has(operation.status)) {
      return {
        ...operationIdentity(operation),
        applyStatus: "skipped",
        reason: operation.status === "noop" ? "planned noop" : operation.reason,
      };
    }
    if (hasBlocker) {
      return {
        ...operationIdentity(operation),
        applyStatus: "skipped",
        reason: "preflight blocked; no file writes were applied",
      };
    }
    return {
      ...operationIdentity(operation),
      applyStatus: "skipped",
      reason: "preflight clear; operation will be applied",
    };
  });
}

async function applyPreflight(
  planOperations: SyncPlanOperation[],
  preflight: SyncApplyOperationResult[],
  backupStamp: string,
): Promise<SyncApplyOperationResult[]> {
  const byKey = new Map(preflight.map((operation) => [operationKey(operation), operation]));
  const out: SyncApplyOperationResult[] = [];
  for (const operation of planOperations) {
    const preflightResult = byKey.get(planOperationKey(operation));
    if (preflightResult?.reason !== "preflight clear; operation will be applied") {
      out.push(preflightResult ?? { ...operationIdentity(operation), applyStatus: "skipped", reason: "missing preflight result" });
      continue;
    }
    out.push(await applyOperation(operation, backupStamp));
  }
  return out;
}

function classifyBlocked(operation: SyncPlanOperation, force: boolean): string | undefined {
  if (BLOCKED_STATUSES.has(operation.status)) {
    return "planned conflict requires an explicit resolution before apply";
  }
  if (FORCE_REQUIRED_STATUSES.has(operation.status) && !force) {
    return `${operation.status} requires --force because it overwrites or deletes an existing file`;
  }
  return undefined;
}

async function copyRequired(
  from: string | undefined,
  to: string | undefined,
  fromField: string,
  toField: string,
): Promise<void> {
  if (!from) throw new Error(`Cannot apply sync operation: missing ${fromField}`);
  if (!to) throw new Error(`Cannot apply sync operation: missing ${toField}`);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
}

async function backupRequired(filePath: string | undefined, backupStamp: string, field: string): Promise<string> {
  if (!filePath) throw new Error(`Cannot backup sync operation: missing ${field}`);
  const backupPath = `${filePath}.bak.${backupStamp}`;
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
  return backupPath;
}

async function rmRequired(filePath: string | undefined, field: string): Promise<void> {
  if (!filePath) throw new Error(`Cannot delete sync operation: missing ${field}`);
  await rm(filePath);
}

function operationIdentity(operation: SyncPlanOperation): Omit<SyncApplyOperationResult, "applyStatus" | "reason"> {
  return {
    plannedStatus: operation.status,
    layerId: operation.layerId,
    relativePath: operation.relativePath,
    localPath: operation.localPath,
    remotePath: operation.remotePath,
  };
}

function operationKey(operation: Pick<SyncApplyOperationResult, "plannedStatus" | "layerId" | "relativePath">): string {
  return `${operation.plannedStatus}:${operation.layerId}/${operation.relativePath}`;
}

function planOperationKey(operation: SyncPlanOperation): string {
  return `${operation.status}:${operation.layerId}/${operation.relativePath}`;
}

async function writeAuditReport(report: SyncApplyReport): Promise<void> {
  await mkdir(path.dirname(report.auditPath), { recursive: true });
  await writeFile(report.auditPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

function auditPath(appState: AppStateManifest, stamp: string): string {
  return path.join(appState.paths.audit, `sync-apply.${stamp}.json`);
}

function countApplyOperations(
  operations: SyncApplyOperationResult[],
): Record<SyncApplyOperationStatus, number> {
  const statuses: SyncApplyOperationStatus[] = ["applied", "skipped", "blocked"];
  return Object.fromEntries(statuses.map((status) => [
    status,
    operations.filter((operation) => operation.applyStatus === status).length,
  ])) as Record<SyncApplyOperationStatus, number>;
}

function hashPlan(plan: SyncPlan): string {
  return createHash("sha256").update(stableJson({
    direction: plan.direction,
    remoteRoot: plan.remoteRoot,
    operations: plan.operations,
  })).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
