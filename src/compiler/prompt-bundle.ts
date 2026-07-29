// ============================================================================
// Compiler / Prompt Bundle
// ----------------------------------------------------------------------------
// Shared prompt bundle formatting for target adapters.
//
// Design intent:
// - Phase 2B moved target-specific artifact generation into `src/adapters/*`.
//   This file remains the compiler-owned shared bundle formatter so adapters
//   do not rebuild prompt/source-trace text independently.
// - TODO(Phase 2C): extend this module with machine-readable prompt sections
//   before `export` writes IDE files.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { CompileTarget } from "../adapters/types.js";

export function buildPromptBundlePreview(target: CompileTarget, skill: ResolvedSkillView): string {
  return [
    `# skill-central artifact`,
    `target: ${target}`,
    `skill: ${skill.id}`,
    `layer: ${skill.layer.name} (${skill.layer.id})`,
    `type: ${skill.type}`,
    "",
    skill.prompt ?? skill.prompt_zh ?? `(no prompt body; ${skill.type} metadata only)`,
  ].join("\n");
}
