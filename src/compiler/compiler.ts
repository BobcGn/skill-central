// ============================================================================
// Compiler / Compiler
// ----------------------------------------------------------------------------
// Dry-run compiler entrypoint.
//
// Design intent:
// - Compile from Registry records, not raw files. This keeps compiler decisions
//   aligned with CLI/MCP/UI effective/shadowed/conflicted semantics.
// - Dry-run is side-effect free: no target IDE files are created or modified.
// - Selection is explainable: intent matching first uses activation intents,
//   then falls back to id/tag matches so legacy skills can participate.
// ============================================================================

import { createHash } from "node:crypto";
import { getTargetAdapter } from "../adapters/registry.js";
import type { TargetAdapter } from "../adapters/types.js";
import type { ResolvedSkillView, ResolutionRecordView } from "../core/engine.js";
import { buildDegradation } from "./degradation.js";
import type {
  CapabilityCheck,
  CompiledSkillBundle,
  CompiledSkillSummary,
  CompileRequest,
} from "./types.js";

export function compileIntentDryRun(
  records: ResolutionRecordView[],
  request: CompileRequest,
): CompiledSkillBundle {
  const adapter = getTargetAdapter(request.target);
  const relevantRecords = records.filter((record) =>
    record.candidates.some((skill) => matchesIntent(skill, request.intent)),
  );

  const selected = relevantRecords
    .flatMap((record) => record.candidates)
    .filter((skill) => skill.status === "effective" && matchesIntent(skill, request.intent));
  const shadowed = relevantRecords
    .flatMap((record) => record.candidates)
    .filter((skill) => skill.status === "shadowed" && matchesIntent(skill, request.intent));
  const conflicted = relevantRecords
    .flatMap((record) => record.candidates)
    .filter((skill) => skill.status === "conflicted" && matchesIntent(skill, request.intent));

  const capabilityChecks = selected.flatMap((skill) => checkCapabilities(skill, adapter));
  const degradations = capabilityChecks
    .filter((check) => check.action === "degrade")
    .map((check) => {
      const skill = selected.find((candidate) => candidate.id === check.skillId)!;
      return buildDegradation(skill, check.capability);
    });

  const artifacts = adapter.buildArtifacts(selected, degradations);
  const bundleWithoutHash = {
    target: request.target,
    intent: request.intent,
    dryRun: true as const,
    selectedSkills: selected.map((skill) => toSummary(skill, request.intent)),
    shadowedSkills: shadowed.map((skill) => toSummary(skill, request.intent)),
    conflictedSkills: conflicted.map((skill) => toSummary(skill, request.intent)),
    capabilityChecks,
    degradations,
    artifacts,
  };

  return {
    ...bundleWithoutHash,
    hash: stableHash(bundleWithoutHash),
  };
}

function checkCapabilities(skill: ResolvedSkillView, adapter: TargetAdapter): CapabilityCheck[] {
  const checks: CapabilityCheck[] = [];
  for (const requirement of ["required", "optional", "denied"] as const) {
    for (const capability of skill.capabilities?.[requirement] ?? []) {
      const support = adapter.capabilitySupport(capability);
      const mustDegrade =
        requirement === "required" &&
        (support === "unavailable" || support === "unknown");
      checks.push({
        skillId: skill.id,
        capability,
        requirement,
        support,
        action: requirement === "denied" ? "note" : mustDegrade ? "degrade" : "use",
        reason: reasonFor(requirement, support),
      });
    }
  }
  return checks;
}

function reasonFor(requirement: "required" | "optional" | "denied", support: string): string {
  if (requirement === "denied") return "skill explicitly denies this capability";
  if (support === "supported") return "target supports this capability";
  if (support === "requires-user-approval") return "target can use this capability after user approval";
  if (support === "partial") return "target has partial support; artifact may degrade";
  return "target support is missing or unknown";
}

function toSummary(skill: ResolvedSkillView, intent: string): CompiledSkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    type: skill.type,
    schemaVersion: skill.schemaVersion,
    sourceFormat: skill.sourceFormat,
    status: skill.status,
    selectionReason: selectionReason(skill, intent),
    layer: skill.layer,
  };
}

function matchesIntent(skill: ResolvedSkillView, intent: string): boolean {
  return (
    skill.id === intent ||
    (skill.tags ?? []).some((tag) => tag.toLowerCase() === intent.toLowerCase()) ||
    (skill.activation?.intents ?? []).some((candidate) => candidate === intent)
  );
}

function selectionReason(skill: ResolvedSkillView, intent: string): string {
  if ((skill.activation?.intents ?? []).includes(intent)) return `activation.intent=${intent}`;
  if (skill.id === intent) return `id=${intent}`;
  return `tag=${intent}`;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
