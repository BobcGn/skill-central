// ============================================================================
// Compiler / Types
// ----------------------------------------------------------------------------
// Shared dry-run report types.
//
// Design intent:
// - Compiler output must be inspectable before any IDE files are written.
// - The report carries layer provenance and resolution state so users can trace
//   every artifact back to the selected skill and understand shadowed/conflicted
//   alternatives.
// - These types deliberately describe preview artifacts, not filesystem writes.
//   Export/apply commands will later turn the same artifacts into transactions.
// ============================================================================

import type { AdapterArtifact, CapabilitySupport, CompileTarget } from "../adapters/types.js";
import type { LayerProvenance, SkillType } from "../schema/universal-skill.js";

export type { AdapterArtifact, CapabilitySupport, CompileTarget } from "../adapters/types.js";

export type CapabilityRequirement = "required" | "optional" | "denied";

export interface CompileRequest {
  target: CompileTarget;
  intent: string;
}

export interface CompiledSkillBundle {
  target: CompileTarget;
  intent: string;
  dryRun: true;
  hash: string;
  selectedSkills: CompiledSkillSummary[];
  shadowedSkills: CompiledSkillSummary[];
  conflictedSkills: CompiledSkillSummary[];
  capabilityChecks: CapabilityCheck[];
  degradations: DegradationReport[];
  artifacts: AdapterArtifact[];
}

export interface CompiledSkillSummary {
  id: string;
  name: string;
  type: SkillType;
  schemaVersion: string;
  sourceFormat: "legacy" | "universal";
  status: "effective" | "shadowed" | "conflicted";
  selectionReason: string;
  layer: LayerProvenance;
}

export interface CapabilityCheck {
  skillId: string;
  capability: string;
  requirement: CapabilityRequirement;
  support: CapabilitySupport;
  action: "use" | "degrade" | "skip" | "note";
  reason: string;
}

export interface DegradationReport {
  skillId: string;
  capability: string;
  mode: string;
  message: string;
}
