// ============================================================================
// Storage / Rule Reader
// ----------------------------------------------------------------------------
// Discovers, reads, and validates Rule definition files from the .rules/
// directory. This is the rule-side counterpart to storage/reader.ts +
// storage/parser.ts, kept independent so rule loading and skill loading share
// no code path and cannot break each other.
//
// A file that fails validation is warned about and skipped (returns null),
// never thrown. One malformed rule must not stop the remaining rules — nor,
// because this module is never imported by the skill pipeline, any skills.
// ============================================================================

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import {
  formatRuleValidationIssue,
  isRuleObject,
  normaliseRule,
  validateRuleObject,
  type Rule,
} from "../schema/rule.js";

const ALLOWED_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

export interface LoadedRule {
  rule: Rule;
  filePath: string;
}

/** Default rule library directory, sibling to .skills/. */
export const DEFAULT_RULES_DIR = ".rules";

/**
 * Read every rule found under the given directories.
 * Files that fail to parse or validate are skipped with a warning.
 */
export async function readAllRules(dirs: string[] = [DEFAULT_RULES_DIR]): Promise<Rule[]> {
  return (await readAllRuleEntries(dirs)).map((entry) => entry.rule);
}

/** Read valid rules together with their exact source paths for editing UIs. */
export async function readAllRuleEntries(
  dirs: string[] = [DEFAULT_RULES_DIR],
): Promise<LoadedRule[]> {
  const rules: LoadedRule[] = [];
  for (const dir of dirs) {
    const files = await discoverRuleFiles(dir);
    for (const filePath of files) {
      const rule = await parseRuleFile(filePath);
      if (rule) {
        rules.push({ rule, filePath });
      }
    }
  }
  return rules;
}

/**
 * Recursively list rule definition files under `dirPath`.
 * Hidden files and `_`-prefixed files (templates/examples) are skipped,
 * matching the skill reader's convention.
 */
export async function discoverRuleFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await discoverRuleFiles(fullPath)));
      } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }

    return files;
  } catch {
    // Missing directory is a normal local-first state, not an error.
    return [];
  }
}

/**
 * Read a single file and attempt to parse it as a Rule.
 * Returns `null` when the file is not a valid rule definition.
 */
export async function parseRuleFile(filePath: string): Promise<Rule | null> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    const raw = await readFile(filePath, "utf-8");
    let obj: unknown;
    switch (ext) {
      case ".json":
        obj = JSON.parse(raw);
        break;
      case ".yaml":
      case ".yml":
        obj = parseYaml(raw);
        break;
      default:
        return null;
    }

    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      console.warn(`[skill-central] Rule file did not produce an object: ${filePath}`);
      return null;
    }

    return validateRule(obj as Record<string, unknown>, filePath);
  } catch (err) {
    console.warn(`[skill-central] Skipping unparseable rule file: ${filePath}`, err);
    return null;
  }
}

/**
 * Validate a parsed object as a Rule. Returns the normalised rule on success,
 * or null with field-level warnings on failure.
 *
 * Exported so the validate-rule command re-uses the same rules the reader
 * applies at load time.
 */
export function validateRule(obj: Record<string, unknown>, filePath: string): Rule | null {
  if (!isRuleObject(obj)) {
    console.warn(
      `[skill-central] ${filePath}: schemaVersion: expected a rule (skillcentral.dev/rule/v1)`,
    );
    return null;
  }

  const result = validateRuleObject(obj, filePath);
  if (!result.ok) {
    for (const issue of result.issues) {
      console.warn(`[skill-central] ${formatRuleValidationIssue(issue)}`);
    }
    return null;
  }

  return normaliseRule(obj);
}
