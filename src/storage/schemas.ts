// ============================================================================
// Storage / Schemas
// ----------------------------------------------------------------------------
// TypeScript type definitions for the Skill Schema format.
// These types define the contract between skill authors and the engine.
// ============================================================================

/** Discriminated union: a skill is either a Prompt or a Tool. */
export type SkillType = "prompt" | "tool";

/** A single argument accepted by a prompt or tool skill. */
export interface SkillArgument {
  name: string;
  description: string;
  required?: boolean;
}

/** Raw skill descriptor as read from disk. */
export interface SkillSchema {
  /** Globally unique skill identifier (e.g. "review-pr", "summarize-log"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description of what this skill does. */
  description: string;
  /** Discriminator: "prompt" → prompt template; "tool" → input schema. */
  type: SkillType;

  // ── Prompt-specific ──────────────────────────────────────────────────────
  /** Prompt template with optional {{handlebars}} placeholders. */
  prompt?: string;

  // ── Tool-specific ────────────────────────────────────────────────────────
  /** JSON Schema for tool input parameters. */
  inputSchema?: Record<string, unknown>;

  // ── Common metadata ──────────────────────────────────────────────────────
  arguments?: SkillArgument[];
  /** Tags for category matching (e.g. "android", "kmp", "global"). */
  tags?: string[];
  version?: string;
}

/** A skill that has been resolved (merged with layer defaults, validated). */
export interface ResolvedSkill extends SkillSchema {
  source: string;   // file path this was loaded from
  priority: number; // layer priority used during conflict resolution
}

/** A layer represents one skill source directory with an associated priority. */
export interface SkillLayer {
  name: string;
  path: string;
  priority: number;
}
