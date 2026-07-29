// ============================================================================
// Storage / Parser
// ----------------------------------------------------------------------------
// Parses raw skill definition files (.json, .yaml) into validated Universal
// Skill objects. Legacy skills are upgraded at load time.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import type { SkillSchema } from "./schemas.js";
import {
  formatValidationIssue,
  isUniversalSkillObject,
  normaliseUniversalSkill,
  validateUniversalSkillObject,
} from "../schema/universal-skill.js";
import {
  normaliseLegacySkill,
  upgradeLegacySkill,
  validateLegacySkillObject,
} from "../schema/legacy.js";

/**
 * Read a single file and attempt to parse it as a Universal Skill.
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
 * Validate that a parsed object conforms to Universal Skill.
 * Returns the schema on success, or null with a warning on failure.
 *
 * Exported so CLI commands (validate, add, doctor) can re-use the same
 * rules the engine uses at load time.
 */
export function validateSkill(
  obj: Record<string, unknown>,
  filePath: string,
): SkillSchema | null {
  if (isUniversalSkillObject(obj)) {
    const result = validateUniversalSkillObject(obj, filePath);
    if (!result.ok) {
      for (const issue of result.issues) {
        console.warn(`[skill-central] ${formatValidationIssue(issue)}`);
      }
      return null;
    }
    return normaliseUniversalSkill(obj);
  }

  const result = validateLegacySkillObject(obj, filePath);
  if (!result.ok) {
    for (const issue of result.issues) {
      console.warn(`[skill-central] ${formatValidationIssue(issue)}`);
    }
    return null;
  }
  return upgradeLegacySkill(normaliseLegacySkill(obj));
}
