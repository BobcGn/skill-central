// ============================================================================
// Adapters / Cursor
// ----------------------------------------------------------------------------
// Target adapter for Cursor rule previews.
//
// Design intent:
// - Cursor artifacts include front matter so future export can write `.mdc`
//   files without changing dry-run semantics.
// - The trace block stays in the preview body because generated files must be
//   explainable even after they are copied out of skill-central.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { DegradationReport } from "../compiler/types.js";
import { buildDegradationArtifacts, buildTraceablePreview, metadataFor } from "./common.js";
import { loadTargetCapabilities, supportFromCapabilities } from "./capability-loader.js";
import type { AdapterArtifact, CapabilitySupport, TargetAdapter, TargetCapability } from "./types.js";

export const cursorAdapter: TargetAdapter = {
  target: "cursor",
  label: "Cursor",
  description: "Cursor rule preview targeting .cursor/rules/*.mdc.",
  capabilities,
  capabilitySupport,
  buildArtifacts(skills, degradations) {
    const artifacts: AdapterArtifact[] = skills.map((skill) => ({
      target: "cursor",
      skillId: skill.id,
      kind: "cursor-rule",
      path: `.cursor/rules/${skill.id}.mdc`,
      preview: [
        "---",
        `description: Generated from skill-central skill ${skill.id}`,
        "alwaysApply: false",
        "---",
        "",
        buildTraceablePreview(skill, "cursor"),
      ].join("\n"),
      metadata: metadataFor(skill),
    }));
    return artifacts.concat(buildDegradationArtifacts("cursor", skills, degradations));
  },
};

function capabilities(): TargetCapability[] {
  return loadTargetCapabilities("cursor");
}

function capabilitySupport(capability: string): CapabilitySupport {
  return supportFromCapabilities(capabilities(), capability);
}
