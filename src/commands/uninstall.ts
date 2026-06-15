// ============================================================================
// Uninstall Command
// ----------------------------------------------------------------------------
// "skill-central uninstall <id>" — remove the on-disk skill file and its
// lock entry. Refuses if the id is not in the lock.
// ============================================================================

import { unlink, readdir, stat } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import type { Dirent } from "node:fs";

import { readLock, writeLock, findById, removeEntry } from "./lockfile.js";

export interface UninstallOptions {
  /** Skip confirmation. */
  yes?: boolean;
  /** Also remove the .bak.* siblings of the skill file. */
  purgeBackups?: boolean;
}

export async function cmdUninstall(id: string, opts: UninstallOptions): Promise<void> {
  const lock = await readLock();
  const entry = findById(lock, id);
  if (!entry) {
    throw new Error(
      `No lock entry for "${id}". Run \`skill-central list\` to see installed skills, or \`install <source>\` first.`,
    );
  }

  if (!opts.yes) {
    console.log(`About to remove: ${entry.filePath}`);
    console.log(`  source:  ${entry.source}`);
    console.log(`  version: ${entry.version}`);
    console.log("  Tip: use --yes to skip this prompt in scripts.");
  }

  // Remove the live file (ignore ENOENT — file may have been deleted manually).
  await unlink(entry.filePath).catch((err) => {
    if (err?.code !== "ENOENT") throw err;
  });

  // Optionally remove backups too.
  if (opts.purgeBackups) {
    const dir = dirname(entry.filePath);
    const base = basename(entry.filePath);
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const e of entries) {
      if (e.isFile() && e.name.startsWith(`${base}.bak.`)) {
        const full = join(dir, e.name);
        const st = await stat(full).catch(() => null);
        if (st) await unlink(full).catch(() => {});
      }
    }
  }

  removeEntry(lock, id);
  await writeLock(lock);

  console.log(`  ✓ Uninstalled ${id}`);
  console.log(`    removed: ${entry.filePath}`);
  console.log("");
}