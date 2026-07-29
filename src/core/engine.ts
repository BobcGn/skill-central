// ============================================================================
// Core / Engine
// ----------------------------------------------------------------------------
// Central orchestrator that ties storage readers, the override tree, and
// the composer together. The protocol layer talks only to this engine;
// it never touches storage directly.
// ============================================================================

import { OverrideTree } from "./override-tree.js";
import type { ResolutionRecord } from "./override-tree.js";
import { readAllLayers } from "../storage/reader.js";
import type { SkillLayer, SkillSchema } from "../storage/schemas.js";
import { getSkillById, querySkillRecords } from "../registry/query.js";
import type { SkillQuery } from "../registry/query.js";
import type {
  LayerProvenance,
  SkillActivation,
  SkillCapabilities,
  SkillContext,
  SkillDegradation,
  SkillResolutionStatus,
  SkillType,
  UniversalSkillSchemaVersion,
  SkillWorkflow,
} from "../schema/universal-skill.js";

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
    return this.querySkills().skills;
  }

  /**
   * Return full resolution records, including shadowed and conflicted entries.
   * This is the diagnostic bridge for Phase 1B. MCP keeps using listSkills()
   * so only deterministic effective skills are exposed to clients.
   */
  listResolutionRecords(): ResolutionRecordView[] {
    return this.tree.getRecords().map((record) => ({
      id: record.id,
      status: record.status,
      reason: record.reason,
      candidates: record.candidates.map(toView),
    }));
  }

  /**
   * Shared query entrypoint for CLI/MCP/UI/compiler consumers.
   * TODO(Phase 1C): once all consumers are migrated, keep listSkills/getSkill as
   * compatibility wrappers only and document querySkills as the primary API.
   */
  querySkills(query: SkillQuery = {}) {
    return querySkillRecords(this.listResolutionRecords(), query);
  }

  /** Retrieve a single resolved skill by id. */
  getSkill(skillId: string): ResolvedSkillView | undefined {
    return getSkillById(this.listResolutionRecords(), skillId);
  }

  /**
   * Return all skills that have at least one matching tag.
   * Results are ordered by originating layer priority (ascending), so later
   * entries effectively "override" earlier ones when merged.
   */
  getSkillsByTags(tags: string[]): ResolvedSkillView[] {
    return this.querySkills({ tags }).skills;
  }
}

// ── Public view (excludes internal fields) ─────────────────────────────────

export interface ResolvedSkillView {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  schemaVersion: UniversalSkillSchemaVersion;
  sourceFormat: "legacy" | "universal";
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
  activation?: SkillActivation;
  context?: SkillContext;
  capabilities?: SkillCapabilities;
  degradation?: SkillDegradation;
  workflow?: SkillWorkflow;
  /** Originating layer priority (used by web board to display origin). */
  priority: number;
  /** Layer path used as current provenance until Phase 1B adds layer ids. */
  source: string;
  layer: LayerProvenance;
  status: SkillResolutionStatus;
  shadowedBy?: LayerProvenance;
  conflictWith?: LayerProvenance[];
}

export interface ResolutionRecordView {
  id: string;
  status: "effective" | "conflicted";
  reason: string;
  candidates: ResolvedSkillView[];
}

function toView(skill: {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  schemaVersion: UniversalSkillSchemaVersion;
  sourceFormat: "legacy" | "universal";
  prompt?: string;
  prompt_zh?: string;
  inputSchema?: Record<string, unknown>;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  tags?: string[];
  activation?: SkillActivation;
  context?: SkillContext;
  capabilities?: SkillCapabilities;
  degradation?: SkillDegradation;
  workflow?: SkillWorkflow;
  priority: number;
  source: string;
  layer: LayerProvenance;
  status: SkillResolutionStatus;
  shadowedBy?: LayerProvenance;
  conflictWith?: LayerProvenance[];
}): ResolvedSkillView {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    type: skill.type,
    schemaVersion: skill.schemaVersion,
    sourceFormat: skill.sourceFormat,
    prompt: skill.prompt,
    prompt_zh: skill.prompt_zh,
    inputSchema: skill.inputSchema,
    arguments: skill.arguments,
    tags: skill.tags,
    activation: skill.activation,
    context: skill.context,
    capabilities: skill.capabilities,
    degradation: skill.degradation,
    workflow: skill.workflow,
    priority: skill.priority,
    source: skill.source,
    layer: skill.layer,
    status: skill.status,
    shadowedBy: skill.shadowedBy,
    conflictWith: skill.conflictWith,
  };
}
