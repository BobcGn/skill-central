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
  private readyPromise: Promise<void> | null = null;

  /** Rebuild the override tree from a list of layer definitions. */
  async reload(layers: SkillLayer[]): Promise<void> {
    this.readyPromise = readAllLayers(layers).then((entries) => {
      this.tree.reset(entries);
      console.error(
        `[skill-central] Loaded ${this.tree.getAll().length} skills across ${layers.length} layer(s)`
      );
    });
    await this.readyPromise;
  }

  /** Wait until the engine has finished loading skills. */
  async waitForReady(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
    }
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
  /**
   * Chinese-language variant of `prompt`. Present iff the underlying YAML
   * declared `prompt_zh`. The composer is responsible for merging the two
   * into a single bilingual message body when both exist.
   */
  prompt_zh?: string;
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
  prompt_zh?: string;
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
    prompt_zh: skill.prompt_zh,
    inputSchema: skill.inputSchema,
    arguments: skill.arguments,
    tags: skill.tags,
    priority: skill.priority,
  };
}
