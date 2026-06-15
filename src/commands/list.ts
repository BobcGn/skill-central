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
}

export async function cmdList(opts: ListOptions): Promise<void> {
  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers);

  let skills = engine.listSkills();

  if (opts.type) {
    skills = skills.filter((s) => s.type === opts.type);
  }
  if (opts.tag) {
    const tag = opts.tag.toLowerCase();
    skills = skills.filter((s) => s.tags?.some((t) => t.toLowerCase() === tag));
  }

  // Group by layer for a readable table.
  const layerByPriority = new Map<number, { name: string; path: string }>();
  for (const l of config.layers) {
    layerByPriority.set(l.priority, { name: l.name, path: l.path });
  }

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
        Tags: (s.tags ?? []).slice(0, 6).join(","),
      };
      return row;
    }),
  );
  console.log("");
}