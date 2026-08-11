// ============================================================================
// Protocol / Prompts
// ----------------------------------------------------------------------------
// MCP Prompt handlers: list available prompt skills and retrieve a specific
// prompt by name with its argument values.
//
// Special prompt name "skills:compose" performs tag-based multi-skill merging:
//   GetPrompt({ name: "skills:compose", arguments: { tags: ["kmp"] }})
// → collects all skills tagged with "kmp", merges in priority order, returns
//   the combined prompt to the IDE.
// ============================================================================

import type {
  ListPromptsResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillEngine, ResolvedSkillView } from "../core/engine.js";
import type { RuleEngine, ResolvedRuleView } from "../core/rule-engine.js";
import type { RuleSeverity } from "../schema/rule.js";
import { composeSkill, composeByTags } from "../core/composer.js";
import type { ComposedPrompt } from "../core/composer.js";

export const ALL_RULES_PROMPT_NAME = "rules:all";
export const RULE_PROMPT_PREFIX = "rule:";

export function buildListPromptsHandler(engine: SkillEngine, ruleEngine: RuleEngine) {
  return async (): Promise<ListPromptsResult> => {
    await Promise.all([engine.waitForReady(), ruleEngine.waitForReady()]);
    const skills = engine.querySkills({ type: "prompt" }).skills;
    const rules = ruleEngine.queryRules();
    return {
      prompts: [allRulesPromptMeta(), ...rules.map(toRulePromptMeta), ...skills.map(toPromptMeta)],
    };
  };
}

export function buildGetPromptHandler(engine: SkillEngine, ruleEngine: RuleEngine) {
  return async (
    request: { params: { name: string; arguments?: Record<string, string | undefined> } },
  ): Promise<GetPromptResult> => {
    await Promise.all([engine.waitForReady(), ruleEngine.waitForReady()]);
    const { name, arguments: args } = request.params;

    if (name === ALL_RULES_PROMPT_NAME) {
      const severity = extractSeverity(args?.severity);
      const rules = ruleEngine.queryRules({
        tag: args?.tag?.trim() || undefined,
        severity,
      });
      return rulesPromptResult(rules, "Applicable Skill Central covenant rules");
    }

    if (name.startsWith(RULE_PROMPT_PREFIX)) {
      const ruleId = name.slice(RULE_PROMPT_PREFIX.length);
      const rule = ruleEngine.getRule(ruleId);
      if (!rule) throw new Error(`Unknown rule prompt: ${ruleId}`);
      return rulesPromptResult([rule], rule.description);
    }

    // ── Special: tag-based composition ───────────────────────────────────
    if (name === "skills:compose") {
      const tags = extractTags(args);
      const matched = engine.querySkills({ type: "prompt", tags }).skills;

      if (matched.length === 0) {
        throw new Error(`No skills found for tags: ${tags.join(", ")}`);
      }

      const result = composeByTags(matched);
      return {
        description: `Composed prompt from tags: ${tags.join(", ")} (${matched.length} skills)`,
        messages: result.messages,
      };
    }

    // ── Standard: single skill lookup ─────────────────────────────────────
    const skill = engine.querySkills({ id: name, type: "prompt" }).skills[0];
    if (!skill) {
      throw new Error(`Unknown prompt skill: ${name}`);
    }

    const result = composeSkill(skill, args ?? {}) as ComposedPrompt;

    return {
      description: skill.description,
      messages: result.messages,
    };
  };
}

function allRulesPromptMeta() {
  return {
    name: ALL_RULES_PROMPT_NAME,
    description: "Load all applicable global and project covenant rules before coding.",
    arguments: [
      { name: "tag", description: "Optional rule tag filter", required: false },
      { name: "severity", description: "Optional info, warn, or error filter", required: false },
    ],
  };
}

function toRulePromptMeta(rule: ResolvedRuleView) {
  return {
    name: `${RULE_PROMPT_PREFIX}${rule.id}`,
    description: `[${rule.severity}] ${rule.description}`,
  };
}

function rulesPromptResult(rules: ResolvedRuleView[], description: string): GetPromptResult {
  if (rules.length === 0) throw new Error("No applicable rules found for the requested filters.");
  return {
    description,
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: rules.map((rule) => [
          `# ${rule.name}`,
          `Rule ID: ${rule.id}`,
          `Severity: ${rule.severity}`,
          `Source: ${rule.library} (${rule.source})`,
          "",
          rule.body,
        ].join("\n")).join("\n\n---\n\n"),
      },
    }],
  };
}

function extractSeverity(value: string | undefined): RuleSeverity | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (value === "info" || value === "warn" || value === "error") return value;
  throw new Error(`Invalid rule severity: ${value}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toPromptMeta(skill: ResolvedSkillView) {
  return {
    name: skill.id,
    description: skill.description || `Execute the ${skill.id} prompt.`,
    arguments: skill.arguments,
  };
}

/**
 * Extract tags from GetPrompt arguments.
 * MCP GetPrompt arguments are constrained to string values, so tags are
 * passed as a comma-separated string: { tags: "kmp,android" }
 */
function extractTags(args: Record<string, string | undefined> | undefined): string[] {
  if (!args?.tags) return [];
  return args.tags.split(",").map((t) => t.trim()).filter(Boolean);
}
