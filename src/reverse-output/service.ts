// ============================================================================
// Reverse Output Service
// ----------------------------------------------------------------------------
// Shared control-plane implementation for IDE/CLI reverse output.
//
// The service deliberately separates proposal preparation from source writes:
// - preview is side-effect free;
// - promote requires explicit decision and passes the same preflight again;
// - defer/discard record a decision without writing an asset;
// - updates use expected SHA-256, sibling backups, and atomic replacement;
// - rollback validates the backup path and restores through the same boundary.
// ============================================================================

import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { dump as dumpYaml, load as parseYaml } from "js-yaml";

import type { SkillEngine } from "../core/engine.js";
import { ensureAppState } from "../local-store/app-state.js";
import type { SkillCentralConfig } from "../storage/config.js";
import { readAllLayers } from "../storage/reader.js";
import { validateSkill } from "../storage/parser.js";
import {
  DEFAULT_RULES_DIR,
  readAllRuleEntries,
} from "../storage/rule-reader.js";
import {
  UNIVERSAL_SKILL_SCHEMA_VERSION,
  validateUniversalSkillObject,
} from "../schema/universal-skill.js";
import {
  RULE_SCHEMA_VERSION,
  validateRuleObject,
} from "../schema/rule.js";
import { normaliseAssetScope, type AssetScope } from "../schema/asset-scope.js";
import type { SkillLayer } from "../storage/schemas.js";

export const REVERSE_OUTPUT_SCHEMA_VERSION = "skillcentral.dev/reverse-output/v1" as const;

export type ReverseOutputAction = "preview" | "apply" | "rollback";
export type ReverseOutputAssetType = "skill" | "rule";
export type ReverseOutputOperation = "create" | "update";
export type ReverseOutputDecision = "promote" | "defer" | "discard";
export type ReverseOutputPlacement =
  | "skill"
  | "covenant-rule"
  | "ide-native-rule"
  | "project-local";
export type ReverseOutputCheckStatus = "passed" | "failed" | "warning" | "not-run";

export interface ReverseOutputCheck {
  id: string;
  status: ReverseOutputCheckStatus;
  detail: string;
}

export interface ReverseOutputExistingAsset {
  assetType: ReverseOutputAssetType;
  id: string;
  source: string;
  sha256: string;
  appliesTo: AssetScope;
  layer?: string;
}

export interface ReverseOutputProposal {
  schemaVersion: typeof REVERSE_OUTPUT_SCHEMA_VERSION;
  proposalId: string;
  assetType: ReverseOutputAssetType;
  operation: ReverseOutputOperation;
  assetId: string;
  placement: ReverseOutputPlacement;
  placementReason: string;
  source: string;
  context: string;
  target: string;
  targetPath?: string;
  appliesTo: AssetScope;
  assetSha256: string;
  existing: ReverseOutputExistingAsset[];
  checks: ReverseOutputCheck[];
  canApply: boolean;
  diffPreview: string;
  backupRequired: boolean;
  rollbackPlan: string;
}

export interface ReverseOutputResult {
  schemaVersion: typeof REVERSE_OUTPUT_SCHEMA_VERSION;
  action: ReverseOutputAction;
  status: "preview" | "applied" | "recorded" | "blocked" | "rolled-back";
  decision?: ReverseOutputDecision;
  proposal?: ReverseOutputProposal;
  targetPath?: string;
  backupPath?: string;
  auditPath?: string;
  verification?: {
    status: "verified" | "unverified";
    detail: string;
  };
  rollback?: {
    restoredFrom: string;
    preRollbackBackupPath?: string;
  };
}

export interface ReverseOutputServiceOptions {
  config: SkillCentralConfig;
  projectRoot?: string;
  engine?: SkillEngine;
}

interface ReverseOutputRequest {
  action: ReverseOutputAction;
  assetType?: ReverseOutputAssetType;
  operation?: ReverseOutputOperation;
  source?: string;
  context?: string;
  target?: string;
  placement?: ReverseOutputPlacement;
  placementReason?: string;
  asset?: Record<string, unknown>;
  decision?: ReverseOutputDecision;
  expectedSha256?: string;
  appStateDir?: string;
  targetPath?: string;
  backupPath?: string;
}

