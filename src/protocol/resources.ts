// ============================================================================
// Protocol / Resources
// ----------------------------------------------------------------------------
// MCP Resource handlers for read-only registry and compiler evidence.
//
// Design intent:
// - Resource reads must be side-effect free. They expose the same resolved
//   registry and dry-run compiler bundles already used by CLI/Web Board.
// - URI parsing stays centralized here so future session/blackboard resources
//   can extend one routing table instead of scattering string checks.
// - Unknown or premature dynamic URIs fail explicitly; returning placeholder
//   session data would make workflow state look auditable before it exists.
// ============================================================================

import type {
  ListResourcesResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { isCompileTarget } from "../adapters/registry.js";
import type { CompileTarget } from "../adapters/types.js";
import { compileIntentDryRun } from "../compiler/compiler.js";
import type { SkillEngine, ResolvedSkillView } from "../core/engine.js";
import type { RuleEngine, ResolvedRuleView } from "../core/rule-engine.js";
import { ensureAppState } from "../local-store/app-state.js";
import { createBlackboardStore } from "../state/blackboard.js";
import { createSessionStore } from "../state/session-store.js";
import { BUILTIN_WORKFLOW_TOOL_NAMES } from "./tools.js";
import type { WorkflowStep } from "../schema/universal-skill.js";

type ParsedResourceUri =
  | { kind: "registry" }
  | { kind: "skill"; skillId: string }
  | { kind: "rule-registry" }
  | { kind: "rule"; ruleId: string }
  | { kind: "bundle"; target: CompileTarget; intent: string }
  | { kind: "session-context"; sessionId: string }
  | { kind: "session-topic"; sessionId: string; topic: string }
  | { kind: "workflow-plan"; workflowId: string };

export function buildListResourcesHandler(engine: SkillEngine, ruleEngine: RuleEngine) {
  return async (): Promise<ListResourcesResult> => {
    await Promise.all([engine.waitForReady(), ruleEngine.waitForReady()]);
    const skills = engine.querySkills().skills;
    const rules = ruleEngine.queryRules();

    return {
      resources: [
        {
          uri: "skill://registry",
          name: "skill-central registry",
          title: "Skill Registry",
          description: "Resolved skill registry with effective/conflicted records and layer provenance.",
          mimeType: "application/json",
        },
        {
          uri: "rule://registry",
          name: "skill-central rule registry",
          title: "Rule Registry",
          description: "Applicable global and project covenant rules available to the Coding Agent.",
          mimeType: "application/json",
          annotations: { audience: ["assistant" as const], priority: 1 },
        },
        ...rules.map(toRuleResource),
        ...skills.map(toSkillResource),
        ...skills.filter((skill) => skill.type === "workflow").map(toWorkflowPlanResource),
      ],
    };
  };
}

export function buildReadResourceHandler(engine: SkillEngine, ruleEngine: RuleEngine) {
  return async (
    request: { params: { uri: string } },
  ): Promise<ReadResourceResult> => {
    await Promise.all([engine.waitForReady(), ruleEngine.waitForReady()]);
    const parsed = parseResourceUri(request.params.uri);

    if (parsed.kind === "registry") {
      return jsonResource("skill://registry", {
        records: engine.listResolutionRecords(),
      });
    }

    if (parsed.kind === "skill") {
      const skill = engine.querySkills({ id: parsed.skillId }).skills[0];
      if (!skill) throw new Error(`Unknown skill resource: ${parsed.skillId}`);
      return jsonResource(`skill://skill/${encodeURIComponent(parsed.skillId)}`, skill);
    }

    if (parsed.kind === "rule-registry") {
      return jsonResource("rule://registry", {
        schemaVersion: "skillcentral.dev/rule-registry/v1",
        rules: ruleEngine.queryRules(),
      });
    }

    if (parsed.kind === "rule") {
      const rule = ruleEngine.getRule(parsed.ruleId);
      if (!rule) throw new Error(`Unknown rule resource: ${parsed.ruleId}`);
      return jsonResource(`rule://rule/${encodeURIComponent(parsed.ruleId)}`, rule);
    }

    if (parsed.kind === "bundle") {
      const bundle = compileIntentDryRun(engine.listResolutionRecords(), {
        target: parsed.target,
        intent: parsed.intent,
      });
      return jsonResource(
        `skill://bundle/${parsed.target}/${encodeURIComponent(parsed.intent)}`,
        bundle,
      );
    }

    if (parsed.kind === "session-context") {
      const appState = await ensureAppState();
      const session = await createSessionStore(appState).get(parsed.sessionId);
      if (!session) throw new Error(`Unknown session resource: ${parsed.sessionId}`);
      return jsonResource(`skill://session/${parsed.sessionId}/context`, session);
    }

    if (parsed.kind === "session-topic") {
      const appState = await ensureAppState();
      const session = await createSessionStore(appState).get(parsed.sessionId);
      if (!session) throw new Error(`Unknown session resource: ${parsed.sessionId}`);
      const topic = await createBlackboardStore(appState).readTopic(parsed.sessionId, parsed.topic);
      if (!topic) throw new Error(`Unknown blackboard topic resource: ${parsed.topic}`);
      return jsonResource(`skill://session/${parsed.sessionId}/topic/${encodeURIComponent(parsed.topic)}`, topic);
    }

    if (parsed.kind === "workflow-plan") {
      const workflow = engine.querySkills({ id: parsed.workflowId, type: "workflow" }).skills[0];
      if (!workflow) throw new Error(`Unknown workflow plan resource: ${parsed.workflowId}`);
      return jsonResource(`skill://workflow/${encodeURIComponent(parsed.workflowId)}/plan`, buildWorkflowPlanResource(workflow));
    }

    throw new Error(`Unknown skill resource URI: ${request.params.uri}`);
  };
}

export function parseResourceUri(uri: string): ParsedResourceUri {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error(`Invalid skill resource URI: ${uri}`);
  }

  if (url.protocol === "rule:") {
    const ruleSegments = [url.hostname, ...url.pathname.split("/")]
      .filter(Boolean)
      .map(decodeURIComponent);
    const [ruleRoot, ruleId] = ruleSegments;
    if (ruleRoot === "registry" && ruleSegments.length === 1) return { kind: "rule-registry" };
    if (ruleRoot === "rule" && ruleId && ruleSegments.length === 2) {
      return { kind: "rule", ruleId };
    }
    throw new Error(`Unknown rule resource URI: ${uri}`);
  }

  if (url.protocol !== "skill:") {
    throw new Error(`Unsupported resource protocol: ${url.protocol}`);
  }

  const segments = [url.hostname, ...url.pathname.split("/")].filter(Boolean).map(decodeURIComponent);
  const [root, first, second, third] = segments;

  if (root === "registry" && segments.length === 1) return { kind: "registry" };
  if (root === "skill" && first && segments.length === 2) return { kind: "skill", skillId: first };
  if (root === "bundle" && first && second && segments.length === 3) {
    if (!isCompileTarget(first)) {
      throw new Error(`Unsupported bundle target "${first}"`);
    }
    return { kind: "bundle", target: first, intent: second };
  }
  if (root === "session" && first && second === "context" && segments.length === 3) {
    return { kind: "session-context", sessionId: first };
  }
  if (root === "session" && first && second === "topic" && third && segments.length === 4) {
    return { kind: "session-topic", sessionId: first, topic: third };
  }
  if (root === "workflow" && first && second === "plan" && segments.length === 3) {
    return { kind: "workflow-plan", workflowId: first };
  }

  throw new Error(`Unknown skill resource URI: ${uri}`);
}

