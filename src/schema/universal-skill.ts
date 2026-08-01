// ============================================================================
// Schema / Universal Skill
// ----------------------------------------------------------------------------
// Universal Skill v1 type definitions and lightweight runtime validation.
//
// Design intent:
// - Keep this module dependency-free so storage, CLI, MCP, and the future
//   registry/compiler all share the same contract instead of drifting.
// - Validate the public authoring contract here, but keep deep semantic checks
//   such as target capability negotiation in later compiler/adapter phases.
// - Preserve today's MCP prompt/tool fields on the normalised model so Phase 1A
//   can change the internal representation without changing client behavior.
// ============================================================================

import {
  normaliseAssetScope,
  validateAssetScope,
  type AssetScope,
} from "./asset-scope.js";

export const UNIVERSAL_SKILL_SCHEMA_VERSION = "skillcentral.dev/v1" as const;

export type UniversalSkillSchemaVersion = typeof UNIVERSAL_SKILL_SCHEMA_VERSION;

export type UniversalSkillType =
  | "prompt"
  | "tool"
  | "workflow"
  | "policy"
  | "context-router";

export type LegacySkillType = "prompt" | "tool";

export type SkillType = UniversalSkillType;

export interface SkillArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface SkillActivation {
  intents?: string[];
  filePatterns?: string[];
  repoSignals?: Record<string, unknown>;
  priority?: number;
}

export interface SkillCapabilities {
  required?: string[];
  optional?: string[];
  denied?: string[];
}

export interface SkillContextSubscription {
  topic: string;
}

export interface SkillContext {
  subscribe?: SkillContextSubscription[];
  publish?: SkillContextSubscription[];
}

export interface SkillPromptObject {
  role?: string;
  template: string;
}

export type SkillPrompt = string | SkillPromptObject;

export interface WorkflowStep {
  id: string;
  uses: string;
  agentRole?: string;
  dependsOn?: string[];
  outputTopic?: string;
}

export interface SkillWorkflow {
  strategy?: "sequential" | "parallel" | string;
  steps?: WorkflowStep[];
}

export interface SkillDegradationRule {
  mode: string;
  message?: string;
  omit?: string[];
}

export interface SkillDegradation {
  whenMissing?: Record<string, SkillDegradationRule>;
  fallbackTarget?: string;
}

export interface UniversalSkill {
  schemaVersion: UniversalSkillSchemaVersion;
  id: string;
  name: string;
  description: string;
  version?: string;
  type: UniversalSkillType;
  tags?: string[];
  appliesTo: AssetScope;
  metadata?: Record<string, unknown>;
  activation?: SkillActivation;
  capabilities?: SkillCapabilities;
  targets?: Record<string, unknown>;
  context?: SkillContext;
  degradation?: SkillDegradation;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  workflow?: SkillWorkflow;

  // Legacy-compatible surface consumed by today's MCP composer.
  prompt?: string;
  prompt_zh?: string;
  inputSchema?: Record<string, unknown>;
  arguments?: SkillArgument[];

  // Internal provenance for compatibility reporting.
  sourceFormat: "legacy" | "universal";
}

export interface ResolvedSkill extends UniversalSkill {
  source: string;
  priority: number;
  layer: LayerProvenance;
  status: SkillResolutionStatus;
  shadowedBy?: LayerProvenance;
  conflictWith?: LayerProvenance[];
}

export type LayerScope = "user" | "workspace" | "repo" | "team" | "org" | "session";
export type LayerTrust = "local" | "remote" | "org" | "verified";
export type LayerVisibility = "private" | "team" | "public";
export type SkillResolutionStatus = "effective" | "shadowed" | "conflicted";

export interface LayerSyncPolicy {
  enabled: boolean;
}

export interface SkillLayer {
  id: string;
  name: string;
  path: string;
  scope: LayerScope;
  priority: number;
  writable: boolean;
  trust: LayerTrust;
  sync: LayerSyncPolicy;
  visibility: LayerVisibility;
  activation?: SkillActivation;
}

export interface LayerProvenance {
  id: string;
  name: string;
  path: string;
  scope: LayerScope;
  priority: number;
  writable: boolean;
  trust: LayerTrust;
  sync: LayerSyncPolicy;
  visibility: LayerVisibility;
}

