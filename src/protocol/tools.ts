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
import { runWorkflowAction } from "../commands/workflow.js";

export const BUILTIN_WORKFLOW_TOOL_NAMES = [
  "workflow.start",
  "workflow.next",
  "workflow.publish",
  "workflow.summarize",
] as const;

export function buildListToolsHandler(engine: SkillEngine) {
  return async (): Promise<ListToolsResult> => {
    await engine.waitForReady();
    const skills = engine.querySkills({ type: "tool" }).skills;
    return { tools: [...workflowToolMetas(), ...skills.map(toToolMeta)] };
  };
}

export function buildCallToolHandler(engine: SkillEngine) {
  return async (
    request: { params: { name: string; arguments?: Record<string, unknown> } },
  ): Promise<CallToolResult> => {
    await engine.waitForReady();
    const workflowResult = await callWorkflowTool(request.params.name, request.params.arguments ?? {});
    if (workflowResult) return workflowResult;

    const skill = engine.querySkills({ id: request.params.name, type: "tool" }).skills[0];
    if (!skill) {
      throw new Error(`Unknown tool skill: ${request.params.name}`);
    }

    const result = composeSkill(skill, request.params.arguments ?? {}) as ComposedToolCall;

    return result;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function callWorkflowTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult | undefined> {
  if (!name.startsWith("workflow.")) return undefined;

  const action = name.slice("workflow.".length);
  if (!BUILTIN_WORKFLOW_TOOL_NAMES.includes(name as (typeof BUILTIN_WORKFLOW_TOOL_NAMES)[number])) {
    throw new Error(`Unknown workflow tool: ${name}`);
  }

  // Built-in workflow tools reuse the CLI control-plane implementation. The
  // result is returned as JSON text so MCP clients can inspect every task,
  // prompt bundle, resource URI, blocked reason, and audit-linked session id.
  const result = await runWorkflowAction({
    action,
    appStateDir: stringArg(args.appStateDir),
    workflowId: stringArg(args.workflowId),
    sessionId: stringArg(args.sessionId),
    topic: stringArg(args.topic),
    producer: stringArg(args.producer),
    kind: stringArg(args.kind),
    content: args.content,
    summary: stringArg(args.summary),
    refs: stringArg(args.refs),
    json: true,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

function workflowToolMetas() {
  return [
    workflowTool("workflow.start", "Create a workflow session and return initial Data Plane Tasks.", {
      workflowId: { type: "string", description: "Workflow skill id to start." },
      appStateDir: { type: "string", description: "Optional app state directory override." },
    }, ["workflowId"]),
    workflowTool("workflow.next", "Return the next ready or blocked workflow tasks for a session.", {
      sessionId: { type: "string", description: "Workflow session id." },
      appStateDir: { type: "string", description: "Optional app state directory override." },
    }, ["sessionId"]),
    workflowTool("workflow.publish", "Publish a result to a session blackboard topic.", {
      sessionId: { type: "string", description: "Workflow session id." },
      topic: { type: "string", description: "Blackboard topic to append to." },
      content: { description: "JSON-compatible result content or plain text." },
      producer: { type: "string", description: "Producer id. Defaults to workflow.publish." },
      kind: { type: "string", description: "Entry kind. Defaults to result." },
      summary: { type: "string", description: "Short summary for scheduler/UI inspection." },
      refs: { type: "string", description: "Comma-separated reference URIs." },
      appStateDir: { type: "string", description: "Optional app state directory override." },
    }, ["sessionId", "topic", "content"]),
    workflowTool("workflow.summarize", "Summarize persisted workflow session topics.", {
      sessionId: { type: "string", description: "Workflow session id." },
      appStateDir: { type: "string", description: "Optional app state directory override." },
    }, ["sessionId"]),
  ];
}

function workflowTool(
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[],
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object" as const,
      properties,
      required,
    },
  };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

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
