// ============================================================================
// Core / Engine
// ----------------------------------------------------------------------------
// Central orchestrator that ties storage readers, the override tree, and
// the composer together. The protocol layer talks only to this engine;
// it never touches storage directly.
// ============================================================================

import { OverrideTree } from "./override-tree.js";
import { readAllLayers } from "../storage/reader.js";
import type { SkillLayer, SkillSchema } from "../storage/schemas.js";

export class SkillEngine {
  private tree = new OverrideTree();

  /** Rebuild the override tree from a list of layer definitions. */
  async reload(layers: SkillLayer[]): Promise<void> {
    const entries = await readAllLayers(layers);
    this.tree.reset(entries);
    console.warn(
      `[skill-central] Loaded ${this.tree.getAll().length} skills across ${layers.length} layer(s)`,
    );
  }

  /** Return every resolved skill (id → resolved entry). */
  listSkills(): ResolvedSkillView[] {
    return this.tree.getAll().map(toView);
  }

  /** Retrieve a single resolved skill by id. */
  getSkill(skillId: string): ResolvedSkillView | undefined {
    const skill = this.tree.get(skillId);
    return skill ? toView(skill) : undefined;
  }

  /**
   * Return all skills that have at least one matching tag.
   * Results are ordered by originating layer priority (ascending), so later
   * entries effectively "override" earlier ones when merged.
   */
  getSkillsByTags(tags: string[]): ResolvedSkillView[] {
    const matched = this.tree
      .getAll()
      .filter((s) => s.tags?.some((t) => tags.includes(t)));
    matched.sort((a, b) => a.priority - b.priority);
    return matched.map(toView);
  }
}

// ── Public view (excludes internal fields) ─────────────────────────────────

export interface ResolvedSkillView {
  id: string;
  name: string;
  description: string;
  type: "prompt" | "tool";
  prompt?: string;
  inputSchema?: Record<string, unknown>;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  tags?: string[];
  /** Originating layer priority (used by web board to display origin). */
  priority: number;
}

function toView(skill: {
  id: string;
  name: string;
  description: string;
  type: "prompt" | "tool";
  prompt?: string;
  inputSchema?: Record<string, unknown>;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  tags?: string[];
  priority: number;
}): ResolvedSkillView {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    type: skill.type,
    prompt: skill.prompt,
    inputSchema: skill.inputSchema,
    arguments: skill.arguments,
    tags: skill.tags,
    priority: skill.priority,
  };
}
