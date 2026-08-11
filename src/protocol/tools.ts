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
import type { RuleEngine } from "../core/rule-engine.js";
import type { RuleSeverity } from "../schema/rule.js";
import { composeSkill } from "../core/composer.js";
import type { ComposedToolCall } from "../core/composer.js";
import { runWorkflowAction } from "../commands/workflow.js";
import { ReverseOutputService } from "../reverse-output/service.js";

export const BUILTIN_WORKFLOW_TOOL_NAMES = [
  "workflow.start",
  "workflow.next",
  "workflow.publish",
  "workflow.summarize",
] as const;
export const REVERSE_OUTPUT_TOOL_NAME = "reverse_output" as const;
export const RULE_LIST_TOOL_NAME = "rules.list" as const;
export const RULE_GET_TOOL_NAME = "rules.get" as const;
export const BUILTIN_CONTROL_TOOL_NAMES = [
  ...BUILTIN_WORKFLOW_TOOL_NAMES,
  REVERSE_OUTPUT_TOOL_NAME,
  RULE_LIST_TOOL_NAME,
  RULE_GET_TOOL_NAME,
] as const;

export function buildListToolsHandler(
  engine: SkillEngine,
  ruleEngine: RuleEngine,
  reverseOutput: ReverseOutputService,
) {
  return async (): Promise<ListToolsResult> => {
    await Promise.all([engine.waitForReady(), ruleEngine.waitForReady()]);
    const skills = engine.querySkills({ type: "tool" }).skills;
    void reverseOutput;
    return {
      tools: [
        rulesListToolMeta(),
        rulesGetToolMeta(),
        reverseOutputToolMeta(),
        ...workflowToolMetas(),
        ...skills.map(toToolMeta),
      ],
    };
  };
}

export function buildCallToolHandler(
  engine: SkillEngine,
  ruleEngine: RuleEngine,
  reverseOutput: ReverseOutputService,
) {
  return async (
    request: { params: { name: string; arguments?: Record<string, unknown> } },
  ): Promise<CallToolResult> => {
    await Promise.all([engine.waitForReady(), ruleEngine.waitForReady()]);
    if (request.params.name === RULE_LIST_TOOL_NAME) {
      const args = request.params.arguments ?? {};
      const rules = ruleEngine.queryRules({
        tag: stringArg(args.tag),
        severity: ruleSeverityArg(args.severity),
      });
      return jsonToolResult({
        schemaVersion: "skillcentral.dev/rule-registry/v1",
        count: rules.length,
        rules: rules.map(({ body, ...metadata }) => metadata),
      });
    }

    if (request.params.name === RULE_GET_TOOL_NAME) {
      const id = requiredStringArg(request.params.arguments?.id, "id");
      const rule = ruleEngine.getRule(id);
      if (!rule) throw new Error(`Unknown rule: ${id}`);
      return jsonToolResult(rule);
    }

    if (request.params.name === REVERSE_OUTPUT_TOOL_NAME) {
      const result = await reverseOutput.execute(request.params.arguments ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

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

function reverseOutputToolMeta() {
  return {
    name: REVERSE_OUTPUT_TOOL_NAME,
    description:
      "Preview or explicitly promote, defer, discard, and roll back a Skill Central reverse-output asset.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["preview", "apply", "rollback"],
          description: "preview is side-effect free; apply requires a decision.",
        },
        assetType: {
          type: "string",
          enum: ["skill", "rule"],
          description: "The durable asset class to write.",
        },
        operation: {
          type: "string",
          enum: ["create", "update"],
          description: "Create a missing asset or update one exact existing asset.",
        },
        source: {
          type: "string",
          description: "Where the candidate came from, such as ide:codex.",
        },
        context: {
          type: "string",
          description: "Work context that explains why this candidate was produced.",
        },
        target: {
          type: "string",
          description: "Skill layer id/name, or a directory under .rules/.",
        },
        placement: {
          type: "string",
          enum: ["skill", "covenant-rule", "ide-native-rule", "project-local"],
          description: "Explicit boundary classification; IDE-native rules are never promotable.",
        },
        placementReason: {
          type: "string",
          description: "Why the candidate belongs in the selected placement.",
        },
        asset: {
          type: "object",
          description: "Universal Skill v1 or Rule v1 object with explicit appliesTo.",
        },
        decision: {
          type: "string",
          enum: ["promote", "defer", "discard"],
          description: "Required for apply; promote is the only decision that writes source.",
        },
        expectedSha256: {
          type: "string",
          description: "Required for update and rollback concurrency protection.",
        },
        targetPath: {
          type: "string",
          description: "Existing configured Skill Layer or .rules/ file for rollback.",
        },
        backupPath: {
          type: "string",
          description: "Sibling backup returned by a prior promote or rollback.",
        },
        appStateDir: {
          type: "string",
          description: "Optional isolated app-state directory for audit evidence.",
        },
      },
      required: ["action"],
    },
  };
}

function rulesListToolMeta() {
  return {
    name: RULE_LIST_TOOL_NAME,
    description: "List applicable Skill Central covenant rules and their provenance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tag: { type: "string", description: "Optional exact rule tag." },
        severity: {
          type: "string",
          enum: ["info", "warn", "error"],
          description: "Optional minimum library filter by exact severity.",
        },
      },
    },
  };
}

function rulesGetToolMeta() {
  return {
    name: RULE_GET_TOOL_NAME,
    description: "Read one applicable covenant rule, including its full instruction body.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Rule id returned by rules.list." },
      },
      required: ["id"],
    },
  };
}

function jsonToolResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function requiredStringArg(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function ruleSeverityArg(value: unknown): RuleSeverity | undefined {
  if (value === undefined) return undefined;
  if (value === "info" || value === "warn" || value === "error") return value;
  throw new Error("severity must be one of: info, warn, error.");
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
