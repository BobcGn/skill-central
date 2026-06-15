// ============================================================================
// Update Command
// ----------------------------------------------------------------------------
// "skill-central update [id]" — re-fetch every (or one) installed skill from
// its source and apply if the sha256 changed. Writes a new lock entry.
// ============================================================================

import { homedir } from "node:os";
import path from "node:path";

import { cmdInstall } from "./install.js";
import { readLock, findById, listAll } from "./lockfile.js";
import type { LockEntry } from "./lockfile.js";

export interface UpdateOptions {
  yes?: boolean;
  /** Force project scope (same as install). */
  project?: boolean;
}

export async function cmdUpdate(id: string | undefined, opts: UpdateOptions): Promise<void> {
  const lock = await readLock();
  const targets: LockEntry[] = id
    ? [findById(lock, id)].filter((e): e is LockEntry => !!e)
    : listAll(lock);

  if (targets.length === 0) {
    if (id) {
      throw new Error(`No lock entry for "${id}". Run \`install <source>\` first.`);
    }
    console.log("  (lock is empty — nothing to update)");
    return;
  }

  console.log("");
  console.log(`  Checking ${targets.length} skill(s) for updates...`);
  console.log("");

  let updated = 0;
  for (const entry of targets) {
    try {
      const beforeSha = entry.sha256;
      // Preserve the original install scope unless --project is forced.
      const projectFlag = opts.project ?? isProjectPath(entry.filePath);
      await cmdInstall(entry.source, {
        layer: entry.layer,
        project: projectFlag,
        yes: opts.yes ?? true, // update is non-interactive by default
      });
      const after = (await readLock()).entries[entry.id];
      if (after && after.sha256 !== beforeSha) {
        updated++;
      }
    } catch (err) {
      console.error(`[skill-central] update failed for ${entry.id}: ${(err as Error).message}`);
    }
  }

  console.log("");
  console.log(`  ${updated} of ${targets.length} updated.`);
  console.log("");
}

/** Detect whether a lock entry lives under project .skills/ or user scope. */
function isProjectPath(p: string): boolean {
  const cwd = process.cwd();
  // Absolute path under <cwd>/.skills/...
  if (p.startsWith(path.join(cwd, ".skills") + path.sep)) return true;
  // Otherwise it's under ~/.skill-central/skills/...
  return !p.startsWith(path.join(homedir(), ".skill-central", "skills") + path.sep);
}