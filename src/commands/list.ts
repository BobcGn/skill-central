// ============================================================================
// List Command
// ----------------------------------------------------------------------------
// "skill-central list" — print every loaded skill (resolved through the
// override tree). Supports filtering by layer name, type, and tag.
// ============================================================================

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";

export interface ListOptions {
  layer?: string;
  type?: "prompt" | "tool";
  tag?: string;
  source?: boolean; // also print the source file path
  projectRoot?: string;
  projectId?: string;
}

export async function cmdList(opts: ListOptions): Promise<void> {
  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers, { projectRoot: opts.projectRoot, projectId: opts.projectId });

  // Phase 1C: all user-facing filtering flows through Registry Query so CLI,
  // MCP, Web Board, and compiler dry-runs share one interpretation of type,
  // tag, resolution status, and provenance.
  const skills = engine.querySkills({
    type: opts.type,
    tags: opts.tag ? [opts.tag] : undefined,
  }).skills;

  // Group by layer for a readable table.
  void config;

  if (skills.length === 0) {
    console.log("");
    console.log("  (no skills match the filters — try `skill-central doctor` to debug)");
    console.log("");
    return;
  }

  console.log("");
  console.log(`▸ ${skills.length} skill(s)`);
  console.log("  " + "-".repeat(72));
  console.table(
    skills.map((s) => {
      const row: Record<string, string> = {
        ID: s.id,
        Name: s.name.length > 28 ? s.name.slice(0, 27) + "…" : s.name,
        Type: s.type,
        Scope: s.appliesTo === "global" ? "global" : `${s.appliesTo.projects.length} project(s)`,
        Tags: (s.tags ?? []).slice(0, 6).join(","),
      };
      return row;
    }),
  );
  console.log("");
}
