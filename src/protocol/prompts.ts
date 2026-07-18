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
import { composeSkill, composeByTags } from "../core/composer.js";
import type { ComposedPrompt } from "../core/composer.js";

export function buildListPromptsHandler(engine: SkillEngine) {
  return async (): Promise<ListPromptsResult> => {
    await engine.waitForReady();
    const skills = engine.listSkills().filter((s) => s.type === "prompt");
    return { prompts: skills.map(toPromptMeta) };
  };
}

export function buildGetPromptHandler(engine: SkillEngine) {
  return async (
    request: { params: { name: string; arguments?: Record<string, string | undefined> } },
  ): Promise<GetPromptResult> => {
    await engine.waitForReady();
    const { name, arguments: args } = request.params;

    // ── Special: tag-based composition ───────────────────────────────────
    if (name === "skills:compose") {
      const tags = extractTags(args);
      const matched = engine.getSkillsByTags(tags);

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
    const skill = engine.getSkill(name);
    if (!skill) {
      throw new Error(`Unknown prompt skill: ${name}`);
    }

    const result = composeSkill(
      skill as ResolvedSkillView & { priority: number; source: string },
      args ?? {},
    ) as ComposedPrompt;

    return {
      description: skill.description,
      messages: result.messages,
    };
  };
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
