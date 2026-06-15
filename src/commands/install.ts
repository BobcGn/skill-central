// ============================================================================
// Install Command
// ----------------------------------------------------------------------------
// "skill-central install <source>" — fetch a skill from a github: or npm:
// URL and write it into a layer. Writes a lock file entry on success.
//
// Layer resolution: explicit --layer flag wins; otherwise inferred from
// the skill's tags via the same LAYER_RULES used by `add`. Scope defaults
// to user (~/.skill-central/skills/) when --project is not given.
// ============================================================================

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

import { validateSkill } from "../storage/parser.js";
import { parseSource, fetchGithubSkill, fetchNpmSkill, sha256Of } from "./sources.js";
import { readLock, writeLock, addEntry, findById } from "./lockfile.js";
import type { LockEntry } from "./lockfile.js";
import { LAYER_RULES, findLayerRule } from "./add.js";
import type { LayerRule } from "./add.js";
import { backupBeforeWrite } from "../web/backup.js";

export interface InstallOptions {
  layer?: string;
  /** Force project scope (.skills/) over user scope. */
  project?: boolean;
  /** Skip "about to install" confirmation. */
  yes?: boolean;
}

interface Scope {
  root: string;
  label: "project" | "user";
}

function resolveScope(projectFlag: boolean): Scope {
  if (projectFlag) {
    return {
      root: path.join(process.cwd(), ".skills"),
      label: "project",
    };
  }
  return {
    root: path.join(homedir(), ".skill-central", "skills"),
    label: "user",
  };
}

function resolveLayer(requested: string | undefined, tags: string[]): LayerRule {
  if (requested) {
    const rule = findLayerRule(requested);
    if (!rule) {
      throw new Error(
        `Unknown layer "${requested}". Valid: ${LAYER_RULES.map((r) => r.name).join(", ")}`,
      );
    }
    return rule;
  }
  const matched = LAYER_RULES.filter((r) =>
    tags.some((t) => r.tags.includes(t.toLowerCase())),
  );
  if (matched.length > 0) {
    matched.sort((a, b) => b.defaultPriority - a.defaultPriority);
    return matched[0]!;
  }
  const fallback = findLayerRule("02-workflows")!;
  console.error(
    `[skill-central] no layer inferred from tags; defaulting to ${fallback.name}. Pass --layer to override.`,
  );
  return fallback;
}

export async function cmdInstall(source: string, opts: InstallOptions): Promise<void> {
  // 1. Parse + fetch.
  const spec = parseSource(source);
  let fetchedList;
  if (spec.kind === "github") {
    const fetched = await fetchGithubSkill(spec);
    fetchedList = [fetched];
  } else {
    fetchedList = await fetchNpmSkill(spec);
  }
  if (fetchedList.length === 0) {
    throw new Error("Source produced no skills.");
  }

  // 2. Parse + validate each fetched entry.
  type Validated = {
    validated: NonNullable<ReturnType<typeof validateSkill>>;
    rawYaml: string;
    sha256: string;
    version: string;
  };
  const items: Validated[] = [];
  for (const f of fetchedList) {
    const parsed = parseYaml(f.rawYaml);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Downloaded YAML did not parse to an object.");
    }
    const schema = parsed as Record<string, unknown>;
    const provisionalPath = f.spec.kind === "github"
      ? `github:${f.spec.user}/${f.spec.repo}/${f.spec.path}`
      : `npm:${f.spec.pkg}`;
    const validated = validateSkill(schema, provisionalPath);
    if (!validated) {
      throw new Error("Downloaded skill failed schema validation.");
    }
    items.push({ validated, rawYaml: f.rawYaml, sha256: f.sha256, version: f.version });
  }

  // 3. Confirm (multi-file for npm packages).
  if (!opts.yes) {
    console.log("");
    console.log(`  About to install ${items.length} skill(s):`);
    for (const it of items) {
      const v = it.validated;
      console.log(`    - id: ${v.id} (${v.name})`);
      console.log(`      tags: ${(v.tags ?? []).join(", ") || "(none)"}`);
    }
    console.log(`    source: ${spec.raw}`);
    console.log(`    version: ${items[0]!.version}`);
    console.log("");
    console.log("  Pass --yes to skip this prompt in scripts.");
    console.log("");
  }

  // 4. Resolve scope once.
  const scope = resolveScope(opts.project ?? false);

  // 5. Update lock once.
  const lock = await readLock();

  // 6. Write each skill.
  for (const it of items) {
    const v = it.validated;
    if (!v) continue;
    const layer = resolveLayer(opts.layer, (v.tags ?? []).map((t) => t.toLowerCase()));
    const targetPath = path.join(scope.root, layer.relPath, `${v.id}.yaml`);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await backupBeforeWrite(targetPath);
    await writeFile(targetPath, it.rawYaml, "utf-8");
    const finalSha = sha256Of(it.rawYaml);

    const existing = findById(lock, v.id);
    const entry: LockEntry = {
      id: v.id,
      source: spec.raw,
      version: it.version,
      sha256: finalSha,
      installedAt: new Date().toISOString(),
      layer: layer.name,
      filePath: targetPath,
    };
    addEntry(lock, entry);

    console.log("");
    if (existing) {
      console.log(`  ✓ Updated ${scope.label}:${layer.name}/${v.id}.yaml`);
      console.log(`    old sha: ${existing.sha256.slice(0, 16)}…`);
      console.log(`    new sha: ${finalSha.slice(0, 16)}…`);
    } else {
      console.log(`  ✓ Installed ${scope.label}:${layer.name}/${v.id}.yaml`);
    }
    console.log(`    ${targetPath}`);
  }

  await writeLock(lock);
  console.log("");
  console.log("  Next: restart MCP (`skill-central mcp`) or open the web board");
  console.log("        (`skill-central board`) to load these skills.");
  console.log("");
}

// Re-exported for symmetry with add.ts and so future commands don't need
// a separate import path.
export { unlink };