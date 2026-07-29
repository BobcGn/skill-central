// ============================================================================
// Workflow Command
// ----------------------------------------------------------------------------
// CLI control-plane wrapper around the Phase 5 workflow scheduler.
//
// Design intent:
// - `workflow start/next` creates or advances orchestration state, but returns
//   Data Plane Tasks for IDE agents instead of running local commands.
// - `workflow publish` is the scheduler-facing alias for blackboard publish, so
//   agent results unblock later steps through durable topic evidence.
// ============================================================================

import { ensureAppState } from "../local-store/app-state.js";
import { createBlackboardStore } from "../state/blackboard.js";
import { createSessionStore, type WorkflowSession } from "../state/session-store.js";
import { SkillEngine, type ResolvedSkillView } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { scheduleWorkflow } from "../scheduler/workflow-scheduler.js";

export interface WorkflowOptions {
  action?: string;
  appStateDir?: string;
  workflowId?: string;
  sessionId?: string;
  topic?: string;
  producer?: string;
  kind?: string;
  content?: unknown;
  summary?: string;
  refs?: string;
  json?: boolean;
}

export async function cmdWorkflow(opts: WorkflowOptions): Promise<void> {
  printResult(await runWorkflowAction(opts), opts.json);
}

export async function runWorkflowAction(opts: WorkflowOptions): Promise<unknown> {
  const action = opts.action ?? "next";
  const appState = await ensureAppState({ overrideDir: opts.appStateDir });
  const sessions = createSessionStore(appState);
  const blackboard = createBlackboardStore(appState);

  if (action === "start") {
    const workflow = await loadWorkflow(requireString(opts.workflowId, "--workflow-id"));
    const session = await sessions.create({
      workflowId: workflow.id,
      reason: "Workflow started.",
      trigger: "workflow.start",
    });
    const report = await schedule(workflow, session, blackboard);
    const running = report.readyTasks.length > 0 ? "running" : "blocked";
    await sessions.updateStatus(session.sessionId, {
      status: running,
      reason: running === "running" ? "Initial tasks are ready." : report.blockedReasons.join("; ") || "Workflow is blocked.",
      trigger: "workflow.start",
    });
    return { sessionId: session.sessionId, report };
  }

  if (action === "next") {
    const session = await requireSession(sessions, opts.sessionId);
    const workflow = await loadWorkflow(session.workflowId);
    const report = await schedule(workflow, session, blackboard);
    const nextStatus = report.status === "completed" ? "completed" : report.readyTasks.length > 0 ? "running" : "blocked";
    if (session.status !== nextStatus) {
      await sessions.updateStatus(session.sessionId, {
        status: nextStatus,
        reason: nextStatus === "blocked" ? report.blockedReasons.join("; ") || "Workflow is blocked." : `Scheduler status ${nextStatus}.`,
        trigger: "workflow.next",
      });
    }
    return report;
  }

  if (action === "publish") {
    const session = await requireSession(sessions, opts.sessionId);
    return blackboard.publish({
      sessionId: session.sessionId,
      topic: requireString(opts.topic, "--topic"),
      producer: opts.producer ?? "workflow.publish",
      kind: opts.kind ?? "result",
      content: parseContent(requireValue(opts.content, "--content")),
      summary: opts.summary,
      refs: parseRefs(opts.refs),
    });
  }

  if (action === "summarize") {
    const session = await requireSession(sessions, opts.sessionId);
    const topics = await blackboard.listTopics(session.sessionId);
    const summary = {
      sessionId: session.sessionId,
      workflowId: session.workflowId,
      status: session.status,
      topics: topics.map((topic) => ({
        topic: topic.topic,
        entries: topic.entries.length,
        latestSummary: topic.entries.at(-1)?.summary,
        latestRefs: topic.entries.at(-1)?.refs ?? [],
      })),
    };
    return summary;
  }

  throw new Error("Unsupported workflow action. Supported: start, next, publish, summarize");
}

async function schedule(
  workflow: ResolvedSkillView,
  session: WorkflowSession,
  blackboard: ReturnType<typeof createBlackboardStore>,
) {
  return scheduleWorkflow(workflow, session, await blackboard.listTopics(session.sessionId));
}

async function loadWorkflow(workflowId: string): Promise<ResolvedSkillView> {
  const engine = new SkillEngine();
  await engine.reload(loadConfig().layers);
  const workflow = engine.querySkills({ id: workflowId }).skills[0];
  if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);
  if (workflow.type !== "workflow") throw new Error(`Skill is not a workflow: ${workflowId}`);
  return workflow;
}

async function requireSession(
  store: ReturnType<typeof createSessionStore>,
  sessionId: string | undefined,
): Promise<WorkflowSession> {
  const session = await store.get(requireString(sessionId, "--session-id"));
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return session;
}

function printResult(value: unknown, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function parseContent(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseRefs(value: string | undefined) {
  if (!value) return [];
  return value.split(",").map((uri) => uri.trim()).filter(Boolean).map((uri) => ({ uri }));
}

function requireString(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}

function requireValue(value: unknown, label: string): unknown {
  if (value === undefined || value === null) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}
