// ============================================================================
// State / Session Store
// ----------------------------------------------------------------------------
// Durable workflow session storage for Phase 5 orchestration.
//
// Design intent:
// - Sessions must survive desktop restarts, so every session is persisted as a
//   JSON document under app state instead of held in process memory.
// - Status transitions are audit events, not overwritten metadata. This lets UI
//   and MCP resources explain why a run is blocked/failed/completed later.
// - The store does not execute workflow steps or read project files. It only
//   records orchestration control-plane state for future scheduler phases.
// ============================================================================

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppStateManifest } from "../local-store/app-state.js";

export type SessionStatus = "created" | "running" | "blocked" | "completed" | "failed";

export interface SessionAuditEvent {
  timestamp: string;
  from?: SessionStatus;
  to: SessionStatus;
  reason: string;
  trigger: string;
}

export interface WorkflowSession {
  schemaVersion: "skillcentral.dev/session/v1";
  sessionId: string;
  workflowId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  context: Record<string, unknown>;
  audit: SessionAuditEvent[];
}

export interface CreateSessionOptions {
  workflowId: string;
  context?: Record<string, unknown>;
  reason?: string;
  trigger?: string;
}

export interface UpdateSessionOptions {
  status: SessionStatus;
  reason: string;
  trigger: string;
}

export class SessionStore {
  constructor(private readonly rootDir: string) {}

  async create(options: CreateSessionOptions): Promise<WorkflowSession> {
    const now = new Date().toISOString();
    const session: WorkflowSession = {
      schemaVersion: "skillcentral.dev/session/v1",
      sessionId: `session-${randomUUID()}`,
      workflowId: requireNonEmpty(options.workflowId, "workflowId"),
      status: "created",
      createdAt: now,
      updatedAt: now,
      context: options.context ?? {},
      audit: [{
        timestamp: now,
        to: "created",
        reason: options.reason ?? "Session created.",
        trigger: options.trigger ?? "session.create",
      }],
    };
    await this.write(session);
    return session;
  }

  async get(sessionId: string): Promise<WorkflowSession | undefined> {
    try {
      return parseSession(await readFile(this.filePath(sessionId), "utf-8"));
    } catch {
      return undefined;
    }
  }

  async list(): Promise<WorkflowSession[]> {
    await mkdir(this.rootDir, { recursive: true });
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const sessions: WorkflowSession[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        sessions.push(parseSession(await readFile(path.join(this.rootDir, entry.name), "utf-8")));
      } catch {
        // Malformed session files stay on disk for manual inspection, but one
        // bad artifact must not hide other resumable sessions from the desktop.
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateStatus(sessionId: string, options: UpdateSessionOptions): Promise<WorkflowSession> {
    const existing = await this.get(sessionId);
    if (!existing) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const now = new Date().toISOString();
    const next: WorkflowSession = {
      ...existing,
      status: options.status,
      updatedAt: now,
      audit: existing.audit.concat({
        timestamp: now,
        from: existing.status,
        to: options.status,
        reason: requireNonEmpty(options.reason, "reason"),
        trigger: requireNonEmpty(options.trigger, "trigger"),
      }),
    };
    await this.write(next);
    return next;
  }

  private async write(session: WorkflowSession): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const target = this.filePath(session.sessionId);
    const temp = `${target}.tmp-${process.pid}`;
    await writeFile(temp, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
    await rename(temp, target);
  }

  private filePath(sessionId: string): string {
    const safeId = requireSessionId(sessionId);
    return path.join(this.rootDir, `${safeId}.json`);
  }
}

export function createSessionStore(appState: AppStateManifest): SessionStore {
  return new SessionStore(appState.paths.sessions);
}

function parseSession(raw: string): WorkflowSession {
  const parsed = JSON.parse(raw) as WorkflowSession;
  if (parsed.schemaVersion !== "skillcentral.dev/session/v1") {
    throw new Error("Unsupported session schemaVersion");
  }
  requireSessionId(parsed.sessionId);
  requireNonEmpty(parsed.workflowId, "workflowId");
  if (!isSessionStatus(parsed.status)) {
    throw new Error(`Invalid session status: ${String(parsed.status)}`);
  }
  if (!Array.isArray(parsed.audit) || parsed.audit.length === 0) {
    throw new Error("Session audit is required");
  }
  return parsed;
}

function requireSessionId(value: string): string {
  return requirePattern(value, "sessionId", /^session-[a-f0-9-]{36}$/);
}

function requirePattern(value: string, label: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireNonEmpty(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return value === "created" || value === "running" || value === "blocked" || value === "completed" || value === "failed";
}