interface PreparedRequest {
  action: "preview" | "apply";
  assetType: ReverseOutputAssetType;
  operation: ReverseOutputOperation;
  source: string;
  context: string;
  target: string;
  placement: ReverseOutputPlacement;
  placementReason: string;
  asset: Record<string, unknown>;
  assetId: string;
  appliesTo: AssetScope;
  decision?: ReverseOutputDecision;
  expectedSha256?: string;
  appStateDir?: string;
}

interface ExistingFile {
  source: string;
  raw: string;
  sha256: string;
  asset: ReverseOutputExistingAsset;
}

interface TargetResolution {
  targetPath?: string;
  layer?: SkillLayer;
  targetError?: string;
}

interface AtomicWriteResult {
  backupPath?: string;
}

export class ReverseOutputService {
  private readonly projectRoot: string;

  constructor(private readonly options: ReverseOutputServiceOptions) {
    this.projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  }

  async execute(input: unknown): Promise<ReverseOutputResult> {
    const request = parseRequest(input);
    if (request.action === "rollback") {
      return this.rollback(request);
    }

    const prepared = prepareRequest(request);
    const proposal = await this.buildProposal(prepared);

    if (request.action === "preview") {
      return {
        schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
        action: "preview",
        status: proposal.canApply ? "preview" : "blocked",
        proposal,
      };
    }

    if (!prepared.decision) {
      throw new Error("apply requires an explicit decision: promote, defer, or discard");
    }

    if (prepared.decision !== "promote") {
      const auditPath = await this.writeAudit({
        action: "apply",
        status: "recorded",
        decision: prepared.decision,
        proposal,
        expectedSha256: prepared.expectedSha256,
        appStateDir: prepared.appStateDir,
      });
      return {
        schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
        action: "apply",
        status: "recorded",
        decision: prepared.decision,
        proposal,
        auditPath,
      };
    }

    if (!proposal.canApply || !proposal.targetPath) {
      const auditPath = await this.writeAudit({
        action: "apply",
        status: "blocked",
        decision: prepared.decision,
        proposal,
        expectedSha256: prepared.expectedSha256,
        appStateDir: prepared.appStateDir,
      });
      return {
        schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
        action: "apply",
        status: "blocked",
        decision: prepared.decision,
        proposal,
        auditPath,
      };
    }

    const raw = serialiseAsset(prepared.asset, proposal.targetPath);
    let write: AtomicWriteResult;
    try {
      write = await writeAtomically(proposal.targetPath, raw, {
        expectedSha256: prepared.operation === "update" ? prepared.expectedSha256 : undefined,
        backupExisting: prepared.operation === "update",
        requireMissing: prepared.operation === "create",
      });
    } catch (err) {
      const verification = {
        status: "unverified" as const,
        detail: `Atomic write was blocked and no source replacement was accepted: ${errorMessage(err)}`,
      };
      const auditPath = await this.writeAudit({
        action: "apply",
        status: "blocked",
        decision: prepared.decision,
        proposal,
        verification,
        expectedSha256: prepared.expectedSha256,
        appStateDir: prepared.appStateDir,
      });
      return {
        schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
        action: "apply",
        status: "blocked",
        decision: prepared.decision,
        proposal,
        targetPath: proposal.targetPath,
        auditPath,
        verification,
      };
    }

    let verification: ReverseOutputResult["verification"];
    try {
      await verifyAsset(proposal.targetPath, prepared.assetType);
      verification = {
        status: "verified",
        detail: "The written asset was parsed and validated after the atomic replacement.",
      };
    } catch (err) {
      await restoreFailedWrite(proposal.targetPath, write.backupPath);
      verification = {
        status: "unverified",
        detail: `Post-write validation failed and the source was restored: ${errorMessage(err)}`,
      };
      const auditPath = await this.writeAudit({
        action: "apply",
        status: "blocked",
        decision: prepared.decision,
        proposal,
        backupPath: write.backupPath,
        verification,
        expectedSha256: prepared.expectedSha256,
        appStateDir: prepared.appStateDir,
      });
      return {
        schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
        action: "apply",
        status: "blocked",
        decision: prepared.decision,
        proposal,
        targetPath: proposal.targetPath,
        backupPath: write.backupPath,
        auditPath,
        verification,
      };
    }

    if (prepared.assetType === "skill" && this.options.engine) {
      await this.options.engine.reload(this.options.config.layers, {
        projectRoot: this.projectRoot,
      });
    }

    const auditPath = await this.writeAudit({
      action: "apply",
      status: "applied",
      decision: prepared.decision,
      proposal,
      backupPath: write.backupPath,
      verification,
      expectedSha256: prepared.expectedSha256,
      appStateDir: prepared.appStateDir,
    });

    return {
      schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
      action: "apply",
      status: "applied",
      decision: prepared.decision,
      proposal,
      targetPath: proposal.targetPath,
      backupPath: write.backupPath,
      auditPath,
      verification,
    };
  }

