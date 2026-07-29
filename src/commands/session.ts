// ============================================================================
// Session Command
// ----------------------------------------------------------------------------
// CLI surface for durable Phase 5 workflow sessions.
//
// Design intent:
// - This command is intentionally control-plane only. It creates and updates
//   session records so the store can be inspected before scheduler execution
//   exists.
// - `--app-state-dir` mirrors sync/web tests and desktop shells, keeping session
//   state inside app state rather than skill source layers.
// ============================================================================

import { ensureAppState } from "../local-store/app-state.js";
import { createBlackboardStore } from "../state/blackboard.js";
import { createSessionStore, type SessionStatus, type WorkflowSession } from "../state/session-store.js";

export interface SessionOptions {
  action?: string;
  appStateDir?: string;
  workflowId?: string;
  sessionId?: string;
  status?: string;
  reason?: string;
  trigger?: string;
  topic?: string;
  producer?: string;
  kind?: string;
  content?: string;
  summary?: string;
  refs?: string;
  json?: boolean;
}

export async function cmdSession(opts: SessionOptions): Promise<void> {
  const action = opts.action ?? "list";
  const appState = await ensureAppState({ overrideDir: opts.appStateDir });
  const store = createSessionStore(appState);
  const blackboard = createBlackboardStore(appState);

  if (action === "create") {
    const session = await store.create({
      workflowId: requireString(opts.workflowId, "--workflow-id"),
      reason: opts.reason,
      trigger: opts.trigger ?? "session.create",
    });
    printSessionResult(session, opts.json);
    return;
  }

  if (action === "list") {
    const sessions = await store.list();
    if (opts.json) {
      console.log(JSON.stringify({ sessions }, null, 2));
      return;
    }
    printSessionList(sessions);
    return;
  }

  if (action === "show") {
    const session = await requireSession(store, opts.sessionId);
    printSessionResult(session, opts.json);
    return;
  }

  if (action === "status") {
    const session = await store.updateStatus(requireString(opts.sessionId, "--session-id"), {
      status: parseStatus(opts.status),
      reason: requireString(opts.reason, "--reason"),
      trigger: opts.trigger ?? "session.status",
    });
    printSessionResult(session, opts.json);
    return;
  }

  if (action === "publish") {
    await requireSession(store, opts.sessionId);
    const entry = await blackboard.publish({
      sessionId: requireString(opts.sessionId, "--session-id"),
      topic: requireString(opts.topic, "--topic"),
      producer: requireString(opts.producer, "--producer"),
      kind: requireString(opts.kind, "--kind"),
      content: parseContent(requireString(opts.content, "--content")),
      summary: opts.summary,
      refs: parseRefs(opts.refs),
    });
    if (opts.json) {
      console.log(JSON.stringify(entry, null, 2));
      return;
    }
    console.log("");
    console.log("▸ Blackboard publish");
    console.log("  " + "-".repeat(72));
    console.log(`  Entry    : ${entry.entryId}`);
    console.log(`  Session  : ${entry.sessionId}`);
    console.log(`  Topic    : ${entry.topic}`);
    console.log(`  Producer : ${entry.producer}`);
    console.log(`  Kind     : ${entry.kind}`);
    console.log(`  Summary  : ${entry.summary ?? "(none)"}`);
    console.log("");
    return;
  }

  if (action === "topic") {
    await requireSession(store, opts.sessionId);
    const topic = await blackboard.readTopic(
      requireString(opts.sessionId, "--session-id"),
      requireString(opts.topic, "--topic"),
    );
    const result = topic ?? {
      schemaVersion: "skillcentral.dev/blackboard-topic/v1" as const,
      sessionId: requireString(opts.sessionId, "--session-id"),
      topic: requireString(opts.topic, "--topic"),
      updatedAt: "",
      entries: [],
    };
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printTopic(result);
    return;
  }

  throw new Error("Unsupported session action. Supported: create, list, show, status, publish, topic");
}

async function requireSession(
  store: ReturnType<typeof createSessionStore>,
  sessionId: string | undefined,
): Promise<WorkflowSession> {
  const session = await store.get(requireString(sessionId, "--session-id"));
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return session;
}

function printSessionResult(session: WorkflowSession, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(session, null, 2));
    return;
  }
  console.log("");
  console.log("▸ Session");
  console.log("  " + "-".repeat(72));
  console.log(`  Id       : ${session.sessionId}`);
  console.log(`  Workflow : ${session.workflowId}`);
  console.log(`  Status   : ${session.status}`);
  console.log(`  Created  : ${session.createdAt}`);
  console.log(`  Updated  : ${session.updatedAt}`);
  console.log(`  Audit    : ${session.audit.length} event(s)`);
  const last = session.audit.at(-1);
  if (last) {
    console.log(`  Last     : ${last.to} via ${last.trigger} - ${last.reason}`);
  }
  console.log("");
}

function printSessionList(sessions: WorkflowSession[]): void {
  console.log("");
  console.log(`▸ Sessions (${sessions.length})`);
  console.log("  " + "-".repeat(72));
  if (sessions.length === 0) {
    console.log("  (none)");
  }
  for (const session of sessions) {
    console.log(`  • ${session.sessionId}  ${session.status}  ${session.workflowId}  updated=${session.updatedAt}`);
  }
  console.log("");
}

function printTopic(topic: { topic: string; entries: Array<{ entryId: string; producer: string; kind: string; summary?: string; createdAt: string }> }): void {
  console.log("");
  console.log(`▸ Blackboard topic ${topic.topic} (${topic.entries.length})`);
  console.log("  " + "-".repeat(72));
  if (topic.entries.length === 0) {
    console.log("  (none)");
  }
  for (const entry of topic.entries) {
    console.log(`  • ${entry.entryId}  ${entry.kind}  producer=${entry.producer}  created=${entry.createdAt}`);
    if (entry.summary) console.log(`    ${entry.summary}`);
  }
  console.log("");
}

function parseStatus(value: string | undefined): SessionStatus {
  if (
    value === "created" ||
    value === "running" ||
    value === "blocked" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("--status must be created, running, blocked, completed, or failed");
}

function requireString(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}

function parseContent(value: string): unknown {
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
