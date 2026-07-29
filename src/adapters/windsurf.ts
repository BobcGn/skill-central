// ============================================================================
// Adapters / Windsurf
// ----------------------------------------------------------------------------
// Target adapter for Windsurf rule previews.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { DegradationReport } from "../compiler/types.js";
import { buildDegradationArtifacts, buildTraceablePreview, metadataFor } from "./common.js";
import { loadTargetCapabilities, supportFromCapabilities } from "./capability-loader.js";
import type { AdapterArtifact, CapabilitySupport, TargetAdapter, TargetCapability } from "./types.js";

export const windsurfAdapter: TargetAdapter = {
  target: "windsurf",
  label: "Windsurf",
  description: "Windsurf rule preview targeting .windsurf/rules/*.md.",
  capabilities,
  capabilitySupport,
  buildArtifacts(skills, degradations) {
    const artifacts: AdapterArtifact[] = skills.map((skill) => ({
      target: "windsurf",
      skillId: skill.id,
      kind: "windsurf-rule",
      path: `.windsurf/rules/${skill.id}.md`,
      preview: buildTraceablePreview(skill, "windsurf"),
      metadata: metadataFor(skill),
    }));
    return artifacts.concat(buildDegradationArtifacts("windsurf", skills, degradations));
  },
};

function capabilities(): TargetCapability[] {
  return loadTargetCapabilities("windsurf");
}

function capabilitySupport(capability: string): CapabilitySupport {
  return supportFromCapabilities(capabilities(), capability);
}
