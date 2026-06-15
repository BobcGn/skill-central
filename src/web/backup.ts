// ============================================================================
// Web Board · Backup
// ----------------------------------------------------------------------------
// Every PUT to /api/skills/:id is preceded by a backup write of the current
// file. Backups follow the convention `<filePath>.bak.<ISO-no-colons>` and
// are never auto-deleted — `doctor` reports them; user removes them by hand.
// ============================================================================

import { readdir, readFile, rename, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

/** ISO timestamp with `:` and `.` replaced by `-` (filesystem-safe). */
function tsSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Move the existing file at `filePath` to a `.bak.<ts>` sibling.
 * If the file does not exist, this is a no-op.
 */
export async function backupBeforeWrite(filePath: string): Promise<string | null> {
  try {
    await stat(filePath);
  } catch {
    return null;
  }
  const backupPath = `${filePath}.bak.${tsSlug()}`;
  await rename(filePath, backupPath);
  return backupPath;
}

export interface BackupInfo {
  file: string;
  createdAt: string;
  size: number;
}

/**
 * List every `.bak.<ts>` sibling of `filePath`, newest first.
 * Returns an empty array if the file has no backups.
 */
export async function listBackups(filePath: string): Promise<BackupInfo[]> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const prefix = `${base}.bak.`;
  const out: BackupInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
    const full = path.join(dir, entry.name);
    const tsPart = entry.name.slice(prefix.length);
    const createdAt = parseTsSlug(tsPart);
    if (!createdAt) continue;
    const st = await stat(full).catch(() => null);
    if (!st) continue;
    out.push({
      file: full,
      createdAt,
      size: st.size,
    });
  }
  // Newest first.
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

/**
 * Restore a backup over the live file. The backup itself is preserved.
 * Caller is expected to have validated that `backupFile` is one of the
 * entries returned by listBackups(filePath) for the same base file.
 */
export async function restoreBackup(
  filePath: string,
  backupFile: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  if (!backupFile.startsWith(path.join(dir, `${base}.bak.`))) {
    throw new Error("backup file does not belong to this skill");
  }
  // Pre-backup the live file before clobbering it.
  await backupBeforeWrite(filePath);
  const content = await readFile(backupFile, "utf-8");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, content, "utf-8");
}

/** Compute sha256 of a string (utf-8). */
export async function sha256Of(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

// ── Internal ───────────────────────────────────────────────────────────────

/** Parse `2026-06-15T09-11-08-835Z` back to `2026-06-15T09:11:08.835Z`. */
function parseTsSlug(slug: string): string | null {
  // Match ISO-style with hyphens replacing : and .
  const m = slug.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}