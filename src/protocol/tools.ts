// ============================================================================
// Protocol / Tools
// ----------------------------------------------------------------------------
// MCP Tool handlers: list available tool skills and invoke a specific tool
// with its argument values.
// ============================================================================

import type {
  ListToolsResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillEngine, ResolvedSkillView } from "../core/engine.js";
import { composeSkill } from "../core/composer.js";
import type { ComposedToolCall } from "../core/composer.js";

export function buildListToolsHandler(engine: SkillEngine) {
  return async (): Promise<ListToolsResult> => {
    await engine.waitForReady();
    const skills = engine.listSkills().filter((s) => s.type === "tool");
    return { tools: skills.map(toToolMeta) };
  };
}

export function buildCallToolHandler(engine: SkillEngine) {
  return async (
    request: { params: { name: string; arguments?: Record<string, unknown> } },
  ): Promise<CallToolResult> => {
    await engine.waitForReady();
    const skill = engine.getSkill(request.params.name);
    if (!skill) {
      throw new Error(`Unknown tool skill: ${request.params.name}`);
    }

    const result = composeSkill(
      skill as ResolvedSkillView & { priority: number; source: string },
      request.params.arguments ?? {},
    ) as ComposedToolCall;

    return result;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toToolMeta(skill: ResolvedSkillView) {
  const schema = skill.inputSchema as
    | { properties?: Record<string, object>; required?: string[] }
    | undefined;

  const properties = schema?.properties ?? {};
  const required = schema?.required && schema.required.length > 0 ? schema.required : undefined;

  return {
    name: skill.id,
    description: skill.description || `Execute the ${skill.id} skill operation.`,
    inputSchema: {
      type: "object" as const,
      properties,
      ...(required ? { required } : {}),
    },
  };
}
