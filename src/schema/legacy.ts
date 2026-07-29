// ============================================================================
// Schema / Legacy
// ----------------------------------------------------------------------------
// Validation and upgrade path for the pre-v1 skill format.
//
// Design intent:
// - Legacy validation must remain at least as permissive as the historical
//   parser. Old user skills should keep loading without manual migration.
// - The upgrade layer supplies deterministic v1 defaults so the rest of the
//   system can reason over UniversalSkill only.
// - Any stricter authoring rules should apply to v1 files first; tightening
//   legacy files is a migration decision, not a parser side effect.
// ============================================================================

import {
  UNIVERSAL_SKILL_SCHEMA_VERSION,
  type LegacySkillType,
  type SkillArgument,
  type UniversalSkill,
  formatValidationIssue,
  normaliseTags,
} from "./universal-skill.js";
import type { ValidationIssue } from "./universal-skill.js";

export interface LegacySkillSchema {
  id: string;
  name: string;
  description: string;
  type: LegacySkillType;
  prompt?: string;
  prompt_zh?: string;
  inputSchema?: Record<string, unknown>;
  arguments?: SkillArgument[];
  tags?: string[];
  version?: string;
}

interface LegacyValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateLegacySkillObject(
  obj: Record<string, unknown>,
  filePath: string,
): LegacyValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (fieldPath: string, reason: string) => {
    issues.push({ filePath, fieldPath, reason });
  };

  if (!nonEmptyString(obj.id)) {
    issue("id", "required non-empty string");
  }
  if (obj.type !== "prompt" && obj.type !== "tool") {
    issue("type", "expected one of: prompt, tool");
  }

  // Historical behavior required prompt skills to contain at least one prompt
  // body. Keeping this check protects MCP clients from receiving empty content
  // while avoiding new requirements such as mandatory name/description.
  if (obj.type === "prompt") {
    const hasEn = typeof obj.prompt === "string" && obj.prompt.trim().length > 0;
    const hasZh = typeof obj.prompt_zh === "string" && obj.prompt_zh.trim().length > 0;
    if (!hasEn && !hasZh) {
      issue("prompt", "prompt skill requires prompt or prompt_zh");
    }
  }

  if (obj.prompt !== undefined && typeof obj.prompt !== "string") {
    issue("prompt", "expected string");
  }
  if (obj.prompt_zh !== undefined && typeof obj.prompt_zh !== "string") {
    issue("prompt_zh", "expected string");
  }
  if (obj.inputSchema !== undefined && !isPlainObject(obj.inputSchema)) {
    issue("inputSchema", "expected object");
  }
  validateArguments(obj.arguments, issue);

  return { ok: issues.length === 0, issues };
}

export function upgradeLegacySkill(
  legacy: LegacySkillSchema,
): UniversalSkill {
  return {
    schemaVersion: UNIVERSAL_SKILL_SCHEMA_VERSION,
    id: legacy.id,
    name: legacy.name,
    description: legacy.description,
    version: legacy.version,
    type: legacy.type,
    tags: legacy.tags,
    capabilities: defaultCapabilities(legacy.type),
    targets: { genericMcp: { injection: { mode: legacy.type } } },
    prompt: legacy.prompt,
    prompt_zh: legacy.prompt_zh,
    inputSchema: legacy.inputSchema,
    arguments: legacy.arguments,
    sourceFormat: "legacy",
  };
}

export function normaliseLegacySkill(
  obj: Record<string, unknown>,
): LegacySkillSchema {
  return {
    id: obj.id as string,
    name: typeof obj.name === "string" && obj.name.length > 0 ? obj.name : (obj.id as string),
    description: typeof obj.description === "string" ? obj.description : "",
    type: obj.type as LegacySkillType,
    prompt: typeof obj.prompt === "string" ? obj.prompt : undefined,
    prompt_zh: typeof obj.prompt_zh === "string" ? obj.prompt_zh : undefined,
    inputSchema: isPlainObject(obj.inputSchema)
      ? (obj.inputSchema as Record<string, unknown>)
      : undefined,
    arguments: normaliseArguments(obj.arguments),
    tags: normaliseTags(obj.tags),
    version: typeof obj.version === "string" ? obj.version : undefined,
  };
}

export function formatLegacyIssue(issue: ValidationIssue): string {
  return formatValidationIssue(issue);
}

function defaultCapabilities(type: LegacySkillType) {
  // These capabilities document the MCP behavior legacy skills already rely on.
  // They are not IDE capability requirements; adapter-specific checks start in
  // the compiler/connection phases.
  if (type === "tool") {
    return { required: ["mcp.tools.call"], optional: ["mcp.tools.list"] };
  }
  return { required: ["mcp.prompts.get"], optional: ["mcp.prompts.list"] };
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
