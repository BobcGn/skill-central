// ============================================================================
// Install · Lock File
// ----------------------------------------------------------------------------
// Persistent record of every skill installed via `install`. Lives at
// ~/.skill-central/lock.json. Maps installed skill id → source / version /
// sha256 so `update` can detect drift and `uninstall` can find the file.
//
// Design intent:
// - The lock file is the supply-chain audit trail for remote skills. It records
//   where a skill came from, which schema version was installed, and the hash of
//   the exact content written to disk.
// - Older v1 lock files must keep reading. We normalise them to v2 in memory and
//   write v2 back on the next install/update/uninstall.
// - Local skills created with `add` do not require lock entries; lock metadata is
//   for remotely installed assets only.
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
  /** Coarse source kind for future sync/audit policies. */
  sourceKind: "github" | "npm" | "unknown";
  /** Resolved version / ref. Empty string means "latest" (npm). */
  version: string;
  /** Content hash of the exact YAML written to disk. Kept alongside sha256 for v1 compatibility. */
  resolvedHash: string;
  sha256: string;
  installedAt: string;
  schemaVersion: string;
  /** Display name of the layer the file was written into. */
  layer: string;
  /** Absolute path on disk. */
  filePath: string;
}

export interface LockFile {
  version: 2;
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
    return { version: 2, entries: {} };
  }
  try {
    const raw = await readFile(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("lock root is not an object");
    }
    if (parsed.version !== 1 && parsed.version !== 2) {
      throw new Error(`unsupported lock version: ${parsed.version}`);
    }
    if (typeof parsed.entries !== "object" || parsed.entries === null) {
      throw new Error("lock entries missing");
    }
    return normaliseLockFile(parsed as LegacyLockFile | LockFile);
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

interface LegacyLockEntry {
  id: string;
  source: string;
  version: string;
  sha256: string;
  installedAt: string;
  layer: string;
  filePath: string;
  sourceKind?: "github" | "npm" | "unknown";
  resolvedHash?: string;
  schemaVersion?: string;
}

interface LegacyLockFile {
  version: 1 | 2;
  entries: Record<string, LegacyLockEntry>;
}

function normaliseLockFile(lock: LegacyLockFile | LockFile): LockFile {
  const entries: Record<string, LockEntry> = {};
  for (const [id, entry] of Object.entries(lock.entries)) {
    entries[id] = normaliseEntry(entry);
  }
  return { version: 2, entries };
}

function normaliseEntry(entry: LegacyLockEntry): LockEntry {
  const resolvedHash = entry.resolvedHash ?? entry.sha256;
  return {
    id: entry.id,
    source: entry.source,
    sourceKind: entry.sourceKind ?? inferSourceKind(entry.source),
    version: entry.version,
    resolvedHash,
    sha256: entry.sha256 ?? resolvedHash,
    installedAt: entry.installedAt,
    schemaVersion: entry.schemaVersion ?? "unknown",
    layer: entry.layer,
    filePath: entry.filePath,
  };
}

export function inferSourceKind(source: string): LockEntry["sourceKind"] {
  if (source.startsWith("github:")) return "github";
  if (source.startsWith("npm:")) return "npm";
  return "unknown";
}
