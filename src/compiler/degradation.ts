// ============================================================================
// Compiler / Degradation
// ----------------------------------------------------------------------------
// Converts capability gaps into report entries.
//
// Design intent:
// - Capability gaps should not crash dry-run. The compiler should explain the
//   missing capability and, when the skill declares a degradation rule, surface
//   the user's next workable path.
// - Actual artifact rewriting is intentionally small in Phase 2A; target
//   adapters will consume these reports in Phase 2B.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { DegradationReport } from "./types.js";

export function buildDegradation(
  skill: ResolvedSkillView,
  capability: string,
): DegradationReport {
  const rule = skill.degradation?.whenMissing?.[capability];
  if (rule) {
    return {
      skillId: skill.id,
      capability,
      mode: rule.mode,
      message: rule.message ?? `Capability ${capability} is missing; apply ${rule.mode}.`,
    };
  }

  return {
    skillId: skill.id,
    capability,
    mode: "unavailable",
    message: `Target cannot satisfy required capability ${capability}, and the skill declares no fallback.`,
  };
}
