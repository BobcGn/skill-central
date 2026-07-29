// ============================================================================
// Scheduler / Workflow Scheduler
// ----------------------------------------------------------------------------
// Pure control-plane scheduler for Phase 5 workflows.
//
// Design intent:
// - The scheduler returns Data Plane Tasks for IDE agents. It never executes
//   shell commands, reads project files, or mutates skill sources.
// - Readiness is derived from explicit workflow dependencies and blackboard
//   topics. Missing inputs produce a blocked report instead of throwing.
// - Context routing is bounded: task context is listed as subscribed topics;
//   callers decide how to read those resources through MCP.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { BlackboardTopic } from "../state/blackboard.js";
import type { WorkflowSession } from "../state/session-store.js";
import type { WorkflowStep } from "../schema/universal-skill.js";

export interface DataPlaneTask {
  taskId: string;
  sessionId: string;
  workflowId: string;
  stepId: string;
  uses: string;
  agentRole?: string;
  instruction: string;
  subscribeTopics: string[];
  publishTo?: string;
  resources: string[];
  promptBundle: DataPlaneTaskPromptBundle;
}

export interface DataPlaneTaskPromptBundle {
  role: "user";
  text: string;
  resourceUris: string[];
}

export interface WorkflowScheduleReport {
  sessionId: string;
  workflowId: string;
  status: "ready" | "blocked" | "completed" | "failed";
  readyTasks: DataPlaneTask[];
  completedStepIds: string[];
  blockedReasons: string[];
}

export function scheduleWorkflow(
  workflow: ResolvedSkillView,
  session: WorkflowSession,
  topics: BlackboardTopic[],
): WorkflowScheduleReport {
  if (workflow.type !== "workflow") {
    throw new Error(`Skill ${workflow.id} is not a workflow`);
  }
  const steps = workflow.workflow?.steps ?? [];
  const completed = completedStepIds(steps, topics);
  const readyTasks: DataPlaneTask[] = [];
  const blockedReasons: string[] = [];

  for (const step of steps) {
    if (completed.has(step.id)) continue;
    const missingSteps = (step.dependsOn ?? []).filter((stepId) => !completed.has(stepId));
    if (missingSteps.length > 0) {
      blockedReasons.push(`${step.id}: waiting for step(s) ${missingSteps.join(", ")}`);
      continue;
    }
    const missingTopics = requiredTopicsForStep(workflow, step).filter((topic) => !hasTopic(topics, topic));
    if (missingTopics.length > 0) {
      blockedReasons.push(`${step.id}: waiting for topic(s) ${missingTopics.join(", ")}`);
      continue;
    }
    readyTasks.push(toTask(workflow, session, step));
    if (workflow.workflow?.strategy === "sequential") break;
  }

  if (steps.length > 0 && completed.size >= steps.length) {
    return baseReport(session, workflow, "completed", [], Array.from(completed), []);
  }
  if (readyTasks.length > 0) {
    return baseReport(session, workflow, "ready", readyTasks, Array.from(completed), []);
  }
  return baseReport(session, workflow, "blocked", [], Array.from(completed), blockedReasons);
}

function toTask(workflow: ResolvedSkillView, session: WorkflowSession, step: WorkflowStep): DataPlaneTask {
  const subscribeTopics = requiredTopicsForStep(workflow, step);
  return {
    taskId: `${session.sessionId}:${step.id}`,
    sessionId: session.sessionId,
    workflowId: workflow.id,
    stepId: step.id,
    uses: step.uses,
    agentRole: step.agentRole,
    instruction: `Run workflow step "${step.id}" using "${step.uses}" and publish the result to "${step.outputTopic ?? step.id}".`,
    subscribeTopics,
    publishTo: step.outputTopic,
    resources: subscribeTopics.map((topic) => `skill://session/${session.sessionId}/topic/${encodeURIComponent(topic)}`),
    promptBundle: buildPromptBundle(workflow, session, step, subscribeTopics),
  };
}

function buildPromptBundle(
  workflow: ResolvedSkillView,
  session: WorkflowSession,
  step: WorkflowStep,
  subscribeTopics: string[],
): DataPlaneTaskPromptBundle {
  const resourceUris = subscribeTopics.map((topic) => `skill://session/${session.sessionId}/topic/${encodeURIComponent(topic)}`);
  const lines = [
    `Workflow: ${workflow.id}`,
    `Session: ${session.sessionId}`,
    `Step: ${step.id}`,
    `Uses: ${step.uses}`,
    step.agentRole ? `Agent role: ${step.agentRole}` : undefined,
    step.outputTopic ? `Publish result to topic: ${step.outputTopic}` : undefined,
    resourceUris.length > 0 ? `Read only these context resources:\n${resourceUris.map((uri) => `- ${uri}`).join("\n")}` : "No subscribed context resources are required for this step.",
    "",
    workflow.prompt ?? "Execute the workflow step and publish a concise structured result.",
  ].filter((line): line is string => typeof line === "string");

  return {
    role: "user",
    text: lines.join("\n"),
    resourceUris,
  };
}

function completedStepIds(steps: WorkflowStep[], topics: BlackboardTopic[]): Set<string> {
  const outputToStep = new Map<string, string>();
  for (const step of steps) {
    if (step.outputTopic) outputToStep.set(step.outputTopic, step.id);
  }
  const completed = new Set<string>();
  for (const topic of topics) {
    const stepId = outputToStep.get(topic.topic);
    if (stepId && topic.entries.length > 0) completed.add(stepId);
  }
  return completed;
}

function requiredTopicsForStep(workflow: ResolvedSkillView, step: WorkflowStep): string[] {
  const workflowTopics = (workflow.context?.subscribe ?? []).map((entry) => entry.topic);
  const dependencyTopics = (step.dependsOn ?? [])
    .map((stepId) => workflow.workflow?.steps?.find((candidate) => candidate.id === stepId)?.outputTopic)
    .filter((topic): topic is string => typeof topic === "string" && topic.length > 0);
  return Array.from(new Set([...workflowTopics, ...dependencyTopics]));
}

function hasTopic(topics: BlackboardTopic[], topic: string): boolean {
  return topics.some((candidate) => candidate.topic === topic && candidate.entries.length > 0);
}

function baseReport(
  session: WorkflowSession,
  workflow: ResolvedSkillView,
  status: WorkflowScheduleReport["status"],
  readyTasks: DataPlaneTask[],
  completedStepIds: string[],
  blockedReasons: string[],
): WorkflowScheduleReport {
  return {
    sessionId: session.sessionId,
    workflowId: workflow.id,
    status,
    readyTasks,
    completedStepIds,
    blockedReasons,
  };
}
