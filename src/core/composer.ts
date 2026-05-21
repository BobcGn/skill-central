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
  args: Record<string, unknown>,
): ComposedPrompt {
  let text = skill.prompt ?? "";
  for (const [key, value] of Object.entries(args)) {
    const placeholder = `{{${key}}}`;
    if (text.includes(placeholder)) {
      text = text.replaceAll(placeholder, String(value));
    }
  }
  const content: TextContent = { type: "text", text };
  return {
    messages: [{ role: "user", content }],
  };
}

function composeTool(
  skill: ResolvedSkill,
  args: Record<string, unknown>,
): ComposedToolCall {
  const errors = validateArgs(skill.inputSchema, args);
  if (errors.length > 0) {
    return {
      content: [{ type: "text", text: errors.join("\n") }],
      isError: true,
    };
  }

  let text = skill.prompt ?? "";
  for (const [key, value] of Object.entries(args)) {
    const placeholder = `{{${key}}}`;
    if (text.includes(placeholder)) {
      text = text.replaceAll(placeholder, String(value));
    }
  }

  return {
    content: [{ type: "text", text: text || JSON.stringify(args, null, 2) }],
  };
}

/**
 * Lightweight validation of tool arguments against a JSON Schema.
 * Returns an array of human-readable error messages (empty = valid).
 */
function validateArgs(
  schema: Record<string, unknown> | undefined,
  args: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  if (!schema || typeof schema !== "object") return errors;

  const required = (schema as Record<string, unknown>).required;
  const properties = (schema as Record<string, unknown>).properties as
    | Record<string, { type?: string }>
    | undefined;

  // Check required fields
  if (Array.isArray(required)) {
    for (const field of required) {
      if (!(field in args) || args[field] === undefined || args[field] === null) {
        errors.push(`Missing required argument: "${field}"`);
      }
    }
  }

  // Type validation for provided fields
  if (properties) {
    for (const [key, value] of Object.entries(args)) {
      const prop = properties[key];
      if (!prop?.type || value === undefined || value === null) continue;

      const typeMap: Record<string, (v: unknown) => boolean> = {
        string: (v) => typeof v === "string",
        number: (v) => typeof v === "number",
        integer: (v) => Number.isInteger(v),
        boolean: (v) => typeof v === "boolean",
        array: (v) => Array.isArray(v),
        object: (v) => typeof v === "object" && !Array.isArray(v) && v !== null,
      };

      const check = typeMap[prop.type];
      if (check && !check(value)) {
        errors.push(
          `Argument "${key}" expected ${prop.type}, got ${Array.isArray(value) ? "array" : typeof value}`,
        );
      }
    }
  }

  return errors;
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
