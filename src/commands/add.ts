// ============================================================================
// Add Command
// ----------------------------------------------------------------------------
// "skill-central add" — create a new skill definition file in the appropriate
// layer. Layer selection is automatic from tags (table-driven), with explicit
// override via --layer. Scope is project (.skills/) by default, or user
// (~/.skill-central/skills/) with --user.
// ============================================================================

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { load as parseYaml, dump as dumpYaml } from "js-yaml";

import { loadConfig } from "../storage/config.js";
import { parseSkillFile, validateSkill } from "../storage/parser.js";
import { discoverSkillFiles } from "../storage/reader.js";
import type { SkillLayer } from "../storage/schemas.js";

// ── Layer inference table ──────────────────────────────────────────────────
//
// Single source of truth for the tag → layer mapping. Re-used by install /
// doctor. Order matters: a tag may match multiple layers; the first matching
// rule wins, and the higher-priority layer wins in ambiguous cases (see
// resolveLayer()).
//
// "path" is relative to the layer root (e.g. ".skills/02-workflows").
// "relPath" is relative to scope root (".skills" or "~/.skill-central/skills").

export interface LayerRule {
  /** Display name used by --layer flag and inference output. */
  name: string;
  /** Subdirectory under the scope root. */
  relPath: string;
  /** Default priority when auto-injecting a user-level layer (lower than project). */
  defaultPriority: number;
  /** Tags that signal this layer is the right home. */
  tags: string[];
}

export const LAYER_RULES: LayerRule[] = [
  {
    name: "01-global",
    relPath: "01-global",
    defaultPriority: 10,
    tags: ["global", "universal", "baseline", "system", "mindset"],
  },
  {
    name: "02-workflows",
    relPath: "02-workflows",
    defaultPriority: 20,
    tags: [
      "workflow",
      "debug",
      "review",
      "planning",
      "commit",
      "test",
      "lint",
      "readme",
      "changelog",
      "refactor",
      "document",
      "release",
      "git",
    ],
  },
  {
    name: "03-domains",
    relPath: "03-domains",
    defaultPriority: 30,
    tags: [
      "docker",
      "nginx",
      "infra",
      "devops",
      "security",
      "database",
      "db",
      "data",
      "ai",
      "agent",
      "ml",
      "kubernetes",
      "k8s",
      "terraform",
      "aws",
    ],
  },
  {
    name: "04-tech-stack/languages",
    relPath: "04-tech-stack/languages",
    defaultPriority: 40,
    tags: [
      "typescript",
      "javascript",
      "python",
      "kotlin",
      "swift",
      "java",
      "go",
      "rust",
      "ruby",
      "php",
      "c++",
      "c",
    ],
  },
  {
    name: "04-tech-stack/frameworks",
    relPath: "04-tech-stack/frameworks",
    defaultPriority: 40,
    tags: [
      "react",
      "vue",
      "svelte",
      "nextjs",
      "next",
      "nuxt",
      "angular",
      "express",
      "fastapi",
      "django",
      "flask",
      "spring",
      "rails",
    ],
  },
];

