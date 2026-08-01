// ============================================================================
// Storage / Asset Scope Editor
// ----------------------------------------------------------------------------
// Reads and atomically updates `appliesTo` on Rule, Universal Skill, or legacy
// Skill files without bypassing the asset's own schema validator.
//
// Write contract:
// - The optional expected hash protects callers acting on a stale preview.
// - A second hash check immediately before rename closes the read/write race.
// - The replacement is written beside the source and renamed over it so a
//   crash cannot leave a partially written YAML/JSON file.
// - Original file permissions are retained and temporary files are removed on
//   both success and failure.
// ============================================================================

import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { dump as dumpYaml, load as parseYaml } from "js-yaml";

import {
  normaliseAssetScope,
  type AssetScope,
} from "../schema/asset-scope.js";
import { RULE_SCHEMA_VERSION, validateRuleObject } from "../schema/rule.js";
import {
  isUniversalSkillObject,
  validateUniversalSkillObject,
} from "../schema/universal-skill.js";
import { validateLegacySkillObject } from "../schema/legacy.js";

export interface AssetScopeFile {
  filePath: string;
  assetType: "rule" | "skill";
  assetId: string;
  appliesTo: AssetScope;
  sha256: string;
}

export async function readAssetScopeFile(filePath: string): Promise<AssetScopeFile> {
  const absolutePath = path.resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  const object = parseAssetObject(raw, absolutePath);
  const assetType = validateAssetObject(object, absolutePath);
  return {
    filePath: absolutePath,
    assetType,
    assetId: object.id as string,
    appliesTo: normaliseAssetScope(object.appliesTo),
    sha256: hash(raw),
  };
}

export async function updateAssetScopeFile(
  filePath: string,
  appliesTo: AssetScope,
  options: { expectedSha256?: string } = {},
): Promise<AssetScopeFile> {
  const absolutePath = path.resolve(filePath);
  const original = await readFile(absolutePath, "utf8");
  const originalHash = hash(original);
  if (options.expectedSha256 && options.expectedSha256 !== originalHash) {
    throw new Error(`sha256 conflict: expected ${options.expectedSha256}, current ${originalHash}`);
  }

  const object = parseAssetObject(original, absolutePath);
  const assetType = validateAssetObject(object, absolutePath);
  object.appliesTo = appliesTo;
  validateAssetObject(object, absolutePath);

  const nextRaw = serialiseAssetObject(object, absolutePath);
  const mode = (await stat(absolutePath)).mode;
  const tempPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.scope-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
  );

  try {
    // Keep the temp file on the same filesystem as the source so rename is an
    // atomic replacement on supported local filesystems.
    await writeFile(tempPath, nextRaw, { encoding: "utf8", mode });
    // Re-read after serialisation: another editor may have changed the asset
    // since our initial validation even when the caller omitted expectedSha256.
    const current = await readFile(absolutePath, "utf8");
    if (hash(current) !== originalHash) {
      throw new Error("sha256 conflict: asset changed while its scope was being updated");
    }
    await rename(tempPath, absolutePath);
  } finally {
    await rm(tempPath, { force: true });
  }

  return {
    filePath: absolutePath,
    assetType,
    assetId: object.id as string,
    appliesTo: normaliseAssetScope(object.appliesTo),
    sha256: hash(nextRaw),
  };
}

function parseAssetObject(raw: string, filePath: string): Record<string, unknown> {
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;
  if (ext === ".json") {
    parsed = JSON.parse(raw);
  } else if (ext === ".yaml" || ext === ".yml") {
    parsed = parseYaml(raw);
  } else {
    throw new Error(`unsupported asset extension: ${ext || "(none)"}`);
  }
  if (!isPlainObject(parsed)) throw new Error("asset file must contain an object");
  return parsed;
}

function validateAssetObject(
  object: Record<string, unknown>,
  filePath: string,
): "rule" | "skill" {
  // Schema version selects the isolated Rule/Universal validators. Anything
  // else follows the established legacy Skill compatibility path.
  if (object.schemaVersion === RULE_SCHEMA_VERSION) {
    const result = validateRuleObject(object, filePath);
    if (!result.ok) throw validationError(result.issues);
    return "rule";
  }
  if (isUniversalSkillObject(object)) {
    const result = validateUniversalSkillObject(object, filePath);
    if (!result.ok) throw validationError(result.issues);
    return "skill";
  }
  const result = validateLegacySkillObject(object, filePath);
  if (!result.ok) throw validationError(result.issues);
  return "skill";
}

function serialiseAssetObject(object: Record<string, unknown>, filePath: string): string {
  if (path.extname(filePath).toLowerCase() === ".json") {
    return `${JSON.stringify(object, null, 2)}\n`;
  }
  return dumpYaml(object, { lineWidth: 100, noRefs: true, noCompatMode: true });
}

function validationError(issues: Array<{ fieldPath: string; reason: string }>): Error {
  return new Error(issues.map((issue) => `${issue.fieldPath}: ${issue.reason}`).join("; "));
}

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
