// ============================================================================
// Core / Override Tree
// ----------------------------------------------------------------------------
// Layered conflict-resolution tree for skills with the same id.
// Skills are loaded from multiple "layers" (e.g. global → team → project).
// When two skills share an id, the highest-priority layer wins. This enables
// progressive override without modifying upstream skill files.
// ============================================================================

import type { ResolvedSkill, SkillSchema, SkillLayer } from "../storage/schemas.js";

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

  /** Insert one skill. If the id already exists, the higher priority wins. */
  insert(
    schema: SkillSchema,
    layer: SkillLayer,
  ): void {
    const existing = this.tree.get(schema.id);
    if (existing && existing.priority >= layer.priority) {
      return; // existing entry has equal or higher priority — keep it
    }

    this.tree.set(schema.id, {
      ...schema,
      version: schema.version ?? "0.1.0",
      source: layer.path,
      priority: layer.priority,
    });
  }

  /** Load a batch of tagged schemas into the tree (one pass). */
  loadAll(
    entries: Array<{ schema: SkillSchema; layer: SkillLayer }>,
  ): void {
    // Sort ascending so higher-priority layers naturally overwrite lower ones.
    const sorted = [...entries].sort((a, b) => a.layer.priority - b.layer.priority);
    for (const { schema, layer } of sorted) {
      this.insert(schema, layer);
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

  /** Remove a skill by id. */
  remove(skillId: string): boolean {
    return this.tree.delete(skillId);
  }

  /** Replace the entire tree contents. */
  reset(entries: Array<{ schema: SkillSchema; layer: SkillLayer }>): void {
    this.tree.clear();
    this.loadAll(entries);
  }
}
