// ============================================================================
// Adapters / Generic MCP
// ----------------------------------------------------------------------------
// Target adapter for MCP-compatible prompt/tool/resource previews.
// ============================================================================

import type { ResolvedSkillView } from "../core/engine.js";
import type { DegradationReport } from "../compiler/types.js";
import { buildDegradationArtifacts, buildTraceablePreview, metadataFor } from "./common.js";
import { loadTargetCapabilities, supportFromCapabilities } from "./capability-loader.js";
import type { AdapterArtifact, CapabilitySupport, TargetAdapter, TargetCapability } from "./types.js";

export const genericMcpAdapter: TargetAdapter = {
  target: "generic-mcp",
  label: "Generic MCP",
  description: "Portable MCP preview using skill:// resources for selected skills.",
  capabilities,
  capabilitySupport,
  buildArtifacts(skills, degradations) {
    const artifacts: AdapterArtifact[] = skills.map((skill) => ({
      target: "generic-mcp",
      skillId: skill.id,
      kind: "mcp-resource",
      path: `skill://${skill.type}/${skill.id}`,
      preview: buildTraceablePreview(skill, "generic-mcp"),
      metadata: metadataFor(skill),
    }));
    return artifacts.concat(buildDegradationArtifacts("generic-mcp", skills, degradations));
  },
};

function capabilities(): TargetCapability[] {
  return loadTargetCapabilities("generic-mcp");
}

function capabilitySupport(capability: string): CapabilitySupport {
  return supportFromCapabilities(capabilities(), capability);
}