  private async buildProposal(request: PreparedRequest): Promise<ReverseOutputProposal> {
    const checks: ReverseOutputCheck[] = [
      {
        id: "source-context",
        status: "passed",
        detail: `Source and context recorded: ${request.source}`,
      },
      {
        id: "asset-type-target",
        status: "passed",
        detail: `${request.assetType} ${request.operation} targeted at ${request.target}`,
      },
      {
        id: "placement-boundary",
        status: "passed",
        detail: `${request.placement}: ${request.placementReason}`,
      },
      {
        id: "scope",
        status: "passed",
        detail: `appliesTo=${formatScope(request.appliesTo)}`,
      },
    ];

    const validation = validateCandidate(request.asset, request.assetType);
    checks.push({
      id: "schema",
      status: validation.ok ? "passed" : "failed",
      detail: validation.detail,
    });

    const target = await this.resolveTarget(request);
    checks.push({
      id: "target",
      status: target.targetPath ? "passed" : "failed",
      detail: target.targetPath ?? target.targetError ?? "Target could not be resolved.",
    });

    const existing = await this.findExisting(request);
    const current = target.targetPath ? await readExisting(target.targetPath) : undefined;
    const duplicate = duplicateCheck(request, target, existing, current);
    checks.push(duplicate.check);

    const currentRaw = duplicate.currentRaw;
    const nextRaw = serialiseAsset(request.asset, target.targetPath);
    const expectedCheck = expectedShaCheck(request, currentRaw);
    checks.push(expectedCheck);

    checks.push({
      id: "diff",
      status: validation.ok && target.targetPath ? "passed" : "not-run",
      detail: validation.ok && target.targetPath
        ? "A bounded diff preview is available."
        : "Diff preview waits for a valid asset and target.",
    });
    checks.push({
      id: "backup-rollback",
      status: request.operation === "update" ? "passed" : "not-run",
      detail: request.operation === "update"
        ? "Apply will create a sibling backup and return its path for rollback."
        : "New asset creation has no existing source to back up.",
    });
    checks.push({
      id: "verification",
      status: "not-run",
      detail: "Post-write parse/validation runs only after promote.",
    });

    const failed = checks.some((check) => check.status === "failed");
    const diffPreview = validation.ok && target.targetPath
      ? buildDiffPreview(currentRaw, nextRaw)
      : "";

    return {
      schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
      proposalId: `proposal-${randomUUID()}`,
      assetType: request.assetType,
      operation: request.operation,
      assetId: request.assetId,
      placement: request.placement,
      placementReason: request.placementReason,
      source: request.source,
      context: request.context,
      target: request.target,
      targetPath: target.targetPath,
      appliesTo: request.appliesTo,
      assetSha256: sha256(nextRaw),
      existing: existing.map((entry) => entry.asset),
      checks,
      canApply: !failed,
      diffPreview,
      backupRequired: request.operation === "update",
      rollbackPlan: request.operation === "update"
        ? "Restore the returned sibling backup after checking the current SHA-256."
        : "Remove the newly created file only after verifying its current SHA-256.",
    };
  }

