// ============================================================================
// Board Command
// ----------------------------------------------------------------------------
// "skill-central board" — 面向开发者的终端看板。
// 读取当前配置的所有 Skill 层与已解析的技能清单，以表格形式输出。
// 直观展示层级覆写关系和优先级分布。
// ============================================================================

import { SkillEngine } from "./core/engine.js";
import { loadConfig } from "./storage/config.js";

export async function showBoard(): Promise<void> {
  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers);

  const skills = engine.listSkills();

  // ── Header ───────────────────────────────────────────────────────────────
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║              skill-central  Skill Board                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  // ── Layer overview ────────────────────────────────────────────────────────
  console.log("▸ Layers");
  console.log("  " + "-".repeat(60));
  console.table(
    config.layers.map((l) => ({
      Name: l.name,
      Path: l.path,
      Priority: l.priority,
    })),
  );

  // ── Skill inventory ──────────────────────────────────────────────────────
  console.log("");
  console.log(`▸ Skills (${skills.length} total)`);
  console.log("  " + "-".repeat(60));
  if (skills.length === 0) {
    console.log("  (no skills loaded — run `skill-central init` to seed samples)");
  } else {
    console.table(
      skills.map((s) => ({
        ID: s.id,
        Name: s.name.substring(0, 30),
        Type: s.type,
        Tags: (s.tags ?? []).join(", "),
      })),
    );
  }

  console.log("");
}
