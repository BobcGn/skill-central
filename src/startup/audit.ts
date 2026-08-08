// ============================================================================
// Startup / Recognition Audit
// ----------------------------------------------------------------------------
// Persists compact startup recognition evidence in app-state audit storage.
//
// Design intent:
// - Audit records must explain what was checked and what the user should do
//   without storing long diffs, stderr dumps, or environment variables.
// - The source report remains the runtime contract; this module stores a stable
//   summary suitable for release and support diagnostics.
// ============================================================================

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureAppState } from "../local-store/app-state.js";
import type { StartupRecognitionReport, StartupRecognitionTarget } from "./reconciler.js";

export interface StartupRecognitionAuditOptions {
  appStateDir?: string;
}

export interface StartupRecognitionAuditRecord {
  schemaVersion: "skillcentral.dev/startup-recognition-audit/v1";
  auditedAt: string;
  checkedAt: string;
  applyDrift: boolean;
  verify: boolean;
  counts: Record<string, number>;
  targets: StartupRecognitionAuditTarget[];
}

export interface StartupRecognitionAuditTarget {
  target: string;
  status: string;
  configPath: string;
  currentCommand?: string;
  desiredCommand?: string;
  desiredArgs?: string[];
  backupPath?: string;
  healthStatus?: string;
  errorSummary?: string;
  nextActions: string[];
}

export interface StartupRecognitionAuditWrite {
  auditPath: string;
  record: StartupRecognitionAuditRecord;
}

const AUDIT_PREFIX = "startup-recognition.";
const AUDIT_SUFFIX = ".json";

export async function writeStartupRecognitionAudit(
  report: StartupRecognitionReport,
  options: StartupRecognitionAuditOptions = {},
): Promise<StartupRecognitionAuditWrite> {
  const appState = await ensureAppState({ overrideDir: options.appStateDir });
  const record = toAuditRecord(report);
  const auditPath = path.join(appState.paths.audit, `${AUDIT_PREFIX}${fileStamp(record.auditedAt)}${AUDIT_SUFFIX}`);
  await writeFile(auditPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return { auditPath, record };
}

export async function readLatestStartupRecognitionAudit(
  options: StartupRecognitionAuditOptions = {},
): Promise<StartupRecognitionAuditWrite | undefined> {
  const appState = await ensureAppState({ overrideDir: options.appStateDir });
  const files = (await readdir(appState.paths.audit))
    .filter((file) => file.startsWith(AUDIT_PREFIX) && file.endsWith(AUDIT_SUFFIX))
    .sort()
    .reverse();
  for (const file of files) {
    const auditPath = path.join(appState.paths.audit, file);
    try {
      const parsed = JSON.parse(await readFile(auditPath, "utf-8")) as StartupRecognitionAuditRecord;
      if (parsed.schemaVersion === "skillcentral.dev/startup-recognition-audit/v1") {
        return { auditPath, record: parsed };
      }
    } catch {
      // Skip corrupt or partial audit records; older valid records still matter.
    }
  }
  return undefined;
}

function toAuditRecord(report: StartupRecognitionReport): StartupRecognitionAuditRecord {
  const targets = report.targets.map(toAuditTarget);
  return {
    schemaVersion: "skillcentral.dev/startup-recognition-audit/v1",
    auditedAt: new Date().toISOString(),
    checkedAt: report.checkedAt,
    applyDrift: report.applyDrift,
    verify: report.verify,
    counts: targets.reduce<Record<string, number>>((acc, target) => {
      acc[target.status] = (acc[target.status] ?? 0) + 1;
      return acc;
    }, {}),
    targets,
  };
}

function toAuditTarget(target: StartupRecognitionTarget): StartupRecognitionAuditTarget {
  return {
    target: target.target,
    status: target.status,
    configPath: target.configPath,
    currentCommand: target.plan?.currentServer?.command,
    desiredCommand: target.plan?.desiredServer.command,
    desiredArgs: target.plan?.desiredServer.args,
    backupPath: target.plan?.backupPath,
    healthStatus: target.plan?.health?.status,
    errorSummary: target.errorSummary,
    nextActions: target.nextActions,
  };
}

function fileStamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}