function toRuleResource(rule: ResolvedRuleView) {
  return {
    uri: `rule://rule/${encodeURIComponent(rule.id)}`,
    name: rule.id,
    title: rule.name,
    description: rule.description,
    mimeType: "application/json",
    annotations: {
      audience: ["assistant" as const],
      priority: rule.severity === "error" ? 1 : rule.severity === "warn" ? 0.9 : 0.8,
    },
  };
}

function toSkillResource(skill: ResolvedSkillView) {
  return {
    uri: `skill://skill/${encodeURIComponent(skill.id)}`,
    name: skill.id,
    title: skill.name,
    description: skill.description || `Resolved skill ${skill.id}`,
    mimeType: "application/json",
    annotations: {
      audience: ["assistant" as const],
      priority: priorityFor(skill),
    },
  };
}

function toWorkflowPlanResource(skill: ResolvedSkillView) {
  return {
    uri: `skill://workflow/${encodeURIComponent(skill.id)}/plan`,
    name: `${skill.id} workflow plan`,
    title: `${skill.name} Plan`,
    description: "Read-only workflow definition, dependency graph, and control-plane boundary.",
    mimeType: "application/json",
    annotations: {
      audience: ["assistant" as const],
      priority: 0.7,
    },
  };
}

function buildWorkflowPlanResource(workflow: ResolvedSkillView) {
  const steps = workflow.workflow?.steps ?? [];
  const workflowSubscribedTopics = (workflow.context?.subscribe ?? []).map((entry) => entry.topic);
  const publishedTopics = steps
    .map((step) => step.outputTopic)
    .filter((topic): topic is string => typeof topic === "string" && topic.length > 0);

  return {
    schemaVersion: "skillcentral.dev/workflow-plan/v1",
    workflowId: workflow.id,
    name: workflow.name,
    description: workflow.description,
    strategy: workflow.workflow?.strategy ?? "sequential",
    source: workflow.source,
    layer: workflow.layer,
    activation: workflow.activation,
    capabilities: workflow.capabilities,
    degradation: workflow.degradation,
    topics: {
      subscribed: Array.from(new Set(workflowSubscribedTopics)),
      published: Array.from(new Set(publishedTopics)),
    },
    steps: steps.map((step) => workflowPlanStep(workflow, step)),
    controlPlane: {
      tools: [...BUILTIN_WORKFLOW_TOOL_NAMES],
      startTool: "workflow.start",
      nextTool: "workflow.next",
      publishTool: "workflow.publish",
      summarizeTool: "workflow.summarize",
    },
    // This resource is an audit preview of the workflow definition. It does
    // not create a session or read blackboard entries; live state stays behind
    // skill://session/... resources and workflow.* tools.
    dataPlaneBoundary: {
      executesCommands: false,
      readsProjectFiles: false,
      writesSkillSource: false,
      injectsFullSessionHistory: false,
    },
  };
}

function workflowPlanStep(workflow: ResolvedSkillView, step: WorkflowStep) {
  return {
    id: step.id,
    uses: step.uses,
    agentRole: step.agentRole,
    dependsOn: step.dependsOn ?? [],
    requiresTopics: requiredTopicsForPlanStep(workflow, step),
    publishesTopic: step.outputTopic,
  };
}

function requiredTopicsForPlanStep(workflow: ResolvedSkillView, step: WorkflowStep): string[] {
  const workflowTopics = (workflow.context?.subscribe ?? []).map((entry) => entry.topic);
  const dependencyTopics = (step.dependsOn ?? [])
    .map((stepId) => workflow.workflow?.steps?.find((candidate) => candidate.id === stepId)?.outputTopic)
    .filter((topic): topic is string => typeof topic === "string" && topic.length > 0);
  return Array.from(new Set([...workflowTopics, ...dependencyTopics]));
}

function priorityFor(skill: ResolvedSkillView): number {
  if (skill.type === "prompt") return 0.9;
  if (skill.type === "tool") return 0.8;
  return 0.6;
}

function jsonResource(uri: string, value: unknown): ReadResourceResult {
  return {
    contents: [{
      uri,
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2),
    }],
  };
}
