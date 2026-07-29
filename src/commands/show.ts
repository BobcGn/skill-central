// ============================================================================
// Show Command
// ----------------------------------------------------------------------------
// "skill-central show <id>" — print the full resolved skill: id, name,
// description, type, tags, prompt body, and source layer + file path.
// ============================================================================

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";

export async function cmdShow(id: string): Promise<void> {
  const config = loadConfig();
  const engine = new SkillEngine();
  await engine.reload(config.layers);

  const resolved = engine.getSkill(id);
  if (!resolved) {
    throw new Error(
      `Skill "${id}" not found. Run \`skill-central list\` to see available ids.`,
    );
  }

  // Phase 1B: source/layer provenance comes from the engine resolution record.
  // This keeps `show` aligned with MCP and doctor instead of re-scanning layers
  // with slightly different override semantics.
  const sourcePath = `${resolved.layer.path}/${id}.yaml`;
  const sourceLayer = resolved.layer.name;

  console.log("");
  console.log(`▸ ${resolved.id}`);
  console.log("  " + "-".repeat(72));
  console.log(`  Name        : ${resolved.name}`);
  console.log(`  Type        : ${resolved.type}`);
  console.log(`  Description : ${resolved.description}`);
  console.log(`  Tags        : ${(resolved.tags ?? []).join(", ") || "(none)"}`);
  console.log(`  Layer       : ${sourceLayer}`);
  console.log(`  Layer ID    : ${resolved.layer.id}`);
  console.log(`  Scope       : ${resolved.layer.scope}`);
  console.log(`  Status      : ${resolved.status}`);
  console.log(`  Format      : ${resolved.sourceFormat}`);
  console.log(`  Source      : ${sourcePath}`);
  if (resolved.type === "tool" && resolved.inputSchema) {
    console.log(`  InputSchema :`);
    console.log(JSON.stringify(resolved.inputSchema, null, 2)
      .split("\n")
      .map((l) => "    " + l)
      .join("\n"));
  }
  if (resolved.type === "prompt") {
    if (resolved.prompt) {
      console.log("");
      console.log("  Prompt [English]:");
      console.log("  " + "-".repeat(72));
      for (const line of resolved.prompt.split("\n")) {
        console.log(`  ${line}`);
      }
    }
    if (resolved.prompt_zh) {
      console.log("");
      console.log("  Prompt [中文]:");
      console.log("  " + "-".repeat(72));
      for (const line of resolved.prompt_zh.split("\n")) {
        console.log(`  ${line}`);
      }
    }
    if (!resolved.prompt && !resolved.prompt_zh) {
      console.log("");
      console.log("  Prompt: (none)");
    }
  }
  console.log("");
}
