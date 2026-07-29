// ============================================================================
// Compiler / Export Transaction
// ----------------------------------------------------------------------------
// Converts compiled preview artifacts into guarded filesystem operations.
//
// Design intent:
// - Export must consume the same `AdapterArtifact[]` that `compile --dry-run`
//   previews. This is the concrete guard against dry-run and apply drift.
// - Planning is separate from writing so commands can print a transaction before
//   touching the filesystem.
// - Existing different files are conflicts by default. `--force` is the only
//   path that overwrites, and it creates a timestamped backup first.
// ============================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { AdapterArtifact } from "../adapters/types.js";
import type { CompiledSkillBundle } from "./types.js";

export type ExportOperationStatus = "create" | "overwrite" | "skip-identical" | "conflict";

export interface ExportOperation {
  artifact: AdapterArtifact;
  relativePath: string;
  absolutePath: string;
  status: ExportOperationStatus;
  bytes: number;
  backupPath?: string;
  diffPreview?: string;
}

export interface ExportPlan {
  target: string;
  intent: string;
  outDir: string;
  bundleHash: string;
  force: boolean;
  operations: ExportOperation[];
}

export async function planExport(
  bundle: CompiledSkillBundle,
  outDir: string,
  options: { force: boolean; backupStamp?: string },
): Promise<ExportPlan> {
  const operations: ExportOperation[] = [];
  for (const artifact of bundle.artifacts) {
    const relativePath = relativePathForArtifact(artifact);
    const absolutePath = assertInsideOutDir(outDir, relativePath);
    const existing = await readExisting(absolutePath);
    const status = existing === undefined
      ? "create"
      : existing === artifact.preview
        ? "skip-identical"
        : options.force
          ? "overwrite"
          : "conflict";

    operations.push({
      artifact,
      relativePath,
      absolutePath,
      status,
      bytes: Buffer.byteLength(artifact.preview, "utf-8"),
      backupPath: status === "overwrite"
        ? `${absolutePath}.bak.${options.backupStamp ?? timestamp()}`
        : undefined,
      diffPreview: existing !== undefined && existing !== artifact.preview
        ? buildDiffPreview(existing, artifact.preview)
        : undefined,
    });
  }

  return {
    target: bundle.target,
    intent: bundle.intent,
    outDir,
    bundleHash: bundle.hash,
    force: options.force,
    operations,
  };
}

export async function applyExportPlan(plan: ExportPlan): Promise<void> {
  const conflicts = plan.operations.filter((operation) => operation.status === "conflict");
  if (conflicts.length > 0) {
    throw new Error(
      `Export refused to overwrite ${conflicts.length} existing file(s). Re-run with --force after reviewing the diff.`,
    );
  }

  for (const operation of plan.operations) {
    if (operation.status === "skip-identical") continue;
    await mkdir(dirname(operation.absolutePath), { recursive: true });
    if (operation.status === "overwrite" && operation.backupPath) {
      await rename(operation.absolutePath, operation.backupPath);
    }
    await writeFile(operation.absolutePath, operation.artifact.preview, "utf-8");
  }
}

export function exportPlanHasConflicts(plan: ExportPlan): boolean {
  return plan.operations.some((operation) => operation.status === "conflict");
}

function relativePathForArtifact(artifact: AdapterArtifact): string {
  if (!artifact.path) return join("degradations", `${artifact.skillId}.md`);
  if (artifact.path.startsWith("skill://")) {
    const [, rest] = artifact.path.split("skill://", 2);
    return join("mcp-resources", `${rest}.md`);
  }
  return artifact.path;
}

function assertInsideOutDir(outDir: string, relativePath: string): string {
  const cleanRelative = normalize(relativePath);
  if (
    isAbsolute(cleanRelative) ||
    cleanRelative === ".." ||
    cleanRelative.startsWith("../") ||
    cleanRelative.startsWith("..\\")
  ) {
    throw new Error(`Adapter artifact path must be relative: ${relativePath}`);
  }

  const root = resolve(outDir);
  const absolutePath = resolve(root, cleanRelative);
  const back = relative(root, absolutePath);
  if (back.startsWith("..") || isAbsolute(back)) {
    throw new Error(`Adapter artifact path escapes output directory: ${relativePath}`);
  }
  return absolutePath;
}

async function readExisting(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

function buildDiffPreview(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const lines: string[] = [];
  for (let i = 0; i < max && lines.length < 12; i += 1) {
    if (beforeLines[i] === afterLines[i]) continue;
    if (beforeLines[i] !== undefined) lines.push(`- ${beforeLines[i]}`);
    if (afterLines[i] !== undefined) lines.push(`+ ${afterLines[i]}`);
  }
  return lines.join("\n");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
