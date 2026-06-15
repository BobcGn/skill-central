// ============================================================================
// Storage / Parser
// ----------------------------------------------------------------------------
// Parses raw skill definition files (.json, .yaml) into validated SkillSchema
// objects. Invalid or malformed files are silently skipped with a warning.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
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
        return validateSkill(JSON.parse(raw), filePath);
      case ".yaml":
      case ".yml":
        return parseYamlSkill(raw, filePath);
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[skill-central] Skipping unparseable file: ${filePath}`, err);
    return null;
  }
}

// ── YAML ───────────────────────────────────────────────────────────────────

function parseYamlSkill(raw: string, filePath: string): SkillSchema | null {
  try {
    const obj = parseYaml(raw);
    if (typeof obj !== "object" || obj === null) {
      console.warn(`[skill-central] YAML did not produce an object: ${filePath}`);
      return null;
    }
    return validateSkill(obj as Record<string, unknown>, filePath);
  } catch (err) {
    console.warn(`[skill-central] YAML parse error: ${filePath}`, err);
    return null;
  }
}

// ── Validation (shared by JSON and YAML) ───────────────────────────────────

/**
 * Validate that a parsed object conforms to SkillSchema.
 * Returns the schema on success, or null with a warning on failure.
 *
 * Exported so CLI commands (validate, add, doctor) can re-use the same
 * rules the engine uses at load time.
 */
export function validateSkill(
  obj: Record<string, unknown>,
  filePath: string,
): SkillSchema | null {
  if (typeof obj.id !== "string" || !obj.id) {
    console.warn(`[skill-central] Missing "id" field: ${filePath}`);
    return null;
  }
  if (obj.type !== "prompt" && obj.type !== "tool") {
    console.warn(`[skill-central] Invalid "type" in: ${filePath}`);
    return null;
  }
  // A prompt-type skill must carry at least one prompt body (English or
  // Chinese). Empty strings count as "missing" — half-migrated skills fail
  // loudly here rather than silently sending empty strings to MCP.
  if (obj.type === "prompt") {
    const hasEn = typeof obj.prompt === "string" && obj.prompt.trim().length > 0;
    const hasZh = typeof obj.prompt_zh === "string" && (obj.prompt_zh as string).trim().length > 0;
    if (!hasEn && !hasZh) {
      console.warn(
        `[skill-central] prompt-type skill "${obj.id}" has neither "prompt" nor "prompt_zh" set (or both are empty): ${filePath}`,
      );
      return null;
    }
  }

  // Normalise tags: accept string or array, collapse to array.
  if (obj.tags !== undefined) {
    if (Array.isArray(obj.tags)) {
      obj.tags = obj.tags.filter((t): t is string => typeof t === "string");
    } else if (typeof obj.tags === "string") {
      obj.tags = [obj.tags];
    } else {
      delete obj.tags;
    }
  }

  return obj as unknown as SkillSchema;
}
