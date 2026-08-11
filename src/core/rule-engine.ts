// ============================================================================
// Core / Rule Engine
// ----------------------------------------------------------------------------
// Loads the global and project covenant libraries for MCP consumers.
// Rules remain a separate asset class from Skills: this engine has its own
// storage, query, scope, and failure boundary.
// ============================================================================

import path from "node:path";
import { queryRules, type RuleQuery } from "../registry/rule-query.js";
import { assetAppliesTo, type AssetScopeContext } from "../schema/asset-scope.js";
import type { Rule } from "../schema/rule.js";
import { resolveAssetScopeContext } from "../storage/project-identity.js";
import { readAllRuleEntries } from "../storage/rule-reader.js";
import { resolveAssetLibrary } from "../storage/asset-library.js";

export const GLOBAL_RULES_DIR_ENV = "SKILL_CENTRAL_GLOBAL_RULES_DIR";

export interface ResolvedRuleView extends Rule {
  source: string;
  library: "global" | "project";
}

export interface RuleEngineOptions {
  projectRoot?: string;
  projectId?: string;
  scopeContext?: AssetScopeContext;
  globalRulesDir?: string;
  projectRulesDir?: string;
}

export class RuleEngine {
  private rules: ResolvedRuleView[] = [];
  private readyPromise: Promise<void> | null = null;

  async reload(options: RuleEngineOptions = {}): Promise<void> {
    this.readyPromise = this.load(options);
    await this.readyPromise;
  }

  async waitForReady(): Promise<void> {
    if (this.readyPromise) await this.readyPromise;
  }

  queryRules(query: RuleQuery = {}): ResolvedRuleView[] {
    const matched = queryRules(this.rules, query);
    const ids = new Set(matched.map((rule) => rule.id));
    return this.rules.filter((rule) => ids.has(rule.id));
  }

  getRule(id: string): ResolvedRuleView | undefined {
    return this.rules.find((rule) => rule.id === id);
  }

  private async load(options: RuleEngineOptions): Promise<void> {
    const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    const scopeContext = options.scopeContext
      ?? await resolveAssetScopeContext(projectRoot, options.projectId);
    const explicitGlobalDir = options.globalRulesDir ?? process.env[GLOBAL_RULES_DIR_ENV];
    const projectDir = path.resolve(
      options.projectRulesDir ?? resolveAssetLibrary(projectRoot).rulesDir,
    );
    const sources = explicitGlobalDir
      ? path.resolve(explicitGlobalDir) === projectDir
        ? [{ directory: projectDir, library: "project" as const }]
        : [
            { directory: path.resolve(explicitGlobalDir), library: "global" as const },
            { directory: projectDir, library: "project" as const },
          ]
      : [{ directory: projectDir, library: "project" as const }];
    const effective = new Map<string, ResolvedRuleView>();

    for (const source of sources) {
      for (const entry of await readAllRuleEntries([source.directory])) {
        if (!assetAppliesTo(entry.rule.appliesTo, scopeContext)) continue;
        // Project rules intentionally override same-id global rules. The
        // ordered source list makes the rule deterministic and inspectable.
        effective.set(entry.rule.id, {
          ...entry.rule,
          source: path.resolve(entry.filePath),
          library: source.library,
        });
      }
    }

    this.rules = [...effective.values()].sort((a, b) => a.id.localeCompare(b.id));
    console.error(
      `[skill-central] Loaded ${this.rules.length} rules from ${sources.length} explicit covenant source(s)`,
    );
  }
}
