// ============================================================================
// Show Command
// ----------------------------------------------------------------------------
// "skill-central show <id>" — print the full resolved skill: id, name,
// description, type, tags, prompt body, and source layer + file path.
// ============================================================================

import { SkillEngine } from "../core/engine.js";
import { loadConfig } from "../storage/config.js";
import { readAllLayers } from "../storage/reader.js";

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

  // Locate the source layer for this id (use raw layer scan for source path).
  const layers = config.layers.sort((a, b) => b.priority - a.priority);
  let sourcePath = "(unknown)";
  let sourceLayer = "(unknown)";
  for (const layer of layers) {
    const entries = await readAllLayers([layer]);
    const hit = entries.find((e) => e.schema.id === id);
    if (hit) {
      sourcePath = `${layer.path}/${id}.yaml`;
      sourceLayer = layer.name;
      break;
    }
  }

  console.log("");
  console.log(`▸ ${resolved.id}`);
  console.log("  " + "-".repeat(72));
  console.log(`  Name        : ${resolved.name}`);
  console.log(`  Type        : ${resolved.type}`);
  console.log(`  Description : ${resolved.description}`);
  console.log(`  Tags        : ${(resolved.tags ?? []).join(", ") || "(none)"}`);
  console.log(`  Layer       : ${sourceLayer}`);
  console.log(`  Source      : ${sourcePath}`);
  if (resolved.type === "tool" && resolved.inputSchema) {
    console.log(`  InputSchema :`);
    console.log(JSON.stringify(resolved.inputSchema, null, 2)
      .split("\n")
      .map((l) => "    " + l)
      .join("\n"));
  }
  if (resolved.type === "prompt" && resolved.prompt) {
    console.log("");
    console.log("  Prompt:");
    console.log("  " + "-".repeat(72));
    for (const line of resolved.prompt.split("\n")) {
      console.log(`  ${line}`);
    }
  }
  console.log("");
}