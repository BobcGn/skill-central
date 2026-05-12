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

export type ComposedPrompt = { messages: PromptMessage[] };
export type ComposedToolCall = CallToolResult;

/**
 * Compose a resolved skill with concrete argument values.
 * Future: handlebars-style interpolation, conditional blocks, chained skills.
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

function composePrompt(
  skill: ResolvedSkill,
  _args: Record<string, unknown>,
): ComposedPrompt {
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
