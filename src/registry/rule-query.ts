// ============================================================================
// Registry / Rule Query
// ----------------------------------------------------------------------------
// Shared, pure query surface for loaded rules — the rule-side counterpart to
// registry/query.ts. CLI, and later MCP/Web/UI, should filter rules through
// this function so they share one interpretation of id/tag/severity instead of
// filtering arrays independently.
//
// This module is intentionally pure: it does not read files or mutate state.
// ============================================================================

import type { Rule, RuleSeverity } from "../schema/rule.js";
import { assetAppliesTo, type AssetScopeContext } from "../schema/asset-scope.js";

export interface RuleQuery {
  id?: string;
  tag?: string;
  severity?: RuleSeverity;
  scopeContext?: AssetScopeContext;
}

export function queryRules(rules: Rule[], query: RuleQuery = {}): Rule[] {
  const matched = rules.filter((rule) => matchesRule(rule, query));
  return sortRules(matched);
}

export function getRuleById(rules: Rule[], id: string): Rule | undefined {
  return rules.find((rule) => rule.id === id);
}

function matchesRule(rule: Rule, query: RuleQuery): boolean {
  if (query.id && rule.id !== query.id) return false;
  if (query.severity && rule.severity !== query.severity) return false;
  if (query.tag && !hasTag(rule, query.tag)) return false;
  if (query.scopeContext && !assetAppliesTo(rule.appliesTo, query.scopeContext)) return false;
  return true;
}

function hasTag(rule: Rule, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return (rule.tags ?? []).some((t) => t.toLowerCase() === wanted);
}

function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.id.localeCompare(b.id));
}