  private async resolveTarget(request: PreparedRequest): Promise<TargetResolution> {
    if (request.assetType === "skill") {
      const layer = this.options.config.layers.find(
        (candidate) => candidate.id === request.target || candidate.name === request.target,
      );
      if (!layer) {
        return { targetError: `Unknown skill layer "${request.target}".` };
      }
      if (!layer.writable) {
        return { targetError: `Skill layer "${request.target}" is not writable.` };
      }
      const layerPath = resolvePathFromProject(this.projectRoot, layer.path);
      const existing = await this.findExisting(request);
      if (request.operation === "update") {
        const candidates = existing.filter((entry) => isInside(layerPath, entry.source));
        if (candidates.length === 1) {
          return { layer, targetPath: candidates[0]!.source };
        }
        if (candidates.length === 0) {
          return {
            layer,
            targetError: `No existing ${request.assetType} "${request.assetId}" was found in layer "${request.target}".`,
          };
        }
        return {
          layer,
          targetError: `Multiple existing ${request.assetType} candidates were found in layer "${request.target}".`,
        };
      }
      return {
        layer,
        targetPath: path.join(layerPath, `${request.assetId}.yaml`),
      };
    }

    const rulesRoot = path.resolve(this.projectRoot, DEFAULT_RULES_DIR);
    const requested = path.resolve(this.projectRoot, request.target);
    if (!isInside(rulesRoot, requested)) {
      return {
        targetError: `Rule target must remain under ${path.relative(this.projectRoot, rulesRoot)}.`,
      };
    }
    const existing = await this.findExisting(request);
    if (request.operation === "update") {
      const candidates = existing.filter((entry) => isInside(requested, entry.source));
      if (candidates.length === 1) return { targetPath: candidates[0]!.source };
      if (candidates.length === 0) {
        return {
          targetError: `No existing rule "${request.assetId}" was found under ${request.target}.`,
        };
      }
      return { targetError: `Multiple existing rule candidates were found under ${request.target}.` };
    }
    return { targetPath: path.join(requested, `${request.assetId}.yaml`) };
  }

  private async findExisting(request: PreparedRequest): Promise<ExistingFile[]> {
    if (request.assetType === "skill") {
      const layers = this.options.config.layers.map((layer) => ({
        ...layer,
        path: resolvePathFromProject(this.projectRoot, layer.path),
      }));
      const entries = await readAllLayers(layers);
      const matches = entries.filter((entry) => entry.schema.id === request.assetId);
      return Promise.all(matches.map(async (entry) => {
        const source = path.resolve(entry.filePath);
        const raw = await readFile(source, "utf8");
        return {
          source,
          raw,
          sha256: sha256(raw),
          asset: {
            assetType: "skill",
            id: entry.schema.id,
            source,
            sha256: sha256(raw),
            appliesTo: entry.schema.appliesTo,
            layer: entry.layer.id,
          },
        };
      }));
    }

    const rulesRoot = path.resolve(this.projectRoot, DEFAULT_RULES_DIR);
    const entries = await readAllRuleEntries([rulesRoot]);
    const matches = entries.filter((entry) => entry.rule.id === request.assetId);
    return Promise.all(matches.map(async (entry) => {
      const source = path.resolve(entry.filePath);
      const raw = await readFile(source, "utf8");
      return {
        source,
        raw,
        sha256: sha256(raw),
        asset: {
          assetType: "rule",
          id: entry.rule.id,
          source,
          sha256: sha256(raw),
          appliesTo: entry.rule.appliesTo,
        },
      };
    }));
  }

