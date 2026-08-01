// ============================================================================
// Rules Command
// ----------------------------------------------------------------------------
// "skill-central rules" — list every loaded rule from the .rules/ directory.
// Supports filtering by tag and severity. This is the rule-side counterpart to
// the `list` command and shares no code path with skill listing, so the two
// lists can never cross-contaminate.
// ============================================================================

import { readAllRules, DEFAULT_RULES_DIR } from "../storage/rule-reader.js";
import { queryRules } from "../registry/rule-query.js";
import type { RuleSeverity } from "../schema/rule.js";
import { resolveAssetScopeContext } from "../storage/project-identity.js";

export interface RulesOptions {
  tag?: string;
  severity?: RuleSeverity;
  dir?: string;
  projectRoot?: string;
  projectId?: string;
}

export async function cmdRules(opts: RulesOptions): Promise<void> {
  const rules = await readAllRules([opts.dir ?? DEFAULT_RULES_DIR]);
  const scopeContext = await resolveAssetScopeContext(opts.projectRoot, opts.projectId);

  const matched = queryRules(rules, {
    tag: opts.tag,
    severity: opts.severity,
    scopeContext,
  });

  if (matched.length === 0) {
    console.log("");
    console.log("  (no rules match the filters — add rule files under .rules/)");
    console.log("");
    return;
  }

  console.log("");
  console.log(`▸ ${matched.length} rule(s)`);
  console.log("  " + "-".repeat(72));
  console.table(
    matched.map((r) => ({
      ID: r.id,
      Name: r.name.length > 28 ? r.name.slice(0, 27) + "…" : r.name,
      Severity: r.severity,
      Scope: r.appliesTo === "global" ? "global" : `${r.appliesTo.projects.length} project(s)`,
      Tags: (r.tags ?? []).slice(0, 6).join(","),
    })),
  );
  console.log("");
}