export interface ValidationIssue {
  filePath: string;
  fieldPath: string;
  reason: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const VALID_TYPES = new Set<UniversalSkillType>([
  "prompt",
  "tool",
  "workflow",
  "policy",
  "context-router",
]);

const VALID_PROMPT_ROLES = new Set(["system", "user", "assistant", "reviewer"]);
const CAPABILITY_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;

export function validateUniversalSkillObject(
  obj: Record<string, unknown>,
  filePath: string,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (fieldPath: string, reason: string) => {
    issues.push({ filePath, fieldPath, reason });
  };

  if (obj.schemaVersion !== UNIVERSAL_SKILL_SCHEMA_VERSION) {
    issue(
      "schemaVersion",
      `expected "${UNIVERSAL_SKILL_SCHEMA_VERSION}"`,
    );
  }

  if (!nonEmptyString(obj.id)) {
    issue("id", "required non-empty string");
  }
  if (!nonEmptyString(obj.name)) {
    issue("name", "required non-empty string");
  }
  if (!nonEmptyString(obj.description)) {
    issue("description", "required non-empty string");
  }
  if (!nonEmptyString(obj.type) || !VALID_TYPES.has(obj.type as UniversalSkillType)) {
    issue("type", `expected one of: ${Array.from(VALID_TYPES).join(", ")}`);
  }

  validateStringArray(obj.tags, "tags", issue, { optional: true });
  for (const scopeIssue of validateAssetScope(obj.appliesTo)) {
    issue(scopeIssue.fieldPath, scopeIssue.reason);
  }
  validateActivation(obj.activation, issue);
  validateCapabilities(obj.capabilities, issue);
  validatePrompt(obj.prompt, "prompt", issue);
  validatePrompt(obj.prompt_zh, "prompt_zh", issue, { chineseVariant: true });
  validateContext(obj.context, issue);
  validateWorkflow(obj.workflow, issue);
  validateObjectField(obj.targets, "targets", issue, { optional: true });
  validateObjectField(obj.degradation, "degradation", issue, { optional: true });
  validateObjectField(obj.inputs, "inputs", issue, { optional: true });
  validateObjectField(obj.outputs, "outputs", issue, { optional: true });
  validateObjectField(obj.inputSchema, "inputSchema", issue, { optional: true });
  validateArguments(obj.arguments, issue);

  // Cross-field validation is intentionally narrow in Phase 1A. The schema must
  // prove it can represent existing and future assets; execution semantics such
  // as workflow step validity belong to later registry/compiler work.
  const type = obj.type;
  if (type === "prompt") {
    const promptText = extractPromptTemplate(obj.prompt);
    const zh = typeof obj.prompt_zh === "string" ? obj.prompt_zh.trim() : "";
    if (!promptText && !zh) {
      issue("prompt", "prompt skill requires prompt or prompt_zh");
    }
  }

  if (type === "tool" && obj.inputSchema !== undefined) {
    validateObjectField(obj.inputSchema, "inputSchema", issue);
  }

  return { ok: issues.length === 0, issues };
}

export function normaliseUniversalSkill(
  obj: Record<string, unknown>,
): UniversalSkill {
  const prompt = extractPromptTemplate(obj.prompt);
  const inputs = asRecord(obj.inputs);
  const inputSchema = asRecord(obj.inputSchema) ?? (obj.type === "tool" ? inputs : undefined);

  return {
    schemaVersion: UNIVERSAL_SKILL_SCHEMA_VERSION,
    id: obj.id as string,
    name: obj.name as string,
    description: obj.description as string,
    version: typeof obj.version === "string" ? obj.version : undefined,
    type: obj.type as UniversalSkillType,
    tags: normaliseTags(obj.tags),
    appliesTo: normaliseAssetScope(obj.appliesTo),
    metadata: asRecord(obj.metadata),
    activation: asActivation(obj.activation),
    capabilities: normaliseCapabilities(obj.capabilities),
    targets: asRecord(obj.targets),
    context: asContext(obj.context),
    degradation: asRecord(obj.degradation) as SkillDegradation | undefined,
    inputs,
    outputs: asRecord(obj.outputs),
    workflow: asRecord(obj.workflow) as SkillWorkflow | undefined,
    prompt: prompt || undefined,
    prompt_zh: typeof obj.prompt_zh === "string" ? obj.prompt_zh : undefined,
    inputSchema,
    arguments: normaliseArguments(obj.arguments),
    sourceFormat: "universal",
  };
}

export function isUniversalSkillObject(obj: Record<string, unknown>): boolean {
  return obj.schemaVersion !== undefined;
}

export function formatValidationIssue(issue: ValidationIssue): string {
  return `${issue.filePath}: ${issue.fieldPath}: ${issue.reason}`;
}

export function extractPromptTemplate(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "";
  }
  if (isPlainObject(value) && typeof value.template === "string") {
    return value.template.trim().length > 0 ? value.template : "";
  }
  return "";
}

export function normaliseTags(input: unknown): string[] | undefined {
  if (Array.isArray(input)) {
    const tags = input.filter((t): t is string => typeof t === "string");
    return tags.length > 0 ? tags : undefined;
  }
  if (typeof input === "string") {
    return [input];
  }
  return undefined;
}

function validateActivation(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    issue("activation", "expected object");
    return;
  }
  validateStringArray(value.intents, "activation.intents", issue, { optional: true });
  validateStringArray(value.filePatterns, "activation.filePatterns", issue, { optional: true });
  validateObjectField(value.repoSignals, "activation.repoSignals", issue, { optional: true });
  if (value.priority !== undefined && typeof value.priority !== "number") {
    issue("activation.priority", "expected number");
  }
}