  private async writeAudit(input: {
    action: "apply" | "rollback";
    status: "applied" | "recorded" | "blocked" | "rolled-back";
    decision?: ReverseOutputDecision;
    proposal?: ReverseOutputProposal;
    targetPath?: string;
    backupPath?: string;
    verification?: ReverseOutputResult["verification"];
    rollback?: ReverseOutputResult["rollback"];
    appStateDir?: string;
    expectedSha256?: string;
  }): Promise<string> {
    const appState = await ensureAppState({ overrideDir: input.appStateDir });
    const auditId = `reverse-output.${timestamp()}.${randomUUID()}.json`;
    const auditPath = path.join(appState.paths.audit, auditId);
    const report = {
      schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
      auditId,
      recordedAt: new Date().toISOString(),
      action: input.action,
      status: input.status,
      decision: input.decision,
      assetType: input.proposal?.assetType,
      operation: input.proposal?.operation,
      assetId: input.proposal?.assetId,
      placement: input.proposal?.placement,
      placementReason: input.proposal?.placementReason,
      source: input.proposal?.source,
      context: input.proposal?.context,
      target: input.proposal?.target,
      targetPath: input.targetPath ?? input.proposal?.targetPath,
      assetSha256: input.proposal?.assetSha256,
      expectedSha256: input.expectedSha256,
      checks: input.proposal?.checks ?? [],
      backupPath: input.backupPath,
      verification: input.verification,
      rollback: input.rollback,
    };
    const tempPath = `${auditPath}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rename(tempPath, auditPath);
    return auditPath;
  }

  private async rollback(request: ReverseOutputRequest): Promise<ReverseOutputResult> {
    const targetPath = requirePath(request.targetPath, "targetPath");
    const backupPath = requirePath(request.backupPath, "backupPath");
    const expectedSha256 = requirePath(request.expectedSha256, "expectedSha256");
    const absoluteTarget = assertRollbackAssetPath(
      this.projectRoot,
      targetPath,
      this.options.config.layers,
    );
    const absoluteBackup = assertRollbackAssetPath(
      this.projectRoot,
      backupPath,
      this.options.config.layers,
    );
    const expectedPrefix = `${absoluteTarget}.bak.`;
    if (!absoluteBackup.startsWith(expectedPrefix)) {
      throw new Error("backupPath must be a sibling backup of targetPath");
    }
    const backupRaw = await readFile(absoluteBackup, "utf8");
    const currentRaw = await readExisting(absoluteTarget);
    if (sha256(currentRaw ?? "") !== expectedSha256) {
      throw new Error(
        `sha256 conflict: expected ${expectedSha256}, current ${sha256(currentRaw ?? "")}`,
      );
    }
    const assetType = inferAssetTypeFromContent(backupRaw);
    await verifyAssetContent(backupRaw, absoluteTarget, assetType);
    const write = await writeAtomically(absoluteTarget, backupRaw, {
      backupExisting: currentRaw !== undefined,
      expectedSha256,
      requireMissing: false,
    });
    const rollback = {
      restoredFrom: absoluteBackup,
      preRollbackBackupPath: write.backupPath,
    };
    const auditPath = await this.writeAudit({
      action: "rollback",
      status: "rolled-back",
      targetPath: absoluteTarget,
      backupPath: absoluteBackup,
      rollback,
      appStateDir: request.appStateDir,
      expectedSha256,
    });
    return {
      schemaVersion: REVERSE_OUTPUT_SCHEMA_VERSION,
      action: "rollback",
      status: "rolled-back",
      targetPath: absoluteTarget,
      backupPath: absoluteBackup,
      auditPath,
      rollback,
    };
  }
}

function parseRequest(input: unknown): ReverseOutputRequest {
  if (!isRecord(input)) throw new Error("reverse output request must be an object");
  const action = enumValue(input.action, ["preview", "apply", "rollback"], "action");
  return {
    action,
    assetType: optionalEnumValue(input.assetType, ["skill", "rule"]),
    operation: optionalEnumValue(input.operation, ["create", "update"]),
    source: optionalString(input.source),
    context: optionalString(input.context),
    target: optionalString(input.target),
    placement: optionalEnumValue(
      input.placement,
      ["skill", "covenant-rule", "ide-native-rule", "project-local"],
    ),
    placementReason: optionalString(input.placementReason),
    asset: isRecord(input.asset) ? input.asset : undefined,
    decision: optionalEnumValue(input.decision, ["promote", "defer", "discard"]),
    expectedSha256: optionalString(input.expectedSha256),
    appStateDir: optionalString(input.appStateDir),
    targetPath: optionalString(input.targetPath),
    backupPath: optionalString(input.backupPath),
  };
}

function validateCandidate(
  asset: Record<string, unknown>,
  assetType: ReverseOutputAssetType,
): { ok: boolean; detail: string } {
  if (assetType === "skill") {
    const result = validateUniversalSkillObject(asset, "(reverse-output)");
    return {
      ok: result.ok,
      detail: result.ok
        ? "Universal Skill v1 validation passed."
        : result.issues.map((issue) => `${issue.fieldPath}: ${issue.reason}`).join("; "),
    };
  }
  const result = validateRuleObject(asset, "(reverse-output)");
  return {
    ok: result.ok,
    detail: result.ok
      ? "Rule v1 validation passed."
      : result.issues.map((issue) => `${issue.fieldPath}: ${issue.reason}`).join("; "),
  };
}

function duplicateCheck(
  request: PreparedRequest,
  target: TargetResolution,
  existing: ExistingFile[],
  current: string | undefined,
): { check: ReverseOutputCheck; currentRaw?: string } {
  if (!target.targetPath) {
    return {
      check: {
        id: "duplicate-conflict",
        status: "failed",
        detail: target.targetError ?? "Target could not be resolved.",
      },
      currentRaw: current,
    };
  }

  if (request.operation === "create") {
    if (current !== undefined) {
      return {
        check: {
          id: "duplicate-conflict",
          status: "failed",
          detail: `Target file already exists: ${target.targetPath}`,
        },
        currentRaw: current,
      };
    }
    if (existing.length > 0) {
      return {
        check: {
          id: "duplicate-conflict",
          status: "failed",
          detail: `Asset id already exists in ${existing.length} library location(s). Use update with an expected SHA-256.`,
        },
        currentRaw: current,
      };
    }
    return {
      check: {
        id: "duplicate-conflict",
        status: "passed",
        detail: "No existing asset with this id or target path was found.",
      },
      currentRaw: current,
    };
  }

  const exact = existing.find((entry) => entry.source === target.targetPath);
  if (!exact) {
    return {
      check: {
        id: "duplicate-conflict",
        status: "failed",
        detail: "Update target does not resolve to exactly one existing asset.",
      },
      currentRaw: current,
    };
  }
  if (existing.length > 1) {
    return {
      check: {
        id: "duplicate-conflict",
        status: "failed",
        detail: `Update is blocked because ${existing.length} candidates share this id.`,
      },
      currentRaw: current,
    };
  }
  return {
    check: {
      id: "duplicate-conflict",
      status: "passed",
      detail: "Exactly one existing asset is selected for update.",
    },
    currentRaw: current,
  };
}

function expectedShaCheck(
  request: PreparedRequest,
  currentRaw: string | undefined,
): ReverseOutputCheck {
  if (request.operation === "create") {
    return {
      id: "expected-sha256",
      status: "not-run",
      detail: "Create operations do not require an existing SHA-256.",
    };
  }
  if (!currentRaw) {
    return {
      id: "expected-sha256",
      status: "failed",
      detail: "The update target disappeared before the preflight check.",
    };
  }
  const current = sha256(currentRaw);
  return {
    id: "expected-sha256",
    status: request.expectedSha256 === current ? "passed" : "failed",
    detail: request.expectedSha256 === current
      ? "Expected SHA-256 matches the current source."
      : `Expected ${request.expectedSha256}; current source is ${current}.`,
  };
}

async function verifyAsset(filePath: string, assetType: ReverseOutputAssetType): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  await verifyAssetContent(raw, filePath, assetType);
}

async function verifyAssetContent(
  raw: string,
  filePath: string,
  assetType: ReverseOutputAssetType,
): Promise<void> {
  const parsed = parseAssetContent(raw, filePath);
  if (!parsed) throw new Error("Asset content did not parse to an object.");
  if (assetType === "skill") {
    const validated = validateSkill(parsed, filePath);
    if (!validated) throw new Error("Skill post-write parse/validation failed.");
    return;
  }
  const validated = validateRuleObject(parsed, filePath);
  if (!validated.ok) throw new Error("Rule post-write parse/validation failed.");
}

async function writeAtomically(
  targetPath: string,
  content: string,
  options: { expectedSha256?: string; backupExisting: boolean; requireMissing: boolean },
): Promise<AtomicWriteResult> {
  const absolutePath = path.resolve(targetPath);
  const before = await readExisting(absolutePath);
  const beforeHash = before === undefined ? undefined : sha256(before);
  if (options.requireMissing && before !== undefined) {
    throw new Error(`target appeared after preview: ${absolutePath}`);
  }
  if (options.expectedSha256 && options.expectedSha256 !== beforeHash) {
    throw new Error(
      `sha256 conflict: expected ${options.expectedSha256}, current ${beforeHash ?? "(missing)"}`,
    );
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  const mode = before === undefined
    ? 0o644
    : (await stat(absolutePath)).mode;
  const tempPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.reverse-output-${process.pid}-${randomUUID()}.tmp`,
  );
  const backupPath = before !== undefined && options.backupExisting
    ? `${absolutePath}.bak.${timestamp()}`
    : undefined;

