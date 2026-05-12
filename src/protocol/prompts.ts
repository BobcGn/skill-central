// ============================================================================
// Protocol / Prompts
// ----------------------------------------------------------------------------
// MCP Prompt handlers: list available prompt skills and retrieve a specific
// prompt by name with its argument values.
// ============================================================================

import type {
  ListPromptsResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillEngine, ResolvedSkillView } from "../core/engine.js";
import { composeSkill } from "../core/composer.js";
import type { ComposedPrompt } from "../core/composer.js";

export function buildListPromptsHandler(engine: SkillEngine) {
  return async (): Promise<ListPromptsResult> => {
    const skills = engine.listSkills().filter((s) => s.type === "prompt");
    return { prompts: skills.map(toPromptMeta) };
  };
}

export function buildGetPromptHandler(engine: SkillEngine) {
  return async (
    request: { params: { name: string; arguments?: Record<string, unknown> } },
  ): Promise<GetPromptResult> => {
    const skill = engine.getSkill(request.params.name);
    if (!skill) {
      throw new Error(`Unknown prompt skill: ${request.params.name}`);
    }

    const result = composeSkill(
      skill as ResolvedSkillView & { priority: number; source: string },
      request.params.arguments ?? {},
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
    description: skill.description,
    arguments: skill.arguments,
  };
}
