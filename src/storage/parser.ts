// ============================================================================
// Storage / Parser
// ----------------------------------------------------------------------------
// Parses raw skill definition files (.json, .yaml, .md) into validated
// SkillSchema objects. Invalid or malformed files are silently skipped
// with a warning rather than crashing the server.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillSchema } from "./schemas.js";

/**
 * Read a single file and attempt to parse it as a SkillSchema.
 * Returns `null` when the file is not a valid skill definition.
 */
export async function parseSkillFile(filePath: string): Promise<SkillSchema | null> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    const raw = await readFile(filePath, "utf-8");

    switch (ext) {
      case ".json":
        return parseJsonSkill(raw, filePath);
      default:
        // JSON5, YAML, and Markdown front-matter parsers will be added here.
        return null;
    }
  } catch (err) {
    console.warn(`[skill-central] Skipping unparseable file: ${filePath}`, err);
    return null;
  }
}

function parseJsonSkill(raw: string, filePath: string): SkillSchema | null {
  try {
    const obj = JSON.parse(raw);

    if (typeof obj.id !== "string" || !obj.id) {
      console.warn(`[skill-central] Missing "id" field: ${filePath}`);
      return null;
    }
    if (obj.type !== "prompt" && obj.type !== "tool") {
      console.warn(`[skill-central] Invalid "type" in: ${filePath}`);
      return null;
    }

    return obj as SkillSchema;
  } catch {
    console.warn(`[skill-central] JSON parse error: ${filePath}`);
    return null;
  }
}