function validateCapabilities(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    issue("capabilities", "expected object");
    return;
  }

  for (const field of ["required", "optional", "denied"] as const) {
    const list = value[field];
    validateStringArray(list, `capabilities.${field}`, issue, { optional: true });
    if (Array.isArray(list)) {
      list.forEach((capability, index) => {
        if (typeof capability === "string" && !CAPABILITY_RE.test(capability)) {
          issue(
            `capabilities.${field}[${index}]`,
            "invalid capability name; expected dot-separated identifier such as ide.agent.readFiles",
          );
        }
      });
    }
  }
}

function validatePrompt(
  value: unknown,
  fieldPath: string,
  issue: (fieldPath: string, reason: string) => void,
  opts: { chineseVariant?: boolean } = {},
): void {
  if (value === undefined) return;
  if (typeof value === "string") return;
  if (opts.chineseVariant) {
    issue(fieldPath, "expected string");
    return;
  }
  if (!isPlainObject(value)) {
    issue(fieldPath, "expected string or object with template");
    return;
  }
  if (!nonEmptyString(value.template)) {
    issue(`${fieldPath}.template`, "required non-empty string");
  }
  if (value.role !== undefined && typeof value.role !== "string") {
    issue(`${fieldPath}.role`, "expected string");
  }
  if (typeof value.role === "string" && !VALID_PROMPT_ROLES.has(value.role)) {
    issue(`${fieldPath}.role`, `expected one of: ${Array.from(VALID_PROMPT_ROLES).join(", ")}`);
  }
}

function validateContext(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    issue("context", "expected object");
    return;
  }
  for (const field of ["subscribe", "publish"] as const) {
    const list = value[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      issue(`context.${field}`, "expected array");
      continue;
    }
    list.forEach((entry, index) => {
      if (!isPlainObject(entry) || !nonEmptyString(entry.topic)) {
        issue(`context.${field}[${index}].topic`, "required non-empty string");
      }
    });
  }
}

function validateWorkflow(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    issue("workflow", "expected object");
    return;
  }
  if (value.steps === undefined) return;
  if (!Array.isArray(value.steps)) {
    issue("workflow.steps", "expected array");
    return;
  }
  value.steps.forEach((step, index) => {
    if (!isPlainObject(step)) {
      issue(`workflow.steps[${index}]`, "expected object");
      return;
    }
    if (!nonEmptyString(step.id)) {
      issue(`workflow.steps[${index}].id`, "required non-empty string");
    }
    if (!nonEmptyString(step.uses)) {
      issue(`workflow.steps[${index}].uses`, "required non-empty string");
    }
    validateStringArray(step.dependsOn, `workflow.steps[${index}].dependsOn`, issue, {
      optional: true,
    });
  });
}

function validateArguments(
  value: unknown,
  issue: (fieldPath: string, reason: string) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issue("arguments", "expected array");
    return;
  }
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      issue(`arguments[${index}]`, "expected object");
      return;
    }
    if (!nonEmptyString(entry.name)) {
      issue(`arguments[${index}].name`, "required non-empty string");
    }
    if (!nonEmptyString(entry.description)) {
      issue(`arguments[${index}].description`, "required non-empty string");
    }
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      issue(`arguments[${index}].required`, "expected boolean");
    }
  });
}

function validateStringArray(
  value: unknown,
  fieldPath: string,
  issue: (fieldPath: string, reason: string) => void,
  opts: { optional?: boolean } = {},
): void {
  if (value === undefined && opts.optional) return;
  if (!Array.isArray(value)) {
    issue(fieldPath, "expected array of strings");
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issue(`${fieldPath}[${index}]`, "expected non-empty string");
    }
  });
}

function validateObjectField(
  value: unknown,
  fieldPath: string,
  issue: (fieldPath: string, reason: string) => void,
  opts: { optional?: boolean } = {},
): void {
  if (value === undefined && opts.optional) return;
  if (!isPlainObject(value)) {
    issue(fieldPath, "expected object");
  }
}

function normaliseCapabilities(value: unknown): SkillCapabilities | undefined {
  if (!isPlainObject(value)) return undefined;
  const result: SkillCapabilities = {};
  for (const field of ["required", "optional", "denied"] as const) {
    const list = value[field];
    if (Array.isArray(list)) {
      const strings = list.filter((entry): entry is string => typeof entry === "string");
      if (strings.length > 0) result[field] = strings;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function asActivation(value: unknown): SkillActivation | undefined {
  return isPlainObject(value) ? (value as SkillActivation) : undefined;
}

function asContext(value: unknown): SkillContext | undefined {
  return isPlainObject(value) ? (value as SkillContext) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? (value as Record<string, unknown>) : undefined;
}

function normaliseArguments(value: unknown): SkillArgument[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const args = value.filter(
    (entry): entry is SkillArgument =>
      isPlainObject(entry) &&
      typeof entry.name === "string" &&
      typeof entry.description === "string",
  );
  return args.length > 0 ? args : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
