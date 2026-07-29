// ============================================================================
// Registry / Query
// ----------------------------------------------------------------------------
// Shared query surface for resolved skills.
//
// Design intent:
// - All consumers should ask the registry for skills instead of filtering
//   engine arrays independently. This prevents CLI, MCP, Web Board, and future
//   compiler logic from drifting on type/tag/status/provenance semantics.
// - Query results preserve the resolution record: effective, shadowed, and
//   conflicted candidates remain inspectable even when normal user-facing flows
//   request only effective skills.
// - This module is intentionally pure. It does not read files or mutate engine
//   state, which makes it safe to reuse in dry-run compiler reports later.
// ============================================================================

import type { ResolvedSkillView, ResolutionRecordView } from "../core/engine.js";
import type { SkillResolutionStatus, SkillType } from "../schema/universal-skill.js";

export interface SkillQuery {
  id?: string;
  type?: SkillType;
  tags?: string[];
  intent?: string;
  capabilities?: string[];
  status?: SkillResolutionStatus | "any";
}

export interface SkillQueryResult {
  skills: ResolvedSkillView[];
  records: ResolutionRecordView[];
  totalCandidates: number;
}

export function querySkillRecords(
  records: ResolutionRecordView[],
  query: SkillQuery = {},
): SkillQueryResult {
  const status = query.status ?? "effective";
  const matchedRecords: ResolutionRecordView[] = [];
  const matchedSkills: ResolvedSkillView[] = [];

  for (const record of records) {
    const candidates = record.candidates.filter((skill) => matchesSkill(skill, query, status));
    if (candidates.length === 0) continue;

    matchedRecords.push({
      ...record,
      candidates,
    });
    matchedSkills.push(...candidates);
  }

  return {
    skills: sortSkills(matchedSkills),
    records: matchedRecords,
    totalCandidates: matchedSkills.length,
  };
}

export function getSkillById(
  records: ResolutionRecordView[],
  id: string,
  opts: { status?: SkillResolutionStatus | "any" } = {},
): ResolvedSkillView | undefined {
  return querySkillRecords(records, { id, status: opts.status ?? "effective" }).skills[0];
}

function matchesSkill(
  skill: ResolvedSkillView,
  query: SkillQuery,
  status: SkillResolutionStatus | "any",
): boolean {
  if (status !== "any" && skill.status !== status) return false;
  if (query.id && skill.id !== query.id) return false;
  if (query.type && skill.type !== query.type) return false;
  if (query.tags && query.tags.length > 0 && !hasAnyTag(skill, query.tags)) return false;
  if (query.intent && !hasIntent(skill, query.intent)) return false;
  if (
    query.capabilities &&
    query.capabilities.length > 0 &&
    !hasAllCapabilities(skill, query.capabilities)
  ) {
    return false;
  }
  return true;
}

function sortSkills(skills: ResolvedSkillView[]): ResolvedSkillView[] {
  const sorted = [...skills];
  sorted.sort((a, b) => {
    // Tag composition expects low-priority context first and high-priority
    // specialisation later. Other queries use the same order for stability.
    const priorityDelta = a.priority - b.priority;
    if (priorityDelta !== 0) return priorityDelta;
    return a.id.localeCompare(b.id);
  });
  return sorted;
}

function hasAnyTag(skill: ResolvedSkillView, tags: string[]): boolean {
  const wanted = new Set(tags.map((tag) => tag.toLowerCase()));
  return (skill.tags ?? []).some((tag) => wanted.has(tag.toLowerCase()));
}

function hasIntent(skill: ResolvedSkillView, intent: string): boolean {
  if (!isActivation(skill.activation)) return false;
  return (skill.activation.intents ?? []).some((candidate) => candidate === intent);
}

function hasAllCapabilities(skill: ResolvedSkillView, capabilities: string[]): boolean {
  const capabilitySet = new Set<string>();
  for (const field of ["required", "optional", "denied"] as const) {
    for (const capability of skill.capabilities?.[field] ?? []) {
      capabilitySet.add(capability);
    }
  }
  return capabilities.every((capability) => capabilitySet.has(capability));
}

function isActivation(value: unknown): value is { intents?: string[] } {
  return typeof value === "object" && value !== null;
}
