// ============================================================================
// Adapters / Common Preview Helpers
// ----------------------------------------------------------------------------
// Shared artifact text and provenance helpers.
//
// Design intent:
// - Target adapters need different paths/kinds, but the source trace block must
//   stay consistent so users can audit any generated artifact back to a skill
//   and layer.
// - The preview body is intentionally Markdown-like because Phase 2 output is
//   inspected by humans before any export transaction is allowed.
// ============================================================================

import { buildPromptBundlePreview } from "../compiler/prompt-bundle.js";
import type { DegradationReport } from "../compiler/types.js";
import type { ResolvedSkillView } from "../core/engine.js";
import type { AdapterArtifact, AdapterMetadata, CompileTarget } from "./types.js";

export function buildTraceablePreview(skill: ResolvedSkillView, target: CompileTarget): string {
  return buildPromptBundlePreview(target, skill);
}

export function metadataFor(skill: ResolvedSkillView): AdapterMetadata {
  return {
    sourceLayer: skill.layer.name,
    sourceLayerId: skill.layer.id,
    readonly: !skill.layer.writable,
    trust: skill.layer.trust,
    visibility: skill.layer.visibility,
  };
}

export function buildDegradationArtifacts(
  target: CompileTarget,
  skills: ResolvedSkillView[],
  degradations: DegradationReport[],
): AdapterArtifact[] {
  const artifacts: AdapterArtifact[] = [];
  for (const degradation of degradations) {
    const skill = skills.find((candidate) => candidate.id === degradation.skillId);
    if (!skill) continue;
    artifacts.push({
      target,
      skillId: skill.id,
      kind: "degradation-note",
      path: degradationPath(target, skill.id, degradation.capability),
      preview: [
        `# skill-central degradation`,
        `target: ${target}`,
        `skill: ${skill.id}`,
        `capability: ${degradation.capability}`,
        `mode: ${degradation.mode}`,
        "",
        degradation.message,
        "",
        nextActionFor(degradation.mode),
      ].join("\n"),
      metadata: metadataFor(skill),
    });
  }
  return artifacts;
}

function degradationPath(target: CompileTarget, skillId: string, capability: string): string {
  const suffix = capability.replace(/[^a-zA-Z0-9.-]/g, "-");
  if (target === "cursor") return `.cursor/rules/${skillId}.degradation.${suffix}.md`;
  if (target === "windsurf") return `.windsurf/rules/${skillId}.degradation.${suffix}.md`;
  return `mcp-degradations/${skillId}.${suffix}.md`;
}

function nextActionFor(mode: string): string {
  switch (mode) {
    case "manual-instructions":
      return "Next action: follow the manual instruction before relying on the generated artifact.";
    case "prompt-only":
      return "Next action: use the prompt text without automated tool calls.";
    case "omit-step":
      return "Next action: run the remaining workflow steps and skip the unsupported step.";
    case "ask-user":
      return "Next action: ask the user to choose an approved substitute action.";
    case "static-export":
      return "Next action: export static files and avoid runtime IDE automation.";
    case "unavailable":
      return "Next action: choose another target or add a degradation rule to the skill.";
    default:
      return `Next action: apply the declared ${mode} fallback.`;
  }
}
