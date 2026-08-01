// ============================================================================
// Core / Override Tree
// ----------------------------------------------------------------------------
// Layered conflict-resolution tree for skills with the same id.
//
// Design intent:
// - The tree is the single place that decides effective/shadowed/conflicted
//   status. CLI, MCP, Web Board, and the future registry should consume this
//   result instead of re-implementing override rules.
// - Resolution is deterministic: priority first, scope distance second. If two
//   candidates still tie, the tree records an explicit conflict and does not
//   let insertion order pick a winner.
// - We retain the candidate chain for diagnostics. Users need to know why a
//   skill is effective, shadowed, or blocked by conflict.
// ============================================================================

import type { ResolvedSkill, SkillSchema, SkillLayer } from "../storage/schemas.js";
import {
  compareLayerPrecedence,
  layerConflictReason,
  layerProvenance,
} from "../storage/layers.js";

export interface ScoredSkill {
  skill: ResolvedSkill;
  score: number; // match relevance score (higher = more relevant)
}

/**
 * In-memory override tree.
 * Internally a Map<skillId, ResolvedSkill> where the highest-priority
 * entry dominates when multiple layers define the same id.
 */
export class OverrideTree {
  private tree = new Map<string, ResolvedSkill>();
  private records = new Map<string, ResolutionRecord>();

  /** Insert one skill and recompute that id's resolution chain. */
  insert(
    schema: SkillSchema,
    layer: SkillLayer,
    filePath: string,
  ): void {
    const candidate = toResolvedSkill(schema, layer, filePath);
    const existingRecord = this.records.get(schema.id);
    const candidates = existingRecord ? [...existingRecord.candidates, candidate] : [candidate];
    this.resolve(schema.id, candidates);
  }

  private resolve(skillId: string, candidates: ResolvedSkill[]): void {
    // Resolution annotations are derived state. Clear them before every recompute
    // so a candidate that used to be conflicted can later become shadowed/effective
    // without carrying stale conflict metadata.
    const sorted = candidates
      .map(clearResolutionAnnotations)
      .sort((a, b) => compareResolvedPrecedence(a, b));
    const winner = sorted[0]!;
    const tied = sorted.filter((candidate) => compareResolvedPrecedence(winner, candidate) === 0);

    if (tied.length > 1) {
      const conflicted = sorted.map((candidate) => ({
        ...candidate,
        status: "conflicted" as const,
        conflictWith: tied
          .filter((other) => other !== candidate)
          .map((other) => other.layer),
      }));
      this.records.set(skillId, {
        id: skillId,
        status: "conflicted",
        reason: layerConflictReason(tied[0]!.layer, tied[1]!.layer),
        candidates: conflicted,
      });
      this.tree.delete(skillId);
      return;
    }

    const resolved = sorted.map((candidate, index) => {
      if (index === 0) {
        return { ...candidate, status: "effective" as const };
      }
      return {
        ...candidate,
        status: "shadowed" as const,
        shadowedBy: winner.layer,
      };
    });

    this.records.set(skillId, {
      id: skillId,
      status: "effective",
      reason: resolved.length > 1 ? "resolved by priority or scope distance" : "single candidate",
      candidates: resolved,
    });
    this.tree.set(skillId, resolved[0]!);
  }

  /** Load a batch of tagged schemas into the tree (one pass). */
  loadAll(
    entries: Array<{ schema: SkillSchema; layer: SkillLayer; filePath: string }>,
  ): void {
    // Sort ascending so higher-priority layers naturally overwrite lower ones.
    const sorted = [...entries].sort((a, b) => a.layer.priority - b.layer.priority);
    for (const { schema, layer, filePath } of sorted) {
      this.insert(schema, layer, filePath);
    }
  }

  /** Look up a resolved skill by id. */
  get(skillId: string): ResolvedSkill | undefined {
    return this.tree.get(skillId);
  }

  /** Return all resolved skills currently in the tree. */
  getAll(): ResolvedSkill[] {
    return Array.from(this.tree.values());
  }

  /** Return every resolution record, including shadowed and conflicted chains. */
  getRecords(): ResolutionRecord[] {
    return Array.from(this.records.values());
  }

  /** Remove a skill by id. */
  remove(skillId: string): boolean {
    this.records.delete(skillId);
    return this.tree.delete(skillId);
  }

  /** Replace the entire tree contents. */
  reset(entries: Array<{ schema: SkillSchema; layer: SkillLayer; filePath: string }>): void {
    this.tree.clear();
    this.records.clear();
    this.loadAll(entries);
  }
}

export interface ResolutionRecord {
  id: string;
  status: "effective" | "conflicted";
  reason: string;
  candidates: ResolvedSkill[];
}

function toResolvedSkill(schema: SkillSchema, layer: SkillLayer, filePath: string): ResolvedSkill {
  return {
    ...schema,
    version: schema.version ?? "0.1.0",
    source: filePath,
    priority: layer.priority,
    layer: layerProvenance(layer),
    status: "effective",
  };
}

function compareResolvedPrecedence(a: ResolvedSkill, b: ResolvedSkill): number {
  return compareLayerPrecedence(a.layer, b.layer);
}

function clearResolutionAnnotations(skill: ResolvedSkill): ResolvedSkill {
  const { shadowedBy: _shadowedBy, conflictWith: _conflictWith, ...rest } = skill;
  return {
    ...rest,
    status: "effective",
  };
}