  try {
    const current = await readExisting(absolutePath);
    const currentHash = current === undefined ? undefined : sha256(current);
    if (options.requireMissing && current !== undefined) {
      throw new Error(`target appeared during write: ${absolutePath}`);
    }
    if (currentHash !== beforeHash) {
      throw new Error(
        `sha256 conflict: source changed during write; current ${currentHash ?? "(missing)"}`,
      );
    }
    if (backupPath) await copyFile(absolutePath, backupPath);
    await writeFile(tempPath, content, { encoding: "utf8", mode });
    await rename(tempPath, absolutePath);
  } finally {
    await rm(tempPath, { force: true });
  }

  return { backupPath };
}

async function restoreFailedWrite(targetPath: string, backupPath?: string): Promise<void> {
  if (backupPath) {
    await copyFile(backupPath, targetPath);
  } else {
    await rm(targetPath, { force: true });
  }
}

function serialiseAsset(asset: Record<string, unknown>, targetPath?: string): string {
  const raw = path.extname(targetPath ?? "").toLowerCase() === ".json"
    ? `${JSON.stringify(asset, null, 2)}\n`
    : dumpYaml(asset, {
      lineWidth: 100,
      noRefs: true,
      noCompatMode: true,
    });
  return raw.endsWith("\n") ? raw : `${raw}\n`;
}

