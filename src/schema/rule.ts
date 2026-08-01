// ============================================================================
// Schema / Rule
// ----------------------------------------------------------------------------
// Rule v1 type definitions and lightweight runtime validation.
//
// Design intent:
// - Rules are a SEPARATE asset class from Skills. This module is intentionally
//   independent of schema/universal-skill.ts: rules have their own contract,
//   their own storage directory (.rules/), and their own failure boundary so a
//   broken rule can never affect skill loading and vice versa.
// - The v1 contract stays independent while sharing only the generic
//   `appliesTo` scope contract with Skills. Rule validation and loading remain
//   isolated from the Skill pipeline.
// - Validation mirrors the field-level issue style used for skills so CLI and
//   future registry/UI surfaces report problems consistently.
// ============================================================================

import {
  normaliseAssetScope,
  validateAssetScope,
  type AssetScope,
} from "./asset-scope.js";

export const RULE_SCHEMA_VERSION = "skillcentral.dev/rule/v1" as const;

export type RuleSchemaVersion = typeof RULE_SCHEMA_VERSION;

export type RuleSeverity = "info" | "warn" | "error";

export interface Rule {
  schemaVersion: RuleSchemaVersion;
  id: string;
  name: string;
  description: string;
  body: string;
  tags?: string[];
  severity: RuleSeverity;
  appliesTo: AssetScope;
}

export interface RuleValidationIssue {
  filePath: string;
  fieldPath: string;
  reason: string;
}

export interface RuleValidationResult {
  ok: boolean;
  issues: RuleValidationIssue[];
}

const VALID_SEVERITIES = new Set<RuleSeverity>(["info", "warn", "error"]);
const DEFAULT_SEVERITY: RuleSeverity = "info";

/**
 * A file is a candidate rule when it declares the rule schema version.
 * This lets the reader distinguish rule files from anything else that might
 * live under .rules/ without importing the skill schema.
 */
export function isRuleObject(obj: Record<string, unknown>): boolean {
  return obj.schemaVersion === RULE_SCHEMA_VERSION;
}

export function validateRuleObject(
  obj: Record<string, unknown>,
  filePath: string,
): RuleValidationResult {
  const issues: RuleValidationIssue[] = [];
  const issue = (fieldPath: string, reason: string) => {
    issues.push({ filePath, fieldPath, reason });
  };

  if (obj.schemaVersion !== RULE_SCHEMA_VERSION) {
    issue("schemaVersion", `expected "${RULE_SCHEMA_VERSION}"`);
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
  if (!nonEmptyString(obj.body)) {
    issue("body", "required non-empty string");
  }

  if (obj.tags !== undefined) {
    if (!Array.isArray(obj.tags)) {
      issue("tags", "expected array of strings");
    } else {
      obj.tags.forEach((tag, index) => {
        if (typeof tag !== "string" || tag.trim().length === 0) {
          issue(`tags[${index}]`, "expected non-empty string");
        }
      });
    }
  }

  if (
    obj.severity !== undefined &&
    (typeof obj.severity !== "string" || !VALID_SEVERITIES.has(obj.severity as RuleSeverity))
  ) {
    issue("severity", `expected one of: ${Array.from(VALID_SEVERITIES).join(", ")}`);
  }

  for (const scopeIssue of validateAssetScope(obj.appliesTo)) {
    issue(scopeIssue.fieldPath, scopeIssue.reason);
  }

  return { ok: issues.length === 0, issues };
}

export function normaliseRule(obj: Record<string, unknown>): Rule {
  return {
    schemaVersion: RULE_SCHEMA_VERSION,
    id: obj.id as string,
    name: obj.name as string,
    description: obj.description as string,
    body: obj.body as string,
    tags: normaliseTags(obj.tags),
    severity: VALID_SEVERITIES.has(obj.severity as RuleSeverity)
      ? (obj.severity as RuleSeverity)
      : DEFAULT_SEVERITY,
    appliesTo: normaliseAssetScope(obj.appliesTo),
  };
}

export function formatRuleValidationIssue(issue: RuleValidationIssue): string {
  return `${issue.filePath}: ${issue.fieldPath}: ${issue.reason}`;
}

function normaliseTags(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const tags = input.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return tags.length > 0 ? tags : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
