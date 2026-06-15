// ============================================================================
// Install · Lock File
// ----------------------------------------------------------------------------
// Persistent record of every skill installed via `install`. Lives at
// ~/.skill-central/lock.json. Maps installed skill id → source / version /
// sha256 so `update` can detect drift and `uninstall` can find the file.
// ============================================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// ── Public types ───────────────────────────────────────────────────────────

export interface LockEntry {
  id: string;
  /** Canonical raw form: "github:user/repo/path" or "npm:@scope/pkg". */
  source: string;
  /** Resolved version / ref. Empty string means "latest" (npm). */
  version: string;
  sha256: string;
  installedAt: string;
  /** Display name of the layer the file was written into. */
  layer: string;
  /** Absolute path on disk. */
  filePath: string;
}

export interface LockFile {
  version: 1;
  entries: Record<string, LockEntry>;
}

export function lockFilePath(): string {
  return path.join(homedir(), ".skill-central", "lock.json");
}

// ── Read / write ───────────────────────────────────────────────────────────

/**
 * Read the lock file from disk. Returns an empty lock if the file doesn't
 * exist yet (first install on a fresh machine).
 */
export async function readLock(): Promise<LockFile> {
  const p = lockFilePath();
  if (!existsSync(p)) {
    return { version: 1, entries: {} };
  }
  try {
    const raw = await readFile(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("lock root is not an object");
    }
    if (parsed.version !== 1) {
      throw new Error(`unsupported lock version: ${parsed.version}`);
    }
    if (typeof parsed.entries !== "object" || parsed.entries === null) {
      throw new Error("lock entries missing");
    }
    return parsed as LockFile;
  } catch (err) {
    throw new Error(`failed to read lock file ${p}: ${(err as Error).message}`);
  }
}

export async function writeLock(lock: LockFile): Promise<void> {
  const p = lockFilePath();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(lock, null, 2) + "\n", "utf-8");
}

// ── Mutators ───────────────────────────────────────────────────────────────

export function findById(lock: LockFile, id: string): LockEntry | undefined {
  return lock.entries[id];
}

export function addEntry(lock: LockFile, entry: LockEntry): void {
  lock.entries[entry.id] = entry;
}

export function removeEntry(lock: LockFile, id: string): boolean {
  if (!(id in lock.entries)) return false;
  delete lock.entries[id];
  return true;
}

export function listAll(lock: LockFile): LockEntry[] {
  return Object.values(lock.entries);
}