function buildDiffPreview(before: string | undefined, after: string): string {
  const beforeLines = before?.split("\n") ?? [];
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const lines: string[] = [];
  for (let i = 0; i < max && lines.length < 24; i += 1) {
    if (beforeLines[i] === afterLines[i]) continue;
    if (beforeLines[i] !== undefined) lines.push(`- ${beforeLines[i]}`);
    if (afterLines[i] !== undefined) lines.push(`+ ${afterLines[i]}`);
  }
  return lines.join("\n");
}

async function readExisting(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    if (isMissingFile(err)) return undefined;
    throw err;
  }
}

function resolvePathFromProject(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

function assertRollbackAssetPath(
  projectRoot: string,
  value: string,
  layers: SkillLayer[],
): string {
  const absolute = path.resolve(value);
  const skillsRoot = path.resolve(projectRoot, ".skills");
  const rulesRoot = path.resolve(projectRoot, DEFAULT_RULES_DIR);
  const configuredLayerRoots = layers.map((layer) =>
    resolvePathFromProject(projectRoot, layer.path),
  );
  const isAllowed = isInside(skillsRoot, absolute)
    || isInside(rulesRoot, absolute)
    || configuredLayerRoots.some((root) => isInside(root, absolute));
  if (!isAllowed) {
    throw new Error("reverse output paths must remain under a configured Skill Layer or .rules/");
  }
  return absolute;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function inferAssetTypeFromContent(raw: string): ReverseOutputAssetType {
  try {
    const parsed = parseYaml(raw) as Record<string, unknown>;
    if (parsed.schemaVersion === RULE_SCHEMA_VERSION) return "rule";
  } catch {
    // Invalid content is rejected by the backup validator.
  }
  return "skill";
}

function parseAssetContent(raw: string, filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = path.extname(filePath).toLowerCase() === ".json"
      ? JSON.parse(raw)
      : parseYaml(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function formatScope(scope: AssetScope): string {
  return scope === "global" ? "global" : scope.projects.join(",");
}

function prepareRequest(request: ReverseOutputRequest): PreparedRequest {
  const assetType = requireValue(request.assetType, "assetType");
  const operation = requireValue(request.operation, "operation");
  const source = requireNonEmpty(request.source, "source");
  const context = requireNonEmpty(request.context, "context");
  const target = requireNonEmpty(request.target, "target");
  const placement = requireValue(request.placement, "placement");
  const placementReason = requireNonEmpty(request.placementReason, "placementReason");
  const asset = request.asset;
  if (!asset) throw new Error("asset is required for preview/apply");
  if (!Object.prototype.hasOwnProperty.call(asset, "appliesTo")) {
    throw new Error("asset.appliesTo is required and must be explicit");
  }
  const appliesTo = normaliseAssetScope(asset.appliesTo);
  validatePlacement(assetType, placement, appliesTo);
  const normalisedAsset: Record<string, unknown> = {
    ...asset,
    appliesTo,
  };
  const assetId = normalisedAsset.id;
  if (typeof assetId !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(assetId)) {
    throw new Error("asset.id must be lowercase kebab-case");
  }
  if (assetType === "skill" && normalisedAsset.schemaVersion !== UNIVERSAL_SKILL_SCHEMA_VERSION) {
    throw new Error(`reverse output skills require ${UNIVERSAL_SKILL_SCHEMA_VERSION}`);
  }
  if (assetType === "rule" && normalisedAsset.schemaVersion !== RULE_SCHEMA_VERSION) {
    throw new Error(`reverse output rules require ${RULE_SCHEMA_VERSION}`);
  }
  if (operation === "update" && !request.expectedSha256) {
    throw new Error("update requires expectedSha256");
  }
  return {
    action: request.action as "preview" | "apply",
    assetType,
    operation,
    source,
    context,
    target,
    placement,
    placementReason,
    asset: normalisedAsset,
    assetId,
    appliesTo,
    decision: request.decision,
    expectedSha256: request.expectedSha256,
    appStateDir: request.appStateDir,
  };
}

function validatePlacement(
  assetType: ReverseOutputAssetType,
  placement: ReverseOutputPlacement,
  appliesTo: AssetScope,
): void {
  if (placement === "ide-native-rule") {
    throw new Error("IDE-native rules cannot be promoted through reverse output");
  }
  if (assetType === "rule" && placement !== "covenant-rule") {
    throw new Error('Rule reverse output requires placement "covenant-rule"');
  }
  if (assetType === "skill" && placement === "covenant-rule") {
    throw new Error('Skill reverse output cannot use placement "covenant-rule"');
  }
  if (placement === "project-local" && appliesTo === "global") {
    throw new Error('Project-local reverse output requires a project-scoped appliesTo');
  }
}

function requirePath(value: string | undefined, label: string): string {
  return requireNonEmpty(value, label);
}

function requireNonEmpty(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalEnumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`expected one of: ${values.join(", ")}`);
  }
  return value as T;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${label} must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isMissingFile(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
