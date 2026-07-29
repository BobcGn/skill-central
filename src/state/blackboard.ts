// ============================================================================
// State / Blackboard
// ----------------------------------------------------------------------------
// Topic-based session blackboard for Phase 5 orchestration.
//
// Design intent:
// - Blackboard entries are append-only evidence. A producer publishes a compact
//   result to a named topic; downstream prompt compilation can later read only
//   the topics a skill explicitly subscribes to.
// - Storage is scoped by session id so unrelated workflow runs cannot leak
//   context into each other.
// - This module does not execute agents or summarize content automatically. It
//   preserves provenance and bounded topic reads for scheduler/compiler phases.
// ============================================================================

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppStateManifest } from "../local-store/app-state.js";

export interface BlackboardRef {
  uri: string;
  title?: string;
}

export interface BlackboardEntry {
  entryId: string;
  sessionId: string;
  topic: string;
  producer: string;
  kind: string;
  content: unknown;
  summary?: string;
  refs: BlackboardRef[];
  createdAt: string;
}

export interface BlackboardTopic {
  schemaVersion: "skillcentral.dev/blackboard-topic/v1";
  sessionId: string;
  topic: string;
  updatedAt: string;
  entries: BlackboardEntry[];
}

export interface PublishBlackboardEntryOptions {
  sessionId: string;
  topic: string;
  producer: string;
  kind: string;
  content: unknown;
  summary?: string;
  refs?: BlackboardRef[];
}

export class BlackboardStore {
  constructor(private readonly rootDir: string) {}

  async publish(options: PublishBlackboardEntryOptions): Promise<BlackboardEntry> {
    const now = new Date().toISOString();
    const sessionId = requireSessionId(options.sessionId);
    const topic = requireTopic(options.topic);
    const existing = await this.readTopic(sessionId, topic);
    const entry: BlackboardEntry = {
      entryId: `entry-${randomUUID()}`,
      sessionId,
      topic,
      producer: requireNonEmpty(options.producer, "producer"),
      kind: requireNonEmpty(options.kind, "kind"),
      content: options.content,
      summary: options.summary,
      refs: options.refs ?? [],
      createdAt: now,
    };
    const next: BlackboardTopic = {
      schemaVersion: "skillcentral.dev/blackboard-topic/v1",
      sessionId,
      topic,
      updatedAt: now,
      entries: existing ? existing.entries.concat(entry) : [entry],
    };
    await this.writeTopic(next);
    return entry;
  }

  async readTopic(sessionId: string, topic: string): Promise<BlackboardTopic | undefined> {
    try {
      return parseTopic(await readFile(this.topicPath(sessionId, topic), "utf-8"));
    } catch {
      return undefined;
    }
  }

  async listTopics(sessionId: string): Promise<BlackboardTopic[]> {
    const dir = this.sessionDir(requireSessionId(sessionId));
    await mkdir(dir, { recursive: true });
    const entries = await readdir(dir, { withFileTypes: true });
    const topics: BlackboardTopic[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        topics.push(parseTopic(await readFile(path.join(dir, entry.name), "utf-8")));
      } catch {
        // Preserve malformed topic files for manual inspection; one corrupt
        // topic should not hide the rest of the workflow state.
      }
    }
    return topics.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async writeTopic(topic: BlackboardTopic): Promise<void> {
    const file = this.topicPath(topic.sessionId, topic.topic);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp-${process.pid}`;
    await writeFile(temp, `${JSON.stringify(topic, null, 2)}\n`, "utf-8");
    await rename(temp, file);
  }

  private topicPath(sessionId: string, topic: string): string {
    return path.join(this.sessionDir(requireSessionId(sessionId)), `${topicSlug(requireTopic(topic))}.json`);
  }

  private sessionDir(sessionId: string): string {
    return path.join(this.rootDir, requireSessionId(sessionId), "blackboard");
  }
}

export function createBlackboardStore(appState: AppStateManifest): BlackboardStore {
  return new BlackboardStore(appState.paths.sessions);
}

function parseTopic(raw: string): BlackboardTopic {
  const parsed = JSON.parse(raw) as BlackboardTopic;
  if (parsed.schemaVersion !== "skillcentral.dev/blackboard-topic/v1") {
    throw new Error("Unsupported blackboard topic schemaVersion");
  }
  requireSessionId(parsed.sessionId);
  requireTopic(parsed.topic);
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Blackboard topic entries must be an array");
  }
  return parsed;
}

function requireSessionId(value: string): string {
  if (typeof value !== "string" || !/^session-[a-f0-9-]{36}$/.test(value)) {
    throw new Error("Invalid sessionId");
  }
  return value;
}

function requireTopic(value: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new Error("Invalid topic");
  }
  return value;
}

function requireNonEmpty(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function topicSlug(topic: string): string {
  return encodeURIComponent(topic).replaceAll("%", "_");
}
