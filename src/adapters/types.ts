// ============================================================================
// Adapters / Types
// ----------------------------------------------------------------------------
// Public adapter contract for target-specific IDE output.
//
// Design intent:
// - The compiler should decide *which* skills are selected; adapters decide
//   *how* those skills are represented for a target.
// - Capability declarations live behind adapters so new IDEs can be added
//   without editing compiler control flow.
// - Adapter artifacts remain previews in Phase 2B. Export will later turn this
//   same shape into write transactions, which keeps dry-run and apply aligned.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { DegradationReport } from "../compiler/types.js";

export type CompileTarget = "generic-mcp" | "cursor" | "windsurf";

export type CapabilitySupport =
  | "supported"
  | "partial"
  | "unavailable"
  | "unknown"
  | "requires-user-approval";

export interface TargetCapability {
  name: string;
  support: CapabilitySupport;
  description?: string;
}

export interface AdapterMetadata {
  sourceLayer: string;
  sourceLayerId: string;
  readonly: boolean;
  trust: string;
  visibility: string;
}

export interface AdapterArtifact {
  target: CompileTarget;
  skillId: string;
  kind: "mcp-resource" | "cursor-rule" | "windsurf-rule" | "degradation-note";
  path?: string;
  preview: string;
  metadata: AdapterMetadata;
}

export interface TargetAdapter {
  target: CompileTarget;
  label: string;
  description: string;
  capabilities(): TargetCapability[];
  capabilitySupport(capability: string): CapabilitySupport;
  buildArtifacts(
    skills: ResolvedSkillView[],
    degradations: DegradationReport[],
  ): AdapterArtifact[];
}