/** Map a layer display name → rule. */
export function findLayerRule(name: string): LayerRule | undefined {
  return LAYER_RULES.find((r) => r.name === name);
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface AddOptions {
  /** Skill id (kebab-case). */
  id?: string;
  /** Human-readable name. */
  name?: string;
  /** Short description. */
  description?: string;
  /** Skill type. Defaults to "prompt". */
  type?: "prompt" | "tool";
  /** Comma-separated tags. */
  tags?: string;
  /** Inline prompt text (mutually exclusive with --prompt-file / --from-file). */
  prompt?: string;
  /** Read prompt from this file path (mutually exclusive with --prompt / --from-file). */
  promptFile?: string;
  /** Copy an entire skill file (parsed, re-serialised). Overrides other flags. */
  fromFile?: string;
  /** Force the layer (bypasses inference). */
  layer?: string;
  /** Write to user-level ~/.skill-central/skills/ instead of project .skills/. */
  user?: boolean;
  /** Overwrite existing file if present. */
  force?: boolean;
  /** Skip confirmations. */
  yes?: boolean;
}

/**
 * Main entry point for `skill-central add`. Resolves scope + layer, builds
 * the schema, writes it, then round-trip validates by re-reading.
 */
export async function cmdAdd(opts: AddOptions): Promise<void> {
  // ── 1. Resolve scope ────────────────────────────────────────────────────
  const scope = await resolveScope(opts.user ?? false);

  // ── 2. If --from-file, copy verbatim ───────────────────────────────────
  let schema: Record<string, unknown>;
  let inferredTags: string[] = [];

  if (opts.fromFile) {
    schema = await loadFromFile(opts.fromFile);
    inferredTags = normaliseTags(schema.tags);
  } else {
    // ── 3. Inline / flags path: require id + name + description + content ──
    const id = requireKebab(opts.id, "--id");
    const name = requireString(opts.name, "--name");
    const description = requireString(opts.description, "--description");

    const promptText = await resolvePromptText(opts);

    schema = {
      id,
      name,
      description,
      type: opts.type ?? "prompt",
    };
    if (opts.tags) {
      const parsed = parseTags(opts.tags);
      schema.tags = parsed;
      inferredTags = parsed;
    }
    if (promptText) {
      schema.prompt = promptText;
    }
  }

  // ── 4. Resolve layer ───────────────────────────────────────────────────
  const idValue = requireString(schema.id as string | undefined, "id");
  const layer = await resolveLayer({
    requested: opts.layer,
    tags: inferredTags,
    id: idValue,
    scope,
  });

  // ── 5. Resolve target path ─────────────────────────────────────────────
  const targetPath = path.join(scope.root, layer.rule.relPath, `${idValue}.yaml`);

  // ── 6. Check existence ─────────────────────────────────────────────────
  const exists = await fileExists(targetPath);
  if (exists && !opts.force) {
    throw new Error(
      `File already exists: ${targetPath}\n` +
        `Use --force to overwrite (a .bak.<ts> backup will be created).`,
    );
  }

  // ── 7. Validate (round-trip) ───────────────────────────────────────────
  const validated = validateSkill(schema, targetPath);
  if (!validated) {
    throw new Error("Schema validation failed; see warnings above.");
  }

  // ── 8. Backup existing file ────────────────────────────────────────────
  if (exists) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${targetPath}.bak.${ts}`;
    const content = await readFile(targetPath, "utf-8");
    await writeFile(backupPath, content, "utf-8");
    console.error(`[skill-central] backed up to ${backupPath}`);
  }

  // ── 9. Ensure directory exists + write ─────────────────────────────────
  await mkdir(path.dirname(targetPath), { recursive: true });
  const yaml = serialiseYaml(schema);
  await writeFile(targetPath, yaml, "utf-8");

  // ── 10. Round-trip verify by re-reading ────────────────────────────────
  const verified = await parseSkillFile(targetPath);
  if (!verified) {
    // Rollback
    const { unlink } = await import("node:fs/promises");
    await unlink(targetPath).catch(() => {});
    throw new Error("Round-trip validation failed; file rolled back.");
  }

  console.log("");
  console.log(`  ✓ Created ${scope.label}:${layer.rule.name}/${idValue}.yaml`);
  console.log(`    ${targetPath}`);
  console.log("");
  console.log("  Next: restart MCP (`skill-central mcp`) or open the web board");
  console.log("        (`skill-central board`) to load this skill.");
  console.log("");
}

// ── Scope resolution ───────────────────────────────────────────────────────

interface Scope {
  /** Absolute root directory containing the 4 layer subdirs. */
  root: string;
  /** Short label for printing: "project" or "user". */
  label: "project" | "user";
  /** Whether this scope was chosen implicitly (for warnings). */
  implicit: boolean;
}

async function resolveScope(userFlag: boolean): Promise<Scope> {
  if (userFlag) {
    const root = path.join(homedir(), ".skill-central", "skills");
    await mkdir(root, { recursive: true });
    return { root, label: "user", implicit: false };
  }

  const projectRoot = path.join(process.cwd(), ".skills");
  if (await dirExists(projectRoot)) {
    return { root: projectRoot, label: "project", implicit: false };
  }

  // .skills/ missing → check whether a config exists; if yes, still use cwd.
  // If neither config nor .skills/ exists, fall back to user.
  const configHere = path.join(process.cwd(), "skill-central.yaml");
  if (await fileExists(configHere)) {
    await mkdir(projectRoot, { recursive: true });
    return { root: projectRoot, label: "project", implicit: false };
  }

  console.error(
    "[skill-central] No .skills/ or skill-central.yaml in cwd; falling back to user scope.",
  );
  const userRoot = path.join(homedir(), ".skill-central", "skills");
  await mkdir(userRoot, { recursive: true });
  return { root: userRoot, label: "user", implicit: true };
}

// ── Layer resolution ────────────────────────────────────────────────────────

interface ResolveLayerInput {
  requested?: string;
  tags: string[];
  id: string;
  scope: Scope;
}

interface ResolvedLayer {
  rule: LayerRule;
  inferred: boolean;
}

async function resolveLayer(input: ResolveLayerInput): Promise<ResolvedLayer> {
  // 1. Explicit --layer wins.
  if (input.requested) {
    const rule = findLayerRule(input.requested);
    if (!rule) {
      throw new Error(
        `Unknown layer "${input.requested}". Valid layers: ${LAYER_RULES.map((r) => r.name).join(", ")}`,
      );
    }
    return { rule, inferred: false };
  }

  // 2. Idempotent re-add: if a file with this id already exists in any layer,
  //    write back to the same layer.
  for (const rule of LAYER_RULES) {
    const candidate = path.join(input.scope.root, rule.relPath, `${input.id}.yaml`);
    if (await fileExists(candidate)) {
      return { rule, inferred: false };
    }
  }

  // 3. Tag-based inference: collect all matching rules, pick highest priority.
  const matched = LAYER_RULES.filter((r) =>
    input.tags.some((t) => r.tags.includes(t.toLowerCase())),
  );

  if (matched.length === 1) {
    return { rule: matched[0]!, inferred: true };
  }

  if (matched.length > 1) {
    matched.sort((a, b) => b.defaultPriority - a.defaultPriority);
    console.error(
      `[skill-central] tags match multiple layers (${matched.map((m) => m.name).join(", ")}); using ${matched[0]!.name}`,
    );
    return { rule: matched[0]!, inferred: true };
  }

  // 4. No match → default to 02-workflows and warn.
  const fallback = findLayerRule("02-workflows")!;
  console.error(
    `[skill-central] no layer inferred from tags; defaulting to ${fallback.name}. Pass --layer to override.`,
  );
  return { rule: fallback, inferred: true };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function resolvePromptText(opts: AddOptions): Promise<string | undefined> {
  if (opts.prompt && opts.promptFile) {
    throw new Error("--prompt and --prompt-file are mutually exclusive.");
  }
  if (opts.promptFile) {
    return await readFile(opts.promptFile, "utf-8");
  }
  return opts.prompt;
}

async function loadFromFile(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;
  if (ext === ".json") {
    parsed = JSON.parse(raw);
  } else {
    parsed = parseYaml(raw);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Source file did not parse to an object: ${filePath}`);
  }
  // Ensure id is present.
  if (typeof (parsed as Record<string, unknown>).id !== "string") {
    throw new Error(`Source file is missing required "id" field: ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function normaliseTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase());
  }
  if (typeof input === "string") {
    return [input.toLowerCase()];
  }
  return [];
}

function requireString(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${label}`);
  }
  return value;
}

function requireKebab(value: string | undefined, label: string): string {
  const v = requireString(value, label);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) {
    throw new Error(
      `${label} must be kebab-case (lowercase letters, digits, single hyphens): got "${v}"`,
    );
  }
  return v;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize an object as YAML. js-yaml's default dump gives a stable
 * representation; we tweak flow-level and quoting to match the style of
 * the samples produced by `init`.
 */
function serialiseYaml(obj: Record<string, unknown>): string {
  return dumpYaml(obj, {
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}

// ── Unused but exposed for future commands ─────────────────────────────────
//
// discoverSkillFiles is exported from reader.ts; re-exported here so any
// command that wants to scan a layer directory has a single import path.
export { discoverSkillFiles };
// SkillLayer type is re-exported so install/doctor don't need to know
// the internal storage path.
export type { SkillLayer };