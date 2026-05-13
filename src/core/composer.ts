// ============================================================================
// Core / Composer
// ----------------------------------------------------------------------------
// Takes a resolved skill + concrete argument values and produces the final
// prompt string or tool call payload. Template interpolation, context
// assembly, and any pre-processing happens here.
// ============================================================================

import type { ResolvedSkill } from "../storage/schemas.js";
import type { PromptMessage, TextContent } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ResolvedSkillView } from "./engine.js";

export type ComposedPrompt = { messages: PromptMessage[] };
export type ComposedToolCall = CallToolResult;

/**
 * Compose a single resolved skill with concrete argument values.
 */
export function composeSkill(
  skill: ResolvedSkill,
  args: Record<string, unknown>,
): ComposedPrompt | ComposedToolCall {
  if (skill.type === "prompt") {
    return composePrompt(skill, args);
  }
  return composeTool(skill, args);
}

// ── Single-prompt composition ──────────────────────────────────────────────

function composePrompt(
  skill: ResolvedSkill,
  _args: Record<string, unknown>,
): ComposedPrompt {
  // TODO: replace {{placeholder}} in skill.prompt with actual _args values
  const content: TextContent = { type: "text", text: skill.prompt ?? "" };
  return {
    messages: [{ role: "user", content }],
  };
}

function composeTool(
  _skill: ResolvedSkill,
  args: Record<string, unknown>,
): ComposedToolCall {
  // TODO: validate args against skill.inputSchema before returning
  return {
    content: [{ type: "text", text: JSON.stringify(args, null, 2) }],
  };
}

// ── Tag-based multi-skill composition ──────────────────────────────────────
// 当 IDE 通过 tags 参数请求上下文时，按优先级合并多个技能的 prompt 内容。
// 策略：低优先级在前（全局上下文），高优先级在后（领域/框架专精），
// 形成"基础→进阶"的逐层叠加效果，而非简单的覆盖。

/**
 * Merge multiple skills by concatenating their prompt sections.
 * Skills are assumed to be pre-sorted by ascending layer priority.
 */
export function composeByTags(
  skills: ResolvedSkillView[],
): ComposedPrompt {
  const sections: string[] = [];

  for (const skill of skills) {
    if (skill.type === "prompt" && skill.prompt) {
      const header = `## ${skill.name}  (${skill.id})\n`;
      sections.push(header + skill.prompt.trim());
    }
  }

  const merged = sections.join("\n\n---\n\n");

  const content: TextContent = {
    type: "text",
    text: merged || "(no matching skills found)",
  };

  return {
    messages: [{ role: "user", content }],
  };
}
